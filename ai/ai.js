// ai/ai.js
// Simple but robust AI for player 2

const AI_PLAYER = 2;
const BOARD_SIZE = 11;

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function getState() {
  return window.NexusCore ? window.NexusCore.state : null;
}

function getCell(x, y) {
  return window.NexusCore ? window.NexusCore.getCell(x, y) : null;
}

function inBounds(x, y) {
  return window.NexusCore ? window.NexusCore.inBounds(x, y) : false;
}

function findUnitsForPlayer(player) {
  const units = [];
  const state = getState();
  if (!state) return units;
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = getCell(x, y);
      if (cell && cell.unit && cell.unit.owner === player) {
        units.push(cell.unit);
      }
    }
  }
  return units;
}

function findEnemyUnitsFor(player) {
  const units = [];
  const state = getState();
  if (!state) return units;
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = getCell(x, y);
      if (cell && cell.unit && cell.unit.owner !== player) {
        units.push(cell.unit);
      }
    }
  }
  return units;
}

function getPlayerHeartPos(player) {
  const state = getState();
  if (!state) return null;
  const heart = state.players[player]?.heart;
  return heart ? { x: heart.x, y: heart.y } : null;
}

function listSpawnTilesForPlayer(player) {
  const state = getState();
  if (!state) return [];
  
  const spawner = state.players[player]?.spawner;
  if (!spawner) return [];
  
  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = spawner.x + dx, y = spawner.y + dy;
      if (!inBounds(x, y)) continue;
      
      const cell = getCell(x, y);
      if (!cell || cell.unit) continue;
      if (cell.nexus || cell.spawner || cell.heart) continue;
      if (cell.blockedForMovement) continue;
      
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function stepTowards(unit, tx, ty) {
  if (!unit || (unit.actionsLeft || 0) <= 0) return false;
  if (!window.NexusCore) return false;
  
  let dx = 0, dy = 0;
  if (unit.x < tx) dx = 1; else if (unit.x > tx) dx = -1;
  if (unit.y < ty) dy = 1; else if (unit.y > ty) dy = -1;

  // Try prioritized steps: diagonal if both dx/dy non-zero, then x, then y
  const candidates = [];
  if (dx !== 0 && dy !== 0) candidates.push({ x: unit.x + dx, y: unit.y + dy });
  if (dx !== 0) candidates.push({ x: unit.x + dx, y: unit.y });
  if (dy !== 0) candidates.push({ x: unit.x, y: unit.y + dy });

  for (const c of candidates) {
    if (!inBounds(c.x, c.y)) continue;
    const cell = getCell(c.x, c.y);
    if (!cell) continue;
    // don't walk onto hearts/spawners (blocked by engine) or occupied tiles
    if (cell.unit) continue;
    if (cell.spawner || cell.heart) continue;
    if (cell.blockedForMovement) continue;
    
    // attempt move via core action which will do final validation
    const did = window.NexusCore.moveUnit(unit, c.x, c.y);
    if (did) return true;
  }
  return false;
}

// --- New AI helpers ---
function countRoles(units) {
  const counts = { soldier: 0, archer: 0, medic: 0, builder: 0, scout: 0, naval: 0, tank: 0, other: 0 };
  for (const u of units) {
    const id = u.defId;
    if (counts.hasOwnProperty(id)) counts[id]++; else counts.other++;
  }
  return counts;
}

function hasAdjacentWater(x, y) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const c = getCell(nx, ny);
      if (c && c.terrain === 'water' && !c.unit && !c.heart && !c.spawner) return true;
    }
  }
  return false;
}

function anyFriendlyWoundedNear(x, y, radius, player) {
  for (let yy = Math.max(0, y - radius); yy <= Math.min(BOARD_SIZE - 1, y + radius); yy++) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(BOARD_SIZE - 1, x + radius); xx++) {
      const c = getCell(xx, yy);
      if (c && c.unit && c.unit.owner === player) {
        const def = (window.UNIT_TYPES || {})[c.unit.defId] || {};
        const maxHp = def.hp || c.unit.hp;
        if (c.unit.hp < maxHp) return true;
      }
    }
  }
  return false;
}

function chooseSpawnTile(tiles, state) {
  if (!tiles || tiles.length === 0) return null;
  // Prefer tiles closer to the nearest neutral or enemy-controlled nexus, else toward enemy heart
  let targets = [];
  for (const nx of state.nexuses) {
    if (nx.owner !== AI_PLAYER) targets.push({ x: nx.x, y: nx.y });
  }
  const enemyHeart = getPlayerHeartPos(1);
  if (targets.length === 0 && enemyHeart) targets.push(enemyHeart);
  if (targets.length === 0) return tiles[0];

  let bestTile = null, bestScore = Infinity;
  for (const t of tiles) {
    let d = Infinity;
    for (const target of targets) {
      const dt = manhattan(t.x, t.y, target.x, target.y);
      if (dt < d) d = dt;
    }
    if (d < bestScore) { bestScore = d; bestTile = t; }
  }
  return bestTile || tiles[0];
}

function chooseSpawnUnit(energy, counts, nearWater) {
  const UT = window.UNIT_TYPES || {};
  // Simple composition rules
  // Ensure at least 1 frontline, 1 ranged, and a support if affordable; occasionally a scout
  const canAfford = id => (UT[id] && (UT[id].cost || 0) <= energy);

  if (nearWater && canAfford('naval')) return 'naval';
  if (counts.soldier < 2 && canAfford('soldier')) return 'soldier';
  if (counts.archer < 1 && canAfford('archer')) return 'archer';
  if (counts.medic < 1 && canAfford('medic')) return 'medic';
  if (counts.tank < 1 && canAfford('tank')) return 'tank';
  if (canAfford('scout')) return 'scout';
  if (canAfford('soldier')) return 'soldier';
  // fallback: pick any affordable non-summon unit with lowest cost
  const ids = Object.keys(UT).filter(k => !UT[k].summonOnly && (UT[k].cost || 0) > 0 && (UT[k].cost || 0) <= energy);
  ids.sort((a,b) => (UT[a].cost||0) - (UT[b].cost||0));
  return ids[0] || null;
}

function tryUseAbility(unit) {
  if (!unit || (unit.actionsLeft || 0) <= 0) return false;
  if (!window.NexusCore) return false;
  const defId = unit.defId;
  const state = getState();

  // helpers
  const enemies = findEnemyUnitsFor(AI_PLAYER);
  const hasEnemyInRange = (rng) => {
    for (const e of enemies) {
      const d = Math.abs(unit.x - e.x) + Math.abs(unit.y - e.y);
      if (d <= rng) return true;
    }
    const enemyHeart = getPlayerHeartPos(1);
    if (enemyHeart) {
      const d = Math.abs(unit.x - enemyHeart.x) + Math.abs(unit.y - enemyHeart.y);
      if (d <= rng) return true;
    }
    return false;
  };

  switch (defId) {
    case 'medic': {
      // heal adjacent friendly
      if (anyFriendlyWoundedNear(unit.x, unit.y, 1, AI_PLAYER)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'builder': {
      // build bridge if adjacent water exists
      if (hasAdjacentWater(unit.x, unit.y)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'archer': {
      // volley if any target within 3 (default archer range)
      if (hasEnemyInRange(3)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'naval': {
      // bombard if enemy within 2
      if (hasEnemyInRange(2)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'tank': {
      // overrun if adjacent enemy
      if (hasEnemyInRange(1)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'soldier': {
      // charge if enemy within 2 tiles (to try to close and hit)
      if (hasEnemyInRange(2)) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    case 'scout': {
      // dash early in turn when far from objectives to gain move bonus
      const targets = state.nexuses.filter(nx => nx.owner !== AI_PLAYER);
      let best = Infinity;
      for (const t of targets) best = Math.min(best, manhattan(unit.x, unit.y, t.x, t.y));
      const enemyHeart = getPlayerHeartPos(1);
      if (enemyHeart) best = Math.min(best, manhattan(unit.x, unit.y, enemyHeart.x, enemyHeart.y));
      if (best >= 4) {
        return !!window.NexusCore.useAbility(unit, 0);
      }
      return false;
    }
    default:
      return false;
  }
}

function spawnPhase() {
  const player = AI_PLAYER;
  const state = getState();
  if (!state) return;
  
  let energy = state.players[player]?.energy || 0;
  if (!energy) return;

  // Reserve some energy to avoid zeroing out each turn
  const RESERVE = 2;
  if (energy <= RESERVE) return;

  // Limit number of spawns per turn
  let spawnsLeft = 2;

  // Gather spawn tiles (adjacent to spawner) and sort by proximity to objectives
  const spawnTiles = listSpawnTilesForPlayer(player);
  if (spawnTiles.length === 0) return;

  // Unit composition counts
  const myUnits = findUnitsForPlayer(player);
  const counts = countRoles(myUnits);

  while (spawnsLeft > 0 && energy > RESERVE) {
    // Choose a tile that advances toward neutral/enemy objectives
    const tile = chooseSpawnTile(spawnTiles, state) || spawnTiles[0];
    if (!tile) break;

    // Prefer naval if near water around spawner
    const nearWater = hasAdjacentWater(tile.x, tile.y);
    const chosenId = chooseSpawnUnit(energy, counts, nearWater);
    if (!chosenId) break;

    const ok = window.NexusCore.spawnUnit(chosenId, tile.x, tile.y, player);
    if (ok) {
      const cost = (window.UNIT_TYPES?.[chosenId]?.cost || 0);
      energy -= cost;
      counts[chosenId] = (counts[chosenId] || 0) + 1;
      spawnsLeft--;
      // remove used tile from list
      const idx = spawnTiles.findIndex(t => t.x === tile.x && t.y === tile.y);
      if (idx >= 0) spawnTiles.splice(idx, 1);
      if (spawnTiles.length === 0) break;
    } else {
      // If spawn failed (terrain/water-only constraints), remove tile and try again
      const idx = spawnTiles.findIndex(t => t.x === tile.x && t.y === tile.y);
      if (idx >= 0) spawnTiles.splice(idx, 1);
      if (spawnTiles.length === 0) break;
    }
  }
}

function canAttack(unit, tx, ty) {
  if (!unit) return false;
  const UNIT_TYPES = window.UNIT_TYPES || {};
  const def = UNIT_TYPES[unit.defId] || {};
  const range = unit.range || def.range || 1;
  const dist = Math.abs(unit.x - tx) + Math.abs(unit.y - ty);
  return dist <= range;
}

function unitActionPhase() {
  const aiUnits = findUnitsForPlayer(AI_PLAYER);
  // maintain deterministic-ish order (by id)
  aiUnits.sort((a,b) => (a.id > b.id ? 1 : -1));

  const enemyUnits = findEnemyUnitsFor(AI_PLAYER);
  const enemyHeartPos = getPlayerHeartPos(1);
  const state = getState();
  if (!state) return;

  for (const unit of aiUnits) {
    if (!unit || (unit.actionsLeft || 0) <= 0) continue;

    // Try using an ability first if it gives tactical advantage
    if (tryUseAbility(unit)) {
      // ability may consume action and/or move – continue to next unit
      continue;
    }

    // 1) Attack if an enemy unit or enemy heart is within attack range
    let attacked = false;

    for (const enemy of enemyUnits) {
      if (!enemy) continue;
      if (canAttack(unit, enemy.x, enemy.y) && (unit.actionsLeft || 0) > 0) {
        const did = window.NexusCore.attackUnit(unit, enemy.x, enemy.y);
        if (did) { attacked = true; }
        break;
      }
    }
    if (attacked) continue;

    // Check heart (player 1)
    if (enemyHeartPos) {
      if (canAttack(unit, enemyHeartPos.x, enemyHeartPos.y) && (unit.actionsLeft || 0) > 0) {
        window.NexusCore.attackUnit(unit, enemyHeartPos.x, enemyHeartPos.y);
        continue;
      }
    }

    // Check for nearest neutral or enemy-owned nexus to move toward
    let targetNexus = null;
    let bestDist = Infinity;
    for (const nx of state.nexuses) {
      if (nx.owner !== AI_PLAYER) {
        const d = manhattan(unit.x, unit.y, nx.x, nx.y);
        if (d < bestDist) {
          bestDist = d;
          targetNexus = nx;
        }
      }
    }

    if (targetNexus) {
      if (unit.x !== targetNexus.x || unit.y !== targetNexus.y) {
        if ((unit.actionsLeft || 0) > 0) {
          const moved = stepTowards(unit, targetNexus.x, targetNexus.y);
          if (moved) continue;
        }
      }
    }

    // Otherwise move toward nearest enemy unit or enemy heart
    const nearestEnemy = enemyUnits.length > 0 ? 
      enemyUnits.reduce((closest, enemy) => {
        const d1 = manhattan(unit.x, unit.y, closest.x, closest.y);
        const d2 = manhattan(unit.x, unit.y, enemy.x, enemy.y);
        return d2 < d1 ? enemy : closest;
      }) : null;
    
    const primaryTarget = nearestEnemy ? { x: nearestEnemy.x, y: nearestEnemy.y } : 
      (enemyHeartPos ? enemyHeartPos : null);
    
    if (primaryTarget) {
      if ((unit.actionsLeft || 0) > 0) {
        stepTowards(unit, primaryTarget.x, primaryTarget.y);
        continue;
      }
    } else {
      // nothing to do; move toward center to threaten
      const center = Math.floor(BOARD_SIZE / 2);
      if ((unit.actionsLeft || 0) > 0) {
        stepTowards(unit, center, center);
        continue;
      }
    }
  }
}

export function takeTurn() {
  try {
    // 1) Spawn phase obeying energy
    spawnPhase();

    // 2) Unit actions (attack/move/abilities)
    unitActionPhase();

    // finished – the orchestrator should call updateUI / render after this completes
  } catch (e) {
    console.error("AI error:", e);
  }
}

export default { takeTurn };