// ui/render.js
// Board and unit rendering

const BOARD_SIZE = 11;
let GRID_WIDTH = BOARD_SIZE; // dynamic width synced on render

function getState() {
  return window.NexusCore ? window.NexusCore.state : null;
}

function getCell(x, y) {
  return window.NexusCore ? window.NexusCore.getCell(x, y) : null;
}

export function renderBoard() {
  const st = getState();
  if (!st) return;
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';
  GRID_WIDTH = (st.board && st.board[0]) ? st.board[0].length : BOARD_SIZE;

  for (let y = 0; y < st.board.length; y++) {
    for (let x = 0; x < st.board[0].length; x++) {
      const cell = getCell(x, y);
      const cellEl = document.createElement('div');
      // apply terrain class on the cell itself per styles.css (.cell.water, .cell.mountain, etc.)
      cellEl.className = 'cell ' + (cell && cell.terrain ? cell.terrain : 'plain');
      cellEl.dataset.x = x;
      cellEl.dataset.y = y;
      // apply subtle shadow realm overlay while keeping terrain visible
      if ((st.viewRealm || 'overworld') === 'shadow') {
        cellEl.classList.add('shadow-terrain');
      }

      // render nexus (neutral or owned)
      if (cell && cell.nexus) {
        const el = document.createElement('div');
        el.className = 'marker-full nexus';
        el.textContent = '◆';
        if (cell.nexus.owner === 1) el.classList.add('owner-1');
        else if (cell.nexus.owner === 2) el.classList.add('owner-2');
        else el.classList.add('neutral');
        cellEl.appendChild(el);
      }

      // render spawner with owner style
      if (cell && cell.spawner) {
        const el = document.createElement('div');
        el.className = 'marker-full spawner';
        el.textContent = '⛓';
        if (cell.spawner.owner === 1) el.classList.add('player');
        else if (cell.spawner.owner === 2) el.classList.add('enemy');
        else el.classList.add('neutral');
        cellEl.appendChild(el);
      }

      // render heart with HP badge
      if (cell && cell.heart) {
        const el = document.createElement('div');
        el.className = 'marker-full heart';
        el.textContent = '♥';
        if (cell.heart.owner === 1) el.classList.add('player');
        else if (cell.heart.owner === 2) el.classList.add('enemy');
        const ownerIdx = cell.heart.owner || 1;
        const hpBadge = document.createElement('div');
        hpBadge.className = 'heart-hp';
        hpBadge.textContent = String(st.players[ownerIdx]?.hp ?? '');
        el.appendChild(hpBadge);
        cellEl.appendChild(el);
      }
  
      const view = st.viewRealm || 'overworld';
      const unit = cell ? ((view === 'shadow') ? cell.shadowUnit : cell.unit) : null;
      if (unit) {
        const uEl = document.createElement('div');
        const ownerCls = 'owner-' + (unit.owner || 1);
        uEl.className = 'unit-el ' + ownerCls + (unit.hiddenUntilTurn && st.turn < unit.hiddenUntilTurn ? ' hidden' : '');
        uEl.dataset.x = x; uEl.dataset.y = y;
        const UNIT_TYPES = window.UNIT_TYPES || {};
        const def = UNIT_TYPES[unit.defId] || {};
        const symbol = def.symbol || unit.symbol || (def.name ? def.name[0] : unit.defId ? String(unit.defId)[0] : '?');
        uEl.title = (def.name || unit.defId || 'Unit') + ' (P' + unit.owner + ')';
        uEl.textContent = symbol;
        // actions badge
        const act = document.createElement('div');
        act.className = 'unit-actions';
        act.textContent = String(unit.actionsLeft != null ? unit.actionsLeft : 0);
        uEl.appendChild(act);
        // hp badge
        const hp = document.createElement('div');
        hp.className = 'unit-hp';
        hp.textContent = String(unit.hp != null ? unit.hp : 1);
        uEl.appendChild(hp);
        // mark selected unit for subtle lift
        if (st.selectedUnit && unit.id === st.selectedUnit.id) {
          uEl.classList.add('selected');
        }
        cellEl.appendChild(uEl);
      }
  
      // Hover previews: movement path and attack target borders
      cellEl.addEventListener('mouseenter', () => {
        const s = getState();
        if (!s) return;
        const cx = x, cy = y;
        clearMoveAttackOverlays();
        const viewRealm = s.viewRealm || 'overworld';
        const cell = getCell(cx, cy);
        const selected = s.selectedUnit || null;
        if (!selected) return;
        // Ensure selected is visible in current view
        if ((selected.realm || 'overworld') !== viewRealm) return;
      
        // Ability targeting hover overlays (purple) — take precedence over move/attack previews
        if (s.abilityTargeting && s.abilityTargeting.unitId === selected.id) {
          drawAbilityHoverPreview(selected, cx, cy);
          return;
        }
      
        const UNIT_TYPES = window.UNIT_TYPES || {};
        const def = UNIT_TYPES[selected.defId] || {};
      
        // Movement path preview: only when hovering a reachable empty tile
        if (selected.actionsLeft > 0) {
          const path = computePath(selected, cx, cy, def);
          if (path && path.length > 1) {
            drawMovePath(path);
          }
        }
      
        // Attack preview: only when hovering an enemy unit/heart targetable by this unit
        if (selected.actionsLeft > 0 && canAttackTarget(selected, cx, cy)) {
          const targetUnit = (viewRealm === 'shadow') ? (cell && cell.shadowUnit) : (cell && cell.unit);
          const isEnemyUnit = targetUnit && targetUnit.owner !== selected.owner;
          const isEnemyHeart = (viewRealm === 'overworld') && cell && cell.heart && cell.heart.owner && cell.heart.owner !== selected.owner;
          if (isEnemyUnit || isEnemyHeart) {
            const dx = Math.abs(selected.x - cx);
            const dy = Math.abs(selected.y - cy);
            const canDiag = !!(def.canAttackDiagonal || selected.defId === 'archer' || selected.defId === 'naval');
            const cls = (dx === 0 || dy === 0) ? 'highlight-attack-ortho' : (canDiag ? 'highlight-attack-diag' : 'highlight-attack');
            addAttackOverlayAt(cx, cy, cls);
          }
        }
      });

      cellEl.addEventListener('mouseleave', () => {
        clearMoveAttackOverlays();
      });
  
      grid.appendChild(cellEl);
    }
  }

  // clear previews when leaving the grid entirely
  grid.addEventListener('mouseleave', () => {
    clearMoveAttackOverlays();
  });

  // Persistent overlays for selected unit: movement tiles tinted by owner color, and attackable enemy targets
  const selected = st.selectedUnit;
  if (selected && !st.abilityTargeting) {
    const viewRealm = st.viewRealm || 'overworld';
    if ((selected.realm || 'overworld') === viewRealm) {
      const ownerCls = 'owner-' + (selected.owner || 1);
      // Movement tiles
      const reachable = computeReachable(selected);
      for (const key of reachable) {
        const [mx, my] = key.split(',').map(Number);
        if (mx === selected.x && my === selected.y) continue;
        addOverlayAt(mx, my, `highlight-move ${ownerCls}`);
      }
      // Attackable enemy tiles
      const attackMap = computeAttackOverlay(selected);
      for (const [k, type] of attackMap) {
        const [ax, ay] = k.split(',').map(Number);
        if (!canAttackTarget(selected, ax, ay)) continue;
        const cls = type === 'diag' ? 'highlight-attack-diag' : 'highlight-attack-ortho';
        // Persistent selection attack overlays should NOT be tagged as preview
        addOverlayAt(ax, ay, cls);
      }
    }
  }

  // toggle board style
  const boardPanel = document.getElementById('boardPanel');
  if (boardPanel) {
    if (st.viewRealm === 'shadow') boardPanel.classList.add('shadow-view');
    else boardPanel.classList.remove('shadow-view');
  }

  ensureRealmToggle();
  updateRealmToggle();
}

function ensureRealmToggle() {
  let toggle = document.getElementById('realmToggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'realmToggle';
    toggle.className = 'realm-toggle';
    toggle.title = 'Switch view between Overworld and Shadow Realm';
    toggle.addEventListener('click', () => {
      const st = getState();
      if (!st) return;
      st.viewRealm = (st.viewRealm === 'overworld') ? 'shadow' : 'overworld';
      if (typeof window.updateUI === 'function') window.updateUI();
    });
    const boardPanel = document.getElementById('boardPanel');
    if (boardPanel) boardPanel.appendChild(toggle);
  }
}

function updateRealmToggle() {
  const st = getState();
  const toggle = document.getElementById('realmToggle');
  if (!st || !toggle) return;

  // Show toggle only if current player has at least one unit in shadow realm
  let hasShadow = false;
  for (let y = 0; y < st.board.length && !hasShadow; y++) {
    for (let x = 0; x < st.board[0].length; x++) {
      const c = getCell(x, y);
      if (c && c.shadowUnit && c.shadowUnit.owner === st.currentPlayer) { hasShadow = true; break; }
    }
  }
  toggle.style.display = hasShadow ? 'block' : 'none';
  toggle.textContent = (st.viewRealm === 'shadow') ? 'View: Shadow' : 'View: Overworld';
}

function clearElement(el) { 
  if (!el) return; 
  while (el.firstChild) el.removeChild(el.firstChild); 
}

// Movement/Attack preview helpers
function gridEl() {
  return document.getElementById('grid');
}

function clearMoveAttackOverlays() {
  const grid = gridEl();
  if (!grid) return;
  // Only clear hover-preview overlays; persistent selection overlays remain
  grid.querySelectorAll('.highlight-overlay.preview').forEach(n => n.remove());
}

function addOverlayAt(x, y, cls) {
  const grid = gridEl(); if (!grid) return;
  const idx = y * GRID_WIDTH + x;
  const cellEl = grid.children[idx];
  if (!cellEl) return;
  // avoid duplicating same overlay
  if (cellEl.querySelector(`.highlight-overlay.${cls.split(' ').join('.')}`)) return;
  const ov = document.createElement('div');
  ov.className = `highlight-overlay ${cls}`;
  cellEl.appendChild(ov);
}

function addAttackOverlayAt(x, y, cls) {
  const c = cls || 'highlight-attack';
  addOverlayAt(x, y, `${c} preview`);
}

function drawMovePath(path) {
  // path is array of {x,y} including start and end; draw borders on each tile except the origin
  const s = getState();
  const ownerCls = (s && s.selectedUnit) ? ('owner-' + s.selectedUnit.owner) : '';
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    const cls = ownerCls ? `highlight-move preview ${ownerCls}` : 'highlight-move preview';
    addOverlayAt(step.x, step.y, cls);
  }
}

function inBounds(x, y) {
  return window.NexusCore && typeof window.NexusCore.inBounds === 'function' ? window.NexusCore.inBounds(x, y) : (x >= 0 && y >= 0 && x < GRID_WIDTH && y < GRID_WIDTH);
}

function canEnter(unit, nx, ny, def) {
  const c = getCell(nx, ny);
  if (!c) return false;
  const realm = unit.realm || 'overworld';
  const occupied = (realm === 'shadow') ? !!c.shadowUnit : !!c.unit;
  if (occupied) return false;
  // Blockers for both realms to prevent overlap with overworld objects
  const overworldBlocked = !!(c.heart || c.spawner || c.blockedForMovement);
  const waterBlocked = (c.terrain === 'water' && !(def.canMoveOnWater || unit.defId === 'naval') && c.terrain !== 'bridge');
  const mountainBlocked = (c.terrain === 'mountain' && !def.canClimb);
  if (overworldBlocked || waterBlocked || mountainBlocked) return false;
  return true;
}

function computePath(unit, tx, ty, def) {
  if (!unit) return null;
  const startKey = `${unit.x},${unit.y}`;
  const targetKey = `${tx},${ty}`;
  const visited = new Set([startKey]);
  const parent = new Map();
  const q = [{ x: unit.x, y: unit.y, d: 0 }];
  const maxSteps = (() => {
    const UNIT_TYPES = window.UNIT_TYPES || {};
    const d = def || (UNIT_TYPES[unit.defId] || {});
    return (unit.move || d.move || 1) + (unit._tempMoveBonus || 0);
  })();
  while (q.length) {
    const cur = q.shift();
    if (cur.d > maxSteps) continue;
    if (cur.x === tx && cur.y === ty) {
      // reconstruct
      const path = [];
      let k = targetKey;
      let node = { x: tx, y: ty };
      path.push(node);
      while (parent.has(k)) {
        const p = parent.get(k);
        node = { x: p.x, y: p.y };
        path.push(node);
        k = `${p.x},${p.y}`;
      }
      // include start
      path.push({ x: unit.x, y: unit.y });
      path.reverse();
      // validate within steps
      if (path.length - 1 <= maxSteps) return path;
      return null;
    }
    if (cur.d >= maxSteps) continue;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!canEnter(unit, nx, ny, def)) continue;
      visited.add(key);
      parent.set(key, { x: cur.x, y: cur.y });
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return null;
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
  if (!inRange || unit.actionsLeft <= 0) return false;
  // Must be valid target: enemy unit in same realm, or enemy heart in overworld
  const c = getCell(tx, ty);
  const realm = unit.realm || 'overworld';
  if (realm === 'shadow') {
    const target = c && c.shadowUnit;
    return !!(target && target.owner !== unit.owner);
  } else {
    const target = c && c.unit;
    if (target && target.owner !== unit.owner) return true;
    if (c && c.heart && c.heart.owner && c.heart.owner !== unit.owner) return true;
    return false;
  }
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
      const occupied = unit.realm === 'shadow' ? !!cell.shadowUnit : !!cell.unit;
      if (occupied) continue;
      const overworldBlocked = !!(cell.heart || cell.spawner || cell.blockedForMovement);
      const waterBlocked = (cell.terrain === 'water' && !(def.canMoveOnWater || unit.defId === 'naval') && cell.terrain !== 'bridge');
      const mountainBlocked = (cell.terrain === 'mountain' && !def.canClimb);
      if (overworldBlocked || waterBlocked || mountainBlocked) continue;
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
  for (let y = 0; y < GRID_WIDTH; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const isSelf = (x === unit.x && y === unit.y);
      if (isSelf) continue;
      const manhattan = Math.abs(unit.x - x) + Math.abs(unit.y - y);
      const chebyshev = Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y));
      if (canAttackDiagonal) {
        if (chebyshev <= range) {
          const type = (Math.abs(unit.x - x) === 0 || Math.abs(unit.y - y) === 0) ? 'ortho' : 'diag';
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

function drawAbilityHoverPreview(unit, tx, ty) {
  const st = getState();
  if (!st || !st.abilityTargeting) return;
  const at = st.abilityTargeting;
  // Archer Volley: show 3x3 purple boundary if target within attack range
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const range = unit.range || def.range || 1;
  const dx = Math.abs(unit.x - tx);
  const dy = Math.abs(unit.y - ty);
  const canDiag = !!(def.canAttackDiagonal || unit.defId === 'archer' || unit.defId === 'naval');
  const dist = canDiag ? Math.max(dx, dy) : (dx + dy);
  const inRange = dist <= range;

  // Clear any previous ability preview overlays (tagged as preview)
  const grid = gridEl();
  if (grid) grid.querySelectorAll('.highlight-overlay.preview').forEach(n => n.remove());

  // Volley (archer): target type enemy_in_range — preview 3x3 area
  const name = (def.abilities && def.abilities[at.abilityIndex] && def.abilities[at.abilityIndex].name || '').toLowerCase();
  if (unit.defId === 'archer' && name.includes('volley') && inRange) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const x = tx + ox, y = ty + oy;
        if (!inBounds(x, y)) continue;
        addOverlayAt(x, y, 'highlight-ability highlight-volley-boundary preview');
      }
    }
    return;
  }

  // Builder Build Bridge: single tile adjacent water preview
  if (unit.defId === 'builder' && name.includes('build')) {
    if (Math.abs(tx - unit.x) <= 1 && Math.abs(ty - unit.y) <= 1) {
      const c = getCell(tx, ty);
      if (c && c.terrain === 'water') {
        addOverlayAt(tx, ty, 'highlight-ability preview');
        return;
      }
    }
  }

  // Generic ability preview: mark the hovered tile if targeting mode is active
  addOverlayAt(tx, ty, 'highlight-ability preview');
}