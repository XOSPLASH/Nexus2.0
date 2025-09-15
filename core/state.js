// core/state.js
// Centralized game state management

export const state = {
  board: [],
  units: [],
  turn: 1,
  currentPlayer: 1,
  players: {
    1: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set(), spawner: null, heart: null },
    2: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set(), spawner: null, heart: null }
  },
  nexuses: [],
  selectedUnit: null,
  pendingShopSelection: { 1: null, 2: null },
  abilityTargeting: null,
  unitIdCounter: 1,
  winner: null,
  lastNexusDamageTurn: {},
  // Track last turn when per-player nexus damage was applied (1 damage max per owner per turn)
  lastNexusPlayerDamageTurn: { 1: 0, 2: 0 }
};

export function uid() { 
  return 'u' + (state.unitIdCounter++).toString(36); 
}

export function resetState() {
  state.board = [];
  state.units = [];
  state.turn = 1;
  state.currentPlayer = 1;
  state.players = {
    1: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set(), spawner: null, heart: null },
    2: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set(), spawner: null, heart: null }
  };
  state.nexuses = [];
  state.selectedUnit = null;
  state.pendingShopSelection = { 1: null, 2: null };
  state.abilityTargeting = null;
  state.unitIdCounter = 1;
  state.winner = null;
  state.lastNexusDamageTurn = {};
  // Reset per-player nexus damage turn tracker
  state.lastNexusPlayerDamageTurn = { 1: 0, 2: 0 };
}

export function getPublicState() {
  return {
    board: state.board.map(row => row.map(c => ({
      x: c.x, y: c.y, terrain: c.terrain,
      nexus: c.nexus ? { ...c.nexus } : null,
      spawner: c.spawner ? { ...c.spawner } : null,
      heart: c.heart ? { ...c.heart } : null,
      unit: c.unit ? { ...c.unit } : null
    }))),
    players: JSON.parse(JSON.stringify({ 1: state.players[1], 2: state.players[2] })),
    currentPlayer: state.currentPlayer,
    turnNumber: state.turn,
    nexuses: [...state.nexuses],
    selectedUnit: state.selectedUnit ? { ...state.selectedUnit } : null,
    winner: state.winner
  };
}