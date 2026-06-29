// The catalogue of games shown on the home hub.
// To add a game later: create js/games/<id>.js exporting the game module,
// import it here, and add it to the array. The hub renders the rest automatically.

import herd from "./herd.js";
import hues from "./hues.js";

export const GAMES = [herd, hues];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
