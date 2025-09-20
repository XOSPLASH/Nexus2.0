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
  const st = getState();
  if (!st) return;
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';

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
        cellEl.appendChild(uEl);
      }
  
      grid.appendChild(cellEl);
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
      
      // respect occupancy by realm
      const occupied = unit.realm === 'shadow' ? !!cell.shadowUnit : !!cell.unit;
      if (occupied) continue;

      // blockers only apply in overworld
      if (unit.realm !== 'shadow') {
        if (cell.heart || cell.spawner) continue;
        if (cell.blockedForMovement) continue;
        if (cell.terrain === 'water' && !(def.canMoveOnWater || unit.defId === 'naval') && cell.terrain !== 'bridge') continue;
        if (cell.terrain === 'mountain' && !def.canClimb) continue;
      }
      
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