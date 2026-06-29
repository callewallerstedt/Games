// The catalogue of games shown on the home hub.
// To add a game later: create js/games/<id>.js exporting the game module,
// import it here, and add it to the array. The hub renders the rest automatically.

import wyr from "./wouldyourather.js";
import howwell from "./howwell.js";
import twotruths from "./twotruths.js";
import deepdive from "./deepdive.js";
import impostor from "./impostor.js";
import herd from "./herd.js";
import hues from "./hues.js";
import battleship from "./battleship.js";
import dice from "./dice.js";

export const GAMES = [wyr, howwell, twotruths, deepdive, impostor, herd, hues, battleship, dice];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
