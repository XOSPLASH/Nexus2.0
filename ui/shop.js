// ui/shop.js
// Shop interface and unit selection

function getState() {
  return window.NexusCore ? window.NexusCore.state : null;
}

export function populateShopForPlayer(playerIndex) {
  const shopListEl = document.getElementById('shop-list');
  if (!shopListEl) return;
  
  const state = getState();
  if (!state) return;
  
  const UNIT_TYPES = window.UNIT_TYPES || {};
  
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
    const section = document.createElement('div'); 
    section.className = 'shop-section';
    const header = document.createElement('div'); 
    header.className = 'shop-header';
    header.innerHTML = `<span>Cost ${cost}</span><span class="chev">▾</span>`;
    const items = document.createElement('div'); 
    items.className = 'shop-items'; 
    items.style.display = 'none';

    header.addEventListener('click', () => {
      document.querySelectorAll('.shop-section').forEach(s => {
        if (s !== section) { 
          s.classList.remove('open'); 
          const si = s.querySelector('.shop-items'); 
          if (si) si.style.display = 'none'; 
        }
      });
      const isOpen = section.classList.toggle('open');
      items.style.display = isOpen ? 'block' : 'none';
    });

    buckets[cost].forEach(({ key, def }) => {
      const item = document.createElement('div'); 
      item.className = 'shop-item'; 
      item.dataset.defKey = key;
      const left = document.createElement('div'); 
      left.className = 'shop-left';
      left.innerHTML = `<strong>${def.symbol ? def.symbol + ' ' : ''}${def.name || key}</strong><div class="shop-desc">${def.description || ''}</div>`;
      const right = document.createElement('div'); 
      right.className = 'shop-right'; 
      right.textContent = String(def.cost || cost);
      item.appendChild(left); 
      item.appendChild(right);

      item.addEventListener('click', () => {
        const currentState = getState();
        if (!currentState) return;
        
        const prev = currentState.pendingShopSelection[currentState.currentPlayer];
        if (prev && prev.key === key) {
          currentState.pendingShopSelection[currentState.currentPlayer] = null;
          document.querySelectorAll('.shop-item').forEach(si => si.classList.remove('selected'));
          if (window.NexusUI && window.NexusUI.clearSpawnHighlights) {
            window.NexusUI.clearSpawnHighlights();
          }
          showEmptyDetails();
          return;
        }
        currentState.pendingShopSelection[currentState.currentPlayer] = { key, def };
        document.querySelectorAll('.shop-item').forEach(si => si.classList.remove('selected'));
        item.classList.add('selected');
        showUnitDetailsForDef(def);
        if (window.NexusUI && window.NexusUI.highlightSpawnableTiles) {
          window.NexusUI.highlightSpawnableTiles(def, currentState.currentPlayer);
        }
      });

      items.appendChild(item);
    });

    section.appendChild(header);
    section.appendChild(items);
    shopListEl.appendChild(section);
  });
}

function showUnitDetailsForDef(def) {
  const unitDetailsEl = document.getElementById('unit-details');
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

function showEmptyDetails() {
  const unitDetailsEl = document.getElementById('unit-details');
  if (unitDetailsEl) {
    unitDetailsEl.classList.add('empty');
    unitDetailsEl.innerHTML = `<div class="unit-details empty">Select a unit or terrain</div>`;
  }
}

function clearElement(el) { 
  if (!el) return; 
  while (el.firstChild) el.removeChild(el.firstChild); 
}