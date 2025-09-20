// core/board.js
// Board utilities and cell management

import { state } from "./state.js";

export const BOARD_SIZE = 11;

export function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function getCell(x, y) {
  if (!inBounds(x, y)) return null;
  return state.board[y][x];
}

export function setCell(x, y, data) {
  if (!inBounds(x, y)) return;
  state.board[y][x] = { ...state.board[y][x], ...data };
}

export function initBoard() {
  state.board = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push({ 
        x, y, 
        terrain: 'plain', 
        unit: null, 
        shadowUnit: null, // Support for shadow realm units
        nexus: null, 
        spawner: null, 
        heart: null, 
        blockedForMovement: false 
      });
    }
    state.board.push(row);
  }
}