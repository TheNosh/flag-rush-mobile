// Speler uit een GLB-bestand met skelet-animaties (bv. Quaternius "Universal Animation Library" of Mixamo).
// Zet het bestand als  public/models/player.glb  (optioneel met  public/models/player.json  voor naamafspraken).
// Dezelfde API als CharacterView (update / trigger / pullFlag / setRing ...), dus de rest van het spel merkt het niet.
// Ontbreekt het bestand, dan gebruikt het spel automatisch de procedurele spelers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterView } from './character.js';
import { asset } from './field.js';
import { clamp, damp, hyp, lerp } from '../game/math.js';

let TEMPLATE = null;
let CFG = {};

const CLIP_RX = {
  idle: /idle|stand|breath/i,
  jog: /^(?!.*(sprint|fast)).*(jog|run)/i,
  walk: /walk/i,
  sprint: /sprint|run.*fast|fast.*run/i,
  back: /back(ward)?|reverse/i,
  strafeL: /(strafe|side|shuffle).*(l\b|left)|left.*(strafe|step|side|shuffle)/i,
  strafeR: /(strafe|side|shuffle).*(r\b|right)|right.*(strafe|step|side|shuffle)/i,
  juke: /juke|dodge|sidestep|evade|feint/i,
  spin: /spin|twirl|pirouette/i,
  hesi: /hesi|brake|stutter/i,
  throw: /throw|pass/i,
  catch: /catch|receive/i,
  pull: /pull|grab|reach|tackle|punch/i,
  cheer: /cheer|celebrat|victory|dance|wave|jump/i,
  miss: /miss|stumble|trip/i,
};
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const TMP = { qd: new THREE.Quaternion(), qp: new THREE.Quaternion(), qi: new THREE.Quaternion(), ax: new THREE.Vector3() };
const eio = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
/** Sleutelframes met zachte overgangen: kf(u, [[0,a],[0.5,b],[1,c]]) */
function kf(u, keys) {
  for (let i = 1; i < keys.length; i++) { if (u <= keys[i][0]) { const [u0, v0] = keys[i - 1], [u1, v1] = keys[i]; const t = eio((u - u0) / (u1 - u0 || 1)); return v0 + (v1 - v0) * t; } }
  return keys[keys.length - 1][1];
}
const ONESHOT = ['juke', 'spin', 'hesi', 'throw', 'catch', 'pull', 'cheer', 'miss'];

/** Laadt public/models/player.glb. Geeft true terug als er een bruikbaar model is. */
export async function preloadPlayerModel() {
  try {
    const url = asset('models/player.glb');
    const head = await fetch(url, { method: 'GET' });
    const type = head.headers.get('content-type') || '';
    if (!head.ok || type.includes('text/html')) return false; // niet aanwezig (dev-server geeft soms index.html terug)
    try { const r = await fetch(asset('models/player.json')); if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) CFG = await r.json(); } catch { CFG = {}; }
    const gltf = await new GLTFLoader().parseAsync(await head.arrayBuffer(), url);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    TEMPLATE = { scene: gltf.scene, clips: gltf.animations, height: size.y, depth: size.x > size.z ? size.z : size.x, minY: box.min.y };
    const mats = new Set(); gltf.scene.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => mats.add(m.name)); });
    console.info('[Flag Rush] spelermodel geladen. Hoogte:', size.y.toFixed(2), '\nAnimaties:', gltf.animations.map((a) => a.name).join(', '), '\nMaterialen:', [...mats].join(', '));
    return true;
  } catch (e) {
    console.warn('[Flag Rush] player.glb kon niet worden gelezen, procedurele spelers worden gebruikt:', e.message);
    TEMPLATE = null; return false;
  }
}
export const hasPlayerModel = () => !!TEMPLATE;

const tinted = new Map();
function teamMaterial(base, team, kind) {
  const key = team.name + '|' + base.uuid + '|' + kind;
  let m = tinted.get(key);
  if (!m) { m = base.clone(); m.color.set(kind === 'jersey' ? team.c : team.k); tinted.set(key, m); }
  return m;
}


// ---- botnamen: Mixamo ("mixamorigLeftArm") wordt vertaald naar de namen die de rest van de code gebruikt ("upperarm_l")
const MX = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head', HeadTop_End: 'head_end' };
const MXL = { Shoulder: 'clavicle', Arm: 'upperarm', ForeArm: 'lowerarm', Hand: 'hand', UpLeg: 'thigh', Leg: 'calf', Foot: 'foot', ToeBase: 'ball', Toe_End: 'ball' };
function canon(n) {
  const m = /^mixamorig:?(.*)$/.exec(n); if (!m) return n;
  const k = m[1]; if (MX[k]) return MX[k];
  const s = /^(Left|Right)(.+)$/.exec(k);
  if (s && MXL[s[2]]) return MXL[s[2]] + (s[1] === 'Left' ? '_l' : '_r');
  return k.toLowerCase(); // vingers e.d.: huid
}

// ---- kleding via vertexkleuren
const SKIN_TONES = [0xe0b394, 0xc68863, 0x8d5a3b, 0x5b3a26];
let dressMat = null;
const dressMaterial = () => dressMat || (dressMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }));
const dressCache = new Map();
function dressGeometry(mesh, team, skinIdx) {
  const key = team.name + '|' + (skinIdx % 4) + '|' + mesh.geometry.uuid;
  let g = dressCache.get(key);
  if (g) return g;
  g = mesh.geometry.clone();
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const H = maxY - minY;
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const skin = new THREE.Color(SKIN_TONES[skinIdx % 4]), jersey = new THREE.Color(team.c), shorts = new THREE.Color(team.k), sock = new THREE.Color(team.c), shoe = new THREE.Color(0xf2f2f2), hair = new THREE.Color(0x1b1612);
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = [sw.getX, sw.getY, sw.getZ, sw.getW][k].call(sw, i); if (w > bw) { bw = w; best = [si.getX, si.getY, si.getZ, si.getW][k].call(si, i); } }
    const n = canon(bones[best] && bones[best].name || '').toLowerCase(), h = (pos.getY(i) - minY) / H;
    if (/spine|clavicle|upperarm/.test(n)) c.copy(jersey);
    else if (/pelvis/.test(n)) c.copy(h > 0.47 ? shorts : skin);
    else if (/thigh/.test(n)) c.copy(h > 0.37 ? shorts : skin);
    else if (/calf/.test(n)) c.copy(h < 0.2 ? sock : skin);
    else if (/foot|ball/.test(n)) c.copy(shoe);
    else if (/head|neck/.test(n) && h > 0.955) c.copy(hair);
    else c.copy(skin);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.groups = []; // één materiaal
  dressCache.set(key, g);
  return g;
}
export class GltfCharacterView extends CharacterView {
  constructor(world, team, num, skinIdx = 0) {
    super(world, team, num, skinIdx);
    const T = TEMPLATE;
    this.pelvis.visible = false; // procedureel lichaam verbergen; flags, bal en ring blijven

    this.model = SkeletonUtils.clone(T.scene);
    const holder = new THREE.Group();
    holder.rotation.y = CFG.rotY ?? Math.PI / 2; // glTF kijkt langs +Z, het spel langs +X
    const s = (CFG.height || 1.95) / T.height * (0.97 + Math.random() * 0.06);
    this.model.scale.setScalar(s); this.model.position.y = -T.minY * s;
    holder.add(this.model); this.leanG.add(holder);
    this.modelScale = s;

    // kleding: shirt, broek, sokken en schoenen worden per hoekpunt gekleurd (op basis van het bot dat het zwaarst weegt)
    let dressed = false;
    this.model.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      if (o.isSkinnedMesh && CFG.dress !== false) { o.geometry = dressGeometry(o, team, skinIdx); o.material = dressMaterial(); dressed = true; }
    });
    if (!dressed) {
      const jerseyRx = new RegExp(CFG.jersey || 'shirt|top|jersey|torso|cloth|tee', 'i'), shortsRx = new RegExp(CFG.shorts || 'short|pant|trouser|bottom', 'i');
      this.model.traverse((o) => {
        if (!o.isMesh) return;
        const arr = [].concat(o.material).map((m) => (jerseyRx.test(m.name) ? teamMaterial(m, team, 'jersey') : shortsRx.test(m.name) ? teamMaterial(m, team, 'shorts') : m));
        o.material = Array.isArray(o.material) ? arr : arr[0];
      });
    }
    // botten voor flags, rugnummer en bal
    const find = (rx) => { let r = null; this.model.traverse((o) => { if (!r && o.isBone && rx.test(o.name)) r = o; }); return r; };
    this.hips = find(new RegExp(CFG.hipsBone || 'hips|pelvis|root', 'i'));
    this.spineBone = find(new RegExp(CFG.chestBone || 'spine2|spine_?0?3|upper.?chest|chest|spine', 'i'));
    this.handBone = find(new RegExp(CFG.handBone || 'hand.?r|right.?hand|hand_r|r_hand', 'i'));
    this.anchor = new THREE.Object3D(); this.root.add(this.anchor);
    for (const f of this.flags) { this.anchor.add(f.piv); f.piv.position.set(0, -0.02, f.side * 0.2); }
    this.numAnchor = new THREE.Object3D(); this.root.add(this.numAnchor);
    const back = T.depth * s * 0.5 + 0.02;
    const pl = new THREE.Mesh(this.numPlane(), this.numMat(team, num)); pl.position.set(-back, 0, 0); pl.rotation.y = -Math.PI / 2; this.numAnchor.add(pl);
    this.holdOffset = new THREE.Vector3(...(CFG.ballOffset || [0, 0, 0]));
    if (this.handBone) {
      this.handR = new THREE.Object3D(); this.handBone.add(this.handR);
      this.model.updateWorldMatrix(true, true);
      const ws = this.handBone.getWorldScale(new THREE.Vector3()).x || 1; this.handR.scale.setScalar(1 / ws);
      this.handR.position.copy(this.holdOffset);
    }

    // animaties
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {}; this.actions = {};
    const names = CFG.clips || {};
    for (const k of Object.keys(CLIP_RX)) {
      // null in player.json = bewust geen clip (gebruik de terugval); anders eerst exacte naam, dan zoeken op patroon
      const clip = (k in names) ? (names[k] ? T.clips.find((c) => c.name === names[k]) : null) : T.clips.find((c) => CLIP_RX[k].test(c.name));
      if (clip) { this.clips[k] = clip; const a = this.mixer.clipAction(clip); a.enabled = true; this.actions[k] = a; }
    }
    if (!this.clips.jog && this.clips.walk) { this.clips.jog = this.clips.walk; this.actions.jog = this.actions.walk; }
    for (const k of ['idle', 'jog', 'sprint', 'back', 'strafeL', 'strafeR']) { const a = this.actions[k]; if (a) { a.setLoop(THREE.LoopRepeat); a.play(); a.weight = 0; } }
    for (const k of ONESHOT) { const a = this.actions[k]; if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } }
    this.mixer.update(Math.random() * 2);
  }

  numPlane() { return new THREE.PlaneGeometry(0.34, 0.34); }
  numMat(team, num) { return GLTF_NUM(team, num); }
  largestMesh() {
    if (this._lm) return this._lm; let best = null, bs = 0;
    this.model.traverse((o) => { if (o.isMesh && o.geometry.boundingSphere !== undefined) { o.geometry.computeBoundingSphere(); const r = o.geometry.boundingSphere.radius; if (r > bs) { bs = r; best = o; } } });
    return (this._lm = best);
  }

  trigger(name, data = {}) {
    super.trigger(name, data);
    const a = this.actions[name];
    if (a && ONESHOT.includes(name)) {
      // de clip bepaalt hoe lang de actie duurt (player.json "dur"); de animatie wordt daarop uitgerekt
      const act = this.acts[this.acts.length - 1];
      if (act && CFG.dur && CFG.dur[name]) act.dur = CFG.dur[name];
      a.reset(); a.setEffectiveWeight(1); a.setEffectiveTimeScale(act ? this.clips[name].duration / act.dur : 1); a.play();
    }
  }

  poseBody(dt, body, sp, s, moving) {
    const A = this.actions;
    for (let i = this.acts.length - 1; i >= 0; i--) { const a = this.acts[i]; a.t += dt; if (a.t >= a.dur) this.acts.splice(i, 1); }
    // gewichten uit snelheid en richting
    const inv = 1 / (sp + 1e-4);
    const wF = Math.max(this.vf, 0) * inv, wB = Math.max(-this.vf, 0) * inv, wS = Math.abs(this.vr) * inv;
    const sprintMix = clamp((sp - (CFG.sprintFrom || 3.6)) / (CFG.sprintRange || 1.6), 0, 1);
    const W = { idle: 1 - moving, jog: moving * wF * (1 - sprintMix), sprint: moving * wF * sprintMix, back: moving * wB, strafeL: moving * wS * (this.vr < 0 ? 1 : 0), strafeR: moving * wS * (this.vr > 0 ? 1 : 0) };
    // ontbrekende clips: val terug op jog (achterwaarts: omgekeerd afspelen)
    const jogLike = (k) => { W.jog += W[k]; W[k] = 0; };
    if (!A.sprint) jogLike('sprint');
    if (!A.back) jogLike('back'); if (!A.strafeL) jogLike('strafeL'); if (!A.strafeR) jogLike('strafeR');
    // gewichten zacht laten overlopen: een plotselinge richting- of snelheidswissel mag geen sprong in de pose geven
    const Ws = this.Ws || (this.Ws = { ...W });
    for (const k in W) { Ws[k] = damp(Ws[k], W[k], 11, dt); W[k] = Ws[k]; }
    // acties dempen de loopanimatie
    let act = 0;
    for (const a of this.acts) { if (this.actions[a.name]) act = Math.max(act, a.name === 'cheer' ? 1 : Math.pow(Math.sin(Math.PI * clamp(a.t / a.dur, 0, 1)), 0.5)); }
    const loco = 1 - act;
    const ref = { jog: CFG.jogSpeed || 3.3, sprint: CFG.sprintSpeed || 4.5, back: CFG.backSpeed || 3.2, strafeL: CFG.strafeSpeed || 3.2, strafeR: CFG.strafeSpeed || 3.2 };
    for (const k of ['idle', 'jog', 'sprint', 'back', 'strafeL', 'strafeR']) {
      const a = A[k]; if (!a) continue;
      a.setEffectiveWeight(W[k] * loco);
      if (k !== 'idle') a.setEffectiveTimeScale(clamp(sp / ref[k], 0.4, 2.0));
    }
    if (!this.clips.back && wB > 0.5 && A.jog) A.jog.setEffectiveTimeScale(-clamp(sp / ref.jog, 0.4, 1.2));
    for (const a of this.acts) {
      const ac = this.actions[a.name]; if (!ac) continue;
      ac.setEffectiveWeight(a.name === 'cheer' ? clamp(a.t / 0.25, 0, 1) : Math.pow(Math.sin(Math.PI * clamp(a.t / a.dur, 0, 1)), 0.5));
    }
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
    this.bonePose(dt, wF, wB, wS);

    // zonder eigen clips: simpele beweging vanuit het hele lichaam
    this.extraY = 0;
    for (const a of this.acts) {
      const w = Math.pow(Math.sin(Math.PI * clamp(a.t / a.dur, 0, 1)), 0.6);
      if (a.name === 'juke' && !this.actions.juke) this.leanG.rotation.x += 0; // lean via body.lean
      if (a.name === 'cheer' && !this.actions.cheer) this.extraY += Math.abs(Math.sin(a.t * 9)) * 0.12;
    }
    this.model.position.y = -TEMPLATE.minY * this.modelScale + this.extraY;
    if (this.actions.spin) this.noSpinRot = true;

    // ankers volgen het skelet
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    if (this.hips) { this.hips.getWorldPosition(v); this.root.worldToLocal(v); this.anchor.position.copy(v); }
    else this.anchor.position.set(0, 0.95, 0);
    if (this.spineBone) { this.spineBone.getWorldPosition(v); this.root.worldToLocal(v); this.numAnchor.position.set(0, v.y, 0); }
    else this.numAnchor.position.set(0, 1.4, 0);
  }


  // ---- procedurele bovenlichaam-animaties bovenop het skelet (gooien, vangen, flag pull, juke, ...)
  rotB(bone, axis, ang) {
    if (!bone || Math.abs(ang) < 1e-4 || !bone.parent) return;
    const q = TMP.qd.setFromAxisAngle(TMP.ax.copy(typeof axis === 'string' ? AXES[axis] : axis).applyQuaternion(this._qRoot), ang);
    bone.parent.getWorldQuaternion(TMP.qp);
    bone.quaternion.premultiply(TMP.qp).premultiply(q).premultiply(TMP.qi.copy(TMP.qp).invert());
    bone.updateMatrixWorld(true);
  }
  /** Buig de onderarm omhoog (hand naar boven), welke kant de arm ook op wijst. */
  flexUp(elbow, hand, ang) {
    if (!elbow || !hand) return;
    const a = elbow.getWorldPosition(new THREE.Vector3()), h = hand.getWorldPosition(new THREE.Vector3());
    const inv = this._qRoot.clone().invert();
    const d = h.sub(a).applyQuaternion(inv).normalize();
    const axis = new THREE.Vector3().crossVectors(d, AXES.y);
    if (axis.lengthSq() < 1e-6) return;
    this.rotB(elbow, axis.normalize(), ang);
  }  bonePose(dt, wF, wB, wS) {
    if (!this.bn) {
      this.bn = {}; const want = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'thigh_r'];
      this.model.traverse((o) => { if (o.isBone && want.includes(canon(o.name))) this.bn[canon(o.name)] = o; });
      this.yaw = 0;
    }
    const b = this.bn;
    this.root.getWorldQuaternion(this._qRoot || (this._qRoot = new THREE.Quaternion()));
    // zijwaarts: zonder eigen clip draait het lichaam deels mee met de looprichting, de schouders blijven op de bal gericht
    const sideDom = wS > 0.45 && wF >= wB && !this.clips.strafeL;
    const ty = sideDom ? clamp(Math.atan2(this.vr, Math.max(this.vf, 0.3)), -1.0, 1.0) : 0;
    this.yaw = damp(this.yaw, ty, 10, dt);
    this.model.parent.rotation.y = (CFG.rotY ?? Math.PI / 2) - this.yaw;
    this.model.parent.updateMatrixWorld(true);
    this.rotB(b.spine_02, 'y', 0.55 * this.yaw); this.rotB(b.spine_03, 'y', 0.45 * this.yaw);
    // achterwaarts lopen: iets achterover, ogen op het spel
    if (wB > 0.3 && !this.clips.back) { this.rotB(b.spine_02, 'z', 0.1 * wB); }

    // bal dragen
    this.cw = damp(this.cw || 0, this.carrying ? 1 : 0, 10, dt);
    if (this.cw > 0.02 && !this.act('throw') && !this.act('catch')) {
      const w = this.cw; this.rotB(b.upperarm_r, 'z', 0.35 * w); this.rotB(b.upperarm_r, 'x', 0.45 * w); this.rotB(b.lowerarm_r, 'z', 1.5 * w);
      this.rotB(b.upperarm_l, 'z', 0.2 * w); this.rotB(b.upperarm_l, 'x', -0.2 * w);
    }

    for (const a of this.acts) {
      if (this.clips[a.name]) continue; // echte animatieclip aanwezig: geen procedurele overlay
      const u = clamp(a.t / a.dur, 0, 1), w = Math.pow(Math.sin(Math.PI * u), 0.6);
      switch (a.name) {
        case 'throw': {
          // American-football worp: bal naast het oor, romp draait, elleboog hoog, arm zwiept naar voren en zwaait door
          const wt = Math.min(1, u * 7, (1 - u) * 7);
          this.rotB(b.spine_01, 'z', kf(u, [[0, 0], [0.35, 0.1], [0.6, -0.2], [0.85, -0.25], [1, 0]]) * wt);
          this.rotB(b.spine_02, 'y', kf(u, [[0, 0], [0.35, -0.6], [0.6, 0.55], [0.85, 0.6], [1, 0]]) * wt);
          this.rotB(b.spine_03, 'y', kf(u, [[0, 0], [0.35, -0.3], [0.6, 0.3], [0.85, 0.3], [1, 0]]) * wt);
          this.rotB(b.upperarm_r, 'x', kf(u, [[0, 0], [0.35, -1.3], [0.6, -1.0], [0.85, -0.35], [1, 0]]) * wt);
          this.rotB(b.upperarm_r, 'y', kf(u, [[0, 0], [0.35, -0.8], [0.6, 1.1], [0.85, 1.3], [1, 0]]) * wt);
          this.flexUp(b.lowerarm_r, this.hr || (this.hr = this.handBone), kf(u, [[0, 0], [0.35, 1.5], [0.6, 0.25], [0.85, 0.1], [1, 0]]) * wt);
          this.rotB(b.upperarm_l, 'z', kf(u, [[0, 0], [0.35, 1.3], [0.6, 0.8], [0.85, 0.3], [1, 0]]) * wt);
          this.rotB(b.upperarm_l, 'x', kf(u, [[0, 0], [0.35, 0.1], [0.6, 0.0], [1, 0]]) * wt);
          this.rotB(b.lowerarm_l, 'z', kf(u, [[0, 0], [0.35, 0.3], [0.6, 0.9], [1, 0]]) * wt);
          this.rotB(b.Head, 'y', kf(u, [[0, 0], [0.35, 0.3], [0.6, 0.0], [1, 0]]) * wt);
          break;
        }        case 'catch': {
          const reach = u < 0.5 ? eio(u / 0.5) : 1 - eio((u - 0.5) / 0.5) * 0.7, hug = u < 0.5 ? 0 : eio((u - 0.5) / 0.5), wt = Math.min(1, w * 3);
          const z = (2.4 + (0.6 - 2.4) * hug) * reach, e = 0.3 + (2.0 - 0.3) * hug;
          this.rotB(b.upperarm_l, 'z', z * wt); this.rotB(b.upperarm_r, 'z', z * wt);
          this.rotB(b.lowerarm_l, 'z', e * wt); this.rotB(b.lowerarm_r, 'z', e * wt);
          this.rotB(b.upperarm_l, 'x', 0.12 * wt); this.rotB(b.upperarm_r, 'x', 0.12 * wt);
          this.rotB(b.Head, 'z', 0.2 * w);
          break;
        }
        case 'pull': {
          const sd = a.side || 1, sw = Math.sin(Math.PI * Math.min(1, u * 1.5));
          this.rotB(b.spine_01, 'z', -0.3 * w); this.rotB(b.spine_02, 'z', -0.3 * w); this.rotB(b.spine_02, 'x', sd * 0.2 * w);
          this.rotB(b.upperarm_r, 'z', (0.9 + 0.5 * sw) * w); this.rotB(b.upperarm_r, 'x', (sd > 0 ? -0.35 : 0.1) * w); this.rotB(b.lowerarm_r, 'z', 0.5 * w);
          break;
        }
        case 'miss':
          this.rotB(b.spine_02, 'z', -0.4 * w); this.rotB(b.upperarm_r, 'z', 1.2 * w); this.rotB(b.upperarm_l, 'z', 0.9 * w);
          break;
        case 'hesi':
          this.rotB(b.spine_01, 'z', -0.25 * w); this.rotB(b.spine_02, 'z', -0.2 * w);
          this.rotB(b.upperarm_l, 'z', 0.6 * w * Math.sin(u * 14)); this.rotB(b.upperarm_r, 'z', -0.6 * w * Math.sin(u * 14));
          break;
        case 'juke': {
          const sd = a.side || 1;
          this.rotB(b.spine_01, 'x', sd * 0.3 * w); this.rotB(b.spine_02, 'x', sd * 0.3 * w); this.rotB(b.spine_02, 'z', -0.15 * w);
          this.rotB(b.upperarm_l, 'x', 0.45 * w); this.rotB(b.upperarm_r, 'x', -0.45 * w);
          this.leanG.rotation.x += sd * 0.25 * w;
          break;
        }
        case 'spin':
          this.rotB(b.upperarm_l, 'x', 0.5 * w); this.rotB(b.upperarm_r, 'x', -0.5 * w); this.rotB(b.upperarm_l, 'z', 0.3 * w); this.rotB(b.upperarm_r, 'z', 0.3 * w);
          break;
      }
    }
  }
  update(dt, body) {
    super.update(dt, body);
    if (this.noSpinRot) this.spinG.rotation.y = 0; // eigen spin-clip speelt de draai zelf
  }

  dispose() { this.mixer.stopAllAction(); super.dispose(); }
}

// rugnummer-materiaal hergebruikt de teller uit character.js via een kleine canvas-texture
const numCache = new Map();
function GLTF_NUM(team, num) {
  const key = team.name + num; let m = numCache.get(key);
  if (!m) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    g.font = '800 104px "Saira Condensed","Arial Narrow",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(String(num), 64, 68); g.fillStyle = team.ink; g.fillText(String(num), 64, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    numCache.set(key, m);
  }
  return m;
}
