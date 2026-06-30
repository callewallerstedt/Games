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
import tapple from "./tapple.js";
import guess from "./guess.js";
import truefalse from "./truefalse.js";
import triangles from "./triangles.js";
import crime from "./crime.js";
import neoncode from "./neoncode.js";
import flashduel from "./flashduel.js";
import wordduel from "./wordduel.js";
import wavelength from "./wavelength.js";
import bombparty from "./bombparty.js";
import categories from "./categories.js";

export const GAMES = [wyr, howwell, twotruths, deepdive, impostor, herd, hues, wavelength, bombparty, categories, battleship, dice, tapple, guess, truefalse, triangles, crime, neoncode, flashduel, wordduel];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
