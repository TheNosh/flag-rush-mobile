// Zet de Mixamo FBX-bestanden uit ./mixamo om naar één public/models/player.glb.
// Gebruik: node tools/mixamo-to-glb.mjs
// stance.fbx moet "With Skin" zijn gedownload (bevat het personage); alle andere zijn "Without Skin".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'mixamo');
const OUT = path.join(ROOT, 'public', 'models', 'player.glb');

// Node heeft geen FileReader; GLTFExporter heeft er één nodig voor de binaire uitvoer.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(b).toString('base64'); this.onloadend && this.onloadend(); }); }
};

// stance en hike worden (nog) niet gebruikt en blijven buiten het model. De worp is een lange scramble: we knippen
// alleen de worp zelf eruit (afgooimoment bij 5,50 s, gemeten als snelste hand t.o.v. de heupen).
const CLIPS = ['idle', 'jog', 'sprint', 'back', 'strafeL', 'strafeR', 'juke', 'spin', 'throw', 'catch', 'cheer', 'miss'];
const LOOPS = ['idle', 'jog', 'sprint', 'back', 'strafeL', 'strafeR'];
const TRIM = { throw: [160, 177] }; // beeldframes @30 fps
const loader = new FBXLoader();
const load = (name) => {
  const b = fs.readFileSync(path.join(DIR, name + '.fbx'));
  return loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), DIR + path.sep);
};

const base = load('stance');
const animations = [];
for (const k of CLIPS) {
  let clip = load(k).animations[0];
  if (!clip) { console.warn('geen animatie in', k); continue; }
  clip.name = k;
  // alleen rotaties (plus heuppositie): schaal- en positiesporen van de botten maken het bestand groot en tellen niet mee
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position');
  if (TRIM[k]) clip = THREE.AnimationUtils.subclip(clip, k, TRIM[k][0], TRIM[k][1], 30);
  clip.resetDuration();
  // Root-beweging eruit: het spel verplaatst de speler zelf. Sprint en spin bevatten van zichzelf een verplaatsing van meerdere
  // meters, waardoor de speler bij elke herhaling naar voren sprong en weer terugsprong.
  // Loops: de lineaire drift weghalen (begin = eind). Losse acties: horizontaal op de beginpositie houden.
  const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  if (hips) {
    const v = hips.values, n = hips.times.length, last = hips.times[n - 1] || 1;
    const loop = LOOPS.includes(k);
    const x0 = v[0], z0 = v[2], dx = v[(n - 1) * 3] - x0, dz = v[(n - 1) * 3 + 2] - z0;
    for (let i = 0; i < n; i++) {
      if (loop) { const f = hips.times[i] / last; v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
      else { v[i * 3] -= v[i * 3] - x0; v[i * 3 + 2] -= v[i * 3 + 2] - z0; }
    }
    if (Math.hypot(dx, dz) * (1.95 / 180.9) > 0.05) console.log('   root-beweging verwijderd:', (Math.hypot(dx, dz) * (1.95 / 180.9)).toFixed(2), 'eenheden over', clip.duration.toFixed(2), 's');
  }
  animations.push(clip);
  console.log(k.padEnd(8), clip.duration.toFixed(2) + ' s', clip.tracks.length + ' tracks');
}

// Het FBX-personage heeft twee meshes (huid + gewrichten), elk met een eigen kopie van het skelet. Zo blijft er één
// kopie animeerbaar. Daarom: alle meshes op het skelet van de eerste zetten en de dubbele botten verwijderen.
{
  const skinned = []; base.updateMatrixWorld(true); base.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const master = skinned[0].skeleton, byName = new Map(master.bones.map((b, i) => [b.name, i]));
  for (const m of skinned.slice(1)) {
    const remap = m.skeleton.bones.map((b) => byName.get(b.name));
    if (remap.some((i) => i === undefined)) throw new Error('bot ontbreekt in hoofdskelet: ' + m.name);
    const si = m.geometry.attributes.skinIndex;
    for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, remap[si.getComponent(i, c)]);
    m.bind(master, m.bindMatrix);
  }
  const keep = new Set(master.bones), dup = [];
  base.traverse((o) => { if (o.isBone && !keep.has(o)) dup.push(o); });
  for (const b of dup) b.removeFromParent();
  console.log('skelet samengevoegd:', skinned.length, 'meshes, dubbele botten verwijderd:', dup.length);
}

// De X Bot heeft ~150.000 hoekpunten per speler; met 10 spelers (en schaduwen) is dat te zwaar voor gewone laptops.
// Vereenvoudig elke mesh. meshopt hergebruikt bestaande hoekpunten, dus de skinning-gewichten blijven kloppen.
{
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const KEEP = Number(process.env.KEEP || 0.35); // aandeel driehoeken dat overblijft
  base.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    // de FBX levert losse driehoeken (3 hoekpunten per driehoek): eerst gelijke hoekpunten samenvoegen
    const before = o.geometry.attributes.position.count;
    o.geometry = mergeVertices(o.geometry, 1e-3);
    const g = o.geometry, pos = g.attributes.position;
    console.log(o.name || 'mesh', 'samengevoegd', before, '->', pos.count, 'hoekpunten');
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    const target = Math.max(3000, Math.floor(idx.length * KEEP / 3) * 3);
    const [simp, err] = MeshoptSimplifier.simplify(idx, new Float32Array(pos.array), 3, target, 0.03, ['LockBorder']);
    // ongebruikte hoekpunten verwijderen
    const used = new Map(); const order = [];
    for (const i of simp) if (!used.has(i)) { used.set(i, order.length); order.push(i); }
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], arr = new a.array.constructor(order.length * a.itemSize);
      for (let n = 0; n < order.length; n++) for (let c = 0; c < a.itemSize; c++) arr[n * a.itemSize + c] = a.array[order[n] * a.itemSize + c];
      g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(simp, (i) => used.get(i)), 1));
    console.log(o.name || 'mesh', 'driehoeken', idx.length / 3, '->', simp.length / 3, 'hoekpunten', pos.count, '->', order.length, 'fout', err.toFixed(4));
  });
}

let meshes = 0, bones = 0;
base.traverse((o) => { if (o.isSkinnedMesh) meshes++; if (o.isBone) bones++; });
console.log('meshes', meshes, 'bones', bones, 'root', base.name);

const glb = await new Promise((res, rej) => new GLTFExporter().parse(base, res, rej, { binary: true, animations, onlyVisible: false }));
fs.writeFileSync(OUT, Buffer.from(glb));
console.log('geschreven', OUT, (glb.byteLength / 1048576).toFixed(2) + ' MB');
