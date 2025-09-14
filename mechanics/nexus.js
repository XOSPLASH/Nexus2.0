// mechanics/nexus.js
// Nexus placement, capture, and damage logic

import { state } from "../core/state.js";
import { getCell, BOARD_SIZE, inBounds } from "../core/board.js";

const NEXUS_PAIRS = 2; // number of upper-half chosen positions; total nexuses = pairs * 2 = 4

export function placeNexusesSymmetric() {
  // clear previous markers
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (c && c.nexus) c.nexus = null;
    }
  }
  state.nexuses = [];

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
    
    if (!inBounds(mx, my)) continue;
    const c1 = getCell(x, y), c2 = getCell(mx, my);
    if (!c1 || !c2) continue;
    
    const key1 = `${x},${y}`, key2 = `${mx},${my}`;
    if (used.has(key1) || used.has(key2)) continue;
    
    // don't place too close to spawners/hearts or on bad terrain
    if (!isMarkerPlacable(c1) || !isMarkerPlacable(c2)) continue;
    if (isNearOtherMarker(c1, 3) || isNearOtherMarker(c2, 3)) continue;
    
    // place neutral nexus
    c1.nexus = { owner: null };
    c2.nexus = { owner: null };
    state.nexuses.push({ x, y, owner: null });
    state.nexuses.push({ x: mx, y: my, owner: null });
    
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
        
        c1.nexus = { owner: null }; 
        c2.nexus = { owner: null };
        state.nexuses.push({ x, y, owner: null });
        state.nexuses.push({ x: mx, y: my, owner: null });
        placedPairs++;
      }
    }
  }
}

export function applyCaptureAndDamage() {
  // Capture: unit standing on nexus captures it immediately
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (c && c.nexus && c.unit) {
        if (c.nexus.owner !== c.unit.owner) {
          c.nexus.owner = c.unit.owner;
          // update state.nexuses array
          const nexus = state.nexuses.find(n => n.x === x && n.y === y);
          if (nexus) nexus.owner = c.unit.owner;
        }
      }
    }
  }

  // Damage: for each nexus owned by a player, apply 1 damage to the opponent once per turn
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = getCell(x, y);
      if (c && c.nexus && c.nexus.owner) {
        const owner = c.nexus.owner;
        const opponent = owner === 1 ? 2 : 1;
        const key = `${x},${y}`;
        
        if (!state.lastNexusDamageTurn[key] || state.lastNexusDamageTurn[key] < state.turn) {
          state.players[opponent].hp = Math.max(0, state.players[opponent].hp - 1);
          state.lastNexusDamageTurn[key] = state.turn;
          
          if (state.players[opponent].hp <= 0) {
            state.winner = owner;
          }
        }
      }
    }
  }
}

// Helper functions
function isMarkerPlacable(cell) {
  if (!cell) return false;
  if (cell.unit || cell.nexus || cell.spawner || cell.heart) return false;
  if (cell.terrain === 'mountain' || cell.terrain === 'water' || cell.terrain === 'forest') return false;
  return true;
}

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

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}