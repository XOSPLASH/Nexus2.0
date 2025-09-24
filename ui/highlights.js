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
  const cellEl = gridEl?.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cellEl) return;
  if (cellEl.querySelector('.highlight-overlay.spawn-highlight')) return;
  const ov = document.createElement('div');
  ov.className = 'highlight-overlay spawn-highlight';
  ov.style.outlineOffset = '0px';
  cellEl.appendChild(ov);
}

export function highlightSpawnableTiles(def, player) {
  clearSpawnHighlights();
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;
  const st = window.NexusCore?.state;
  if (!st) return;
  const isWaterOnly = !!(def && def.waterOnly);
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      const cell = window.NexusCore.getCell(x, y);
      if (!cell || cell.unit) continue;
      if (cell.nexus || cell.spawner || cell.heart) continue;
      if (!window.NexusMechanics.isSpawnableForPlayer(def, x, y, player)) continue;
      addSpawnOverlayAt(x, y);
      // If water-only unit, also lightly preview radius-2 around spawner for visual clarity
      if (isWaterOnly) {
        const sp = window.NexusMechanics.getSpawnerForPlayer(player);
        if (sp && Math.abs(sp.x - x) <= 2 && Math.abs(sp.y - y) <= 2 && (Math.abs(sp.x - x) > 1 || Math.abs(sp.y - y) > 1)) {
          const ov = gridEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"] .highlight-overlay.spawn-highlight`);
          if (ov) ov.classList.add('radius2');
        }
      }
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