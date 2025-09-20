// core/actions.js
// Movement, attacking, spawning actions

import { state, uid } from "./state.js";
import { getCell, inBounds } from "./board.js";

function getRealmUnit(cell, realm) {
  if (!cell) return null;
  return realm === 'shadow' ? (cell.shadowUnit || null) : (cell.unit || null);
}
function setRealmUnit(cell, realm, unit) {
  if (!cell) return;
  if (realm === 'shadow') cell.shadowUnit = unit; else cell.unit = unit;
}
function clearRealmUnit(cell, realm) {
  if (!cell) return;
  if (realm === 'shadow') cell.shadowUnit = null; else cell.unit = null;
}

export function spawnUnit(defId, x, y, player) {
  if (!inBounds(x, y)) return false;
  const cell = getCell(x, y);
  if (!cell) return false;
  // Overworld spawning only
  if (cell.unit) return false;
  
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
    realm: 'overworld',
    actionsLeft: 2 // ACTIONS_PER_TURN
  };
  
  setRealmUnit(cell, 'overworld', unit);
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
  if (!dst) return false;

  // Realm-aware occupancy and blocking
  const realm = unit.realm || 'overworld';
  const occupied = getRealmUnit(dst, realm);
  if (occupied) return false;
  // In shadow realm, ignore overworld-only blockers
  if (realm === 'overworld' && dst.blockedForMovement) return false;
  
  const reachable = computeReachable(unit);
  if (!reachable.has(`${tx},${ty}`)) return false;
  
  clearRealmUnit(src, realm);
  unit.x = tx; unit.y = ty;
  setRealmUnit(dst, realm, unit);
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

  const realm = attacker.realm || 'overworld';
  const target = getRealmUnit(targetCell, realm);

  // attack unit in same realm only
  if (target) {
    if (target.owner === attacker.owner) return false;
    if (!canAttack(attacker, tx, ty)) return false;
    
    const dmg = attacker.attack || 1;
    target.hp -= dmg;
    attacker.actionsLeft = Math.max(0, (attacker.actionsLeft || 0) - 1);
    
    if (target.hp <= 0) clearRealmUnit(targetCell, realm);
    return true;
  }

  // attack heart only in overworld
  if (realm === 'overworld' && targetCell.heart && targetCell.heart.owner) {
    const heart = targetCell.heart;
    if (heart.owner === attacker.owner) return false;
    if (!canAttack(attacker, tx, ty)) return false;

    const dmg = attacker.attack || 1;
    const opponent = heart.owner;
    state.players[opponent].hp = Math.max(0, state.players[opponent].hp - dmg);
    attacker.actionsLeft = Math.max(0, (attacker.actionsLeft || 0) - 1);
    if (state.players[opponent].hp <= 0) {
      state.winner = attacker.owner;
    }
    return true;
  }

  return false;
}

function computeReachable(unit) {
  const key = (x,y)=>`${x},${y}`;
  const set = new Set();
  const visited = new Set();
  const q = [{ x: unit.x, y: unit.y, d: 0 }];
  visited.add(key(unit.x, unit.y));
  while (q.length) {
    const { x, y, d } = q.shift();
    if (d >= (unit.move || 1)) continue;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx,dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const cell = getCell(nx, ny);
      if (!cell) continue;
      const realm = unit.realm || 'overworld';
      // can't move onto occupied slot for the same realm
      if (getRealmUnit(cell, realm)) continue;
      // In overworld, respect blockers; in shadow, ignore blockers from structures
      if (realm === 'overworld' && cell.blockedForMovement) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      set.add(k);
      q.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return set;
}

function canAttack(unit, tx, ty) {
  const dx = Math.abs(unit.x - tx);
  const dy = Math.abs(unit.y - ty);
  const r = unit.range || 1;
  return (dx + dy) <= r;
}

function checkSpawnableForPlayer(def, x, y, player) {
  if (!window.NexusMechanics || typeof window.NexusMechanics.isSpawnableForPlayer !== 'function') return false;
  return window.NexusMechanics.isSpawnableForPlayer(def, x, y, player);
}

export function useAbility(unit, abilityIndex, targetX = null, targetY = null) {
  if (!unit) return false;
  if (unit.owner !== state.currentPlayer) return false;
  if ((unit.actionsLeft || 0) <= 0) return false;

  // Resolve unit definition and ability once
  const defs = window.UNIT_TYPES || {};
  const uDef = defs[unit.defId] || {};
  const abilities = uDef.abilities || [];
  const ability = abilities[abilityIndex];
  if (!ability) return false;

  // Handle Shade's Vanish (realm toggle)
  if (unit.defId === 'shadow' && ability.name === 'Vanish') {
    // cooldown check
    unit._cooldowns = unit._cooldowns || {};
    const cd = unit._cooldowns['Vanish'] || 0;
    if (cd > 0) return false;

    const cell = getCell(unit.x, unit.y);
    const fromRealm = unit.realm || 'overworld';
    const toRealm = fromRealm === 'overworld' ? 'shadow' : 'overworld';

    // target slot must be free in destination realm
    if (getRealmUnit(cell, toRealm)) return false;

    // Move between realms
    clearRealmUnit(cell, fromRealm);
    unit.realm = toRealm;
    setRealmUnit(cell, toRealm, unit);

    // Auto-return after 1 turn when entering shadow; clear when exiting
    if (toRealm === 'shadow') {
      unit._shadowReturnOnTurn = state.turn + 1;
    } else {
      delete unit._shadowReturnOnTurn;
    }

    // Apply cooldown and consume action
    unit._cooldowns['Vanish'] = ability.cooldown || 3;
    unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);

    // Dispatch a simple FX event for UI to animate
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vanishFX', { detail: { x: unit.x, y: unit.y, realm: toRealm } }));
    }

    return true;
  }

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
    const ddef = uDef;
    if (dst.terrain === 'mountain' && !ddef.canClimbMountain) return false;
    if (dst.terrain === 'water' && !ddef.canCrossWater && !ddef.waterOnly && dst.terrain !== 'bridge') return false;
    const src = getCell(unit.x, unit.y);
    src.unit = null;
    unit.x = nx; unit.y = ny;
    dst.unit = unit;
    return true;
  };

  // Soldier: Charge (simple lunge) — attack an enemy in range; if it dies, move into its tile (no second phase)
  if (unit.defId === 'soldier' && name.includes('charge')) {
    if (targetX == null || targetY == null) return false;
    // must target an enemy unit within attack range
    const targetCell = getCell(targetX, targetY);
    if (!targetCell || !targetCell.unit || targetCell.unit.owner === unit.owner) return false;
    if (!canAttack(unit, targetX, targetY)) return false;

    const ok = attackUnit(unit, targetX, targetY);
    if (!ok) return false;

    // If the target died, move into that tile if passable
    const after = getCell(targetX, targetY);
    if (after && !after.unit && !after.blockedForMovement) {
      // terrain restrictions match unit def
      const ddef = uDef;
      if (!(after.terrain === 'mountain' && !ddef.canClimbMountain) &&
          !((after.terrain === 'water') && !ddef.canCrossWater && !ddef.waterOnly && after.terrain !== 'bridge')) {
        const src = getCell(unit.x, unit.y);
        // ensure unit is still at src (wasn't moved by other effects)
        if (src && src.unit && src.unit.id === unit.id) {
          src.unit = null;
          unit.x = targetX; unit.y = targetY;
          after.unit = unit;
        }
      }
    }

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
    const range = unit.range || uDef.range || 3;
    const dx = Math.abs(unit.x - targetX);
    const dy = Math.abs(unit.y - targetY);
    
    // Archer can attack diagonally within range
    const distance = Math.max(dx, dy);
    if (distance > range) {
      return false;
    }
    
    // Apply AoE damage to all enemies in 3x3 area around target
    const dmg = unit.attack || uDef.atk || uDef.attack || 1;
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