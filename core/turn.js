// core/turn.js
// Turn management, energy gain, action reset

import { state } from "./state.js";
import { getCell } from "./board.js";

const ENERGY_PER_TURN = 5;
const ENERGY_TURNS = 10;
const ENERGY_CAP = 50;
const ACTIONS_PER_TURN = 2;

export function endTurn() {
  if (state.winner) return;
  
  // apply capture/damage for nexuses
  if (window.NexusMechanics && window.NexusMechanics.applyCaptureAndDamage) {
    window.NexusMechanics.applyCaptureAndDamage();
  }

  // increment turn & switch current player
  state.turn++;
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

  // energy gain at start of player's turn (limited times)
  const p = state.players[state.currentPlayer];
  if (p.energyTurnsUsed < ENERGY_TURNS) {
    p.energy = Math.min(ENERGY_CAP, (p.energy || 0) + ENERGY_PER_TURN);
    p.energyTurnsUsed = (p.energyTurnsUsed || 0) + 1;
  }

  // Immediate loss check: trigger only when player reached max obtainable energy AND has no remaining moves
  // No remaining moves is defined as: cannot place any unit AND has no units alive
  try {
    const canPlace = canPlayerPlaceAnyAffordableUnit(state.currentPlayer);
    let hasUnits = false;
    for (let yy = 0; yy < state.board.length && !hasUnits; yy++) {
      for (let xx = 0; xx < state.board[0].length; xx++) {
        const cell = getCell(xx, yy);
        if (cell && cell.unit && cell.unit.owner === state.currentPlayer) { hasUnits = true; break; }
      }
    }
    const energyAtMax = ((p.energyTurnsUsed || 0) >= ENERGY_TURNS);
    if (energyAtMax && !canPlace && !hasUnits) {
      state.winner = (state.currentPlayer === 1 ? 2 : 1);
      return;
    }
  } catch (e) {
    // fail-safe: ignore check errors
  }

  // reset actions for new player's units and decrement cooldowns ONLY for the player whose turn just started
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[0].length; x++) {
      const cell = getCell(x, y);
      if (cell && cell.unit) {
        // expire temporary move bonuses every turn
        if (cell.unit._tempMoveBonus) cell.unit._tempMoveBonus = 0;
        // expire stealth if duration passed
        if (cell.unit.hiddenUntilTurn && state.turn >= cell.unit.hiddenUntilTurn) {
          delete cell.unit.hiddenUntilTurn;
        }
        // Decrement cooldowns and grant actions only for units of the player who is about to act
        if (cell.unit.owner === state.currentPlayer) {
          if (cell.unit._cooldowns) {
            for (const k in cell.unit._cooldowns) {
              cell.unit._cooldowns[k] = Math.max(0, (cell.unit._cooldowns[k] || 0) - 1);
            }
          }
          cell.unit.actionsLeft = ACTIONS_PER_TURN;
        }
      }
    }
  }

  // clear targeting state and selection
  state.abilityTargeting = null;
  state.selectedUnit = null;
}

// Helper: determine if the given player can place at least one shop unit with their current energy
function canPlayerPlaceAnyAffordableUnit(player) {
  const defs = (typeof window !== 'undefined' && window.UNIT_TYPES) ? window.UNIT_TYPES : {};
  const list = Object.values(defs).filter(d => !d.summonOnly && !d.isTerrain);
  const p = state.players[player];
  if (!p) return false;
  const energy = p.energy || 0;
  if (!window.NexusMechanics || typeof window.NexusMechanics.isSpawnableForPlayer !== 'function') return false;

  for (const def of list) {
    const cost = Number(def.cost || 0);
    if (cost > energy) continue;
    // scan board for any valid spawn location
    for (let y = 0; y < state.board.length; y++) {
      for (let x = 0; x < state.board[0].length; x++) {
        if (window.NexusMechanics.isSpawnableForPlayer(def, x, y, player)) return true;
      }
    }
  }
  return false;
}