// Veld en spelconstanten. Eenheden: yards. Spellogica gebruikt (x, y) = (lengte, breedte);
// de renderer zet dat om naar wereld (x, 0, z=y).
export const FIELD = {
  length: 50,      // speelveld tussen de goallines
  ez: 10,          // diepte eindzone
  width: 25,
  xMin: -10,
  xMax: 60,
};

export const PLAYER = {
  radius: 0.4,     // cilinder voor botsingen
  height: 1.95,
};

// Bewegingsmodel (zie game/movement.js)
export const MOVE = {
  accel: 6.5,      // yd/s2 optrekken
  brake: 11,       // yd/s2 afremmen / zijwaarts bijsturen
  turnStill: 13,   // rad/s draaien op de plek
  turnFast: 3.4,   // rad/s draaien op topsnelheid
  sideFactor: 0.74,
  backFactor: 0.52,
  sprintMult: 1.24,
};

export const FIXED_DT = 1 / 120;
