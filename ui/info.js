// ui/info.js

export function showUnitDetailsForInstance(unit) {
  const unitDetailsEl = document.getElementById('unit-details');
  const abilitiesContainer = document.getElementById('unit-abilities');
  if (!unit || !unitDetailsEl || !abilitiesContainer) return;

  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const abilities = def.abilities || [];

  // Basic stats header
  unitDetailsEl.classList.remove('empty');
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

  // Abilities list
  abilitiesContainer.innerHTML = '';
  abilities.slice(0, 2).forEach((ab, idx) => {
    const btn = document.createElement('button');
    btn.className = 'unit-ability-btn';
    btn.dataset.abilityIndex = String(idx);

    // cooldown badge/disable
    const cdLeft = (unit._cooldowns || {})[idx] || 0;
    const isMyTurn = (window.NexusCore && window.NexusCore.state.currentPlayer === unit.owner);
    const disabled = (unit.actionsLeft || 0) <= 0 || cdLeft > 0 || !isMyTurn;
    btn.disabled = !!disabled;
    btn.innerHTML = `${ab.name}${cdLeft > 0 ? ` <span class="cd-badge">${cdLeft}</span>` : ''}`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const state = window.NexusCore.state;
      // Keep the unit selected
      state.selectedUnit = unit;

      // Do not write messages into unit info; description is fine
      const descEl = document.getElementById('unit-ability-desc');
      const desc = ab.description || ab.text || ab.desc || 'No description available.';
      if (descEl) descEl.textContent = desc;

      const targetType = ab.target || 'auto';
      const needsTarget = !['auto','self'].includes(targetType);

      // Clear any previous aim hints
      state._aimHint = state._aimHint || {};
      state._aimHint.text = '';

      if (needsTarget) {
        state.abilityTargeting = { unitId: unit.id, abilityIndex: idx, targetType };
        if (typeof window.updateUI === 'function') window.updateUI();
      } else {
        // Auto/self abilities execute immediately; show a banner instead of inline message
        if (window.NexusCore && typeof window.NexusCore.useAbility === 'function' && unit.actionsLeft > 0) {
          const ok = window.NexusCore.useAbility(unit, idx);
          if (ok) {
            state._bannerText = `${ab.name} used!`;
            if (typeof window.updateUI === 'function') window.updateUI();
            // clear banner after a short delay
            setTimeout(() => { state._bannerText = ''; if (typeof window.updateUI === 'function') window.updateUI(); }, 900);
          }
        }
      }
    });

    abilitiesContainer.appendChild(btn);
  });
}

export function showCellInfo(x, y) {
  const unitDetailsEl = document.getElementById('unit-details');
  const c = window.NexusCore.getCell(x, y);
  if (!unitDetailsEl || !c) return;

  // If unit present, delegate
  if (c.unit) return showUnitDetailsForInstance(c.unit);

  const name = (c.terrain || 'plain');
  const nice = name.charAt(0).toUpperCase() + name.slice(1);
  unitDetailsEl.classList.add('empty');
  unitDetailsEl.innerHTML = `<div class="unit-name">${nice}</div><div class="unit-description">${c.nexus ? 'Nexus tile – can be captured.' : c.spawner ? 'Spawner – place adjacent to deploy.' : c.heart ? 'Heart – defend this!' : 'A terrain tile.'}</div>`;
  const abilitiesContainer = document.getElementById('unit-abilities');
  if (abilitiesContainer) abilitiesContainer.innerHTML = '';
}