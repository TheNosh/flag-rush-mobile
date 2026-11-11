// Invoer: PlayStation-controller (Gamepad API) met exact dezelfde knopindeling als het 2D-spel,
// toetsenbord als terugval. Overgenomen uit flag-rush.html.
import { hyp } from '../game/math.js';

const KM = { Space: 'X', Enter: 'X', NumpadEnter: 'X', Digit1: 'X', Numpad1: 'X', Digit2: 'O', Numpad2: 'O', KeyE: 'O', Backspace: 'O', Digit3: 'SQ', Numpad3: 'SQ', KeyQ: 'SQ', Digit4: 'TRI', Numpad4: 'TRI', KeyW: 'TRI', Digit5: 'R1', Numpad5: 'R1', KeyR: 'R1', ShiftLeft: 'R2', ShiftRight: 'R2', Tab: 'L1', KeyH: 'L2', KeyC: 'R3', Escape: 'OPT', KeyP: 'OPT', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
const BI = { X: 0, O: 1, SQ: 2, TRI: 3, L1: 4, R1: 5, L2: 6, R2: 7, OPT: 9, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const BK = Object.keys(BI);

function deadzone(x, y) {
  const m = hyp(x, y);
  if (m < 0.15) return [0, 0];
  const s = Math.min(1, (m - 0.15) / 0.85) / m;
  return [x * s, y * s];
}

export class Input {
  constructor(onToast = () => {}) {
    this.toast = onToast;
    this.mode = 'none';
    this.padIndex = null; this.padId = ''; this.connected = false;
    this.held = {}; this.pressed = {}; this.released = {}; this.ht = {};
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0; this.rflick = null; this.rPrev = 0;
    this.keys = {};
    this.navX = 0; this.navY = 0; this.ndx = 0; this.ndy = 0; this.nrx = 0; this.nry = 0;
    this.latch = {}; // korte aanslagen die binnen één frame los zijn gelaten gaan niet verloren
    this.extra = new Set(); // extra toetsen (debug) die eenmalig afgaan
    this.onKey = null;
    // touch (zie touch.js): tkeys = ingedrukte schermknoppen, tx/ty = virtuele stick
    this.touch = false; this.tkeys = {}; this.tx = 0; this.ty = 0;

    addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e)) { e.preventDefault(); return; }
      const b = KM[e.code];
      if (!b) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keys[b] = true; this.latch[b] = true; this.mode = 'kb';
    });
    addEventListener('keyup', (e) => { const b = KM[e.code]; if (b) { this.keys[b] = false; e.preventDefault(); } });
    addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
    addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; this.padId = e.gamepad.id; this.mode = 'pad'; this.toast('Controller verbonden'); this.rumble(180, 0.3, 0.6); });
    addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === this.padIndex) { this.padIndex = null; this.toast('Controller losgekoppeld'); } });
  }

  /** Eén keer per frame aanroepen. Zet lx/ly (linkerstick), rx/ry, pressed/held/released. */
  poll(dt) {
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { pads = []; }
    let gp = null;
    if (this.padIndex != null && pads[this.padIndex] && pads[this.padIndex].connected) gp = pads[this.padIndex];
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.connected = !!gp;
    const cur = {};
    for (const k of BK) cur[k] = !!this.keys[k] || !!this.latch[k] || !!this.tkeys[k];
    this.latch = {};
    let lx = 0, ly = 0, rx = 0, ry = 0;
    if (gp) {
      let any = false;
      for (const k of BK) { const b = gp.buttons[BI[k]]; if (b && (b.pressed || b.value > 0.5)) { cur[k] = true; any = true; } }
      [lx, ly] = deadzone(gp.axes[0] || 0, gp.axes[1] || 0);
      [rx, ry] = deadzone(gp.axes[2] || 0, gp.axes[3] || 0);
      if (any || hyp(lx, ly) > 0.4) { this.mode = 'pad'; this.padIndex = gp.index; this.padId = gp.id; }
    }
    if (!lx && !ly && (this.tx || this.ty)) { lx = this.tx; ly = this.ty; this.mode = 'touch'; }
    if (!lx && !ly) {
      const dx = (cur.RIGHT ? 1 : 0) - (cur.LEFT ? 1 : 0), dy = (cur.DOWN ? 1 : 0) - (cur.UP ? 1 : 0);
      if (dx || dy) { const m = hyp(dx, dy); lx = dx / m; ly = dy / m; }
    }
    this.lx = lx; this.ly = ly; this.rx = rx; this.ry = ry;
    const rm = hyp(rx, ry);
    this.rflick = (rm > 0.75 && this.rPrev <= 0.75) ? { x: rx / rm, y: ry / rm } : null;
    this.rPrev = rm;
    const nx = ((cur.RIGHT ? 1 : 0) - (cur.LEFT ? 1 : 0)) || (lx > 0.6 ? 1 : lx < -0.6 ? -1 : 0);
    const ny = ((cur.DOWN ? 1 : 0) - (cur.UP ? 1 : 0)) || (ly > 0.6 ? 1 : ly < -0.6 ? -1 : 0);
    this.navX = 0; if (nx !== this.ndx) { this.ndx = nx; this.nrx = 0.38; this.navX = nx; } else if (nx) { this.nrx -= dt; if (this.nrx <= 0) { this.nrx = 0.14; this.navX = nx; } }
    this.navY = 0; if (ny !== this.ndy) { this.ndy = ny; this.nry = 0.38; this.navY = ny; } else if (ny) { this.nry -= dt; if (this.nry <= 0) { this.nry = 0.14; this.navY = ny; } }
    for (const k of BK) {
      const was = !!this.held[k];
      this.pressed[k] = cur[k] && !was; this.released[k] = !cur[k] && was;
      if (cur[k]) this.ht[k] = (was ? (this.ht[k] || 0) : 0) + dt; else if (!this.released[k]) this.ht[k] = 0;
      this.held[k] = cur[k];
    }
  }

  rumble(ms, strong, weak) {
    try {
      if (this.touch && this.padIndex == null) { if (navigator.vibrate) navigator.vibrate(Math.min(ms, 120)); return; }
      if (this.padIndex == null) return;
      const gp = navigator.getGamepads()[this.padIndex];
      const va = gp && gp.vibrationActuator;
      if (va && va.playEffect) {
        const p = va.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
        if (p && p.catch) p.catch(() => {});
      }
    } catch { /* geen trilling beschikbaar */ }
  }
}
