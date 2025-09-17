// ui/render.js
// Board and unit rendering

const BOARD_SIZE = 11;

function getState() {
  return window.NexusCore ? window.NexusCore.state : null;
}

function getCell(x, y) {
  return window.NexusCore ? window.NexusCore.getCell(x, y) : null;
}

export function renderBoard() {
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;
  
  const state = getState();
  if (!state) return;
  
  clearElement(gridEl);
  gridEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size, 40px))`;

  // precompute movement/attack once for performance
  const selected = state.selectedUnit;
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const sDef = selected ? (UNIT_TYPES[selected.defId] || {}) : {};
  const baseMove = selected ? (selected.move || sDef.move || 1) : 0;
  const bonusMove = selected ? (selected._tempMoveBonus || 0) : 0;
  const baseReach = selected ? computeReachable(selected, baseMove) : new Set();
  const totalReach = selected ? computeReachable(selected, baseMove + bonusMove) : new Set();
  const attackOverlay = selected ? computeAttackOverlay(selected) : null;

  // ability targeting overlays
  const abilityTargeting = state.abilityTargeting;
  // NEW: prepare aim mode class + instructions banner
  const boardPanel = document.getElementById('boardPanel');
  let abilityUnitRef = null;
  let abilityName = '';
  let abilityInstruction = '';
  let isVolleyAbility = false;
  if (abilityTargeting) {
    // find unit reference once
    for (let yy = 0; yy < state.board.length; yy++) {
      for (let xx = 0; xx < state.board[0].length; xx++) {
        const c2 = getCell(xx, yy);
        if (c2 && c2.unit && c2.unit.id === abilityTargeting.unitId) { abilityUnitRef = c2.unit; break; }
      }
      if (abilityUnitRef) break;
    }
    if (abilityUnitRef) {
      const UNIT_TYPES = window.UNIT_TYPES || {};
      const def = UNIT_TYPES[abilityUnitRef.defId] || {};
      const ab = (def.abilities || [])[abilityTargeting.abilityIndex];
      abilityName = (ab && ab.name) ? ab.name : 'Ability';
      const t = abilityTargeting.targetType;
      if (t === 'enemy_in_range') abilityInstruction = `Click a tile within range to use ${abilityName}.`;
      else if (t === 'manhattan_2_enemy') abilityInstruction = `Click an enemy within 2 tiles (Manhattan) to use ${abilityName}.`;
      else if (t === 'adjacent_friendly') abilityInstruction = `Click an adjacent friendly to use ${abilityName}.`;
      else if (t === 'adjacent_enemy') abilityInstruction = `Click an adjacent enemy to use ${abilityName}.`;
      else if (t === 'adjacent_water') abilityInstruction = `Click an adjacent water tile to use ${abilityName}.`;
      else if (t === 'charge_move') abilityInstruction = `Choose an adjacent empty tile to move (1 step).`;
      else abilityInstruction = `Choose a valid target for ${abilityName}.`;
      // Override with tailored hint if available
      try {
        if (state._aimHint && state._aimHint.text) abilityInstruction = state._aimHint.text;
      } catch (e) { /* ignore */ }
      // detect volley
      isVolleyAbility = !!(ab && ab.name && String(ab.name).toLowerCase().includes('volley'));
    }
    gridEl.classList.add('aim-mode');
  } else {
    gridEl.classList.remove('aim-mode');
    // Clear any transient aim state
    if (state._aimHover) state._aimHover = null;
    if (state._aimHint) state._aimHint.text = '';
  }

  // Banner handling: show during aim OR when a transient banner text is set
  const bannerNeeded = !!abilityTargeting || !!(state._bannerText && state._bannerText.length > 0);
  
  // Move instructional text to unit info panel instead of purple banner
  const unitAbilityDescEl = document.getElementById('unit-ability-desc');
  if (unitAbilityDescEl) {
    if (bannerNeeded) {
      unitAbilityDescEl.textContent = abilityTargeting ? (abilityInstruction || 'Choose a valid target.') : state._bannerText;
      unitAbilityDescEl.style.display = 'block';
      unitAbilityDescEl.style.background = 'rgba(120,80,200,0.18)';
      unitAbilityDescEl.style.color = '#e8d8ff';
      unitAbilityDescEl.style.border = '1px solid rgba(160,100,255,0.35)';
      unitAbilityDescEl.style.padding = '6px 10px';
      unitAbilityDescEl.style.borderRadius = '10px';
      unitAbilityDescEl.style.fontSize = '12px';
      unitAbilityDescEl.style.fontWeight = '800';
      unitAbilityDescEl.style.letterSpacing = '0.2px';
      unitAbilityDescEl.style.marginTop = '8px';
    } else {
      unitAbilityDescEl.textContent = '';
      unitAbilityDescEl.style.display = 'none';
    }
  }
  
  // Remove any existing purple banner
  if (boardPanel) {
    let banner = document.getElementById('instructionBanner');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (!c) continue;
      
      const cellEl = document.createElement('div');
      cellEl.className = 'cell ' + (c.terrain || 'plain');
      cellEl.dataset.x = x;
      cellEl.dataset.y = y;

      // Nexus (neutral or owned)
      if (c.nexus) {
        const el = document.createElement('div'); 
        el.className = 'marker-full nexus';
        el.textContent = '◆';
        if (c.nexus.owner === 1) el.classList.add('owner-1');
        else if (c.nexus.owner === 2) el.classList.add('owner-2');
        else el.classList.add('neutral');
        cellEl.appendChild(el);
      }

      // Spawner
      if (c.spawner) {
        const el = document.createElement('div'); 
        el.className = 'marker-full spawner';
        el.textContent = '⚙';
        if (c.spawner.owner === 1) el.classList.add('player');
        else if (c.spawner.owner === 2) el.classList.add('enemy');
        cellEl.appendChild(el);
      }

      // Heart
      if (c.heart) {
        const el = document.createElement('div'); 
        el.className = 'marker-full heart';
        el.textContent = '♥';
        if (c.heart.owner === 1) el.classList.add('player');
        else if (c.heart.owner === 2) el.classList.add('enemy');
        // small HP badge
        const hpBadge = document.createElement('div'); 
        hpBadge.className = 'heart-hp'; 
        hpBadge.textContent = String(state.players[c.heart.owner || 1].hp);
        el.appendChild(hpBadge);
        cellEl.appendChild(el);
      }

      // Unit
      if (c.unit) {
        const u = c.unit;
        const ue = document.createElement('div'); 
        ue.className = 'unit-el owner-' + (u.owner || 1);
        ue.textContent = u.symbol || (u.name ? u.name.charAt(0) : '?');
        const hp = document.createElement('div'); 
        hp.className = 'unit-hp'; 
        hp.textContent = String(u.hp);
        const ap = document.createElement('div'); 
        ap.className = 'unit-actions'; 
        ap.textContent = String(u.actionsLeft || 0);
        ue.appendChild(hp); 
        ue.appendChild(ap);
        cellEl.appendChild(ue);
        
        // Add selection highlighting
        if (state.selectedUnit && state.selectedUnit.id === u.id) {
          ue.classList.add('selected');
        }
        
        // Add attackable highlighting (unit border)
        if (state.selectedUnit && state.selectedUnit.owner !== u.owner && canAttackTarget(state.selectedUnit, u.x, u.y)) {
          ue.classList.add('attackable-target');
        }

        // Ability activation flash
        if (u._abilityFlashTurn === state.turn) {
          ue.classList.add('attack-flash');
        }
      }
      
      // Add movement highlights for selected unit
      if (selected && !c.unit) {
        const key = `${x},${y}`;
        if (baseReach.has(key)) {
          const overlay = document.createElement('div');
          overlay.className = 'highlight-overlay highlight-move';
          cellEl.appendChild(overlay);
        } else if ((bonusMove > 0) && totalReach.has(key)) {
          // tiles newly reachable thanks to Dash or other temporary bonuses -> purple border
          const overlay = document.createElement('div');
          overlay.className = 'highlight-overlay highlight-ability';
          cellEl.appendChild(overlay);
        }
      }

      // Add attack overlays ONLY on enemy-occupied, actually attackable cells
      if (selected && c.unit && c.unit.owner !== selected.owner && canAttackTarget(selected, x, y)) {
        const overlay = document.createElement('div');
        overlay.className = 'highlight-overlay highlight-attack-ortho';
        cellEl.appendChild(overlay);
      }

      // Ability targeting overlays per ability target type (purple border)
      if (abilityTargeting && abilityUnitRef) {
        const t = abilityTargeting.targetType;
        let show = false;
        let useOverlay = false;
        let overlayClass = 'highlight-overlay highlight-ability';

        if (t === 'enemy_in_range') {
          // Archer Volley aiming: default highlight within range; when hovering, preview a 3x3 impact area around hover center
          const def = (UNIT_TYPES[abilityUnitRef.defId] || {});
          const range = abilityUnitRef.range || def.range || 1;
          const canDiag = def.canAttackDiagonal || abilityUnitRef.defId === 'archer' || abilityUnitRef.defId === 'naval';
          const manhattan = Math.abs(abilityUnitRef.x - x) + Math.abs(abilityUnitRef.y - y);
          const chebyshev = Math.max(Math.abs(abilityUnitRef.x - x), Math.abs(abilityUnitRef.y - y));
          const inRange = canDiag ? (chebyshev <= range) : (manhattan <= range);

          const hover = state._aimHover;
          if (hover) {
            const cx = hover.x, cy = hover.y;
            const centerMan = Math.abs(abilityUnitRef.x - cx) + Math.abs(abilityUnitRef.y - cy);
            const centerCheb = Math.max(Math.abs(abilityUnitRef.x - cx), Math.abs(abilityUnitRef.y - cy));
            const centerInRange = canDiag ? (centerCheb <= range) : (centerMan <= range);
            if (centerInRange) {
              // show 3x3 around hover center
              show = Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
            } else {
              // if hover center isn't valid, show nothing
              show = false;
            }
          } else {
            // no hover: show general in-range aim area
            show = inRange;
          }
          useOverlay = show;

          // Visible boundary ring for Volley: outer limit tiles
          if (isVolleyAbility) {
            const isBoundary = canDiag ? (chebyshev === range) : (manhattan === range);
            if (isBoundary) {
              const boundary = document.createElement('div');
              boundary.className = 'highlight-overlay highlight-volley-boundary';
              cellEl.appendChild(boundary);
            }
          }
        } else if (t === 'manhattan_2_enemy') {
          const dist = Math.abs(abilityUnitRef.x - x) + Math.abs(abilityUnitRef.y - y);
          show = dist <= 2; useOverlay = show;
        } else if (t === 'adjacent_friendly') {
          show = Math.abs(abilityUnitRef.x - x) + Math.abs(abilityUnitRef.y - y) === 1; useOverlay = show;
        } else if (t === 'adjacent_enemy') {
          show = Math.abs(abilityUnitRef.x - x) + Math.abs(abilityUnitRef.y - y) === 1; useOverlay = show;
        } else if (t === 'adjacent_water') {
          const cell = getCell(x, y);
          show = Math.abs(abilityUnitRef.x - x) <= 1 && Math.abs(abilityUnitRef.y - y) <= 1 && cell && cell.terrain === 'water'; useOverlay = show;
        } else if (t === 'charge_move') {
          const ddef = (UNIT_TYPES[abilityUnitRef.defId] || {});
          const cell = getCell(x, y);
          const adj = Math.abs(abilityUnitRef.x - x) + Math.abs(abilityUnitRef.y - y) === 1;
          show = !!(adj && cell && !cell.unit && !cell.blockedForMovement && !(cell.terrain === 'mountain' && !ddef.canClimbMountain) && !(cell.terrain === 'water' && !ddef.canCrossWater && !ddef.waterOnly && cell.terrain !== 'bridge'));
          useOverlay = show;
        }

        if (useOverlay) {
          const overlay = document.createElement('div');
          overlay.className = overlayClass;
          cellEl.appendChild(overlay);
        }

        // Add hover listeners for 3x3 preview when aiming with Volley
        if (t === 'enemy_in_range') {
          cellEl.addEventListener('mouseenter', () => {
            state._aimHover = { x, y };
            // Throttle re-render to avoid canceling click due to DOM replacement during hover
            if (!state._suppressAimRerender) {
              if (typeof window.requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                  if (!state._suppressAimRerender && typeof window.updateUI === 'function') window.updateUI();
                });
              } else if (typeof window.updateUI === 'function') {
                window.updateUI();
              }
            }
          });
          cellEl.addEventListener('mouseleave', () => {
            state._aimHover = null;
            // Throttle re-render similarly on leave
            if (!state._suppressAimRerender) {
              if (typeof window.requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                  if (!state._suppressAimRerender && typeof window.updateUI === 'function') window.updateUI();
                });
              } else if (typeof window.updateUI === 'function') {
                window.updateUI();
              }
            }
          });
        }
      }

      gridEl.appendChild(cellEl);
    }
  }
}

function clearElement(el) { 
  if (!el) return; 
  while (el.firstChild) el.removeChild(el.firstChild); 
}

function canAttackTarget(unit, tx, ty) {
  if (!unit) return false;
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const range = unit.range || def.range || 1;
  const orthogonalDist = Math.abs(unit.x - tx) + Math.abs(unit.y - ty);
  const diagonalDist = Math.max(Math.abs(unit.x - tx), Math.abs(unit.y - ty));
  const canAttackDiagonal = def.canAttackDiagonal || unit.defId === 'archer' || unit.defId === 'naval';
  const inRange = canAttackDiagonal ? (diagonalDist <= range) : (orthogonalDist <= range);
  return inRange && unit.actionsLeft > 0;
}

function computeReachable(unit, stepsOverride) {
  const set = new Set();
  if (!unit) return set;
  
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const maxSteps = (typeof stepsOverride === 'number') ? stepsOverride : (unit.move || def.move || 1) + (unit._tempMoveBonus || 0);
  const visited = new Set();
  const q = [{ x: unit.x, y: unit.y, d: 0 }];
  visited.add(`${unit.x},${unit.y}`);
  set.add(`${unit.x},${unit.y}`);
  
  while (q.length) {
    const cur = q.shift();
    if (cur.d >= maxSteps) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!window.NexusCore.inBounds(nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const cell = getCell(nx, ny);
      if (!cell) continue;
      
      // can't move onto occupied or truly blocked markers (spawners/hearts). Nexuses are NOT blocking.
      if (cell.unit || cell.heart || cell.spawner) continue;
      if (cell.blockedForMovement) continue;
      
      // terrain restrictions (match UI rules)
      if (cell.terrain === 'water' && !(def.canMoveOnWater || unit.defId === 'naval') && cell.terrain !== 'bridge') continue;
      if (cell.terrain === 'mountain' && !def.canClimb) continue;
      
      set.add(key);
      visited.add(key);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return set;
}

function computeAttackOverlay(unit) {
  const map = new Map();
  if (!unit) return map;
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const range = unit.range || def.range || 1;
  const canAttackDiagonal = def.canAttackDiagonal || unit.defId === 'archer' || unit.defId === 'naval';
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const isSelf = (x === unit.x && y === unit.y);
      if (isSelf) continue;
      const manhattan = Math.abs(unit.x - x) + Math.abs(unit.y - y);
      const chebyshev = Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y));
      if (canAttackDiagonal) {
        if (chebyshev <= range) {
          const type = (manhattan % 2 === 0) ? 'diag' : 'ortho';
          map.set(`${x},${y}`, type);
        }
      } else {
        if (manhattan <= range) {
          map.set(`${x},${y}`, 'ortho');
        }
      }
    }
  }
  return map;
}