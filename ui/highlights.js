// ui/highlights.js
// Movement, attack, and spawn highlighting

import { state } from "../core/state.js";
import { BOARD_SIZE, getCell } from "../core/board.js";
import { isSpawnableForPlayer } from "../mechanics/spawn.js";

function clearSpawnHighlights() {
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;
  gridEl.querySelectorAll('.highlight-overlay.spawn-highlight').forEach(n => n.remove());
}

function addSpawnOverlayAt(x, y) {
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;
  const idx = y * BOARD_SIZE + x;
  const cellEl = gridEl.children[idx];
  if (!cellEl) return;
  if (cellEl.querySelector('.highlight-overlay.spawn-highlight')) return;
  const ov = document.createElement('div');
  ov.className = 'highlight-overlay spawn-highlight';
  cellEl.appendChild(ov);
}

export function highlightSpawnableTiles(def, player) {
  clearSpawnHighlights();
  if (!def) return;
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = getCell(x, y);
      if (!cell || cell.unit) continue;
      if (cell.nexus || cell.spawner || cell.heart) continue;
      if (!isSpawnableForPlayer(def, x, y, player)) continue;
      addSpawnOverlayAt(x, y);
    }
  }
}

export function refreshSpawnHighlightsIfPending() {
  const pick = state.pendingShopSelection && state.pendingShopSelection[state.currentPlayer];
  if (!pick || !pick.def) { 
    clearSpawnHighlights(); 
    return; 
  }
  highlightSpawnableTiles(pick.def, state.currentPlayer);
}

export { clearSpawnHighlights };