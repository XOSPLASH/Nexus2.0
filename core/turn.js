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

  // reset actions for new player's units and decrement cooldowns
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
        // decrement cooldowns if any
        if (cell.unit._cooldowns) {
          for (const k in cell.unit._cooldowns) {
            cell.unit._cooldowns[k] = Math.max(0, (cell.unit._cooldowns[k] || 0) - 1);
          }
        }
        // give actions to the units of the new current player
        if (cell.unit.owner === state.currentPlayer) {
          cell.unit.actionsLeft = ACTIONS_PER_TURN;
        }
      }
    }
  }

  // clear targeting state and selection
  state.abilityTargeting = null;
  state.selectedUnit = null;
}