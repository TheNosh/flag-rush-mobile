// Volledige spelregels van Flag Rush (overgenomen uit het 2D-spel flag-rush.html).
// Bevat GEEN rendering. De aanval loopt altijd naar +x; de renderer draait kleuren/camera mee met het balbezit.
import { TEAMS, DEFAULT_TEAMS } from '../data/teams.js';
import { PLAYS, AUD, GC, PB } from '../data/plays.js';
import { COVERS } from '../data/covers.js';
import { buildOffense, buildDefense } from './formation.js';
import { avoid, resolveCollisions, clampToField } from './movement.js';
import { clamp, lerp, hyp, dist, norm, rnd, gauss } from './math.js';
import { FIXED_DT } from '../config.js';

const CUSTOM_KEY = 'flagrush-eigen-plays';
const C = { chalk: '#eef3ee', dim: '#8c9a92', lamp: '#ffb547', red: '#ff6d6d', fd: '#ffd23a' };
export { C };

// ---------- Play Maker: 3 eigen plays, bewaard in deze browser
function blankCustom(n) { return { name: 'EIGEN PLAY ' + n, custom: true, empty: true, desc: '', f: { Q: [-4, 12.5, []], C: [0, 12.5, [], 1], X: [0, 3, [], 1], Y: [0, 8, [], 1], Z: [0, 22, [], 1] } }; }
const customDesc = (p) => (p.h ? 'Run met handoff naar ' + p.h : 'Passplay') + ' · eigen ontwerp';
(function loadCustoms() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') || []; } catch { saved = []; }
  for (let n = 1; n <= 3; n++) {
    const sv = saved[n - 1], p = blankCustom(n);
    if (sv && sv.f) { p.f = sv.f; p.h = sv.h || null; p.run = p.h ? 1 : 0; p.empty = false; p.desc = customDesc(p); }
    PLAYS.push(p);
  }
})();

export function createGame(I) {
  const G = {
    screen: 'title', phase: '', sel: 0, teamSel: [...DEFAULT_TEAMS], teamRow: 0, score: [0, 0], poss: 0, startPoss: 0, los: 5, down: 1, zone: 'mid', half: 1, clock: 240,
    isPAT: false, patPts: 1, play: PLAYS[0], cover: COVERS[0], sub: 'pre', liveT: 0, presnapT: 0, deadT: 0, next: null, carrier: null, handed: false, charge: null, audible: false,
    paused: false, pauseSel: 0, pauseView: 'menu', pauseReason: '', banner: null, toast: null, lastPlay: 0, lastCov: 0, cpuThinkT: 0, time: 0, camOff: 'achter', camDef: 'achter',
    editor: null, fwdUsed: false, qbTick: null, pend: null,
  };
  let OFF = [], DEF = [], B = { state: 'none' };
  const ctl = { move: { x: 0, y: 0 }, rstick: { x: 0, y: 0 }, flick: null };
  const game = { G, ctl, fx: [], pops: [], get OFF() { return OFF; }, get DEF() { return DEF; }, get B() { return B; } };
  const teamOf = (i) => TEAMS[G.teamSel[i]];
  const toast = (t) => { G.toast = { text: t, t: 0 }; };
  const banner = (text, sub, col, big, dur) => { G.banner = { text, sub: sub || '', col: col || C.chalk, big: !!big, t: 0, dur: dur || 2 }; };
  const pop = (u, v, text, col) => { game.pops.push({ u, v, text, col: col || C.chalk, t: 0 }); };
  const rumble = (ms, s, w) => game.fx.push({ type: 'rumble', ms, s, w });
  const emit = (e) => game.fx.push(e);
  game.toast = toast; game.teamOf = teamOf;

  const noRun = () => G.isPAT || G.los >= 45;
  const playAllowed = (i) => !(PLAYS[i].h && noRun());
  game.noRun = noRun; game.playAllowed = playAllowed;
  const passOpen = () => { const c = G.carrier; return !!c && !G.fwdUsed && G.sub === 'run' && B.state === 'held' && c.x < G.los; };
  const passBtn = (p) => { if (p === G.carrier) return null; if (p === OFF[0]) return G.carrier ? G.carrier.btn : null; return p.btn; };
  game.passOpen = passOpen; game.passBtn = passBtn;
  const cpuPickPlay = () => { const o = PLAYS.map((p, i) => i).filter((i) => !PLAYS[i].custom && playAllowed(i)); return o[Math.floor(Math.random() * o.length)]; };
  const cpuPickCover = () => { const r = Math.random(); if ((G.down >= 3 && r < 0.3) || r < 0.1) return COVERS[4]; return COVERS[Math.floor(Math.random() * 4)]; };
  const opp = (p) => (p.team === 'off' ? DEF : OFF);

  function saveCustoms() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(PLAYS.filter((p) => p.custom).map((p) => (p.empty ? null : { f: p.f, h: p.h || null })))); }
    catch { toast('Opslaan lukt niet in deze browser'); }
  }

  /* ---------- opstelling / flow ---------- */
  function rebuild(play, cov) {
    OFF = buildOffense(play, G.los); DEF = buildDefense(cov, OFF, G.los);
    for (const p of DEF) p.heading = Math.PI;
    emit({ type: 'rebuild' });
  }
  function newGame() { G.score = [0, 0]; G.half = 1; G.clock = 240; G.startPoss = 0; G.lastPlay = 0; G.lastCov = 0; G.screen = 'game'; G.paused = false; game.pops.length = 0; changePoss(0, 5); }
  function changePoss(t, los) { G.poss = t; G.los = los; G.down = 1; G.zone = los >= 25 ? 'goal' : 'mid'; G.isPAT = false; emit({ type: 'possession' }); banner('BALBEZIT ' + teamOf(t).name, t === 0 ? 'Jij valt aan' : 'Jij verdedigt', teamOf(t).c, false, 1.4); nextSnap(); }
  function nextSnap() {
    G.phase = G.poss === 0 ? 'playcall' : 'defcall';
    G.sel = G.poss === 0 ? (playAllowed(G.lastPlay) ? G.lastPlay : 0) : G.lastCov;
    rebuild(PLAYS[0], COVERS[0]); G.sub = 'pre'; B = { state: 'pre' }; G.carrier = null; G.audible = false;
  }
  const nextSnapChk = () => { if (G.clock <= 0) endHalf(); else nextSnap(); };
  const changePossChk = (t, l) => { if (G.clock <= 0) endHalf(); else changePoss(t, l); };
  const afterScore = (t) => { G.isPAT = false; if (G.clock <= 0) endHalf(); else changePoss(t, 5); };
  function goPAT() { if (G.poss === 0) { G.phase = 'pat'; G.sel = 0; } else setPAT(Math.random() < 0.35 ? 2 : 1); }
  function setPAT(p) { G.isPAT = true; G.patPts = p; G.los = p === 1 ? 45 : 38; G.down = 1; banner('EXTRA PUNT', p === 1 ? '1 punt · vanaf 5 yard' : '2 punten · vanaf 12 yard', C.lamp, false, 1.3); nextSnap(); }
  function endHalf() { G.phase = G.half === 1 ? 'halftime' : 'final'; G.banner = null; rumble(300, 0.4, 0.4); }
  function startPresnap(play, cov) {
    G.play = play; G.cover = cov; rebuild(play, cov);
    G.handed = false; G.carrier = null; B = { state: 'pre' }; G.sub = 'pre'; G.phase = 'presnap'; G.presnapT = 1.6; G.charge = null; G.audible = false; G.pend = null;
    if (G.poss === 0) OFF[0].ctrl = true; else DEF[3].ctrl = true;
  }
  function snap() { G.phase = 'live'; G.sub = 'snap'; G.liveT = 0; G.cpuThinkT = 0; G.fwdUsed = false; G.qbTick = null; G.pend = null; B = { state: 'snap', t: 0 }; }

  function cheer(list) { for (const p of list) p.events.push({ name: 'cheer' }); }
  function endPlay(r) {
    if (G.phase !== 'live') return;
    G.phase = 'dead'; G.deadT = 2; G.charge = null; G.pend = null;
    if (B.state === 'air') B.state = 'loose';
    const off = G.poss, def = 1 - off, tO = teamOf(off), tD = teamOf(def);
    let next = nextSnapChk, msg = '', sub = '', col = C.chalk, big = false, fd = false;
    const confetti = (n, cols) => emit({ type: 'confetti', n, cols });
    if (['tackle', 'oob', 'sack'].includes(r.type) && r.spot <= 0 && !G.isPAT) r = { type: 'safety' };
    const offCheer = () => cheer(OFF), defCheer = () => cheer(DEF);
    if (G.isPAT) {
      if (r.type === 'td') { G.score[off] += G.patPts; msg = G.patPts > 1 ? '2 PUNTEN RAAK' : 'EXTRA PUNT RAAK'; sub = tO.name + ' +' + G.patPts; col = tO.c; confetti(60, [tO.c, tO.flag, '#ffffff']); rumble(260, 0.5, 0.6); offCheer(); }
      else if (r.type === 'pick6') { G.score[def] += 2; msg = '2 PUNTEN DEFENSE'; sub = 'Interceptie teruggelopen · ' + tD.name + ' +2'; col = tD.c; rumble(400, 0.8, 0.8); defCheer(); }
      else { msg = 'EXTRA PUNT MISLUKT'; sub = r.type === 'int' ? 'Onderschept' : ''; }
      G.isPAT = false; next = () => afterScore(def);
    } else {
      switch (r.type) {
        case 'td': G.score[off] += 6; msg = 'TOUCHDOWN'; sub = tO.name + ' +6'; col = tO.c; big = true; confetti(160, [tO.c, tO.flag, '#ffffff']); rumble(500, 1, 1); next = goPAT; offCheer(); break;
        case 'safety': G.score[def] += 2; msg = 'SAFETY'; sub = tD.name + ' +2'; col = tD.c; big = true; rumble(400, 0.8, 0.8); next = () => afterScore(def); defCheer(); break;
        case 'pick6': G.score[def] += 6; msg = 'PICK SIX'; sub = tD.name + ' +6'; col = tD.c; big = true; confetti(160, [tD.c, tD.flag, '#ffffff']); rumble(500, 1, 1); next = () => { G.poss = def; goPAT(); }; defCheer(); break;
        case 'int': { const s = clamp(50 - r.spot, 5, 49.5); msg = 'INTERCEPTIE'; sub = tD.name + ' krijgt de bal op ' + (s <= 25 ? 'eigen ' + Math.round(s) : Math.round(50 - s) + ' yard van de eindzone'); col = tD.c; big = true; next = () => changePossChk(def, s); } break;
        case 'inc': G.down++; msg = r.text || 'INCOMPLEET'; if (r.sub) sub = r.sub; break;
        default: {
          const spot = Math.min(r.spot, 49.5), gain = spot - G.los; G.los = spot;
          if (G.zone === 'mid' && spot >= 25) { G.zone = 'goal'; G.down = 1; fd = true; msg = 'EERSTE DOWN'; sub = 'Middenlijn gepasseerd'; col = C.fd; }
          else { G.down++; const g = Math.round(gain); msg = r.type === 'sack' ? 'SACK' : (g > 0 ? '+' + g + ' YARD' : g < 0 ? g + ' YARD' : 'GEEN WINST'); sub = r.type === 'oob' ? 'Buiten de lijnen' : r.type === 'sack' ? g + ' yard' : ''; }
        }
      }
      if ((r.type === 'inc' || ['tackle', 'oob', 'sack'].includes(r.type)) && !fd && G.down > 4) { msg = 'TURNOVER ON DOWNS'; sub = tD.name + ' krijgt de bal'; col = tD.c; next = () => changePossChk(def, 5); }
      if (r.type !== 'inc') G.clock = Math.max(0, G.clock - 5);
    }
    banner(msg, sub, col, big);
    G.next = next;
  }

  /* ---------- besturing van een speler ---------- */
  const want = (p, x, y) => { p.wx = x; p.wy = y; };
  function steer(p, tx, ty, spd, through) {
    const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
    if (d < 0.05) { want(p, 0, 0); return; }
    const s = through ? spd : Math.min(spd, d * 3.5);
    want(p, dx / d * s, dy / d * s);
  }
  function pursue(d, t, spd) {
    spd = spd || d.vmax * 1.05;
    const k = clamp(dist(d, t) / 7.5, 0, 0.9);
    d.ignore = t;
    steer(d, t.x + t.vx * k, t.y + t.vy * k, spd, true);
  }
  function userMove(p, dt) {
    const m = Math.min(1, hyp(ctl.move.x, ctl.move.y));
    const sprint = I.held.R2 && p.stamina > 0.03 && m > 0.2;
    p.stamina = sprint ? Math.max(0, p.stamina - dt * 0.34) : Math.min(1, p.stamina + dt * 0.17);
    const spd = p.vmax * (sprint ? 1.24 : 1);
    want(p, ctl.move.x * spd, ctl.move.y * spd); p.user = true;
  }
  function closing(d, c) { const dd = dist(d, c); if (dd < 0.8 || dd > 3.2) return false; return d.vx * (c.x - d.x) / dd + d.vy * (c.y - d.y) / dd > 2; }
  function hesiFool(p) {
    if (p !== G.carrier) return; let n = 0;
    for (const d of opp(p)) if (closing(d, p) && Math.random() < 0.65) { d.overrun = 0.45; n++; }
    pop(p.x, p.y, n ? 'HESI!' : 'HESI', n ? '#3fdcaa' : C.dim); if (G.poss === 0) rumble(80, 0.2, 0.3);
  }
  function doHesi(p) { p.startHesi(); p.events.push({ name: 'hesi' }); }
  function doJuke(p, rx, ry) {
    let dir;
    if (hyp(rx, ry) > 0.3) dir = norm(rx, ry);
    else {
      let nd = 99, ne = null; for (const d of opp(p)) { const v = dist(d, p); if (v < nd) { nd = v; ne = d; } }
      const a = { x: -p.vy, y: p.vx }, b = { x: p.vy, y: -p.vx }; let pick = a;
      if (ne) { const qx = ne.x - p.x, qy = ne.y - p.y; pick = (a.x * qx + a.y * qy) < (b.x * qx + b.y * qy) ? a : b; }
      if (hyp(pick.x, pick.y) < 0.1) pick = { x: 0, y: p.y < 12.5 ? 1 : -1 };
      dir = norm(pick.x, pick.y);
    }
    p.startJuke(dir);
    const r = p.right; p.events.push({ name: 'juke', side: Math.sign(dir.x * r.x + dir.y * r.y) || 1 });
    let n = 0;
    for (const d of opp(p)) { const ok = closing(d, p); if (dist(d, p) < 3.2 && Math.random() < (ok ? 0.78 : 0.2)) { d.overrun = 0.5; d.stun = Math.max(d.stun, 0.2); n++; } }
    pop(p.x, p.y, n ? 'JUKE!' : 'JUKE', n ? '#3fdcaa' : C.dim); if (G.poss === 0) rumble(70, 0, 0.35);
  }
  function doSpin(p) {
    p.startSpin(); p.events.push({ name: 'spin' });
    let n = 0; for (const d of opp(p)) if (dist(d, p) < 1.6 && closing(d, p) && Math.random() < 0.5) { d.overrun = 0.4; n++; }
    pop(p.x, p.y, n ? 'SPIN!' : 'SPIN', n ? '#3fdcaa' : C.dim); if (G.poss === 0) rumble(90, 0.2, 0.2);
  }
  function carrierMoves(p) {
    if (!p.canMove()) return;
    if (ctl.flick) doJuke(p, ctl.flick.x, ctl.flick.y);
    else if (I.pressed.SQ) doJuke(p, ctl.rstick.x, ctl.rstick.y);
    else if (I.pressed.O) doSpin(p);
    else if (I.pressed.TRI) doHesi(p);
  }

  /* ---------- passen ---------- */
  function throwTo(qb, rec, bullet) {
    const spd = bullet ? 21 : 14.5; let ax = rec.x, ay = rec.y, T = 0.3;
    for (let i = 0; i < 4; i++) { const d = hyp(ax - qb.x, ay - qb.y); T = d / spd + (bullet ? 0.04 : 0.22); ax = rec.x + rec.vx * T; ay = rec.y + rec.vy * T; }
    const d = hyp(ax - qb.x, ay - qb.y);
    let pres = 0; for (const r of DEF) if (r.rush) pres = Math.max(pres, clamp((3.2 - dist(r, qb)) / 3.2, 0, 1));
    const mov = Math.min(1, hyp(qb.vx, qb.vy) / qb.vmax);
    const sd = 0.18 + d * 0.02 * (bullet && d > 14 ? 1.4 : 1) * (!bullet && d < 8 ? 1.3 : 1) + pres * 0.75 + mov * 0.3;
    ax += gauss() * sd; ay += gauss() * sd;
    const h = bullet ? Math.min(1.6, 0.4 + d * 0.04) : Math.max(1.8, d * 0.2);
    qb.events.push({ name: 'throw' });
    G.pend = { qb, t: 0.13, B: { state: 'air', x0: qb.x, y0: qb.y, x1: ax, y1: ay, t: 0, T, lob: !bullet, target: rec, h } };
  }
  function releaseThrow() {
    const q = G.pend; G.pend = null; B = q.B;
    if (B.x1 > q.qb.x) G.fwdUsed = true;
    G.carrier = null; G.sub = 'air'; rumble(60, 0, 0.25);
  }
  function throwAway(qb) { G.fwdUsed = true; qb.events.push({ name: 'throw' }); G.pend = { qb, t: 0.1, B: { state: 'air', x0: qb.x, y0: qb.y, x1: G.los + 4, y1: qb.y < 12.5 ? -3 : 28, t: 0, T: 0.9, lob: true, target: null, h: 3, away: true } }; }
  function resolvePass() {
    const Lx = B.x1, Ly = B.y1; B.state = 'loose';
    if (B.away || Ly < -0.3 || Ly > 25.3 || Lx > 59.8) { endPlay({ type: 'inc', text: B.away ? 'WEGGEGOOID' : 'INCOMPLEET' }); return; }
    const rec = B.target, dR = rec ? hyp(rec.x - Lx, rec.y - Ly) : 99;
    let bd = null, dD = 99; for (const d of DEF) { if (d.stun > 0) continue; const v = hyp(d.x - Lx, d.y - Ly); if (v < dD) { dD = v; bd = d; } }
    if (bd && dD < 1.45) {
      let pI = (B.lob ? 0.34 : 0.2) * (1.45 - dD) / 1.45 * (dD < dR ? 1.5 : 0.55);
      if (bd.ctrl) pI = bd.diveT > 0 ? pI + 0.45 : pI * 0.4;
      if (Math.random() < pI) { startReturn(bd); return; }
    }
    if (rec && dR < 1.55) {
      let pC = 0.94 - (dR > 1.05 ? 0.2 : 0) - (dD < 1.7 ? (1.7 - dD) / 1.7 * 0.42 : 0);
      if (bd && bd.ctrl && bd.diveT > 0 && dD < 1.7) pC -= 0.2;
      if (Math.random() < pC) {
        G.carrier = rec; B.state = 'held'; G.sub = 'run'; rec.events.push({ name: 'catch' });
        if (G.poss === 0) { OFF.forEach((p) => { p.ctrl = false; }); rec.ctrl = true; }
        pop(rec.x, rec.y, 'VANGST', C.chalk); rumble(80, 0.1, 0.3); return;
      }
      endPlay({ type: 'inc', text: dD < 1.7 ? 'PASS VERDEDIGD' : 'LATEN VALLEN' }); return;
    }
    endPlay({ type: 'inc', text: 'INCOMPLEET' });
  }
  function attempt(d, c, user) {
    let p = user ? 0.8 : 0.56;
    if (c.spin > 0) p -= user ? 0.38 : 0.45; if (c.juke > 0) p -= 0.3;
    if (c === OFF[0] && G.sub === 'pocket') p = user ? 0.85 : 0.62;
    if (d.x < c.x - 0.3) p += 0.1;
    if (Math.random() < p) {
      c.flagOn = false;
      const side = Math.sign((c.x - d.x) * -Math.sin(d.heading) + (c.y - d.y) * Math.cos(d.heading)) || 1;
      d.events.push({ name: 'pull', side }); emit({ type: 'flagpull', carrier: c, from: { x: d.x, y: d.y } });
      rumble(220, 0.6, 0.5); pop(c.x, c.y, 'FLAG!', C.chalk);
      endPlay(G.sub === 'ret' ? { type: 'int', spot: c.x } : c === OFF[0] && G.sub === 'pocket' ? { type: 'sack', spot: c.x } : { type: 'tackle', spot: c.x });
    } else { d.pullCd = 0.7; d.stun = Math.max(d.stun, user ? 0.4 : 0.3); d.events.push({ name: 'miss' }); pop(d.x, d.y, 'MIS', C.dim); }
  }

  /* ---------- AI ---------- */
  function runRoute(p) {
    if (G.sub === 'snap' && G.liveT < 0.12) { want(p, 0, 0); return; }
    if (B.state === 'air' && B.target === p && p.ctrl && G.poss === 0 && hyp(ctl.move.x, ctl.move.y) > 0.2) { userMove(p, 0); return; }
    if (B.state === 'air' && B.target === p && B.T - B.t < 1.6) { const dd = hyp(B.x1 - p.x, B.y1 - p.y); if (dd < (B.T - B.t) * p.vmax * 1.1 + 1.6) { steer(p, B.x1, B.y1, p.vmax * 1.05, false); return; } }
    if (p.route && p.ri < p.route.length) { const w = p.route[p.ri]; steer(p, w.x, w.y, p.vmax, true); if (hyp(w.x - p.x, w.y - p.y) < 0.7) p.ri++; return; }
    if (p.cont) { want(p, p.cont.x * p.vmax, p.cont.y * p.vmax); return; }
    want(p, 0, 0);
  }
  function qbDrop(qb) {
    if (!qb.route || qb.ri >= qb.route.length) return false;
    if (hyp(ctl.move.x, ctl.move.y) >= 0.2 && G.poss === 0) { qb.ri = qb.route.length; return false; }
    const w = qb.route[qb.ri]; steer(qb, w.x, w.y, qb.vmax * 0.85, false); if (hyp(w.x - qb.x, w.y - qb.y) < 0.4) qb.ri++; return true;
  }
  function cpuQB(qb, dt) {
    let near = null, nd = 99; for (const d of DEF) if (d.rush) { const v = dist(d, qb); if (v < nd) { nd = v; near = d; } }
    if (qbDrop(qb)) { /* getekende drop */ }
    else if (near && nd < 4) { const v = norm(qb.x - near.x, qb.y - near.y); want(qb, v.x * qb.vmax * 0.9, v.y * qb.vmax * 0.9); } else want(qb, 0, 0);
    if (qb.y < 1.5 && qb.wy < 0) qb.wy = Math.abs(qb.wy); if (qb.y > 23.5 && qb.wy > 0) qb.wy = -Math.abs(qb.wy);
    if (G.play.h && !G.handed && G.liveT < 1.5) return;
    G.cpuThinkT -= dt; if (G.liveT < 0.85 || G.cpuThinkT > 0) return; G.cpuThinkT = 0.2;
    const need = (G.zone === 'mid' ? 25 : 50) - G.los; let best = null, bv = -1e9, bs = 0;
    for (const r of OFF) {
      if (r === qb) continue; let sep = 99; for (const d of DEF) { if (d.rush) continue; sep = Math.min(sep, dist(d, r)); }
      const depth = r.x - G.los; const v = Math.min(sep, 5) * 1.2 + clamp(depth, -3, need + 3) * 0.12 + (depth >= need ? 0.8 : 0) - (dist(r, qb) > 28 ? 3 : 0);
      if (v > bv) { bv = v; best = r; bs = sep; }
    }
    if (!best) return;
    if (bs > 2.7 || (G.liveT > 2.3 && bs > 1.6) || nd < 1.9 || G.liveT > 4.2) {
      if (nd < 1.3 && bs < 1.2 && Math.random() < 0.5) throwAway(qb); else throwTo(qb, best, dist(qb, best) < 13);
    }
  }
  function cpuCarrier(c, dt) {
    const sg = c.team === 'off' ? 1 : -1; let dx = sg, dy = 0, nearD = 99;
    for (const d of opp(c)) {
      const rx = c.x - d.x, ry = c.y - d.y, dd = hyp(rx, ry); if (dd < nearD) nearD = dd;
      if (dd < 6 && (d.x - c.x) * sg > -1.5) { const w = (6 - dd) / 6; dy += (ry >= 0 ? 1 : -1) * w * 1.7; dx -= w * 0.35 * sg; }
    }
    if (c.y < 2.5) dy += 0.9; if (c.y > 22.5) dy -= 0.9;
    const v = norm(sg > 0 ? Math.max(0.15, dx) : Math.min(-0.15, dx), dy);
    want(c, v.x * c.vmax * 1.08, v.y * c.vmax * 1.08);
    if (nearD < 2.4 && c.canMove() && Math.random() < dt * 2.2) { const r = Math.random(); if (r < 0.5) doJuke(c, 0, 0); else if (r < 0.75) doSpin(c); else doHesi(c); }
  }
  function aiDef(d) {
    if (G.sub === 'snap' && G.liveT < 0.18) { want(d, 0, 0); return; }
    const c = G.carrier;
    if (G.sub === 'run' && c && !(passOpen() && !d.rush && dist(d, c) > 5)) { pursue(d, c); return; }
    if (G.sub === 'air' && B.t > 0.28 && !B.away && hyp(d.x - B.x1, d.y - B.y1) < 6.5) { d.face = { x: B.x1, y: B.y1 }; steer(d, B.x1, B.y1, d.vmax * 1.02, true); return; }
    if (d.rush) { if (G.sub === 'air') { want(d, d.vx * 0.5, d.vy * 0.5); return; } pursue(d, OFF[0], Math.min(d.vmax, 5.9)); return; }
    const qb = OFF[0];
    if (d.man) {
      const r = d.man, cush = 0.25 + clamp(r.vx / 7, 0, 1);
      d.face = r.x > d.x + 1.8 ? null : { x: r.x, y: r.y };
      steer(d, r.x + r.vx * 0.35 + cush, r.y + r.vy * 0.3, d.vmax, false); return;
    }
    if (d.zone) {
      const z = d.zone; d.face = { x: qb.x, y: qb.y };
      if (G.liveT < 0.7) { steer(d, z.x, z.y, d.vmax * 0.9, false); return; }
      let best = null, bd = 1e9;
      for (const r of OFF) { if (r === qb) continue; const v = hyp(r.x - z.x, r.y - z.y); if (v < z.R && (!z.deep || r.x > G.los + 5) && (z.deep ? r.x > (best ? best.x : -99) : v < bd)) { bd = v; best = r; } }
      if (best) {
        const w = z.deep ? 0.55 : 0.6; let tx = lerp(z.x, best.x + best.vx * 0.3, w), ty = lerp(z.y, best.y + best.vy * 0.3, w);
        if (z.deep) tx = Math.max(tx, best.x + 1.8);
        if (best.x > d.x + 2.5) d.face = null;
        steer(d, tx, ty, d.vmax * 0.95, false);
      } else steer(d, z.x, z.y, d.vmax * 0.8, false);
      return;
    }
    want(d, 0, 0);
  }
  function userDef(d, dt) {
    userMove(d, dt);
    if (I.pressed.X) { const c = G.carrier; if (c && G.sub !== 'snap' && dist(d, c) < 1.45) attempt(d, c, true); else d.stun = Math.max(d.stun, 0.12); }
    if (I.pressed.TRI) { d.diveT = 0.6; if (B.state === 'air' && hyp(B.x1 - d.x, B.y1 - d.y) < 5) { d.startJuke(norm(B.x1 - d.x, B.y1 - d.y)); d.events.push({ name: 'catch' }); } }
    if (I.pressed.L1) switchDef();
  }
  function switchDef() {
    const t = G.carrier || (B.state === 'air' ? { x: B.x1, y: B.y1 } : OFF[0]);
    const cur = DEF.find((d) => d.ctrl); const sorted = [...DEF].sort((a, b) => dist(a, t) - dist(b, t));
    let pick = sorted[0]; if (pick === cur && sorted[1]) pick = sorted[1];
    DEF.forEach((d) => { d.ctrl = false; }); pick.ctrl = true; rumble(40, 0, 0.2);
  }
  function switchOff() {
    const c = G.carrier; if (!c) return; const cur = OFF.find((p) => p.ctrl); const so = [...OFF].sort((a, b) => dist(a, c) - dist(b, c));
    let pk = so[0]; if (pk === cur && so[1]) pk = so[1]; OFF.forEach((p) => { p.ctrl = false; }); pk.ctrl = true; rumble(40, 0, 0.2);
  }

  /* ---------- live spel ---------- */
  function physics(dt) {
    const n = Math.max(1, Math.ceil(dt / FIXED_DT)), h = dt / n, all = [...OFF, ...DEF];
    const qb = OFF[0];
    for (let i = 0; i < n; i++) {
      for (const p of all) {
        let wx = p.wx || 0, wy = p.wy || 0;
        if (!p.user && (wx || wy)) { const a = avoid(p, wx, wy, all, p.ignore); wx = a.x; wy = a.y; }
        p.step(h, wx, wy);
      }
      resolveCollisions(all, 3);
      for (const p of all) clampToField(p, G.carrier);
      resolveCollisions(all, 2);
      const c = G.carrier;
      if (c && c === qb && G.sub === 'pocket' && c.x > G.los - 0.2) { c.x = G.los - 0.2; if (c.vx > 0) c.vx = 0; }
      if (G.sub === 'snap' || G.sub === 'pocket') for (const d of DEF) if (!d.rush && d.x < G.los + 0.3) d.x = G.los + 0.3;
    }
    for (const p of all) if (p.hesiDone) { p.hesiDone = false; hesiFool(p); }
  }
  function resetWants() { for (const p of [...OFF, ...DEF]) { p.wx = 0; p.wy = 0; p.user = false; p.face = null; p.ignore = null; } }

  function updateLive(dt) {
    G.liveT += dt; if (!G.isPAT) G.clock = Math.max(0, G.clock - dt);
    resetWants();
    if (G.pend) { G.pend.qb.face = G.pend.B.target ? { x: G.pend.B.target.x, y: G.pend.B.target.y } : null; G.pend.t -= dt; if (G.pend.t <= 0) releaseThrow(); }
    if (G.sub === 'ret') { decideReturn(dt); physics(dt); rulesReturn(dt); return; }
    const qb = OFF[0], userOff = G.poss === 0;
    if (B.state === 'snap') { B.t += dt; if (B.t >= 0.22) { B.state = 'held'; G.carrier = qb; G.sub = 'pocket'; } }
    if (G.play.h && !G.handed && G.sub === 'pocket' && G.carrier === qb) {
      const rb = OFF.find((p) => p.role === G.play.h);
      if (dist(rb, qb) < 1.35 && G.liveT > 0.3) { G.carrier = rb; G.handed = true; G.sub = 'run'; rb.events.push({ name: 'catch' }); if (userOff) { qb.ctrl = false; rb.ctrl = true; } pop(rb.x, rb.y, 'HANDOFF', C.chalk); }
    }
    for (const p of OFF) {
      if (p === G.carrier) {
        if (userOff) {
          if (p === qb && G.sub === 'pocket' && qbDrop(p) && hyp(ctl.move.x, ctl.move.y) < 0.2) { /* drop */ } else userMove(p, dt);
          if (G.sub === 'pocket' && p === qb) userThrow(qb, dt);
          else if (passOpen()) { userThrow(p, dt); if (G.carrier === p && p.canMove() && ctl.flick) doJuke(p, ctl.flick.x, ctl.flick.y); }
          else carrierMoves(p);
        } else if (G.sub === 'pocket' && p === qb) cpuQB(qb, dt); else cpuCarrier(p, dt);
      } else if (G.sub === 'run' && !passOpen()) want(p, p.vx * 0.4, p.vy * 0.4);
      else if (G.sub === 'run' && p === qb) want(p, 0, 0);
      else if (p === qb) want(p, 0, 0);
      else runRoute(p);
      if (G.phase !== 'live') return;
    }
    for (const d of DEF) { if (d.ctrl) userDef(d, dt); else aiDef(d); if (G.phase !== 'live') return; }
    // QB in de pocket kijkt altijd het veld in: naar achteren lopen is een backpedal, geen omdraaien
    if (G.carrier === qb && (G.sub === 'pocket' || G.sub === 'snap') && !qb.face) qb.face = { x: qb.x + 10, y: qb.y };
    physics(dt);
    if (B.state === 'air') { B.t += dt; if (B.t >= B.T) { resolvePass(); return; } }
    const c = G.carrier;
    if (c && c === qb && G.sub === 'pocket') {
      const left = 7 - G.liveT, sec = Math.ceil(left);
      if (left <= 3 && sec > 0 && sec !== G.qbTick) { G.qbTick = sec; rumble(70, 0, sec === 1 ? 0.6 : 0.3); }
      if (left <= 0) { pop(qb.x, qb.y, 'TIJD!', C.red); endPlay({ type: 'inc', text: '7 SECONDEN', sub: 'Bal te lang vastgehouden · verlies van een down' }); return; }
    }
    if (c) {
      if (c.y < 0 || c.y > 25) { pop(c.x, clamp(c.y, 0, 25), 'UIT', C.dim); endPlay({ type: 'oob', spot: c.x }); return; }
      if (c.x >= 50 && G.sub === 'run') { endPlay({ type: 'td' }); return; }
      for (const d of DEF) { if (d.ctrl || d.stun > 0 || d.pullCd > 0 || d.overrun > 0) continue; if (dist(d, c) < 0.95) { attempt(d, c, false); if (G.phase !== 'live') return; } }
    }
  }
  function startReturn(d) {
    G.sub = 'ret'; G.carrier = d; B.state = 'held'; d.stun = 0; d.overrun = 0; d.pullCd = 0; d.events.push({ name: 'catch' });
    pop(d.x, d.y, 'PICK!', C.lamp); rumble(350, 0.8, 0.8);
    if (G.poss === 1) { DEF.forEach((x) => { x.ctrl = false; }); d.ctrl = true; }
    else { OFF.forEach((p) => { p.ctrl = false; }); [...OFF].sort((a, b) => dist(a, d) - dist(b, d))[0].ctrl = true; }
  }
  function decideReturn(dt) {
    const c = G.carrier, userOff = G.poss === 0;
    if (!userOff && c.ctrl) { userMove(c, dt); carrierMoves(c); } else cpuCarrier(c, dt);
    for (const p of OFF) {
      if (p.ctrl && userOff) {
        userMove(p, dt);
        if (I.pressed.X) { if (dist(p, c) < 1.45) attempt(p, c, true); else p.stun = Math.max(p.stun, 0.12); }
        if (I.pressed.L1) switchOff();
      } else pursue(p, c);
      if (G.phase !== 'live') return;
    }
    for (const d of DEF) { if (d === c) continue; steer(d, c.x - 3, d.y + (c.y - d.y) * 0.3, d.vmax * 0.85, true); }
  }
  function rulesReturn(dt) {
    const c = G.carrier, userOff = G.poss === 0;
    if (G.phase !== 'live') return;
    if (c.y < 0 || c.y > 25) { pop(c.x, clamp(c.y, 0, 25), 'UIT', C.dim); endPlay({ type: 'int', spot: c.x }); return; }
    if (c.x <= 0) { endPlay({ type: 'pick6' }); return; }
    for (const p of OFF) { if ((p.ctrl && userOff) || p.stun > 0 || p.pullCd > 0 || p.overrun > 0) continue; if (dist(p, c) < 0.95) { attempt(p, c, false); if (G.phase !== 'live') return; } }
  }
  function userThrow(qb, dt) {
    if (B.state !== 'held' || G.pend) return;
    if (!G.charge) {
      for (const b of ['X', 'O', 'SQ', 'TRI']) if (I.pressed[b] && OFF.some((p) => passBtn(p) === b)) { G.charge = { b, t: 0 }; break; }
      if (!G.charge && I.pressed.R1) { throwAway(qb); return; }
    }
    if (G.charge) {
      G.charge.t += dt; const b = G.charge.b;
      if (!I.held[b] || G.charge.t >= 0.5) {
        const rec = OFF.find((p) => passBtn(p) === b); const bullet = G.charge.t >= 0.18; G.charge = null;
        if (rec) { throwTo(qb, rec, bullet); OFF.forEach((p) => { p.ctrl = false; }); rec.ctrl = true; }
      }
    }
  }

  /* ---------- Play Maker ---------- */
  const EIDS = ['Q', 'C', 'X', 'Y', 'Z'];
  function openEditor(idx) { const p = PLAYS[idx]; G.editor = { idx, f: JSON.parse(JSON.stringify(p.f)), h: p.h || null, sel: 'X', mode: 'route', cx: 12.5, cy: 4, menu: false, menuSel: 0 }; rumble(60, 0, 0.3); }
  const eRoute = (E, id) => (id === 'Q' ? (E.f.Q[2] || (E.f.Q[2] = [])) : E.f[id][2]);
  function editorUpdate(dt) {
    const E = G.editor;
    if (E.menu) {
      if (I.navY) E.menuSel = (E.menuSel + I.navY + 3) % 3;
      if (I.pressed.O || I.pressed.OPT) { E.menu = false; return; }
      if (I.pressed.X) {
        const p = PLAYS[E.idx], n = E.idx - PLAYS.findIndex((q) => q.custom) + 1;
        if (E.menuSel === 0) { p.f = E.f; p.h = E.h; p.run = E.h ? 1 : 0; p.empty = false; p.desc = customDesc(p); saveCustoms(); G.editor = null; G.sel = E.idx; toast(p.name + ' opgeslagen'); }
        else if (E.menuSel === 1) G.editor = null;
        else { const b = blankCustom(n); Object.assign(p, { f: b.f, h: null, run: 0, empty: true, desc: '' }); saveCustoms(); G.editor = null; toast(p.name + ' leeggemaakt'); }
      }
      return;
    }
    if (I.pressed.OPT) { E.menu = true; E.menuSel = 0; return; }
    const sp = I.held.R2 ? 16 : 7;
    E.cx = clamp(E.cx + I.lx * sp * dt, 0.5, 24.5); E.cy = clamp(E.cy - I.ly * sp * dt, -8, 16);
    const l = Math.round(E.cx * 2) / 2, d = Math.round(E.cy * 2) / 2;
    if (I.pressed.L1 || I.pressed.R1) { const i = EIDS.indexOf(E.sel); E.sel = EIDS[(i + (I.pressed.R1 ? 1 : -1) + 5) % 5]; }
    if (I.pressed.SQ) E.mode = E.mode === 'pos' ? 'route' : 'pos';
    if (I.pressed.X) {
      const hit = EIDS.find((id) => hyp(E.f[id][1] - l, E.f[id][0] - d) < 0.8);
      if (hit && hit !== E.sel) E.sel = hit;
      else if (E.mode === 'pos') {
        const id = E.sel, o = E.f[id]; let nd = id === 'C' ? 0 : id === 'Q' ? Math.min(d, -1) : Math.min(d, 0); nd = Math.max(nd, -8);
        const dd = nd - o[0], dl = l - o[1]; o[0] = nd; o[1] = l;
        eRoute(E, id).forEach((pt) => { pt[0] = clamp(pt[0] + dd, -8, 16); pt[1] = clamp(pt[1] + dl, 0.5, 24.5); });
        if (id === 'C' && d !== 0) toast('De center staat altijd op de line of scrimmage');
      } else {
        const rt = eRoute(E, E.sel);
        if (rt.length >= 6) toast('Maximaal 6 punten per route');
        else if (E.sel === 'Q' && d > -0.5) toast('De QB mag niet over de line of scrimmage');
        else rt.push([d, l]);
      }
    }
    if (I.pressed.O) { const rt = eRoute(E, E.sel); if (rt.length) rt.pop(); }
    if (I.pressed.TRI && E.sel !== 'Q') { const o = E.f[E.sel]; o[3] = o[3] === 0 ? 1 : 0; }
    if (I.pressed.L2 && E.sel !== 'Q') { E.h = E.h === E.sel ? null : E.sel; toast(E.h ? 'Run: handoff naar ' + E.h : 'Passplay: geen handoff'); }
  }

  /* ---------- hoofdupdate (1x per frame) ---------- */
  function toggleCam() {
    if (G.poss === 0) { G.camOff = G.camOff === 'achter' ? 'boven' : 'achter'; toast(G.camOff === 'achter' ? 'Camera aanval: achter de offense' : 'Camera aanval: van boven'); }
    else { G.camDef = G.camDef === 'achter' ? 'boven' : 'achter'; toast(G.camDef === 'achter' ? 'Camera verdediging: achter de defense' : 'Camera verdediging: van boven'); }
  }
  game.cameraStyle = () => (G.poss === 0 ? G.camOff : G.camDef);

  game.update = function update(dt) {
    G.time += dt;
    if (G.toast) { G.toast.t += dt; if (G.toast.t > 2.6) G.toast = null; }
    for (let i = game.pops.length - 1; i >= 0; i--) { game.pops[i].t += dt; if (game.pops[i].t > 0.9) game.pops.splice(i, 1); }
    if (G.screen === 'title') { if (I.pressed.X) { G.screen = 'teams'; G.teamRow = 0; } return; }
    if (G.screen === 'teams') {
      if (I.navY) G.teamRow = clamp(G.teamRow + I.navY, 0, 1);
      if (I.navX) { const r = G.teamRow; let v = G.teamSel[r]; do { v = (v + I.navX + TEAMS.length) % TEAMS.length; } while (v === G.teamSel[1 - r]); G.teamSel[r] = v; emit({ type: 'teams' }); }
      if (I.pressed.X) G.screen = 'tutorial'; else if (I.pressed.O) G.screen = 'title';
      return;
    }
    if (G.screen === 'tutorial') { if (I.pressed.X) newGame(); else if (I.pressed.O) G.screen = 'teams'; return; }
    if (G.editor) { editorUpdate(dt); return; }
    if (I.pressed.OPT && G.phase !== 'halftime' && G.phase !== 'final') {
      if (G.paused) G.paused = false; else { G.paused = true; G.pauseReason = ''; G.pauseView = 'menu'; G.pauseSel = 0; }
      return;
    }
    if (G.paused) {
      if (G.pauseView === 'controls') { if (I.pressed.O || I.pressed.X) G.pauseView = 'menu'; return; }
      if (I.navY) G.pauseSel = (G.pauseSel + I.navY + 4) % 4;
      if (I.pressed.O) G.paused = false;
      else if (I.pressed.X) { if (G.pauseSel === 0) G.paused = false; else if (G.pauseSel === 1) toggleCam(); else if (G.pauseSel === 2) G.pauseView = 'controls'; else { G.paused = false; G.screen = 'title'; } }
      return;
    }
    if (I.pressed.R3) toggleCam();
    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
    switch (G.phase) {
      case 'playcall':
        if (I.navX) G.sel = Math.floor(G.sel / 3) * 3 + ((G.sel % 3) + I.navX + 3) % 3;
        if (I.navY) G.sel = (G.sel + 3 * I.navY + PLAYS.length) % PLAYS.length;
        if (I.pressed.R1) G.sel = (G.sel + 6) % PLAYS.length;
        if (I.pressed.L1) G.sel = (G.sel - 6 + PLAYS.length) % PLAYS.length;
        { const cp = PLAYS[G.sel]; if (cp.custom && (I.pressed.TRI || (I.pressed.X && cp.empty))) { openEditor(G.sel); break; } }
        if (I.pressed.X) { if (playAllowed(G.sel)) { G.lastPlay = G.sel; startPresnap(PLAYS[G.sel], cpuPickCover()); } else banner('GEEN RUN', 'In een no-run zone mag je alleen passen', C.red, false, 1.4); }
        break;
      case 'defcall':
        if (I.navX) G.sel = (G.sel + I.navX + COVERS.length) % COVERS.length;
        if (I.pressed.X) { G.lastCov = G.sel; startPresnap(PLAYS[cpuPickPlay()], COVERS[G.sel]); }
        break;
      case 'pat':
        if (I.navX) G.sel = (G.sel + I.navX + 2) % 2;
        if (I.pressed.X) setPAT(G.sel + 1);
        break;
      case 'presnap':
        if (G.poss === 0) {
          if (G.audible) {
            const pick = I.pressed.SQ ? 0 : I.pressed.X ? 1 : I.pressed.O ? 2 : -1;
            if (pick >= 0) { G.lastPlay = AUD[pick]; startPresnap(PLAYS[AUD[pick]], G.cover); pop(OFF[0].x, OFF[0].y, 'AUDIBLE', C.lamp); }
            else if (I.pressed.TRI) G.audible = false;
          } else if (I.pressed.X) snap(); else if (I.pressed.TRI) G.audible = true;
        } else { if (I.pressed.L1) switchDef(); G.presnapT -= dt; if (G.presnapT <= 0) snap(); }
        break;
      case 'live': updateLive(dt); break;
      case 'dead':
        G.deadT -= dt;
        // spelers lopen rustig uit
        resetWants(); physics(dt);
        if (G.deadT <= 0 || (G.deadT < 1.5 && I.pressed.X)) { const n = G.next; G.next = null; if (n) n(); }
        break;
      case 'halftime':
        if (I.pressed.X) { G.half = 2; G.clock = 240; changePoss(1 - G.startPoss, 5); }
        break;
      case 'final':
        if (I.pressed.X) G.screen = 'teams';
        break;
    }
  };

  game.GC = GC; game.PB = PB; game.PLAYS = PLAYS; game.COVERS = COVERS; game.AUD = AUD; game.TEAMS = TEAMS;
  return game;
}
