// ui/info.js

export function showUnitDetailsForInstance(unit) {
  const unitDetailsEl = document.getElementById('unit-details');
  const abilitiesContainer = document.getElementById('unit-abilities');
  if (!unit || !unitDetailsEl || !abilitiesContainer) return;

  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};

  // Build mapping of abilities keeping original indices; only show non-passive
  const rawAbilities = Array.isArray(def.abilities) ? def.abilities : [];
  const activeAbilities = rawAbilities
    .map((ab, i) => ({ ab, i }))
    .filter(({ ab }) => ab && ab.type !== 'passive');

  // Basic stats header
  unitDetailsEl.classList.remove('empty');
  unitDetailsEl.classList.remove('cell-info');
  unitDetailsEl.innerHTML = `
    <div class="unit-name">${def.name || unit.name || unit.defId}</div>
    <div class="unit-description">${def.description || ''}</div>
    <div class="unit-stat"><span class="unit-stat-label">HP</span><span>${unit.hp}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">ATK</span><span>${unit.attack || def.atk || def.attack || 0}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">RNG</span><span>${unit.range || def.range || 1}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">MOVE</span><span>${unit.move || def.move || 1}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">ACTIONS</span><span>${unit.actionsLeft || 0}/2</span></div>
    <div class="unit-ability-desc" id="unit-ability-desc"></div>
  `;

  // Shared description element
  const descEl = document.getElementById('unit-ability-desc');

  // State refs
  const st = window.NexusCore.state;
  if (st.abilityTargeting && st.abilityTargeting.unitId !== unit.id) {
    st.abilityTargeting = null;
  }
  st._pendingAbility = st._pendingAbility && st._pendingAbility.unitId === unit.id ? st._pendingAbility : null;

  // Helper to render the description box content for an ability (by original index)
  function renderDescFor(ab, origIdx, mode = 'review') {
    if (!descEl || !ab) return;
    const desc = ab.description || ab.text || ab.desc || 'No description available.';

    const targetType = ab.target || 'auto';
    const needsTarget = !['auto', 'self'].includes(targetType);

    const stepText = needsTarget ? 'Step 2: Confirm to start targeting' : 'Step 2: Confirm to activate';
    const confirmLabel = needsTarget ? 'Start Targeting' : 'Confirm';

    if (mode === 'targeting') {
      descEl.innerHTML = `
        <div class="ability-title"><strong>${ab.name}</strong></div>
        <div class="ability-text">Targeting active: select a valid target tile to use this ability.</div>
        <div class="ability-confirm">
          <span class="ability-steps">Targeting… Click a tile or Cancel.</span>
          <button class="ability-cancel-btn" data-idx="${origIdx}">Cancel</button>
        </div>
      `;
      descEl.classList.add('visible');
      const cancelBtn = descEl.querySelector('.ability-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          st.abilityTargeting = null;
          st._pendingAbility = null;
          const prevSelected = abilitiesContainer.querySelector('.unit-ability-btn.selected');
          if (prevSelected) prevSelected.classList.remove('selected');
          st._bannerText = '';
          descEl.classList.remove('visible');
          if (typeof window.updateUI === 'function') window.updateUI();
        });
      }
      return;
    }

    // Review mode
    descEl.innerHTML = `
      <div class="ability-title"><strong>${ab.name}</strong></div>
      <div class="ability-text">${desc}</div>
      <div class="ability-confirm">
        <span class="ability-steps">${stepText}</span>
        <button class="ability-confirm-btn" data-idx="${origIdx}">${confirmLabel}</button>
      </div>
    `;
    descEl.classList.add('visible');

    const confirmBtn = descEl.querySelector('.ability-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cdLeft = (unit._cooldowns || {})[origIdx] || 0;
        const isMyTurn = (window.NexusCore && st.currentPlayer === unit.owner);
        const disabled = (unit.actionsLeft || 0) <= 0 || cdLeft > 0 || !isMyTurn;
        if (disabled) return;

        if (needsTarget) {
          st.abilityTargeting = { unitId: unit.id, abilityIndex: origIdx, targetType };
          st._bannerText = `Select a target for ${ab.name}`;
          const prevSelected = abilitiesContainer.querySelector('.unit-ability-btn.selected');
          if (prevSelected) prevSelected.classList.remove('selected');
          const btn = abilitiesContainer.querySelector(`.unit-ability-btn[data-ability-index="${origIdx}"]`);
          if (btn) btn.classList.add('selected');
          renderDescFor(ab, origIdx, 'targeting');
          if (typeof window.updateUI === 'function') window.updateUI();
        } else {
          if (window.NexusCore && typeof window.NexusCore.useAbility === 'function' && unit.actionsLeft > 0) {
            const ok = window.NexusCore.useAbility(unit, origIdx);
            if (ok) {
              st._bannerText = `${ab.name} used!`;
              if (typeof window.updateUI === 'function') window.updateUI();
              setTimeout(() => {
                st._bannerText = '';
                descEl.classList.remove('visible');
                const prevSelected = abilitiesContainer.querySelector('.unit-ability-btn.selected');
                if (prevSelected) prevSelected.classList.remove('selected');
                st._pendingAbility = null;
                if (typeof window.updateUI === 'function') window.updateUI();
              }, 900);
            }
          }
        }
      });
    }
  }

  // Abilities list
  abilitiesContainer.innerHTML = '';
  activeAbilities.slice(0, 2).forEach(({ ab, i: origIdx }) => {
    const btn = document.createElement('button');
    btn.className = 'unit-ability-btn';
    btn.dataset.abilityIndex = String(origIdx);

    const cdLeft = (unit._cooldowns || {})[origIdx] || 0;
    const isMyTurn = (window.NexusCore && window.NexusCore.state.currentPlayer === unit.owner);
    const disabled = (unit.actionsLeft || 0) <= 0 || cdLeft > 0 || !isMyTurn;
    btn.disabled = !!disabled;
    btn.innerHTML = `${ab.name}${cdLeft > 0 ? ` <span class="cd-badge">${cdLeft}</span>` : ''}`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      // Toggle off if clicking the same pending ability
      if (st._pendingAbility && st._pendingAbility.unitId === unit.id && st._pendingAbility.abilityIndex === origIdx) {
        st._pendingAbility = null;
        btn.classList.remove('selected');
        if (descEl) descEl.classList.remove('visible');
        st._bannerText = '';
        if (typeof window.updateUI === 'function') window.updateUI();
        return;
      }

      // New selection: clear previous selection/targeting
      const prevSelected = abilitiesContainer.querySelector('.unit-ability-btn.selected');
      if (prevSelected) prevSelected.classList.remove('selected');
      st.abilityTargeting = null;
      st._bannerText = '';

      // Mark pending and show description
      st.selectedUnit = unit;
      st._pendingAbility = { unitId: unit.id, abilityIndex: origIdx };
      btn.classList.add('selected');
      renderDescFor(ab, origIdx, 'review');
      if (typeof window.updateUI === 'function') window.updateUI();
    });

    abilitiesContainer.appendChild(btn);
  });

  // After building buttons, reapply selection/desc based on current state
  if (st.abilityTargeting && st.abilityTargeting.unitId === unit.id) {
    const aIdx = st.abilityTargeting.abilityIndex;
    const ab = rawAbilities[aIdx];
    const selBtn = abilitiesContainer.querySelector(`.unit-ability-btn[data-ability-index="${aIdx}"]`);
    if (selBtn) selBtn.classList.add('selected');
    if (ab) renderDescFor(ab, aIdx, 'targeting');
    // If we're in Soldier Charge move phase, override text to be explicit
    if (st.abilityTargeting.phase === 'charge_move' && descEl) {
      descEl.innerHTML = `
        <div class="ability-title"><strong>${ab.name}</strong></div>
        <div class="ability-text">Charge: choose an adjacent empty tile to move 1 step.</div>
        <div class="ability-confirm">
          <span class="ability-steps">Targeting… Click a tile or Cancel.</span>
          <button class="ability-cancel-btn" data-idx="${aIdx}">Cancel</button>
        </div>
      `;
      const cancelBtn = descEl.querySelector('.ability-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          st.abilityTargeting = null;
          st._pendingAbility = null;
          const prevSelected = abilitiesContainer.querySelector('.unit-ability-btn.selected');
          if (prevSelected) prevSelected.classList.remove('selected');
          st._bannerText = '';
          descEl.classList.remove('visible');
          if (typeof window.updateUI === 'function') window.updateUI();
        });
      }
    }
  } else if (st._pendingAbility && st._pendingAbility.unitId === unit.id) {
    const aIdx = st._pendingAbility.abilityIndex;
    const ab = rawAbilities[aIdx];
    const selBtn = abilitiesContainer.querySelector(`.unit-ability-btn[data-ability-index="${aIdx}"]`);
    if (selBtn) selBtn.classList.add('selected');
    if (ab) renderDescFor(ab, aIdx, 'review');
  }
}

export function showCellInfo(x, y) {
  const unitDetailsEl = document.getElementById('unit-details');
  const c = window.NexusCore.getCell(x, y);
  if (!unitDetailsEl || !c) return;

  if (c.unit) return showUnitDetailsForInstance(c.unit);

  // Determine title and description based on markers/terrain
  let title = '';
  let desc = '';
  if (c.nexus) {
    title = 'Nexus';
    desc = 'Capture and control objective.';
  } else if (c.spawner) {
    title = 'Spawner';
    desc = 'Deploy units adjacent to this tile.';
  } else if (c.heart) {
    title = 'Heart';
    desc = 'Your core structure. If it falls, you lose.';
  } else {
    const t = c.terrain || 'plain';
    title = t.charAt(0).toUpperCase() + t.slice(1);
    switch (t) {
      case 'water': desc = 'Most units cannot cross; build a bridge or use special movement.'; break;
      case 'forest': desc = 'Dense terrain.'; break;
      case 'mountain': desc = 'Impassable to most units.'; break;
      case 'bridge': desc = 'A built crossing over water.'; break;
      default: desc = 'Open ground.'; break;
    }
  }

  // Update left panel (UNIT INFO) with centered title and description
  unitDetailsEl.classList.remove('empty');
  unitDetailsEl.classList.add('cell-info');
  unitDetailsEl.innerHTML = `
    <div class="unit-name">${title}</div>
    <div class="unit-description">${desc}</div>
  `;

  const abilitiesContainer = document.getElementById('unit-abilities');
  if (abilitiesContainer) abilitiesContainer.innerHTML = '';
  const descEl = document.getElementById('unit-ability-desc');
  if (descEl) { descEl.classList.remove('visible'); descEl.innerHTML = ''; }

  // Removed grid overlays: render only inside UNIT INFO per request
}