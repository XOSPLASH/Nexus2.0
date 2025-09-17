// game.js — Nexus core engine (full, updated for random symmetric nexuses + movement fix)
/*
  Key changes in this version:
  - 4 Nexuses generated each game with randomness but symmetric placement.
  - Nexuses are NOT movement-blocking; units can move onto and move off them.
  - Nexus capture occurs at end of turn (unit stands on Nexus at end of turn).
  - Captured Nexuses change owner and apply 1 damage per nexus to the opponent once per turn.
  - Nexus placement avoids spawners, hearts, mountains, water, and forest (keeps them reachable).
  - Spawner placement + spawn rules: units can only spawn on tiles adjacent (8-way) to their spawner.
  - Hearts are attackable (reduce player HP).
  - Many helper functions and a UI highlight helper exposed on window.__nexus_ui remain present.
  - Public API for AI exposed on window.__nexus_game.
*/

(function () {
  'use strict';

  /* ======================
     Config
     ====================== */
  const BOARD_SIZE = 11;
  const ACTIONS_PER_TURN = 2;
  const ENERGY_PER_TURN = 5;
  const ENERGY_TURNS = 10;
  const ENERGY_CAP = 50;
  const NEXUS_PAIRS = 2; // number of upper-half chosen positions; total nexuses = pairs * 2 (mirrored) = 4

  /* ======================
     DOM tolerant lookups
     ====================== */
  const byId = id => document.getElementById(id);
  const gridEl = byId('grid') || document.querySelector('.grid');
  const shopListEl = byId('shop-list') || document.querySelector('.shop-list');
  const unitDetailsEl = byId('unit-details') || document.querySelector('.unit-details');
  const p1HpEl = byId('player1-hp') || byId('p1-hp');
  const p2HpEl = byId('player2-hp') || byId('p2-hp');
  const p1EnergyEl = byId('player1-energy') || byId('p1-energy');
  const p2EnergyEl = byId('player2-energy') || byId('p2-energy');
  const endTurnBtn = byId('endTurnBtn') || byId('end-turn') || byId('endTurn');
  const newGameBtn = byId('newGameBtn') || byId('new-game') || byId('newGame');

  // Units should be defined in units.js as window.UNIT_TYPES or window.UNIT_MAP
  const UNIT_TYPES = window.UNIT_TYPES || window.UNIT_MAP || {};

  /* ======================
     Game State
     ====================== */
  const state = {
    board: [], // 2D array
    players: {
      1: { hp: 20, energy: 5, energyTurnsUsed: 0, purchased: new Set() },
      2: { hp: 20, energy: 5, energyTurnsUsed: 0, purchased: new Set() }
    },
    currentPlayer: 1,
    turnNumber: 1,
    lastNexusDamageTurn: {}, // "x,y" -> turn number when last damage applied
    selectedUnit: null,
    pendingShopSelection: { 1: null, 2: null },
    unitIdCounter: 1,
    winner: null
  };

  function uid() { return 'u' + (state.unitIdCounter++).toString(36); }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE; }
  function getCell(x, y) { return inBounds(x, y) ? state.board[y][x] : null; }

  /* ======================
     Terrain generation (denser, symmetric)
     ====================== */
  const TERRAIN_WEIGHTS = { plain: 0.50, water: 0.17, forest: 0.17, mountain: 0.16 };

  function sampleTerrain() {
    const entries = Object.entries(TERRAIN_WEIGHTS);
    let total = entries.reduce((s, e) => s + e[1], 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) {
      if (r < w) return k;
      r -= w;
    }
    return entries[0][0];
  }

  function createEmptyBoard() {
    state.board = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      const row = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        row.push({ x, y, terrain: 'plain', unit: null, nexus: null, spawner: null, heart: null, blockedForMovement: false });
      }
      state.board.push(row);
    }
  }

  function generateSymmetricMapWithDensity() {
    // Repeated attempts to ensure reasonable density/clustered features
    for (let attempt = 0; attempt < 8; attempt++) {
      createEmptyBoard();
      const half = Math.floor(BOARD_SIZE / 2);

      // top half random
      for (let y = 0; y < half; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (Math.random() < 0.65) state.board[y][x].terrain = sampleTerrain();
          else state.board[y][x].terrain = 'plain';
        }
      }
      // mirror to bottom half with horizontal + vertical flip for fair orientation
      for (let y = 0; y < half; y++) {
        const my = BOARD_SIZE - 1 - y;
        for (let x = 0; x < BOARD_SIZE; x++) {
          const mx = BOARD_SIZE - 1 - x;
          state.board[my][mx].terrain = state.board[y][x].terrain;
        }
      }
      // center row if odd
      if (BOARD_SIZE % 2 === 1) {
        const y = half;
        for (let x = 0; x < BOARD_SIZE; x++) {
          state.board[y][x].terrain = (Math.random() < 0.22) ? sampleTerrain() : 'plain';
        }
      }

      // simple smoothing passes
      for (let p = 0; p < 2; p++) {
        const snapshot = state.board.map(r => r.map(c => c.terrain));
        for (let y = 0; y < BOARD_SIZE; y++) {
          for (let x = 0; x < BOARD_SIZE; x++) {
            const counts = {};
            for (let yy = Math.max(0, y - 1); yy <= Math.min(BOARD_SIZE - 1, y + 1); yy++) {
              for (let xx = Math.max(0, x - 1); xx <= Math.min(BOARD_SIZE - 1, x + 1); xx++) {
                const t = snapshot[yy][xx];
                counts[t] = (counts[t] || 0) + 1;
              }
            }
            // pick majority
            let best = 'plain', bestN = -1;
            for (const k in counts) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
            if (Math.random() < 0.08) state.board[y][x].terrain = sampleTerrain();
            else state.board[y][x].terrain = best;
          }
        }
      }

      // ensure some minimum non-plain coverage
      const nonPlain = state.board.reduce((acc, row) => acc + row.filter(c => c.terrain !== 'plain').length, 0);
      if (nonPlain / (BOARD_SIZE * BOARD_SIZE) > 0.42) break;
    }
  }

  /* ======================
     Markers: spawners, hearts, nexuses (symmetry + no overlap)
     ====================== */

  // helper: marker placement preference - avoid forests/mountains/water so accessible
  function isMarkerPlacable(cell) {
    if (!cell) return false;
    if (cell.unit || cell.nexus || cell.spawner || cell.heart) return false;
    // avoid rough terrain for markers
    if (cell.terrain === 'mountain' || cell.terrain === 'water' || cell.terrain === 'forest') return false;
    return true;
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function placeMarkersRandomSymmetric() {
    // clear previous markers
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const c = getCell(x, y);
        c.nexus = null; c.spawner = null; c.heart = null; c.blockedForMovement = false;
      }
    }

    // place spawners: choose top region for enemy (player 2), bottom region for player 1
    const mid = Math.floor(BOARD_SIZE / 2);
    function findSpawnerFor(bottomSide) {
      const yMin = bottomSide ? Math.floor(BOARD_SIZE * 0.6) : 1;
      const yMax = bottomSide ? BOARD_SIZE - 2 : Math.floor(BOARD_SIZE * 0.4);
      const attempts = 300;
      for (let t = 0; t < attempts; t++) {
        const x = 2 + Math.floor(Math.random() * (BOARD_SIZE - 4)); // avoid edges
        const y = yMin + Math.floor(Math.random() * Math.max(1, (yMax - yMin + 1)));
        if (!inBounds(x, y)) continue;
        const c = getCell(x, y);
        if (isMarkerPlacable(c)) return c;
      }
      // fallback: center-ish
      return bottomSide ? getCell(mid, BOARD_SIZE - 2) : getCell(mid, 1);
    }

    const p1Spawner = findSpawnerFor(true);
    const p2Spawner = findSpawnerFor(false);
    if (p1Spawner) { p1Spawner.spawner = { owner: 1 }; p1Spawner.blockedForMovement = true; }
    if (p2Spawner) { p2Spawner.spawner = { owner: 2 }; p2Spawner.blockedForMovement = true; }

    // place hearts near spawners (not overlapping)
    function placeHeartNear(spawnerCell, owner) {
      if (!spawnerCell) return;
      const candidates = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = spawnerCell.x + dx, y = spawnerCell.y + dy;
          if (!inBounds(x, y)) continue;
          const c = getCell(x, y);
          if (!isMarkerPlacable(c)) continue;
          candidates.push(c);
        }
      }
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        pick.heart = { owner }; pick.blockedForMovement = true;
      } else {
        // fallback immediate adjacent
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = spawnerCell.x + dx, y = spawnerCell.y + dy;
            if (!inBounds(x, y)) continue;
            const c = getCell(x, y);
            if (isMarkerPlacable(c)) { c.heart = { owner }; c.blockedForMovement = true; return; }
          }
        }
        spawnerCell.heart = { owner }; spawnerCell.blockedForMovement = true;
      }
    }

    placeHeartNear(p1Spawner, 1);
    placeHeartNear(p2Spawner, 2);

    // Place NEXUS_PAIRS random positions in the upper half central zone, mirror each to lower half.
    const candidates = [];
    const xMin = 2, xMax = BOARD_SIZE - 3;
    const yMin = 1, yMax = Math.floor(BOARD_SIZE / 2) - 1;
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) candidates.push({ x, y });
    }
    shuffleArray(candidates);

    let placedPairs = 0;
    const used = new Set();

    for (const cand of candidates) {
      if (placedPairs >= NEXUS_PAIRS) break;
      const x = cand.x, y = cand.y;
      const mx = BOARD_SIZE - 1 - x, my = BOARD_SIZE - 1 - y;
      // avoid duplicates and conflict
      if (!inBounds(mx, my)) continue;
      const c1 = getCell(x, y), c2 = getCell(mx, my);
      if (!c1 || !c2) continue;
      const key1 = `${x},${y}`, key2 = `${mx},${my}`;
      if (used.has(key1) || used.has(key2)) continue;
      // don't place too close to spawners/hearts or on bad terrain
      if (!isMarkerPlacable(c1) || !isMarkerPlacable(c2)) continue;
      if (isNearOtherMarker(c1, 3) || isNearOtherMarker(c2, 3)) continue;
      // place neutral nexus
      c1.nexus = { owner: null }; c1.blockedForMovement = false;
      c2.nexus = { owner: null }; c2.blockedForMovement = false;
      used.add(key1); used.add(key2);
      placedPairs++;
    }

    // if we couldn't place enough pairs, brute-force fill symmetric spots near center
    if (placedPairs < NEXUS_PAIRS) {
      for (let y = Math.floor(BOARD_SIZE / 2) - 1; y <= Math.floor(BOARD_SIZE / 2) + 1 && placedPairs < NEXUS_PAIRS; y++) {
        for (let x = 2; x < BOARD_SIZE - 2 && placedPairs < NEXUS_PAIRS; x++) {
          const mx = BOARD_SIZE - 1 - x, my = BOARD_SIZE - 1 - y;
          const c1 = getCell(x, y), c2 = getCell(mx, my);
          if (!c1 || !c2) continue;
          if (!isMarkerPlacable(c1) || !isMarkerPlacable(c2)) continue;
          if (isNearOtherMarker(c1, 2) || isNearOtherMarker(c2, 2)) continue;
          c1.nexus = { owner: null }; c2.nexus = { owner: null };
          placedPairs++;
        }
      }
    }

    // Helper to check proximity to existing markers
    function isNearOtherMarker(cell, radius) {
      for (let yy = Math.max(0, cell.y - radius); yy <= Math.min(BOARD_SIZE - 1, cell.y + radius); yy++) {
        for (let xx = Math.max(0, cell.x - radius); xx <= Math.min(BOARD_SIZE - 1, cell.x + radius); xx++) {
          const cc = getCell(xx, yy);
          if (!cc) continue;
          if (cc.spawner || cc.heart || cc.nexus) return true;
        }
      }
      return false;
    }

    // ensure spawners/hearts remain blocked; nexuses explicitly NOT blocked for movement
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (c.spawner || c.heart) c.blockedForMovement = true;
      if (c.nexus) c.blockedForMovement = false;
    }
  }

  /* ======================
     Rendering
     ====================== */
  function clearElement(el) { if (!el) return; while (el.firstChild) el.removeChild(el.firstChild); }
  function renderBoard() {
    if (!gridEl) return;
    clearElement(gridEl);
    gridEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size, 40px))`;

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const c = getCell(x, y);
        const cellEl = document.createElement('div');
        cellEl.className = 'cell ' + (c.terrain || 'plain');

        // Nexus (neutral or owned)
        if (c.nexus) {
          const el = document.createElement('div'); el.className = 'marker-full nexus';
          el.textContent = '◆';
          if (c.nexus.owner === 1) el.classList.add('owner-1');
          else if (c.nexus.owner === 2) el.classList.add('owner-2');
          else el.classList.add('neutral');
          cellEl.appendChild(el);
        }

        // Spawner
        if (c.spawner) {
          const el = document.createElement('div'); el.className = 'marker-full spawner';
          el.textContent = '⛓';
          if (c.spawner.owner === 1) el.classList.add('player');
          else if (c.spawner.owner === 2) el.classList.add('enemy');
          cellEl.appendChild(el);
        }

        // Heart
        if (c.heart) {
          const el = document.createElement('div'); el.className = 'marker-full heart';
          el.textContent = '♥';
          if (c.heart.owner === 1) el.classList.add('player');
          else if (c.heart.owner === 2) el.classList.add('enemy');
          // small HP badge
          const hpBadge = document.createElement('div'); hpBadge.className = 'heart-hp'; hpBadge.textContent = String(state.players[c.heart.owner || 1].hp);
          el.appendChild(hpBadge);
          cellEl.appendChild(el);
        }

        // Unit
        if (c.unit) {
          const u = c.unit;
          const ue = document.createElement('div'); ue.className = 'unit-el owner-' + (u.owner || 1);
          ue.textContent = u.symbol || (u.name ? u.name.charAt(0) : '?');
          const hp = document.createElement('div'); hp.className = 'unit-hp'; hp.textContent = String(u.hp);
          const ap = document.createElement('div'); ap.className = 'unit-actions'; ap.textContent = String(u.actionsLeft || 0);
          ue.appendChild(hp); ue.appendChild(ap);
          cellEl.appendChild(ue);
        }

        // click handler
        cellEl.addEventListener('click', (ev) => { ev.stopPropagation(); handleCellClick(x, y); });

        gridEl.appendChild(cellEl);
      }
    }

    refreshSelectionVisuals();
  }

  /* ======================
     Info & Shop helpers
     ====================== */
  function showUnitDetailsForDef(def) {
    if (!unitDetailsEl) return;
    unitDetailsEl.classList.remove('empty');
    unitDetailsEl.innerHTML = `
      <div class="unit-name">${def.name || 'Unit'}</div>
      <div class="unit-description">${def.description || ''}</div>
      <div class="unit-stat"><span class="unit-stat-label">Cost</span><span>${def.cost || 0}</span></div>
      ${def.hp ? `<div class="unit-stat"><span class="unit-stat-label">HP</span><span>${def.hp}</span></div>` : ''}
      ${def.atk || def.attack ? `<div class="unit-stat"><span class="unit-stat-label">ATK</span><span>${def.atk || def.attack}</span></div>` : ''}
      ${def.range ? `<div class="unit-stat"><span class="unit-stat-label">RNG</span><span>${def.range}</span></div>` : ''}
      ${def.move ? `<div class="unit-stat"><span class="unit-stat-label">MOVE</span><span>${def.move}</span></div>` : ''}
      <div class="unit-abilities">${(def.abilities || []).slice(0, 2).map(a => `<button class="unit-ability-btn" disabled>${a.name}</button>`).join('')}</div>
    `;
  }

  function showUnitDetailsForInstance(unit) {
    if (!unitDetailsEl) return;
    const def = UNIT_TYPES[unit.defId] || {};
    const cell = getCell(unit.x, unit.y);
    const tileName = cell && cell.terrain ? (cell.terrain.charAt(0).toUpperCase() + cell.terrain.slice(1)) : 'Plain';
    const tileExtra = (cell && (cell.nexus || cell.spawner || cell.heart)) ?
      `${cell.nexus ? ' + Nexus' : ''}${cell.spawner ? ' + Spawner' : ''}${cell.heart ? ' + Heart' : ''}` : '';
    unitDetailsEl.classList.remove('empty');
    unitDetailsEl.innerHTML = `
      <div class="unit-name">${def.name || unit.name || 'Unit'}</div>
      <div class="unit-description">${def.description || ''}</div>
      <div class="unit-stat"><span class="unit-stat-label">Location</span><span>${tileName}${tileExtra}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">HP</span><span>${unit.hp}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">ATK</span><span>${unit.attack || def.atk || def.attack || 0}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">RNG</span><span>${unit.range || def.range || 1}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">MOVE</span><span>${unit.move || def.move || 1}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">ACTIONS</span><span>${unit.actionsLeft || 0}/${ACTIONS_PER_TURN}</span></div>
      <div class="unit-abilities">${(def.abilities || []).slice(0, 2).map((a, idx) => `<button class="unit-ability-btn" data-ability-index="${idx}">${a.name}</button>`).join('')}</div>
    `;

    // bind ability actions when available
    const btns = unitDetailsEl.querySelectorAll('.unit-ability-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.abilityIndex);
        const ability = (def.abilities || [])[idx];
        if (ability && typeof ability.action === 'function' && unit.actionsLeft > 0) {
          try {
            const res = ability.action(unit, getPublicState());
            if (res && res.msg) console.info('Ability:', res.msg);
          } catch (e) {
            console.error('Ability error', e);
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          updateUI();
        }
      });
    });
  }

  function showCellInfo(x, y) {
    const c = getCell(x, y);
    if (!unitDetailsEl || !c) return;
    if (c.unit) return showUnitDetailsForInstance(c.unit);
    if (c.heart) {
      const owner = c.heart.owner ? `P${c.heart.owner}` : 'Neutral';
      unitDetailsEl.innerHTML = `<div class="unit-name">Heart (${owner})</div><div class="unit-description">Player life pool. Attackable — if a player's heart reaches 0 you lose.</div><div class="unit-stat"><span class="unit-stat-label">HP</span><span>${c.heart.owner ? state.players[c.heart.owner].hp : '-'}</span></div>`;
      return;
    }
    if (c.nexus) {
      const owner = c.nexus.owner ? `P${c.nexus.owner}` : 'Neutral';
      unitDetailsEl.innerHTML = `<div class="unit-name">Nexus (${owner})</div><div class="unit-description">Capture by ending your turn while a unit stands here. Captured nexuses deal 1 damage per turn to the opponent.</div>`;
      return;
    }
    if (c.spawner) {
      const owner = c.spawner.owner ? `P${c.spawner.owner}` : 'Neutral';
      unitDetailsEl.innerHTML = `<div class="unit-name">Spawner (${owner})</div><div class="unit-description">Place units adjacent (8-way) to this tile. Spawner tiles are blocked for movement.</div>`;
      return;
    }
    unitDetailsEl.innerHTML = `<div class="unit-name">${(c.terrain || 'Plain').charAt(0).toUpperCase() + (c.terrain || 'plain').slice(1)}</div><div class="unit-description">A terrain tile.</div>`;
  }

  /* ======================
     Movement / Reachability
     ====================== */
  function computeReachable(unit) {
    const set = new Set();
    if (!unit) return set;
    const def = UNIT_TYPES[unit.defId] || {};
    const maxSteps = unit.move || def.move || 1;
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
        if (!inBounds(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        const cell = getCell(nx, ny);
        if (!cell) continue;
        // can't move onto occupied
        if (cell.unit) continue;
        // cannot step onto blocked markers (spawner/heart)
        if (cell.blockedForMovement) continue;
        // terrain restrictions
        if (cell.terrain === 'mountain' && !(def.canClimbMountain)) continue;
        if (cell.terrain === 'water' && !(def.canCrossWater) && !def.waterOnly) continue;
        visited.add(key);
        set.add(key);
        q.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
    return set;
  }

  function canAttack(unit, tx, ty) {
    if (!unit) return false;
    const def = UNIT_TYPES[unit.defId] || {};
    const range = unit.range || def.range || 1;
    const dist = Math.abs(unit.x - tx) + Math.abs(unit.y - ty);
    return dist <= range;
  }

  /* ======================
     Spawn rules: only adjacent (8-way) to player's spawner
     ====================== */
  function isSpawnableForPlayer(def, x, y, player) {
    if (!inBounds(x, y)) return false;
    const cell = getCell(x, y);
    if (!cell || cell.unit) return false;
    // disallow spawning onto markers
    if (cell.nexus || cell.spawner || cell.heart) return false;
    if (cell.blockedForMovement) return false;
    // terrain rules
    if (def.waterOnly) {
      if (cell.terrain !== 'water' && cell.terrain !== 'bridge') return false;
    } else {
      if (cell.terrain === 'water' && !def.canCrossWater && !def.waterOnly) return false;
      if (cell.terrain === 'mountain' && !def.canClimbMountain) return false;
    }
    // must be adjacent to player's spawner
    for (let sy = 0; sy < BOARD_SIZE; sy++) {
      for (let sx = 0; sx < BOARD_SIZE; sx++) {
        const sc = getCell(sx, sy);
        if (sc && sc.spawner && sc.spawner.owner === player) {
          if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1) return true;
        }
      }
    }
    return false;
  }

  /* ======================
     Actions: place, move, attack
     ====================== */
  function placeUnitFromShopAt(x, y) {
    const pick = state.pendingShopSelection[state.currentPlayer];
    if (!pick) return false;
    const def = pick.def;
    if (!def || !inBounds(x, y)) return false;
    if (!isSpawnableForPlayer(def, x, y, state.currentPlayer)) return false;
    const cost = Number(def.cost || 0);
    if (state.players[state.currentPlayer].energy < cost) return false;
    // deduct energy
    state.players[state.currentPlayer].energy -= cost;
    const unit = {
      id: uid(),
      defId: def.id || def.name || pick.key,
      name: def.name || pick.key,
      symbol: def.symbol || '?',
      hp: def.hp || def.health || 1,
      attack: def.attack || def.atk || 1,
      range: def.range || 1,
      move: def.move || 1,
      owner: state.currentPlayer,
      x, y,
      actionsLeft: ACTIONS_PER_TURN
    };
    getCell(x, y).unit = unit;
    // remove from shop for this player
    state.players[state.currentPlayer].purchased.add(def.id || def.name || pick.key);
    state.pendingShopSelection[state.currentPlayer] = null;
    if (window.__nexus_ui && window.__nexus_ui.clearSpawnHighlights) window.__nexus_ui.clearSpawnHighlights();
    updateUI();
    return true;
  }

  function moveUnitTo(unit, tx, ty) {
    if (!unit) return false;
    if (unit.owner !== state.currentPlayer) return false;
    if ((unit.actionsLeft || 0) <= 0) return false;
    if (!inBounds(tx, ty)) return false;
    const src = getCell(unit.x, unit.y);
    const dst = getCell(tx, ty);
    if (!dst || dst.unit) return false;
    if (dst.blockedForMovement) return false;
    const reachable = computeReachable(unit);
    if (!reachable.has(`${tx},${ty}`)) return false;
    src.unit = null;
    unit.x = tx; unit.y = ty;
    dst.unit = unit;
    unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
    updateUI();
    return true;
  }

  function attackAt(attacker, tx, ty) {
    if (!attacker) return false;
    if (attacker.owner !== state.currentPlayer) return false;
    if ((attacker.actionsLeft || 0) <= 0) return false;
    if (!inBounds(tx, ty)) return false;
    const targetCell = getCell(tx, ty);
    if (!targetCell) return false;

    // attack unit
    if (targetCell.unit) {
      const target = targetCell.unit;
      if (target.owner === attacker.owner) return false;
      if (!canAttack(attacker, tx, ty)) return false;
      const dmg = attacker.attack || 1;
      target.hp -= dmg;
      attacker.actionsLeft = Math.max(0, (attacker.actionsLeft || 0) - 1);
      flashUnitAt(tx, ty);
      if (target.hp <= 0) targetCell.unit = null;
      updateUI();
      return true;
    }

    // attack heart
    if (targetCell.heart && targetCell.heart.owner) {
      const owner = targetCell.heart.owner;
      if (owner === attacker.owner) return false;
      if (!canAttack(attacker, tx, ty)) return false;
      const dmg = attacker.attack || 1;
      state.players[owner].hp = Math.max(0, state.players[owner].hp - dmg);
      attacker.actionsLeft = Math.max(0, (attacker.actionsLeft || 0) - 1);
      flashHeartAt(tx, ty);
      if (state.players[owner].hp <= 0) { state.winner = attacker.owner; setTimeout(() => alert(`Player ${attacker.owner} wins! Heart destroyed.`), 50); }
      updateUI();
      return true;
    }

    return false;
  }

  function flashUnitAt(x, y) {
    if (!gridEl) return;
    const idx = y * BOARD_SIZE + x;
    const cellEl = gridEl.children[idx];
    if (!cellEl) return;
    const ue = cellEl.querySelector('.unit-el');
    if (ue) { ue.classList.add('attack-flash'); setTimeout(() => ue.classList.remove('attack-flash'), 360); }
  }

  function flashHeartAt(x, y) {
    if (!gridEl) return;
    const idx = y * BOARD_SIZE + x;
    const cellEl = gridEl.children[idx];
    if (!cellEl) return;
    const he = cellEl.querySelector('.marker-full.heart');
    if (he) { he.classList.add('attack-flash'); setTimeout(() => he.classList.remove('attack-flash'), 360); }
  }

  /* ======================
     Selection & click handling
     ====================== */
  function deselectUnit() {
    state.selectedUnit = null;
    refreshSelectionVisuals();
    if (unitDetailsEl) unitDetailsEl.innerHTML = `<div class="unit-details empty">Select a unit or terrain</div>`;
  }

  function handleCellClick(x, y) {
    const cell = getCell(x, y);
    if (!cell) return;

    // If player selected a shop unit, attempt to place
    if (state.pendingShopSelection[state.currentPlayer]) {
      const ok = placeUnitFromShopAt(x, y);
      if (!ok) showCellInfo(x, y);
      return;
    }

    // If cell has unit
    if (cell.unit) {
      // friendly
      if (cell.unit.owner === state.currentPlayer) {
        if (state.selectedUnit && state.selectedUnit.id === cell.unit.id) deselectUnit();
        else { state.selectedUnit = cell.unit; showUnitDetailsForInstance(cell.unit); }
        refreshSelectionVisuals();
        return;
      }
      // enemy: if we have a selected unit that can attack -> attack, else show info
      if (state.selectedUnit && canAttack(state.selectedUnit, x, y) && state.selectedUnit.actionsLeft > 0) {
        attackAt(state.selectedUnit, x, y);
      } else {
        showUnitDetailsForInstance(cell.unit);
      }
      return;
    }

    // empty tile
    if (state.selectedUnit) {
      const moved = moveUnitTo(state.selectedUnit, x, y);
      if (!moved) showCellInfo(x, y);
      return;
    }

    // otherwise show info about the cell (terrain/marker)
    showCellInfo(x, y);
  }

  /* ======================
     Nexus capture & damage (ensure once per nexus per turn)
     ====================== */
  function applyNexusCaptureAndDamage() {
    // This function is now handled by the modular version in mechanics/nexus.js
    // The modular version has proper turn tracking to prevent double damage
    // We don't call the modular version here to prevent double damage
    // The modular version is called from core/turn.js
  }

  /* ======================
     Turn management
     ====================== */
  function endTurn() {
    if (state.winner) return;
    // apply capture/damage for nexuses (units that are standing on them capture them)
    applyNexusCaptureAndDamage();

    // increment turn & switch current player
    state.turnNumber++;
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

    // energy gain at start of player's turn (limited times)
    const p = state.players[state.currentPlayer];
    if (p.energyTurnsUsed < ENERGY_TURNS) {
      p.energy = Math.min(ENERGY_CAP, (p.energy || 0) + ENERGY_PER_TURN);
      p.energyTurnsUsed = (p.energyTurnsUsed || 0) + 1;
    }

    // reset actions for new player's units
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
      const u = getCell(x, y).unit;
      if (u && u.owner === state.currentPlayer) u.actionsLeft = ACTIONS_PER_TURN;
    }

    // deselect selection
    state.selectedUnit = null;
    updateUI();

    // AI hook (player 2)
    if (state.currentPlayer === 2 && typeof window.aiTakeTurn === 'function') {
      setTimeout(() => {
        try { window.aiTakeTurn(getPublicState()); } catch (e) { console.error('AI error', e); }
        updateUI();
      }, 150);
    }
  }

  /* ======================
     Visuals: highlights & attack marker
     ====================== */
  function refreshSelectionVisuals() {
    if (!gridEl) return;
    // clear overlays
    gridEl.querySelectorAll('.highlight-overlay').forEach(n => n.remove());
    gridEl.querySelectorAll('.unit-el.selected').forEach(n => n.classList.remove('selected'));
    gridEl.querySelectorAll('.unit-el.attackable-target').forEach(n => n.classList.remove('attackable-target'));
    gridEl.querySelectorAll('.marker-full.heart.attackable-target').forEach(n => n.classList.remove('attackable-target'));

    if (state.selectedUnit) {
      const reachable = computeReachable(state.selectedUnit);
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const key = `${x},${y}`;
          if (reachable.has(key)) {
            const idx = y * BOARD_SIZE + x;
            const cellEl = gridEl.children[idx];
            if (cellEl) {
              const overlay = document.createElement('div');
              overlay.className = 'highlight-overlay highlight-move';
              cellEl.appendChild(overlay);
            }
          }
        }
      }
      // mark selected unit
      const su = state.selectedUnit;
      const idx = su.y * BOARD_SIZE + su.x;
      const selCellEl = gridEl.children[idx];
      if (selCellEl) {
        const ue = selCellEl.querySelector('.unit-el');
        if (ue) ue.classList.add('selected');
      }
    }

    // mark attackable enemies/hearts
    if (state.selectedUnit) {
      const s = state.selectedUnit;
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const c = getCell(x, y);
          if (c.unit && c.unit.owner !== s.owner && canAttack(s, x, y)) {
            const idx = y * BOARD_SIZE + x;
            const ue = gridEl.children[idx].querySelector('.unit-el');
            if (ue) ue.classList.add('attackable-target');
          }
          if (c.heart && c.heart.owner && c.heart.owner !== s.owner && canAttack(s, x, y)) {
            const idx = y * BOARD_SIZE + x;
            const he = gridEl.children[idx].querySelector('.marker-full.heart');
            if (he) he.classList.add('attackable-target');
          }
        }
      }
    }

    // spawn highlight if pending
    if (window.__nexus_ui && typeof window.__nexus_ui.refreshSpawnHighlightsIfPending === 'function') window.__nexus_ui.refreshSpawnHighlightsIfPending();
  }

  /* ======================
     Shop population
     ====================== */
  function populateShopForPlayer(playerIndex) {
    if (!shopListEl) return;
    clearElement(shopListEl);

    const buckets = {};
    for (const key in UNIT_TYPES) {
      const def = UNIT_TYPES[key];
      if (!def || typeof def.cost === 'undefined') continue;
      if (def.cost <= 0) continue; // skip summon-only
      if (state.players[playerIndex].purchased.has(def.id || def.name || key)) continue;
      const cost = Number(def.cost || 0);
      (buckets[cost] = buckets[cost] || []).push({ key, def });
    }
    const costs = Object.keys(buckets).map(n => +n).sort((a, b) => a - b);

    costs.forEach(cost => {
      const section = document.createElement('div'); section.className = 'shop-section';
      const header = document.createElement('div'); header.className = 'shop-header';
      header.innerHTML = `<span>Cost ${cost}</span><span class="chev">▾</span>`;
      const items = document.createElement('div'); items.className = 'shop-items'; items.style.display = 'none';

      header.addEventListener('click', () => {
        document.querySelectorAll('.shop-section').forEach(s => {
          if (s !== section) { s.classList.remove('open'); const si = s.querySelector('.shop-items'); if (si) si.style.display = 'none'; }
        });
        const isOpen = section.classList.toggle('open');
        items.style.display = isOpen ? 'block' : 'none';
      });

      buckets[cost].forEach(({ key, def }) => {
        const item = document.createElement('div'); item.className = 'shop-item'; item.dataset.defKey = key;
        const left = document.createElement('div'); left.className = 'shop-left';
        left.innerHTML = `<strong>${def.symbol ? def.symbol + ' ' : ''}${def.name || key}</strong><div class="shop-desc">${def.description || ''}</div>`;
        const right = document.createElement('div'); right.className = 'shop-right'; right.textContent = String(def.cost || cost);
        item.appendChild(left); item.appendChild(right);

        item.addEventListener('click', () => {
          const prev = state.pendingShopSelection[state.currentPlayer];
          if (prev && prev.key === key) {
            state.pendingShopSelection[state.currentPlayer] = null;
            document.querySelectorAll('.shop-item').forEach(si => si.classList.remove('selected'));
            if (window.__nexus_ui && window.__nexus_ui.clearSpawnHighlights) window.__nexus_ui.clearSpawnHighlights();
            if (unitDetailsEl) unitDetailsEl.innerHTML = `<div class="unit-details empty">Select a unit or terrain</div>`;
            return;
          }
          state.pendingShopSelection[state.currentPlayer] = { key, def };
          document.querySelectorAll('.shop-item').forEach(si => si.classList.remove('selected'));
          item.classList.add('selected');
          showUnitDetailsForDef(def);
          if (window.__nexus_ui && window.__nexus_ui.highlightSpawnableTiles) window.__nexus_ui.highlightSpawnableTiles(def, state.currentPlayer);
        });

        items.appendChild(item);
      });

      section.appendChild(header);
      section.appendChild(items);
      shopListEl.appendChild(section);
    });
  }

  function populateShopAll() { populateShopForPlayer(state.currentPlayer); }

  /* ======================
     HUD updates
     ====================== */
  function updateHUD() {
    if (p1HpEl) p1HpEl.textContent = String(state.players[1].hp);
    if (p2HpEl) p2HpEl.textContent = String(state.players[2].hp);
    if (p1EnergyEl) p1EnergyEl.textContent = String(state.players[1].energy || 0);
    if (p2EnergyEl) p2EnergyEl.textContent = String(state.players[2].energy || 0);
  }

  function updateUI() {
    renderBoard();
    updateHUD();
    populateShopAll();
  }

  /* ======================
     Public state/AI helpers
     ====================== */
  function getPublicState() {
    return {
      board: state.board.map(row => row.map(c => ({
        x: c.x, y: c.y, terrain: c.terrain,
        nexus: c.nexus ? { ...c.nexus } : null,
        spawner: c.spawner ? { ...c.spawner } : null,
        heart: c.heart ? { ...c.heart } : null,
        unit: c.unit ? { ...c.unit } : null
      }))),
      players: JSON.parse(JSON.stringify({ 1: state.players[1], 2: state.players[2] })),
      currentPlayer: state.currentPlayer,
      turnNumber: state.turnNumber
    };
  }

  /* ======================
     API exposed
     ====================== */
  function placeUnit(defId, x, y, owner) {
    if (!inBounds(x, y)) return false;
    const cell = getCell(x, y);
    if (!cell || cell.unit) return false;
    const def = UNIT_TYPES[defId] || null;
    if (!def) return false;
    if (!isSpawnableForPlayer(def, x, y, owner || state.currentPlayer)) return false;
    const u = {
      id: uid(),
      defId,
      name: def.name || defId,
      symbol: def.symbol || '?',
      hp: def.hp || 1,
      attack: def.attack || def.atk || 1,
      range: def.range || 1,
      move: def.move || 1,
      owner: owner || state.currentPlayer,
      x, y, actionsLeft: ACTIONS_PER_TURN
    };
    cell.unit = u;
    return true;
  }
  function moveUnit(unit, x, y) { return moveUnitTo(unit, x, y); }
  function attackUnit(attacker, x, y) { return attackAt(attacker, x, y); }
  function getState() { return getPublicState(); }

  /* ======================
     UI helper: spawn highlights (exposed on __nexus_ui)
     ====================== */
  window.__nexus_ui = window.__nexus_ui || {};
  (function (ui) {
    let lastHighlights = [];
    ui.clearSpawnHighlights = function () {
      if (!gridEl) return;
      gridEl.querySelectorAll('.spawn-highlight').forEach(n => n.remove());
      lastHighlights = [];
    };
    ui.highlightSpawnableTiles = function (def, playerIndex) {
      ui.clearSpawnHighlights();
      if (!gridEl) return;
      const highlights = [];
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const c = getCell(x, y);
          if (!c || c.unit) continue;
          if (c.nexus || c.spawner || c.heart) continue;
          if (!isSpawnableForPlayer(def, x, y, playerIndex)) continue;
          const idx = y * BOARD_SIZE + x;
          const cellEl = gridEl.children[idx];
          if (!cellEl) continue;
          const overlay = document.createElement('div'); overlay.className = 'highlight-overlay spawn-highlight';
          cellEl.appendChild(overlay);
          highlights.push({ x, y });
        }
      }
      lastHighlights = highlights;
    };
    ui.refreshSpawnHighlightsIfPending = function () {
      const pick = state.pendingShopSelection[state.currentPlayer];
      if (pick && pick.def) ui.highlightSpawnableTiles(pick.def, state.currentPlayer);
    };
  })(window.__nexus_ui);

  /* ======================
     Reset / init
     ====================== */
  function resetGame() {
    state.unitIdCounter = 1;
    state.selectedUnit = null;
    state.pendingShopSelection = { 1: null, 2: null };
    state.players[1] = { hp: 20, energy: 5, energyTurnsUsed: 0, purchased: new Set() };
    state.players[2] = { hp: 20, energy: 5, energyTurnsUsed: 0, purchased: new Set() };
    state.currentPlayer = 1;
    state.turnNumber = 1;
    state.lastNexusDamageTurn = {};
    state.winner = null;

    generateSymmetricMapWithDensity();
    placeMarkersRandomSymmetric();

    // clear units
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) getCell(x, y).unit = null;

    updateUI();
  }

  // bind buttons (tolerant)
  if (endTurnBtn) endTurnBtn.addEventListener('click', () => endTurn());
  if (newGameBtn) newGameBtn.addEventListener('click', () => resetGame());

  // keyboard: ESC to deselect
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') deselectUnit(); });

  // expose API for AI/debug
  window.__nexus_game = window.__nexus_game || {};
  Object.assign(window.__nexus_game, {
    state, getState, getPublicState, placeUnit, placeUnitFromShopAt: placeUnitFromShopAt, moveUnit, moveUnitTo,
    attackUnit, attackAt, endTurn, resetGame, populateShopForPlayer, updateUI
  });

  // initial start
  resetGame();

  console.info('game.js initialized — nexuses random+symmetrical, capturable, not blocking movement.');
})();
