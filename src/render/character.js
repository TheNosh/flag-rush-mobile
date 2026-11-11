// 3D-speler met skelet (hiërarchie van gewrichten) en geblende animaties.
//
// De animaties zijn procedureel (pose-blending op basis van snelheid en richting), zodat het spel
// zonder externe bestanden werkt. De rest van het spel praat alleen met de publieke API:
//   view.update(dt, body)      -> volgt de simulatie
//   view.trigger(name, data)   -> eenmalige acties: juke, spin, hesi, throw, catch, pull, cheer
//   view.pullFlag(fromX,fromY) -> haalt een flag van de riem, die vrij door de lucht vliegt
// Een GLTF-karakter (Quaternius/Mixamo) kan later dezelfde API implementeren; zie README.
import * as THREE from 'three';
import { clamp, lerp, damp, hyp } from '../game/math.js';

const TAU = Math.PI * 2;
const GRAV = 10.7; // yd/s2

// ---------- gedeelde geometrie en materialen
const cap = (r, l, rs = 10) => new THREE.CapsuleGeometry(r, l, 4, rs);
const GEO = {
  torso: cap(0.16, 0.30, 12),
  pelvis: cap(0.13, 0.08, 10),
  thigh: cap(0.085, 0.30),
  shorts: cap(0.098, 0.10),
  shin: cap(0.06, 0.30),
  upperArm: cap(0.055, 0.20),
  foreArm: cap(0.045, 0.18),
  hand: new THREE.SphereGeometry(0.05, 8, 6),
  head: new THREE.SphereGeometry(0.115, 14, 10),
  hair: new THREE.SphereGeometry(0.122, 12, 8, 0, TAU, 0, Math.PI * 0.58),
  shoe: new THREE.BoxGeometry(0.27, 0.075, 0.105),
  belt: new THREE.CylinderGeometry(0.15, 0.15, 0.05, 14),
  flag: new THREE.BoxGeometry(0.05, 0.34, 0.012),
  numPlane: new THREE.PlaneGeometry(0.30, 0.30),
  ring: new THREE.RingGeometry(0.62, 0.78, 32),
  dbg: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
};
GEO.ring.rotateX(-Math.PI / 2);

const SKIN = [0xe0b394, 0xc68863, 0x8d5a3b, 0x5b3a26].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
const HAIR = new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.9 });
const SHOE = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9, depthWrite: false });
const DBG_MAT = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true });

const teamMats = new Map();
function getTeamMats(team) {
  let m = teamMats.get(team.name);
  if (!m) {
    m = {
      jersey: new THREE.MeshStandardMaterial({ color: team.c, roughness: 0.8 }),
      shorts: new THREE.MeshStandardMaterial({ color: team.k, roughness: 0.85 }),
      sock: new THREE.MeshStandardMaterial({ color: team.c, roughness: 0.85 }),
      flag: new THREE.MeshStandardMaterial({ color: team.flag, roughness: 0.6, emissive: team.flag, emissiveIntensity: 0.15, side: THREE.DoubleSide }),
      belt: new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.7 }),
    };
    teamMats.set(team.name, m);
  }
  return m;
}
const numMats = new Map();
function getNumMat(team, num) {
  const key = team.name + num;
  let m = numMats.get(key);
  if (!m) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.font = '800 104px "Saira Condensed","Arial Narrow",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(String(num), 64, 68);
    g.fillStyle = team.ink; g.fillText(String(num), 64, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    numMats.set(key, m);
  }
  return m;
}

// ---------- pose-indexen
const P = { pelY: 0, spZ: 1, spY: 2, spX: 3, headZ: 4, hLz: 5, hLx: 6, kL: 7, hRz: 8, hRx: 9, kR: 10, sLz: 11, sLx: 12, eL: 13, sRz: 14, sRx: 15, eR: 16 };
const NP = 17;
const poseIdle = new Float32Array(NP), poseRun = new Float32Array(NP), poseBack = new Float32Array(NP), poseSide = new Float32Array(NP), poseOut = new Float32Array(NP);

const smooth = (t) => t * t * (3 - 2 * t);
const env = (t, dur) => Math.pow(Math.sin(Math.PI * clamp(t / dur, 0, 1)), 0.6);
const easeIO = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));

export class CharacterView {
  /** @param world THREE.Object3D waar losse flags in terechtkomen; team = {name,c,k,flag,ink} */
  constructor(world, team, num, skinIdx = 0) {
    this.world = world; this.team = team; this.num = num;
    const tm = getTeamMats(team), skin = SKIN[skinIdx % SKIN.length];
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

    this.root = new THREE.Group();
    this.spinG = joint(this.root, 0, 0, 0);
    this.leanG = joint(this.spinG, 0, 0, 0);
    this.pelvis = joint(this.leanG, 0, 0.96, 0);
    mesh(GEO.pelvis, tm.shorts, this.pelvis).scale.set(0.8, 1, 1.3);
    mesh(GEO.belt, tm.belt, this.pelvis, 0, 0.0, 0).scale.set(0.82, 1, 1.28);

    // benen (links = -z, rechts = +z)
    this.hip = [], this.knee = [];
    for (const s of [-1, 1]) {
      const hip = joint(this.pelvis, 0, -0.03, s * 0.1);
      mesh(GEO.thigh, skin, hip, 0, -0.23, 0);
      mesh(GEO.shorts, tm.shorts, hip, 0, -0.13, 0);
      const knee = joint(hip, 0, -0.47, 0);
      mesh(GEO.shin, tm.sock, knee, 0, -0.24, 0);
      mesh(GEO.shoe, SHOE, knee, 0.06, -0.455, 0);
      this.hip.push(hip); this.knee.push(knee);
    }

    // romp
    this.spine = joint(this.pelvis, 0, 0.07, 0);
    mesh(GEO.torso, tm.jersey, this.spine, 0, 0.30, 0).scale.set(0.76, 1, 1.18);
    for (const [sgn, rot] of [[1, Math.PI / 2], [-1, -Math.PI / 2]]) {
      const pl = new THREE.Mesh(GEO.numPlane, getNumMat(team, num));
      pl.scale.setScalar(sgn > 0 ? 0.55 : 1);
      pl.position.set(sgn * 0.126, sgn > 0 ? 0.42 : 0.33, 0); pl.rotation.y = rot;
      this.spine.add(pl);
    }
    // armen
    this.sho = [], this.elb = [];
    for (const s of [-1, 1]) {
      const sh = joint(this.spine, 0, 0.55, s * 0.215);
      mesh(GEO.upperArm, tm.jersey, sh, 0, -0.15, 0);
      const el = joint(sh, 0, -0.30, 0);
      mesh(GEO.foreArm, skin, el, 0, -0.14, 0);
      mesh(GEO.hand, skin, el, 0, -0.30, 0);
      this.sho.push(sh); this.elb.push(el);
    }
    this.handR = joint(this.elb[1], 0.06, -0.30, -0.02); // hier hangt de bal
    // hoofd
    this.head = joint(this.spine, 0, 0.66, 0);
    mesh(GEO.head, skin, this.head, 0, 0.13, 0);
    const hair = mesh(GEO.hair, HAIR, this.head, 0, 0.14, 0); hair.rotation.z = 0.15;

    // flags aan de riem
    this.flags = [-1, 1].map((s) => {
      const piv = joint(this.pelvis, 0, -0.02, s * 0.2);
      const m = mesh(GEO.flag, tm.flag, piv, 0, -0.19, 0);
      return { piv, mesh: m, ang: 0, angV: 0, roll: 0, rollV: 0, on: true, side: s };
    });
    this.loose = [];

    // markeringen
    this.ring = new THREE.Mesh(GEO.ring, RING_MAT); this.ring.position.y = 0.03; this.ring.visible = false; this.root.add(this.ring);
    this.dbg = new THREE.Mesh(GEO.dbg, DBG_MAT); this.dbg.visible = false; this.root.add(this.dbg);

    world.add(this.root);
    // animatiestatus
    this.vf = 0; this.vr = 0; this.phase = Math.random() * TAU; this.t = Math.random() * 10;
    this.acts = [];
    this.spinDir = 1; this.spinAngle = 0;
    this.carrying = 0; this.carryW = 0;
    this.pelBase = 0.96;
    this.setDebug(false, 0.4);
  }

  setDebug(on, r) { this.dbg.visible = on; this.dbg.scale.set(r, 2.0, r); this.dbg.position.y = 1.0; }
  setRing(on) { this.ring.visible = on; }
  setCarrying(on) { this.carrying = on ? 1 : 0; }

  trigger(name, data = {}) {
    const durs = { juke: 0.34, spin: 0.46, hesi: 0.3, throw: 0.55, catch: 0.7, pull: 0.5, cheer: 2.4, miss: 0.4 };
    this.acts = this.acts.filter((a) => a.name !== name);
    if (name === 'spin') this.spinDir = Math.random() < 0.5 ? 1 : -1;
    this.acts.push({ name, t: 0, dur: durs[name] || 0.5, ...data });
  }
  stop(name) { this.acts = this.acts.filter((a) => a.name !== name); }
  act(name) { return this.acts.find((a) => a.name === name); }

  /** Haalt de flag weg die het dichtst bij (fx, fy) zit en laat hem vrij vliegen. Geeft de wereldpositie terug. */
  pullFlag(fx, fy) {
    this.root.updateMatrixWorld(true);
    let best = null, bd = 1e9;
    const v = new THREE.Vector3();
    for (const f of this.flags) {
      if (!f.on) continue;
      f.mesh.getWorldPosition(v);
      const d = hyp(v.x - fx, v.z - fy);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return null;
    best.on = false;
    const m = best.mesh, pos = new THREE.Vector3(), q = new THREE.Quaternion();
    m.getWorldPosition(pos); m.getWorldQuaternion(q);
    m.removeFromParent(); this.world.add(m);
    m.position.copy(pos); m.quaternion.copy(q);
    const side = new THREE.Vector3(Math.cos(this.root.rotation.y), 0, -Math.sin(this.root.rotation.y)); // lokale +x
    this.loose.push({ m, v: new THREE.Vector3(this.lastVx * 0.3 + (Math.random() - 0.5) * 1.5, 3 + Math.random() * 1.5, this.lastVy * 0.3 + (Math.random() - 0.5) * 1.5), w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12), home: best });
    return pos;
  }

  resetFlags() {
    for (const l of this.loose) { l.m.removeFromParent(); l.home.piv.add(l.m); l.m.position.set(0, -0.19, 0); l.m.quaternion.identity(); l.home.on = true; }
    this.loose.length = 0;
    for (const f of this.flags) { f.on = true; f.ang = f.angV = f.roll = f.rollV = 0; }
  }

  get flagsLeft() { return this.flags.filter((f) => f.on).length; }

  dispose() { this.root.removeFromParent(); for (const l of this.loose) l.m.removeFromParent(); }

  // ----------------------------------------------------------------
  update(dt, body) {
    this.t += dt;
    this.lastVx = body.vx; this.lastVy = body.vy;
    // positie en richting (spel x,y -> wereld x,z; heading draait mee)
    this.root.position.set(body.x, 0, body.y);
    this.root.rotation.y = -body.heading;
    this.dbg.visible && this.dbg.scale.set(body.radius, 2, body.radius);

    // events uit de simulatie
    if (body.events && body.events.length) {
      for (const e of body.events) this.trigger(e.name, e);
      body.events.length = 0;
    }

    const lv = body.localVel();
    this.vf = damp(this.vf, lv.f, 14, dt);
    this.vr = damp(this.vr, lv.r, 14, dt);
    const sp = hyp(this.vf, this.vr);
    const s = clamp(sp / 7.5, 0, 1.15);
    const moving = clamp((sp - 0.25) / 0.9, 0, 1);

    this.poseBody(dt, body, sp, s, moving);


    // lean in bochten + vooroverhellen bij optrekken
    this.leanG.rotation.x = body.lean * 0.9;
    this.leanG.rotation.z = -clamp(body.aFwd * 0.022, -0.12, 0.22);

    // spin: alleen visueel, de fysieke heading blijft staan
    const sa = this.act('spin');
    this.spinG.rotation.y = sa ? this.spinDir * TAU * easeIO(sa.t / sa.dur) : 0;

    this.updateFlags(dt, body);
    this.updateLoose(dt);
  }

  idlePose(o, t) {
}
  /** Procedurele pose (overschreven door GltfCharacterView). */
  poseBody(dt, body, sp, s, moving) {
    // looptempo: tempo van de stappen volgt de snelheid
    const steps = lerp(2.0, 3.2, clamp((sp - 1.5) / 6.5, 0, 1));
    this.phase = (this.phase + dt * Math.PI * steps * moving) % TAU;
    const ph = this.phase;

    this.idlePose(poseIdle, this.t);
    this.runPose(poseRun, ph, s);
    this.backPose(poseBack, ph, s);
    this.sidePose(poseSide, ph, s, Math.sign(this.vr) || 1);

    const inv = 1 / (sp + 1e-4);
    const wF = Math.max(this.vf, 0) * inv, wB = Math.max(-this.vf, 0) * inv, wS = Math.abs(this.vr) * inv;
    for (let i = 0; i < NP; i++) {
      const loco = poseRun[i] * wF + poseBack[i] * wB + poseSide[i] * wS;
      poseOut[i] = lerp(poseIdle[i], loco, moving);
    }

    // bal dragen: rechterarm tegen de borst
    this.carryW = damp(this.carryW, this.carrying, 10, dt);
    if (this.carryW > 0.01) {
      const w = this.carryW;
      poseOut[P.sRz] = lerp(poseOut[P.sRz], 0.15, w); poseOut[P.sRx] = lerp(poseOut[P.sRx], 0.55, w); poseOut[P.eR] = lerp(poseOut[P.eR], 1.55, w);
      poseOut[P.sLz] = lerp(poseOut[P.sLz], poseOut[P.sLz] * 0.8 + 0.1, w * 0.3);
    }

    this.applyActs(dt, body);

    // naar gewrichten schrijven
    const o = poseOut;
    // voeten op de grond: de bekkenhoogte volgt uit de stand van de benen (geen zwevende of wegzakkende voeten)
    const fo = (hz, hx, k) => -0.03 - Math.cos(hx) * (0.47 * Math.cos(hz) + 0.455 * Math.cos(hz + k));
    const lowest = Math.min(fo(o[P.hLz], o[P.hLx], o[P.kL]), fo(o[P.hRz], o[P.hRx], o[P.kR]));
    this.pelvis.position.y = 0.045 - lowest + this.extraY;
    this.spine.rotation.set(o[P.spX], o[P.spY], o[P.spZ]);
    this.head.rotation.set(0, -o[P.spY] * 0.6, o[P.headZ]);
    this.hip[0].rotation.set(o[P.hLx], 0, o[P.hLz]); this.knee[0].rotation.z = o[P.kL];
    this.hip[1].rotation.set(o[P.hRx], 0, o[P.hRz]); this.knee[1].rotation.z = o[P.kR];
    this.sho[0].rotation.set(o[P.sLx], 0, o[P.sLz]); this.elb[0].rotation.z = o[P.eL];
    this.sho[1].rotation.set(o[P.sRx], 0, o[P.sRz]); this.elb[1].rotation.z = o[P.eR];
  }

  idlePose(o, t) {
    o.fill(0);
    const b = Math.sin(t * 1.8) * 0.01;
    o[P.pelY] = -0.03 + b; o[P.spZ] = -0.06; o[P.hLz] = o[P.hRz] = 0.08; o[P.kL] = o[P.kR] = -0.16;
    o[P.hLx] = 0.04; o[P.hRx] = -0.04;
    o[P.sLz] = o[P.sRz] = 0.1; o[P.eL] = o[P.eR] = 0.35; o[P.sLx] = 0.08; o[P.sRx] = -0.08;
  }

  runPose(o, ph, s) {
    o.fill(0);
    const legAmp = 0.30 + 0.62 * s, kneeMax = 0.55 + 1.05 * s, armAmp = 0.28 + 0.62 * s, elbow = 0.95 + 0.5 * s;
    const th = [ph, ph + Math.PI]; // links, rechts
    const sw = [Math.sin(th[0]), Math.sin(th[1])];
    const kn = th.map((a) => -(kneeMax * Math.pow(0.5 + 0.5 * Math.cos(a - 0.45), 1.5) + 0.12));
    o[P.hLz] = sw[0] * legAmp + 0.05; o[P.hRz] = sw[1] * legAmp + 0.05; o[P.kL] = kn[0]; o[P.kR] = kn[1];
    o[P.sLz] = -sw[0] * armAmp + 0.1; o[P.sRz] = -sw[1] * armAmp + 0.1;
    o[P.eL] = elbow + 0.15 * Math.max(0, sw[0]); o[P.eR] = elbow + 0.15 * Math.max(0, sw[1]);
    o[P.sLx] = 0.1; o[P.sRx] = -0.1;
    o[P.spZ] = -(0.05 + 0.26 * s);
    o[P.spY] = Math.sin(ph) * 0.14 * (0.4 + s);
    o[P.headZ] = 0.05 + 0.18 * s;
    o[P.pelY] = -0.03 - 0.05 * s - Math.abs(Math.cos(ph)) * (0.012 + 0.04 * s);
  }

  backPose(o, ph, s) {
    o.fill(0);
    const a = 0.26 + 0.3 * s;
    const th = [ph, ph + Math.PI];
    const sw = [Math.sin(th[0]), Math.sin(th[1])];
    o[P.hLz] = -sw[0] * a + 0.12; o[P.hRz] = -sw[1] * a + 0.12;
    o[P.kL] = -(0.55 + 0.35 * (0.5 - 0.5 * Math.cos(th[0]))); o[P.kR] = -(0.55 + 0.35 * (0.5 - 0.5 * Math.cos(th[1])));
    o[P.sLz] = 0.45 + sw[0] * 0.18; o[P.sRz] = 0.45 - sw[0] * 0.18;
    o[P.eL] = o[P.eR] = 1.15; o[P.sLx] = 0.15; o[P.sRx] = -0.15;
    o[P.spZ] = -0.2; o[P.pelY] = -0.1 - Math.abs(Math.cos(ph)) * 0.02; o[P.headZ] = 0.2;
  }

  sidePose(o, ph, s, sgn) {
    o.fill(0);
    const th = [ph, ph + Math.PI];
    const sw = [Math.sin(th[0]), Math.sin(th[1])];
    const lead = sgn > 0 ? 1 : 0; // index van het been dat de beweging aanvoert
    const openL = lead === 0 ? 1 : 0.3, openR = lead === 1 ? 1 : 0.3;
    o[P.hLx] = (0.1 + 0.32 * openL * (0.5 + 0.5 * sw[0])) ; o[P.hRx] = -(0.1 + 0.32 * openR * (0.5 + 0.5 * sw[1]));
    o[P.hLz] = 0.2; o[P.hRz] = 0.2;
    o[P.kL] = -(0.5 + 0.25 * Math.abs(sw[0])); o[P.kR] = -(0.5 + 0.25 * Math.abs(sw[1]));
    o[P.sLz] = 0.4; o[P.sRz] = 0.4; o[P.eL] = o[P.eR] = 1.0; o[P.sLx] = 0.45; o[P.sRx] = -0.45;
    o[P.spZ] = -0.16; o[P.pelY] = -0.09; o[P.spX] = sgn * 0.05;
  }

  applyActs(dt, body) {
    const o = poseOut; this.extraY = 0;
    for (let i = this.acts.length - 1; i >= 0; i--) {
      const a = this.acts[i];
      a.t += dt;
      if (a.name !== 'cheer' && a.t >= a.dur) { this.acts.splice(i, 1); continue; }
      const w = a.name === 'cheer' ? smooth(clamp(a.t / 0.25, 0, 1)) : env(a.t, a.dur);
      const u = clamp(a.t / a.dur, 0, 1);
      switch (a.name) {
        case 'juke': {
          const sd = a.side || 1; // + = naar rechts
          o[P.pelY] -= 0.11 * w; o[P.spX] += sd * 0.42 * w; o[P.spZ] -= 0.12 * w;
          o[P.hLx] += (sd > 0 ? -0.1 : 0.45) * w; o[P.hRx] += (sd > 0 ? -0.45 : 0.1) * w;
          o[P.sLx] += 0.5 * w; o[P.sRx] -= 0.5 * w; o[P.kL] -= 0.25 * w; o[P.kR] -= 0.25 * w;
          break;
        }
        case 'spin':
          o[P.pelY] -= 0.08 * w; o[P.kL] -= 0.3 * w; o[P.kR] -= 0.3 * w;
          o[P.sLx] += 0.35 * w; o[P.sRx] -= 0.35 * w; o[P.sLz] += 0.3 * w; o[P.sRz] += 0.3 * w;
          break;
        case 'hesi':
          o[P.pelY] -= 0.13 * w; o[P.spZ] -= 0.2 * w; o[P.kL] -= 0.4 * w; o[P.kR] -= 0.4 * w;
          o[P.sLz] += 0.6 * w * Math.sin(u * 14); o[P.sRz] -= 0.6 * w * Math.sin(u * 14);
          break;
        case 'throw': {
          let cock, rel;
          if (u < 0.4) { cock = easeIO(u / 0.4); rel = 0; } else { cock = 1 - easeIO((u - 0.4) / 0.25); rel = easeIO((u - 0.4) / 0.3); }
          const wt = Math.min(1, w * 2.2, (1 - u) * 5 + 0.0);
          o[P.sRx] = lerp(o[P.sRx], -1.35 * cock - 0.3 * rel, wt);
          o[P.sRz] = lerp(o[P.sRz], -0.7 * cock + 2.0 * rel, wt);
          o[P.eR] = lerp(o[P.eR], 1.7 * cock + 0.4 * rel, wt);
          o[P.spY] = lerp(o[P.spY], -0.65 * cock + 0.5 * rel, wt);
          o[P.spZ] = lerp(o[P.spZ], -0.12 - 0.2 * rel, wt);
          o[P.sLz] = lerp(o[P.sLz], 1.1 * (1 - rel * 0.6), wt); o[P.eL] = lerp(o[P.eL], 0.3, wt);
          o[P.hLz] += 0.25 * rel * wt; o[P.hRz] -= 0.2 * rel * wt;
          break;
        }
        case 'catch': {
          const reach = u < 0.5 ? easeIO(u / 0.5) : 1 - easeIO((u - 0.5) / 0.5) * 0.7;
          const hug = u < 0.5 ? 0 : easeIO((u - 0.5) / 0.5);
          const wt = Math.min(1, w * 3);
          const z = lerp(2.4, 0.6, hug) * reach, e = lerp(0.3, 2.0, hug);
          o[P.sLz] = lerp(o[P.sLz], z, wt); o[P.sRz] = lerp(o[P.sRz], z, wt);
          o[P.eL] = lerp(o[P.eL], e, wt); o[P.eR] = lerp(o[P.eR], e, wt);
          o[P.sLx] = lerp(o[P.sLx], -0.12, wt); o[P.sRx] = lerp(o[P.sRx], 0.12, wt);
          o[P.headZ] += 0.2 * w;
          break;
        }
        case 'pull': {
          const sd = a.side || 1;
          o[P.spZ] -= 0.45 * w; o[P.pelY] -= 0.14 * w; o[P.kL] -= 0.3 * w; o[P.kR] -= 0.3 * w;
          o[P.spX] += sd * 0.2 * w; o[P.headZ] += 0.2 * w;
          const sw = Math.sin(Math.PI * Math.min(1, u * 1.5));
          o[P.sRz] = lerp(o[P.sRz], 0.9 + 0.5 * sw, w); o[P.sRx] = lerp(o[P.sRx], sd > 0 ? -0.35 : 0.1, w); o[P.eR] = lerp(o[P.eR], 0.5, w);
          break;
        }
        case 'miss':
          o[P.spZ] -= 0.5 * w; o[P.pelY] -= 0.1 * w; o[P.sRz] += 1.2 * w; o[P.sLz] += 0.9 * w;
          break;
        case 'cheer': {
          const bounce = Math.abs(Math.sin(a.t * 9));
          o[P.sLz] = lerp(o[P.sLz], 2.9, w); o[P.sRz] = lerp(o[P.sRz], 2.9, w);
          o[P.sLx] = lerp(o[P.sLx], 0.35, w); o[P.sRx] = lerp(o[P.sRx], -0.35, w);
          o[P.eL] = lerp(o[P.eL], 0.25, w); o[P.eR] = lerp(o[P.eR], 0.25, w);
          o[P.headZ] -= 0.15 * w;
          this.extraY += bounce * 0.12 * w;
          if (a.t > a.dur) this.acts.splice(i, 1);
          break;
        }
      }
    }
  }

  updateFlags(dt, body) {
    const k = 95, c = 9;
    const lv = this.vf;
    for (const f of this.flags) {
      if (!f.on) continue;
      const flut = Math.sin(this.t * 17 + f.side * 2) * 0.05 * clamp(Math.abs(lv) / 5, 0, 1);
      const tz = -0.075 * lv - body.aFwd * 0.014 + flut;
      const tx = body.aRight * 0.013 * 1 + f.side * 0.12 * clamp(Math.abs(lv) / 6, 0, 1) - body.lean * 0.5;
      f.angV += (-k * (f.ang - tz) - c * f.angV) * dt; f.ang += f.angV * dt;
      f.rollV += (-k * (f.roll - tx) - c * f.rollV) * dt; f.roll += f.rollV * dt;
      f.ang = clamp(f.ang, -1.5, 0.7); f.roll = clamp(f.roll, -0.9, 0.9);
      f.piv.rotation.set(f.roll, 0, f.ang);
    }
  }

  updateLoose(dt) {
    for (const l of this.loose) {
      l.v.y -= GRAV * dt;
      l.m.position.addScaledVector(l.v, dt);
      if (l.m.position.y < 0.02) {
        l.m.position.y = 0.02; l.v.y *= -0.25; l.v.x *= 0.7; l.v.z *= 0.7; l.w.multiplyScalar(0.5);
        if (Math.abs(l.v.y) < 0.4) { l.v.set(0, 0, 0); l.w.multiplyScalar(0); }
      }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(l.w.x * dt, l.w.y * dt, l.w.z * dt));
      l.m.quaternion.premultiply(q);
    }
  }
}
