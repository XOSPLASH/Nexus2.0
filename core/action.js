// core/actions.js
// Movement, attacking, spawning actions

import { state, uid } from "./state.js";
import { getCell, inBounds } from "./board.js";

export function spawnUnit(defId, x, y, player) {
  if (!inBounds(x, y)) return false;
  const cell = getCell(x, y);
  if (!cell || cell.unit) return false;
  
  // Get unit definition from global UNIT_TYPES
  const def = window.UNIT_TYPES ? window.UNIT_TYPES[defId] : null;
  if (!def) {
    console.error(`Unit definition not found for ${defId}`);
    return false;
  }
  
  // Check if spawnable (import spawn module functions)
  const spawnable = checkSpawnableForPlayer(def, x, y, player);
  if (!spawnable) return false;
  
  const cost = Number(def.cost || 0);
  if (state.players[player].energy < cost) return false;
  
  // deduct energy
  state.players[player].energy -= cost;
  
  const unit = {
    id: uid(),
    defId: defId,
    name: def.name || defId,
    symbol: def.symbol || '?',
    hp: def.hp || def.health || 1,
    attack: def.attack || def.atk || 1,
    range: def.range || 1,
    move: def.move || 1,
    owner: player,
    x, y,
    actionsLeft: 2 // ACTIONS_PER_TURN
  };
  
  cell.unit = unit;
  state.players[player].purchased.add(def.id || def.name || defId);
  return true;
}

export function moveUnit(unit, tx, ty) {
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
  
  return true;
}

export function attackUnit(attacker, tx, ty) {
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
    
    if (target.hp <= 0) targetCell.unit = null;
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
    
    if (state.players[owner].hp <= 0) { 
      state.winner = attacker.owner; 
    }
    return true;
  }

  return false;
}

function computeReachable(unit) {
  const set = new Set();
  if (!unit) return set;
  
  // Get unit definition safely
  const def = window.UNIT_TYPES ? window.UNIT_TYPES[unit.defId] : {};
  const baseMove = unit.move || def.move || 1;
  const bonus = unit._tempMoveBonus || 0;
  const maxSteps = baseMove + bonus;
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
      if (cell.terrain === 'water' && !(def.canCrossWater) && !def.waterOnly && cell.terrain !== 'bridge') continue;
      
      visited.add(key);
      set.add(key);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return set;
}

function canAttack(unit, tx, ty) {
  if (!unit) return false;
  const def = window.UNIT_TYPES ? window.UNIT_TYPES[unit.defId] : {};
  const range = unit.range || def.range || 1;
  
  // Calculate both orthogonal and diagonal distances
  const orthogonalDist = Math.abs(unit.x - tx) + Math.abs(unit.y - ty);
  const diagonalDist = Math.max(Math.abs(unit.x - tx), Math.abs(unit.y - ty));
  
  // Some units can attack diagonally (archers, naval units, certain abilities)
  const canAttackDiagonal = def.canAttackDiagonal || unit.defId === 'archer' || unit.defId === 'naval';
  
  if (canAttackDiagonal) {
    return diagonalDist <= range;
  } else {
    return orthogonalDist <= range;
  }
}

// Simplified spawn checking (will be enhanced by spawn module)
function checkSpawnableForPlayer(def, x, y, player) {
  const cell = getCell(x, y);
  if (!cell || cell.unit) return false;
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

// Centralized ability execution
export function useAbility(unit, abilityIndex, targetX = null, targetY = null) {
  if (!unit) return false;
  if (unit.owner !== state.currentPlayer) return false;
  if ((unit.actionsLeft || 0) <= 0) return false;
  const defs = window.UNIT_TYPES || {};
  const def = defs[unit.defId] || {};
  const abilities = def.abilities || [];
  const ability = abilities[abilityIndex];
  if (!ability) return false;
  const name = (ability.name || '').toLowerCase();

  // cooldown gate
  unit._cooldowns = unit._cooldowns || {};
  const cdLeft = unit._cooldowns[abilityIndex] || 0;
  if (cdLeft > 0) return false;

  // helper to apply cooldown + flash
  function applyCooldownAndFlash() {
    const cd = Number(ability.cooldown || 0);
    if (cd > 0) unit._cooldowns[abilityIndex] = cd;
    unit._abilityFlashTurn = state.turn; // UI can flash this turn
  }

  // helpers
  const nearestEnemy = findNearestEnemy(unit);
  const tryManualStep = (nx, ny) => {
    if (!inBounds(nx, ny)) return false;
    const dst = getCell(nx, ny);
    if (!dst || dst.unit || dst.blockedForMovement) return false;
    const ddef = def;
    if (dst.terrain === 'mountain' && !ddef.canClimbMountain) return false;
    if (dst.terrain === 'water' && !ddef.canCrossWater && !ddef.waterOnly && dst.terrain !== 'bridge') return false;
    const src = getCell(unit.x, unit.y);
    src.unit = null;
    unit.x = nx; unit.y = ny;
    dst.unit = unit;
    return true;
  };

  // Soldier: Charge (move 1 toward nearest enemy, then attack if in range)
  if (unit.defId === 'soldier' && name.includes('charge')) {
    if (nearestEnemy) {
      const dx = Math.sign(nearestEnemy.x - unit.x);
      const dy = Math.sign(nearestEnemy.y - unit.y);
      const candidates = [];
      if (dx !== 0 && dy !== 0) candidates.push({ x: unit.x + dx, y: unit.y + dy });
      if (dx !== 0) candidates.push({ x: unit.x + dx, y: unit.y });
      if (dy !== 0) candidates.push({ x: unit.x, y: unit.y + dy });
      for (const c of candidates) { if (tryManualStep(c.x, c.y)) break; }
      // attempt attack on nearest enemy if now within range
      if (canAttack(unit, nearestEnemy.x, nearestEnemy.y)) {
        const ok = attackUnit(unit, nearestEnemy.x, nearestEnemy.y);
        if (ok) applyCooldownAndFlash();
        return ok;
      }
    }
    // consume action even if no target in range after step
    unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
    applyCooldownAndFlash();
    return true;
  }

  // Archer: Volley (3x3 AoE centered on target cell within range)
  if (unit.defId === 'archer' && name.includes('volley')) {
    // Must have explicit target coordinates
    if (targetX == null || targetY == null || !inBounds(targetX, targetY)) {
      return false;
    }
    
    // Check range using archer's attack range (3 tiles)
    const range = unit.range || def.range || 3;
    const dx = Math.abs(unit.x - targetX);
    const dy = Math.abs(unit.y - targetY);
    
    // Archer can attack diagonally within range
    const distance = Math.max(dx, dy);
    if (distance > range) {
      return false;
    }
    
    // Apply AoE damage to all enemies in 3x3 area around target
    const dmg = unit.attack || def.atk || def.attack || 1;
    let hitCount = 0;
    
    for (let yOffset = -1; yOffset <= 1; yOffset++) {
      for (let xOffset = -1; xOffset <= 1; xOffset++) {
        const tx = targetX + xOffset;
        const ty = targetY + yOffset;
        
        if (!inBounds(tx, ty)) continue;
        
        const cell = getCell(tx, ty);
        if (!cell) continue;
        
        // Damage enemy units
        if (cell.unit && cell.unit.owner !== unit.owner) {
          cell.unit.hp -= dmg;
          if (cell.unit.hp <= 0) {
            cell.unit = null;
          }
          hitCount++;
        }
        
        // Damage enemy hearts
        if (cell.heart && cell.heart.owner && cell.heart.owner !== unit.owner) {
          const owner = cell.heart.owner;
          state.players[owner].hp = Math.max(0, state.players[owner].hp - dmg);
          if (state.players[owner].hp <= 0) {
            state.winner = unit.owner;
          }
          hitCount++;
        }
      }
    }
    
    // Only consume action if we actually hit something
    if (hitCount > 0) {
      unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
      applyCooldownAndFlash();
      
      // Banner feedback
      try { 
        state._bannerText = `Volley hit ${hitCount} targets!`; 
      } catch (e) {}
      
      return true;
    } else {
      // No targets hit - don't consume action
      try { 
        state._bannerText = 'No targets in range!'; 
      } catch (e) {}
      return false;
    }
  }

  // Builder: Build Bridge (on specified or any adjacent water tile)
  if (unit.defId === 'builder' && name.includes('build')) {
    const tryBuildAt = (x, y) => {
      if (!inBounds(x, y)) return false;
      const c = getCell(x, y);
      if (c && c.terrain === 'water') { c.terrain = 'bridge'; unit.actionsLeft--; applyCooldownAndFlash(); return true; }
      return false;
    };
    if (targetX != null && targetY != null) {
      if (Math.abs(targetX - unit.x) <= 1 && Math.abs(targetY - unit.y) <= 1) {
        if (tryBuildAt(targetX, targetY)) return true;
      }
      return false;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (tryBuildAt(unit.x + dx, unit.y + dy)) return true;
      }
    }
    return false;
  }

  // Medic: Heal (adjacent friendly +3 up to max hp)
  if (unit.defId === 'medic' && name.includes('heal')) {
    const pickFriend = () => {
      if (targetX != null && targetY != null && Math.abs(targetX - unit.x) + Math.abs(targetY - unit.y) === 1) {
        const c = getCell(targetX, targetY);
        if (c && c.unit && c.unit.owner === unit.owner) return c.unit;
      }
      return findAdjacentFriendly(unit);
    };
    const friend = pickFriend();
    if (friend) {
      const tdef = defs[friend.defId] || {};
      const maxHp = tdef.hp || friend.hp || 5;
      friend.hp = Math.min(maxHp, friend.hp + 3);
      unit.actionsLeft--;
      applyCooldownAndFlash();
      return true;
    }
    return false;
  }

  // Scout: Dash (+2 move for this turn)
  if (unit.defId === 'scout' && name.includes('dash')) {
    unit._tempMoveBonus = (unit._tempMoveBonus || 0) + 2;
    unit.actionsLeft--;
    applyCooldownAndFlash();
    return true;
  }

  // Naval: Bombard (attack target within 2 if provided, else nearest enemy within 2)
  if (unit.defId === 'naval' && name.includes('bombard')) {
    const within2 = (x, y) => Math.abs(unit.x - x) + Math.abs(unit.y - y) <= 2;
    let target = null;
    if (targetX != null && targetY != null && within2(targetX, targetY)) {
      const c = getCell(targetX, targetY);
      if (c && c.unit && c.unit.owner !== unit.owner) target = { x: targetX, y: targetY };
    }
    if (!target && nearestEnemy && within2(nearestEnemy.x, nearestEnemy.y)) target = { x: nearestEnemy.x, y: nearestEnemy.y };
    if (target) {
      const ok = attackUnit(unit, target.x, target.y);
      if (ok) applyCooldownAndFlash();
      return ok;
    }
    unit.actionsLeft--;
    applyCooldownAndFlash();
    return true;
  }

  // Tank: Overrun (hit adjacent enemy; if survives push back; if dead move into tile)
  if (unit.defId === 'tank' && name.includes('overrun')) {
    const pickAdj = () => {
      if (targetX != null && targetY != null && Math.abs(targetX - unit.x) + Math.abs(targetY - unit.y) === 1) {
        const c = getCell(targetX, targetY);
        if (c && c.unit && c.unit.owner !== unit.owner) return { x: targetX, y: targetY };
      }
      return findAdjacentEnemy(unit);
    };
    const adj = pickAdj();
    if (adj) {
      const ex = adj.x, ey = adj.y;
      const dx = Math.sign(ex - unit.x), dy = Math.sign(ey - unit.y);
      const cell = getCell(ex, ey);
      if (cell && cell.unit) {
        cell.unit.hp -= (unit.attack || 1);
        if (cell.unit.hp <= 0) {
          // move in
          cell.unit = null;
          const src = getCell(unit.x, unit.y);
          src.unit = null; unit.x = ex; unit.y = ey; cell.unit = unit;
        } else {
          // try to push
          const px = ex + dx, py = ey + dy;
          if (inBounds(px, py)) {
            const pc = getCell(px, py);
            if (pc && !pc.unit && !pc.blockedForMovement) {
              pc.unit = cell.unit; pc.unit.x = px; pc.unit.y = py; cell.unit = null;
            }
          }
        }
        unit.actionsLeft--;
        applyCooldownAndFlash();
        return true;
      }
    }
    return false;
  }

  // Shadow: Vanish (become hidden until next turn; purely cosmetic for now)
  if (unit.defId === 'shadow' && name.includes('vanish')) {
    unit.hiddenUntilTurn = state.turn + 1;
    unit.actionsLeft--;
    applyCooldownAndFlash();
    return true;
  }

  // default: no-op consume
  unit.actionsLeft--;
  applyCooldownAndFlash();
  return true;
}

function findNearestEnemy(unit) {
  let best = null, bestD = Infinity;
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[y].length; x++) {
      const c = state.board[y][x];
      if (c && c.unit && c.unit.owner !== unit.owner) {
        const d = Math.abs(unit.x - x) + Math.abs(unit.y - y);
        if (d < bestD) { bestD = d; best = c.unit; }
      }
    }
  }
  return best;
}

function findAdjacentFriendly(unit) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    const x = unit.x + dx, y = unit.y + dy;
    if (!inBounds(x, y)) continue;
    const c = getCell(x, y);
    if (c && c.unit && c.unit.owner === unit.owner) return c.unit;
  }
  return null;
}

function findAdjacentEnemy(unit) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    const x = unit.x + dx, y = unit.y + dy;
    if (!inBounds(x, y)) continue;
    const c = getCell(x, y);
    if (c && c.unit && c.unit.owner !== unit.owner) return { x, y };
  }
  return null;
}