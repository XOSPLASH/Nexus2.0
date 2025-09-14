// core/map.js
// Symmetric terrain generation

import { state } from "./state.js";
import { BOARD_SIZE, getCell, initBoard } from "./board.js";

const TERRAIN_WEIGHTS = { plain: 0.30, water: 0.25, forest: 0.25, mountain: 0.20 };

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

export function generateSymmetricMapWithDensity() {
  // Repeated attempts to ensure reasonable density/clustered features
  for (let attempt = 0; attempt < 12; attempt++) {
    initBoard();
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
    // center row if odd: enforce horizontal mirror for perfect symmetry
    if (BOARD_SIZE % 2 === 1) {
      const y = half;
      for (let x = 0; x < half; x++) {
        const t = (Math.random() < 0.22) ? sampleTerrain() : 'plain';
        state.board[y][x].terrain = t;
        state.board[y][BOARD_SIZE - 1 - x].terrain = t;
      }
      // middle cell maps to itself
      state.board[y][half].terrain = (Math.random() < 0.22) ? sampleTerrain() : 'plain';
    }

    // simple smoothing passes
    for (let p = 0; p < 3; p++) {
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
      // re-impose perfect symmetry after smoothing
      for (let y = 0; y < half; y++) {
        const my = BOARD_SIZE - 1 - y;
        for (let x = 0; x < BOARD_SIZE; x++) {
          const mx = BOARD_SIZE - 1 - x;
          state.board[my][mx].terrain = state.board[y][x].terrain;
        }
      }
      if (BOARD_SIZE % 2 === 1) {
        const y = half;
        for (let x = 0; x < half; x++) {
          const t = state.board[y][x].terrain;
          state.board[y][BOARD_SIZE - 1 - x].terrain = t;
        }
      }
    }

    // enforce balanced terrain density thresholds
    const totalCells = BOARD_SIZE * BOARD_SIZE;
    const counts = { water: 0, forest: 0, mountain: 0, plain: 0 };
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const t = state.board[y][x].terrain || 'plain';
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    const nonPlain = totalCells - counts.plain;
    const nonPlainRatio = nonPlain / totalCells; // target ~45%
    const waterRatio = counts.water / totalCells;
    const forestRatio = counts.forest / totalCells;
    const mountainRatio = counts.mountain / totalCells;

    const ok = (
      nonPlainRatio >= 0.55 && nonPlainRatio <= 0.65 &&
      waterRatio >= 0.14 && waterRatio <= 0.26 &&
      forestRatio >= 0.14 && forestRatio <= 0.26 &&
      mountainRatio >= 0.12 && mountainRatio <= 0.18
    );

    if (ok) break;
  }
}