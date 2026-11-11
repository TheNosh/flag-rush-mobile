import { Body } from './movement.js';

/** Eén speler in het spel: beweging (Body) + rol, route en dekking. */
export class Player extends Body {
  constructor(team, role, x, y, vmax, num, heading) {
    super(x, y, vmax, heading);
    this.team = team;     // 'off' | 'def'
    this.role = role;     // QB, C, X, Y, Z | CB1, CB2, LB, FS, R
    this.num = num;
    this.route = null;    // [{x,y}]
    this.ri = 0;
    this.cont = null;     // richting waarin de route doorloopt
    this.btn = null;      // pass-knop (X/O/SQ/TRI)
    this.man = null;      // gedekte speler
    this.zone = null;     // {x,y,R,deep}
    this.rush = false;
    this.ctrl = false;    // door gebruiker bestuurd
    this.flagOn = true;   // flags nog aan de riem
    this.pullCd = 0;
    this.events = [];     // animatie-events voor de renderer: {name, ...}
  }
}

