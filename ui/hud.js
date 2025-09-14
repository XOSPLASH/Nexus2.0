// ui/hud.js
// Player HUD (hp + energy)

import { state } from "../core/state.js";

export function renderHUD() {
  const p1 = document.getElementById("player1-stats");
  const p2 = document.getElementById("player2-stats");

  p1.querySelector(".hp").textContent = `HP: ${state.players[1].hp}`;
  p1.querySelector(".energy").textContent = `Energy: ${state.players[1].energy}`;

  p2.querySelector(".hp").textContent = `HP: ${state.players[2].hp}`;
  p2.querySelector(".energy").textContent = `Energy: ${state.players[2].energy}`;
}
