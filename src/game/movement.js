// Menselijke bewegingsmodel voor een speler (puur wiskunde, geen rendering).
// - acceleratie/afremmen met beperkte grip: draaicirkel volgt vanzelf uit snelheid en versnelling
// - kijkrichting draait langzamer naarmate je sneller gaat
// - sneller rechtdoor dan zijwaarts, en nog trager achterwaarts (backpedal)
// - lichaam leunt in bochten (tan(lean) = zijwaartse versnelling / zwaartekracht)
// - moves (juke, spin, hesitation) laten een korte herstelfase achter
import { FIELD, PLAYER, MOVE } from '../config.js';
import { clamp, hyp, lerp, wrapAngle, damp } from './math.js';

const G_YD = 10.7; // 9.8 m/s2 in yd/s2
let NEXT_ID = 1;

// Snelheidsfactor naar kijkrichting: 0 rad = 1, 90 graden = zijwaarts, 180 = achterwaarts
export function dirFactor(ang) {
  const h = Math.PI / 2;
  return ang <= h
    ? lerp(1, MOVE.sideFactor, ang / h)
    : lerp(MOVE.sideFactor, MOVE.backFactor, (ang - h) / h);
}

export class Body {
  constructor(x, y, vmax, heading = 0) {
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.heading = heading;
    this.vmax = vmax;          // topsnelheid (yd/s) zonder sprint
    this.face = null;          // {x,y}: kijk naar dit punt (backpedal / zijwaarts schuiven)
    this.lean = 0;             // rad, + = naar rechts van de speler
    this.aFwd = 0; this.aRight = 0; // lokale versnelling (voor flags en animatie)
    this.turnRate = 0;
    this.radius = PLAYER.radius;
    // moves
    this.juke = 0; this.jukeDir = { x: 0, y: 0 };
    this.spin = 0; this.spinTotal = 0.42;
    this.hesi = 0; this.burst = 0;
    this.recover = 0; this.moveCd = 0;
    this.overrun = 0; this.stun = 0; this.diveT = 0;
    this.stamina = 1;
  }

  get speed() { return hyp(this.vx, this.vy); }
  get fwd() { return { x: Math.cos(this.heading), y: Math.sin(this.heading) }; }
  get right() { return { x: -Math.sin(this.heading), y: Math.cos(this.heading) }; }
  // snelheid in het lokale frame: f = vooruit, r = rechts
  localVel() {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { f: this.vx * c + this.vy * s, r: -this.vx * s + this.vy * c };
  }
  get busy() { return this.juke > 0 || this.spin > 0 || this.hesi > 0 || this.recover > 0; }
  canMove() { return this.moveCd <= 0 && this.overrun <= 0 && this.stun <= 0; }

  startJuke(dir) { this.juke = 0.24; this.jukeDir = dir; this.moveCd = 1.0; }
  startSpin() { this.spin = this.spinTotal; this.moveCd = 1.2; }
  startHesi() { this.hesi = 0.22; this.moveCd = 1.1; }

  /** Eén simulatiestap. (wx, wy) = gewenste snelheidsvector (yd/s). */
  step(dt, wx, wy) {
    // timers; na een move volgt een herstelfase
    const dec = (k) => { const was = this[k] > 0; if (was) this[k] -= dt; return was && this[k] <= 0; };
    if (dec('juke')) this.recover = 0.32;
    if (dec('spin')) this.recover = 0.26;
    if (dec('hesi')) { this.burst = 0.6; this.hesiDone = true; }
    dec('burst'); dec('diveT'); dec('recover'); dec('moveCd'); dec('stun'); dec('overrun');

    const ovx = this.vx, ovy = this.vy;
    let speedMul = 1, accMul = 1;
    if (this.recover > 0) { speedMul *= 0.72; accMul *= 0.6; }
    if (this.spin > 0) speedMul *= 0.85;
    if (this.hesi > 0) speedMul *= 0.15;
    if (this.burst > 0) { speedMul *= 1.32; accMul *= 1.6; }
    if (this.stun > 0) { wx = 0; wy = 0; accMul = 0.4; }

    let overriding = false;
    if (this.juke > 0) { wx = this.jukeDir.x * 9.5; wy = this.jukeDir.y * 9.5; accMul = 2.6; overriding = true; }

    if (this.overrun > 0) {
      // verdediger die erdoorheen schiet: kan niet bijsturen
    } else {
      // --- kijkrichting
      let hd = null;
      const wm = hyp(wx, wy);
      if (!overriding) {
        if (this.face) hd = Math.atan2(this.face.y - this.y, this.face.x - this.x);
        else if (wm > 0.35) hd = Math.atan2(wy, wx);
      }
      if (hd !== null) {
        const wmax = lerp(MOVE.turnStill, MOVE.turnFast, clamp(this.speed / this.vmax, 0, 1.2));
        const dh = clamp(wrapAngle(hd - this.heading), -wmax * dt, wmax * dt);
        this.heading = wrapAngle(this.heading + dh);
        this.turnRate = dh / dt;
      } else this.turnRate = 0;

      // --- gewenste snelheid, begrensd door kijkrichting (zijwaarts/achterwaarts is trager)
      let tx = 0, ty = 0;
      if (wm > 0.02) {
        const f = overriding ? 1 : dirFactor(Math.abs(wrapAngle(Math.atan2(wy, wx) - this.heading)));
        const k = f * speedMul * (overriding ? 1 : 1);
        tx = wx * k; ty = wy * k;
      }
      // --- versnellen / afremmen met beperkte grip
      const dx = tx - this.vx, dy = ty - this.vy, dm = hyp(dx, dy);
      if (dm > 1e-5) {
        const sp = this.speed;
        const align = sp > 0.15 ? (dx * this.vx + dy * this.vy) / (dm * sp) : 1;
        const rate = lerp(MOVE.brake, MOVE.accel, clamp(align, 0, 1)) * accMul;
        const s = Math.min(dm, rate * dt);
        this.vx += dx / dm * s; this.vy += dy / dm * s;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;

    // --- afgeleiden voor animatie: lokale versnelling en lean
    const ax = (this.vx - ovx) / dt, ay = (this.vy - ovy) / dt;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    this.aFwd = damp(this.aFwd, ax * c + ay * s, 14, dt);
    this.aRight = damp(this.aRight, -ax * s + ay * c, 14, dt);
    const sp = this.speed;
    let lat = 0;
    if (sp > 0.8) lat = (ax * -ovy + ay * ovx) / Math.max(hyp(ovx, ovy), 0.5); // + = rechtsaf
    const target = clamp(Math.atan(lat / G_YD), -0.5, 0.5) * clamp(sp / 3, 0, 1);
    this.lean = damp(this.lean, target, 9, dt);
  }
}

/** Zachte ontwijking: stuurt de gewenste snelheid om anderen heen. */
export function avoid(self, wx, wy, others, ignore) {
  const wm = hyp(wx, wy);
  let ax = 0, ay = 0, slow = 0;
  const r2 = self.radius * 2;
  for (const o of others) {
    if (o === self || o === ignore) continue;
    const rx = o.x - self.x, ry = o.y - self.y, d = hyp(rx, ry);
    if (d > 3.4 || d < 1e-4) continue;
    // korte afstand: wegduwen
    if (d < r2 + 0.45) {
      const k = (r2 + 0.45 - d) * 5;
      ax -= rx / d * k; ay -= ry / d * k;
    }
    if (wm < 0.3) continue;
    const dx = wx / wm, dy = wy / wm;
    const ahead = rx * dx + ry * dy;
    if (ahead < -0.1 || ahead > 3.2) continue;
    const lat = rx * -dy + ry * dx; // + = ander staat rechts van mijn looprichting
    if (Math.abs(lat) > r2 + 0.3) continue;
    const side = Math.abs(lat) > 0.08 ? (lat > 0 ? -1 : 1) : (self.id < o.id ? 1 : -1);
    const w = (1 - ahead / 3.2) * (1 - Math.abs(lat) / (r2 + 0.3) * 0.5);
    ax += -dy * side * w * wm * 1.1; ay += dx * side * w * wm * 1.1;
    slow = Math.max(slow, w * 0.25);
  }
  let nx = wx * (1 - slow) + ax, ny = wy * (1 - slow) + ay;
  const nm = hyp(nx, ny);
  const cap = Math.max(wm, 1.2);
  if (nm > cap) { nx *= cap / nm; ny *= cap / nm; }
  return { x: nx, y: ny };
}

/** Harde botsing: cilinders gaan nooit door elkaar. */
export function resolveCollisions(bodies, iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min) continue;
        if (d < 1e-4) { dx = Math.cos(a.id); dy = Math.sin(a.id); d = 1; }
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
        if (va > vb) {
          const m = (va + vb) / 2;
          a.vx += nx * (m - va); a.vy += ny * (m - va);
          b.vx += nx * (m - vb); b.vy += ny * (m - vb);
        }
      }
    }
  }
}

/** Veldgrenzen. Wie niet draagt blijft binnen de lijnen; de baldrager mag er net overheen (=out of bounds). */
export function clampToField(p, carrier) {
  p.x = clamp(p.x, FIELD.xMin + 0.4, FIELD.xMax - 0.4);
  if (p === carrier) p.y = clamp(p.y, -1, FIELD.width + 1);
  else p.y = clamp(p.y, 0.4, FIELD.width - 0.4);
}
export const isOutOfBounds = (p) => p.y < 0 || p.y > FIELD.width;
