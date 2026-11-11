// Flag Rush 3D — koppelt spellogica (game/), invoer (input/) en rendering (render/) aan elkaar.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { Input } from './input/input.js';
import { createTouchControls, isTouchDevice } from './input/touch.js';
import { createGame } from './game/game.js';
import { createRenderer, createScene, followShadow, resizeTo } from './render/scene.js';
import { createField } from './render/field.js';
import { createStadium } from './render/stadium.js';
import { CharacterView } from './render/character.js';
import { BallView } from './render/ball.js';
import { GltfCharacterView, preloadPlayerModel, hasPlayerModel } from './render/gltfCharacter.js';
import { CameraRig } from './render/cameraRig.js';
import { drawOverlay, W as UW, H as UH } from './render/overlay.js';
import { TEAMS } from './data/teams.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const uictx = ui.getContext('2d');
const fpsEl = document.getElementById('fps');

// ---------------------------------------------------------------- invoer en spel
const input = new Input((t) => game.toast(t));
const game = createGame(input);
const { G } = game;
// mobiel: schermbesturing (stick links, knoppen rechts) en zuinigere weergave
const TOUCH = isTouchDevice();
if (TOUCH) { createTouchControls(input); document.getElementById('rotate').hidden = false; }
if (!document.fullscreenEnabled) document.getElementById('fs').style.display = 'none'; // iPhone Safari heeft geen volledig scherm

// ---------------------------------------------------------------- wereld
const renderer = createRenderer(canvas, TOUCH);
const stadium = createStadium(TEAMS);
const { scene, sun } = createScene(stadium.mastPositions, TOUCH);
scene.add(stadium.group);
const field = createField(renderer, [game.teamOf(0), game.teamOf(1)]);
scene.add(field.group);
field.setTeams([game.teamOf(0), game.teamOf(1)]);
const actors = new THREE.Group(); scene.add(actors);
const ball = new BallView(actors);

const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 500);
const rig = new CameraRig(camera);

// lijnen op het veld: line of scrimmage (blauw), eerste down / midden (geel), no-run zone (rood)
function strip(color, w, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 25), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.012, 12.5); m.visible = false; scene.add(m); return m;
}
const losLine = strip(0x4aa3ff, 0.25, 0.9), fdLine = strip(0xffd23a, 0.3, 0.9), noRunZone = strip(0xff3b3b, 5, 0.16);

// confetti
const CONF = { n: 0, pos: null, vel: null, pts: null, t: 0 };
function confetti(n, cols) {
  if (CONF.pts) { scene.remove(CONF.pts); CONF.pts.geometry.dispose(); }
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos.set([G.los + 8 + Math.random() * 20 - 5, 14 + Math.random() * 10, Math.random() * 25], i * 3);
    vel.set([(Math.random() - 0.5) * 4, -Math.random() * 3, (Math.random() - 0.5) * 4], i * 3);
    c.set(cols[i % cols.length]); col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  CONF.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95 }));
  CONF.n = n; CONF.pos = pos; CONF.vel = vel; CONF.t = 0; scene.add(CONF.pts);
}
function updateConfetti(dt) {
  if (!CONF.pts) return; CONF.t += dt;
  for (let i = 0; i < CONF.n; i++) { CONF.vel[i * 3 + 1] -= 3 * dt; for (let k = 0; k < 3; k++) CONF.pos[i * 3 + k] += CONF.vel[i * 3 + k] * dt; if (CONF.pos[i * 3 + 1] < 0.05) CONF.pos[i * 3 + 1] = 0.05; }
  CONF.pts.geometry.attributes.position.needsUpdate = true;
  if (CONF.t > 6) { scene.remove(CONF.pts); CONF.pts.geometry.dispose(); CONF.pts = null; }
}

// ---------------------------------------------------------------- weergave-schaal
let scaleU = 1, offX = 0, offY = 0, dpr = 1;
// Dynamische resolutie: haalt het spel de framerate niet, dan rendert de 3D-scène met een lagere resolutie (UI blijft scherp).
const MAX_PR = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2);
const adapt = { pr: MAX_PR, bad: Infinity, acc: 0, n: 0, good: 0, last: 0, fps: 0 };
function onResize() {
  renderer.setPixelRatio(adapt.pr);
  resizeTo(renderer, camera);
  dpr = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2);
  const w = window.innerWidth, h = window.innerHeight;
  ui.width = Math.round(w * dpr); ui.height = Math.round(h * dpr);
  scaleU = Math.min(w / UW, h / UH); offX = (w - UW * scaleU) / 2; offY = (h - UH * scaleU) / 2;
}
addEventListener('resize', onResize); onResize();
const _v = new THREE.Vector3();
function project(u, v, z) {
  _v.set(u, z || 0, v).project(camera);
  if (_v.z > 1 || _v.z < -1) return null;
  const px = (_v.x * 0.5 + 0.5) * window.innerWidth, py = (-_v.y * 0.5 + 0.5) * window.innerHeight;
  return { x: (px - offX) / scaleU, y: (py - offY) / scaleU };
}

// ---------------------------------------------------------------- views
preloadPlayerModel(); // optioneel: public/models/player.glb
const views = new Map();
let debug = false;
function rebuildViews() {
  for (const v of views.values()) v.dispose();
  views.clear();
  ball.detach(actors);
  [...game.OFF, ...game.DEF].forEach((p, i) => {
    const View = hasPlayerModel() ? GltfCharacterView : CharacterView;
    const v = new View(actors, game.teamOf(p.team === 'off' ? G.poss : 1 - G.poss), p.num, i % 4);
    v.setDebug(debug, PLAYER.radius); views.set(p, v);
  });
  rig.snap = true;
}
function toggleFS() {
  try {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => game.toast('Volledig scherm is hier niet beschikbaar'));
    else document.exitFullscreen?.().catch(() => {});
  } catch { game.toast('Volledig scherm is hier niet beschikbaar'); }
}
input.onKey = (e) => {
  if (e.code === 'KeyF') { if (!e.repeat) toggleFS(); return true; }
  if (e.code === 'KeyB') { if (!e.repeat) { debug = !debug; for (const v of views.values()) v.setDebug(debug, PLAYER.radius); game.toast(debug ? 'Botsingscilinders aan' : 'Botsingscilinders uit'); } return true; }
  return false;
};
document.getElementById('fs').addEventListener('click', (e) => { toggleFS(); e.currentTarget.blur(); canvas.focus(); });

// camerastand volgt het balbezit: 0 achter offense, 1 achter defense, 2 van boven, 3 = menu-rondvlucht
function camMode() {
  if (G.screen !== 'game') return 3;
  const top = game.cameraStyle() === 'boven';
  return top ? 2 : (G.poss === 0 ? 0 : 1);
}
// linkerstick -> veldrichting (de aanval loopt altijd naar +x)
function stickToField(x, y, mode) {
  switch (mode) {
    case 0: return { x: -y, y: x };
    case 1: return { x: y, y: -x };
    default: return { x, y };
  }
}
const lerp3 = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// ---------------------------------------------------------------- lus
let last = performance.now(), fpsAcc = 0, fpsN = 0, orbit = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000) * (window.__fr?.timeScale ?? 1); last = now;

  const P0 = performance.now();
  input.poll(dt);
  const mode = camMode();
  const ctl = game.ctl;
  const sm = mode === 3 ? 2 : mode;
  ctl.move = stickToField(input.lx, input.ly, sm); ctl.rstick = stickToField(input.rx, input.ry, sm);
  ctl.flick = input.rflick ? stickToField(input.rflick.x, input.rflick.y, sm) : null;

  game.update(dt);
  const P1 = performance.now();

  for (const e of game.fx.splice(0)) {
    if (e.type === 'rebuild') rebuildViews();
    else if (e.type === 'possession') field.setTeams([game.teamOf(G.poss), game.teamOf(1 - G.poss)]);
    else if (e.type === 'teams') field.setTeams([game.teamOf(0), game.teamOf(1)]);
    else if (e.type === 'flagpull') views.get(e.carrier)?.pullFlag(e.from.x, e.from.y);
    else if (e.type === 'rumble') input.rumble(e.ms, e.s, e.w);
    else if (e.type === 'confetti') confetti(e.n, e.cols);
  }

  const playing = G.screen === 'game';
  for (const [p, v] of views) {
    v.setRing(p.ctrl && playing && G.phase !== 'dead' && G.phase !== 'halftime' && G.phase !== 'final');
    v.setCarrying(p === G.carrier && game.B.state === 'held');
    v.update(dt, p);
  }
  updateBall(dt);
  updateConfetti(dt);
  const P2 = performance.now();

  const showLines = playing && !G.editor;
  losLine.visible = showLines; losLine.position.x = G.los;
  fdLine.visible = showLines && G.zone === 'mid' && !G.isPAT; fdLine.position.x = 25;
  noRunZone.visible = showLines && game.noRun(); noRunZone.position.x = 47.5;

  // camera
  let focus;
  if (!playing) {
    orbit += dt * 0.12;
    focus = { x: 25 + Math.cos(orbit) * 14, y: 12.5 };
    camera.position.set(25 + Math.cos(orbit) * 42, 20, 12.5 + Math.sin(orbit) * 30); camera.lookAt(25, 0, 12.5);
    rig.snap = true; rig.pos.copy(camera.position);
  } else {
    const b = game.B, ctrl = [...game.OFF, ...game.DEF].find((p) => p.ctrl);
    const qb = game.OFF[0];
    focus = G.carrier || ctrl || { x: G.los, y: 12.5 };
    if (b.state === 'air') focus = { x: lerp3(b.x0, b.x1, b.t / b.T), y: lerp3(b.y0, b.y1, b.t / b.T) };
    else if (['presnap', 'playcall', 'defcall', 'pat'].includes(G.phase)) focus = G.poss === 0 ? { x: G.los + 2, y: qb ? qb.y : 12.5 } : { x: G.los + 10, y: 12.5 };
    if (mode === 1 && G.phase === 'live' && ctrl) focus = { x: Math.max(ctrl.x, G.los + 6), y: ctrl.y };
    rig.mode = mode;
    rig.update(dt, focus, 1);
  }
  followShadow(sun, focus.x, focus.y);

  const P3 = performance.now();
  renderer.render(scene, camera);
  const P4 = performance.now();

  uictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  uictx.translate(offX, offY); uictx.scale(scaleU, scaleU);
  drawOverlay(uictx, game, input, project);
  const P5 = performance.now();
  // meetgegevens (gemiddelde in ms) voor het opsporen van haperingen: __fr.perf
  const pf = (window.__fr.perf ||= { game: 0, views: 0, cam: 0, render: 0, overlay: 0, n: 0 }), k = 0.05;
  pf.game += (P1 - P0 - pf.game) * k; pf.views += (P2 - P1 - pf.views) * k; pf.cam += (P3 - P2 - pf.cam) * k; pf.render += (P4 - P3 - pf.render) * k; pf.overlay += (P5 - P4 - pf.overlay) * k; pf.n++;

  // echte framerate meten (niet via dt, dat is begrensd) en de 3D-resolutie daarop afstellen
  const A = adapt;
  if (A.last) { A.acc += now - A.last; A.n++; }
  A.last = now;
  if (A.acc > 1000) {
    const ms = A.acc / A.n; A.fps = 1000 / ms; A.acc = 0; A.n = 0;
    fpsEl.textContent = Math.round(A.fps) + ' fps' + (A.pr < MAX_PR - 0.01 ? ' · ' + Math.round(A.pr / MAX_PR * 100) + '%' : '');
    if (document.hidden || now < 6000) { A.good = 0; } // eerste seconden (laden, shaders) niet meetellen
    else if (ms > 24 && A.pr > 0.55) { A.bad = A.pr; A.pr = Math.max(0.55, A.pr * 0.85); A.good = 0; onResize(); } // trager dan ~42 fps: resolutie omlaag
    else if (ms < 18.5 && A.pr * 1.1 < A.bad && A.pr < MAX_PR) { if (++A.good >= 6) { A.pr = Math.min(MAX_PR, A.pr * 1.1); A.good = 0; onResize(); } }
    else A.good = 0;
  }
}

function updateBall(dt) {
  const b = game.B;
  ball.group.visible = G.screen === 'game' && !!game.OFF.length && b.state !== 'none';
  if (!ball.group.visible) return;
  const C = game.OFF[1], Q = game.OFF[0];
  if (b.state === 'pre') { ball.detach(actors); ball.setGround(tmp.set(C.x + 0.45, 0, C.y), 0); }
  else if (b.state === 'snap') {
    ball.detach(actors); const f = Math.min(1, b.t / 0.22);
    tmp.set(C.x + (Q.x - C.x) * f, 0.5 + Math.sin(f * Math.PI) * 0.6 + f * 0.6, C.y + (Q.y - C.y) * f);
    tmp2.set(Q.x - C.x, 0, Q.y - C.y).normalize(); ball.setFlight(tmp, tmp2, dt);
  } else if (b.state === 'held' && G.carrier) {
    const v = views.get(G.carrier); if (v && ball.holder !== v) ball.attach(v);
  } else if (b.state === 'air') {
    ball.detach(actors);
    const f = Math.min(1, b.t / b.T), f2 = Math.min(1, f + 0.02), z = (ff) => 1.8 + (1.6 - 1.8) * ff + 4 * b.h * ff * (1 - ff);
    const x = lerp3(b.x0, b.x1, f), y = lerp3(b.y0, b.y1, f), x2 = lerp3(b.x0, b.x1, f2), y2 = lerp3(b.y0, b.y1, f2);
    tmp.set(x, z(f), y); tmp2.set(x2 - x, z(f2) - z(f), y2 - y); if (tmp2.lengthSq() < 1e-8) tmp2.set(1, 0, 0); tmp2.normalize();
    ball.setFlight(tmp, tmp2, dt);
  } else if (b.state === 'loose') {
    ball.detach(actors); ball.setGround(tmp.set(b.x1 ?? 0, 0, b.y1 ?? 0), 0.6);
  }
}

requestAnimationFrame(frame);
window.__fr = { timeScale: 1, game, views, rig, renderer, camera, scene, ball, input };
