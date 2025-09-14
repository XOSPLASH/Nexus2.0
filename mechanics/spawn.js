// mechanics/spawn.js
// Spawner and heart placement, spawn validation

import { state } from "../core/state.js";
import { getCell, inBounds, BOARD_SIZE } from "../core/board.js";
import { UNIT_TYPES } from "../data/units.js";

export function placeSpawnersAndHearts() {
  // Clear previous spawners/hearts
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (c) {
        if (c.spawner) c.spawner = null;
        if (c.heart) c.heart = null;
        c.blockedForMovement = false;
      }
    }
  }

  // symmetric spawner placement: pick a bottom-half candidate for P1 and mirror to P2
  const bottomYMin = Math.floor(BOARD_SIZE * 0.60);
  const bottomYMax = BOARD_SIZE - 2;
  const xMin = 2, xMax = BOARD_SIZE - 3;

  const candidates = [];
  for (let y = bottomYMin; y <= bottomYMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const mx = BOARD_SIZE - 1 - x, my = BOARD_SIZE - 1 - y;
      if (!inBounds(mx, my)) continue;
      const c1 = getCell(x, y);
      const c2 = getCell(mx, my);
      if (isMarkerPlacable(c1) && isMarkerPlacable(c2)) {
        candidates.push({ x, y, mx, my });
      }
    }
  }
  shuffleArray(candidates);

  let p1SpawnerCell = null, p2SpawnerCell = null;
  for (const cand of candidates) {
    const c1 = getCell(cand.x, cand.y);
    const c2 = getCell(cand.mx, cand.my);
    if (isMarkerPlacable(c1) && isMarkerPlacable(c2)) {
      p1SpawnerCell = c1; p2SpawnerCell = c2; break;
    }
  }

  // fallback near vertical center if none found
  if (!p1SpawnerCell || !p2SpawnerCell) {
    const cx = Math.floor(BOARD_SIZE / 2);
    p1SpawnerCell = getCell(cx, BOARD_SIZE - 2);
    p2SpawnerCell = getCell(BOARD_SIZE - 1 - cx, 1);
  }

  if (p1SpawnerCell) {
    p1SpawnerCell.spawner = { owner: 1 };
    p1SpawnerCell.blockedForMovement = true;
    state.players[1].spawner = { x: p1SpawnerCell.x, y: p1SpawnerCell.y };
  }
  if (p2SpawnerCell) {
    p2SpawnerCell.spawner = { owner: 2 };
    p2SpawnerCell.blockedForMovement = true;
    state.players[2].spawner = { x: p2SpawnerCell.x, y: p2SpawnerCell.y };
  }

  // Place hearts with mirrored offsets relative to spawners
  placeMirroredHearts(p1SpawnerCell, p2SpawnerCell);
}

function placeMirroredHearts(sp1, sp2) {
  if (!sp1 || !sp2) return;
  const offsets = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy });
    }
  }
  shuffleArray(offsets);

  let placed = false;
  for (const { dx, dy } of offsets) {
    const h1x = sp1.x + dx, h1y = sp1.y + dy;
    const h2x = sp2.x - dx, h2y = sp2.y - dy; // mirrored offset
    if (!inBounds(h1x, h1y) || !inBounds(h2x, h2y)) continue;
    const c1 = getCell(h1x, h1y);
    const c2 = getCell(h2x, h2y);
    if (isMarkerPlacable(c1) && isMarkerPlacable(c2)) {
      c1.heart = { owner: 1 }; c1.blockedForMovement = true; state.players[1].heart = { x: h1x, y: h1y };
      c2.heart = { owner: 2 }; c2.blockedForMovement = true; state.players[2].heart = { x: h2x, y: h2y };
      placed = true; break;
    }
  }

  if (!placed) {
    // fallback adjacent (radius 1)
    for (let dy = -1; dy <= 1 && !placed; dy++) {
      for (let dx = -1; dx <= 1 && !placed; dx++) {
        if (dx === 0 && dy === 0) continue;
        const h1x = sp1.x + dx, h1y = sp1.y + dy;
        const h2x = sp2.x - dx, h2y = sp2.y - dy;
        if (!inBounds(h1x, h1y) || !inBounds(h2x, h2y)) continue;
        const c1 = getCell(h1x, h1y);
        const c2 = getCell(h2x, h2y);
        if (isMarkerPlacable(c1) && isMarkerPlacable(c2)) {
          c1.heart = { owner: 1 }; c1.blockedForMovement = true; state.players[1].heart = { x: h1x, y: h1y };
          c2.heart = { owner: 2 }; c2.blockedForMovement = true; state.players[2].heart = { x: h2x, y: h2y };
          placed = true;
        }
      }
    }
  }

  if (!placed) {
    // final fallback: on spawner tiles (symmetric by construction)
    sp1.heart = { owner: 1 }; sp1.blockedForMovement = true; state.players[1].heart = { x: sp1.x, y: sp1.y };
    sp2.heart = { owner: 2 }; sp2.blockedForMovement = true; state.players[2].heart = { x: sp2.x, y: sp2.y };
  }
}

export function isSpawnableForPlayer(def, x, y, player) {
  if (!inBounds(x, y)) return false;
  const cell = getCell(x, y);
  if (!cell || cell.unit) return false;
  // disallow spawning onto markers
  if (cell.nexus || cell.spawner || cell.heart) return false;
  if (cell.blockedForMovement) return false;
  
  // terrain rules
  if (def && def.waterOnly) {
    if (cell.terrain !== 'water' && cell.terrain !== 'bridge') return false;
  } else {
    if (cell.terrain === 'water' && !(def && def.canCrossWater) && !(def && def.waterOnly)) return false;
    if (cell.terrain === 'mountain' && !(def && def.canClimbMountain)) return false;
  }
  
  // must be adjacent to player's spawner
  const spawner = state.players[player].spawner;
  if (!spawner) return false;
  
  if (Math.abs(spawner.x - x) <= 1 && Math.abs(spawner.y - y) <= 1) return true;
  
  return false;
}

export function getSpawnerForPlayer(player) {
  return state.players[player]?.spawner || null;
}

export function getHeartForPlayer(player) {
  return state.players[player]?.heart || null;
}

// Helper function for marker placement
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