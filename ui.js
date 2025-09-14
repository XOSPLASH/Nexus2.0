// ui.js — UI helpers: spawn highlighting, shop toggle behavior, spawn-only-for-current-player
(function(){
  'use strict';
  const gridEl = document.getElementById('grid') || document.querySelector('.grid');
  const shopListEl = document.getElementById('shop-list') || document.getElementById('shop-groups') || document.querySelector('.shop-list');

  function getState(){ return (window.__nexus_game && window.__nexus_game.state) ? window.__nexus_game.state : null; }
  function clearSpawnHighlights(){ if (!gridEl) return; gridEl.querySelectorAll('.highlight-overlay.spawn-highlight').forEach(n => n.remove()); }

  function addSpawnOverlayAt(x,y){
    if (!gridEl) return;
    const st = getState(); if (!st) return;
    const idx = y * st.board.length + x;
    const cellEl = gridEl.children[idx];
    if (!cellEl) return;
    if (cellEl.querySelector('.highlight-overlay.spawn-highlight')) return;
    const ov = document.createElement('div');
    ov.className = 'highlight-overlay spawn-highlight';
    cellEl.appendChild(ov);
  }

  function canSpawnAtWrapper(x,y,owner){
    const st = getState(); if (!st) return false;
    if (window.NexusSpawners && typeof window.NexusSpawners.canSpawnAt === 'function') {
      return window.NexusSpawners.canSpawnAt(st, x, y, owner);
    }
    // fallback
    for (let sy=0; sy<st.board.length; sy++){
      for (let sx=0; sx<st.board.length; sx++){
        const s = st.board[sy][sx];
        if (s && s.spawner && s.spawner.owner === owner){
          if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1) return true;
        }
      }
    }
    return false;
  }

  function terrainAllowsPlacement(def, cell){
    if (!def || !cell) return false;
    if (def.waterOnly) return (cell.terrain === 'water' || cell.terrain === 'bridge');
    if (!def.waterOnly && cell.terrain === 'water') return false;
    if (cell.terrain === 'mountain' && !def.canClimbMountain) return false;
    return true;
  }

  function highlightSpawnableTiles(def, player){
    clearSpawnHighlights();
    const st = getState(); if (!st || !def) return;
    const N = st.board.length;
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        const cell = st.board[y][x];
        if (cell.unit) continue;
        if (!canSpawnAtWrapper(x,y,player)) continue;
        if (!terrainAllowsPlacement(def, cell)) continue;
        addSpawnOverlayAt(x,y);
      }
    }
  }

  function refreshSpawnHighlightsIfPending(){
    const st = getState(); if (!st) return;
    const pick = st.pendingShopSelection && st.pendingShopSelection[st.currentPlayer];
    if (!pick || !pick.def) { clearSpawnHighlights(); return; }
    highlightSpawnableTiles(pick.def, st.currentPlayer);
  }

  // toggle shop item selection (also ensures only one dropdown open)
  if (shopListEl){
    shopListEl.addEventListener('click', (ev) => {
      const section = ev.target.closest('.shop-section');
      if (section){
        // header toggles handled in game.js.populateShopForPlayer (DOM created there) — leave that
      }
      const item = ev.target.closest('.shop-item');
      if (!item) return;
      // the game.js attached click handler already toggles selection/pending state and calls highlightSpawnableTiles
      // we only ensure only one cost group is open at a time (done in game.js), and keep spawn highlights in sync
      setTimeout(()=> refreshSpawnHighlightsIfPending(), 40);
    });
  }

  // clicking the grid (outside cells) clears spawn highlights if nothing pending
  if (gridEl){
    gridEl.addEventListener('click', (ev) => {
      setTimeout(()=> refreshSpawnHighlightsIfPending(), 60);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSpawnHighlights();
  });

  window.__nexus_ui = window.__nexus_ui || {};
  window.__nexus_ui.highlightSpawnableTiles = highlightSpawnableTiles;
  window.__nexus_ui.clearSpawnHighlights = clearSpawnHighlights;
  window.__nexus_ui.refreshSpawnHighlightsIfPending = refreshSpawnHighlightsIfPending;

  // initial refresh
  setTimeout(()=> refreshSpawnHighlightsIfPending(), 150);
})();
