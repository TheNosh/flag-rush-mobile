// Speelveld: PBR-gras (Poly Haven, CC0) + overlay met maaibanen, krijtlijnen, yardcijfers en eindzones.
import * as THREE from 'three';
import { FIELD } from '../config.js';
import { LOGOS } from '../data/teams.js';

export const asset = (p) => import.meta.env.BASE_URL + p;
const PPY = 48; // pixels per yard in de overlay

function loadTex(url, srgb, repeatX, repeatY, renderer) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createField(renderer, teams) {
  const group = new THREE.Group();

  // --- gras (groter dan het speelveld: de rand rondom)
  const GX0 = -24, GX1 = 74, GZ0 = -14, GZ1 = 39;
  const tile = 2.2; // yard per texturetegel
  const gw = GX1 - GX0, gh = GZ1 - GZ0;
  const grassMat = new THREE.MeshStandardMaterial({
    map: loadTex(asset('textures/leafy_grass_diff_1k.jpg'), true, gw / tile, gh / tile, renderer),
    normalMap: loadTex(asset('textures/leafy_grass_nor_gl_1k.jpg'), false, gw / tile, gh / tile, renderer),
    roughnessMap: loadTex(asset('textures/leafy_grass_rough_1k.jpg'), false, gw / tile, gh / tile, renderer),
    color: new THREE.Color(0.36, 0.7, 0.3), roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set((GX0 + GX1) / 2, 0, (GZ0 + GZ1) / 2);
  grass.receiveShadow = true;
  group.add(grass);

  // --- overlay (strepen + lijnen + eindzones)
  const cv = document.createElement('canvas');
  cv.width = (FIELD.xMax - FIELD.xMin) * PPY; cv.height = FIELD.width * PPY;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const overlayMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.xMax - FIELD.xMin, FIELD.width), overlayMat);
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set((FIELD.xMin + FIELD.xMax) / 2, 0.004, FIELD.width / 2);
  overlay.receiveShadow = true;
  group.add(overlay);

  // --- pylons
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6, emissive: 0xff3a00, emissiveIntensity: 0.25 });
  const pylonGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
  for (const x of [0, 50, -10, 60]) for (const z of [0, 25]) {
    const p = new THREE.Mesh(pylonGeo, pylonMat);
    p.position.set(x + (x === 60 ? -0.15 : x === -10 ? 0.15 : 0), 0.45, z + (z === 25 ? -0.15 : 0.15));
    p.castShadow = true; group.add(p);
  }

  const X = (x) => (x - FIELD.xMin) * PPY, Y = (y) => y * PPY;
  const imgCache = {};
  const getImg = (name) => new Promise((res) => {
    const src = LOGOS[name];
    if (!src) return res(null);
    if (imgCache[name]) return res(imgCache[name]);
    const im = new Image();
    im.onload = () => { imgCache[name] = im; res(im); };
    im.onerror = () => res(null);
    im.src = asset(src);
  });

  async function draw(t) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    // maaibanen: 14 stroken van 5 yard
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(0,18,0,0.17)';
      g.fillRect(X(FIELD.xMin + i * 5), 0, 5 * PPY, cv.height);
    }
    // eindzones in teamkleur
    const ez = [{ x0: FIELD.xMin, x1: 0, team: t[0], rot: Math.PI / 2 }, { x0: FIELD.length, x1: FIELD.xMax, team: t[1], rot: -Math.PI / 2 }];
    for (const e of ez) {
      g.fillStyle = e.team.c; g.globalAlpha = 0.8; g.fillRect(X(e.x0), 0, X(e.x1) - X(e.x0), cv.height); g.globalAlpha = 1;
      // subtiele strepen blijven zichtbaar
      for (let i = 0; i < 2; i++) { g.fillStyle = i ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(X(e.x0 + i * 5), 0, 5 * PPY, cv.height); }
    }
    // krijtlijnen
    const chalk = '#f1f5ee';
    g.fillStyle = chalk;
    const lw = 0.16 * PPY;
    for (let x = 0; x <= FIELD.length; x += 5) {
      const w = x === 25 ? lw * 1.4 : lw;
      g.fillRect(X(x) - w / 2, 0, w, cv.height);
    }
    g.fillRect(0, 0, cv.width, lw); g.fillRect(0, cv.height - lw, cv.width, lw);
    g.fillRect(0, 0, lw, cv.height); g.fillRect(cv.width - lw, 0, lw, cv.height);
    // hashmarks elke yard, bij beide zijlijnen en het midden
    for (let x = FIELD.xMin + 1; x < FIELD.xMax; x++) {
      if (x % 5 === 0 && x >= 0 && x <= 50) continue;
      for (const y of [0, 25]) {
        const sgn = y === 0 ? 1 : -1;
        g.fillRect(X(x) - lw / 4, Y(y) + (sgn > 0 ? 0 : -0.7 * PPY), lw / 2, 0.7 * PPY);
      }
      g.fillRect(X(x) - lw / 4, Y(12.5) - 0.3 * PPY, lw / 2, 0.6 * PPY);
    }
    // yardcijfers (afstand tot de dichtstbijzijnde goallijn)
    await document.fonts.load('800 100px "Saira Condensed"').catch(() => {});
    g.fillStyle = 'rgba(241,245,238,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${2.4 * PPY}px "Saira Condensed","Arial Narrow",sans-serif`;
    for (const x of [10, 20, 30, 40]) {
      const label = String(Math.min(x, 50 - x));
      for (const [y, rot] of [[5, Math.PI], [20, 0]]) {
        g.save(); g.translate(X(x), Y(y)); g.rotate(rot); g.fillText(label, 0, 0); g.restore();
      }
    }
    // midveld: logo thuisteam
    const midImg = await getImg(t[0].name);
    g.save(); g.translate(X(25), Y(12.5));
    g.beginPath(); g.arc(0, 0, 3.4 * PPY, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
    g.beginPath(); g.arc(0, 0, 3.0 * PPY, 0, Math.PI * 2); g.fillStyle = t[0].c; g.fill();
    if (midImg) { g.save(); g.beginPath(); g.arc(0, 0, 2.7 * PPY, 0, Math.PI * 2); g.clip(); g.drawImage(midImg, -2.7 * PPY, -2.7 * PPY, 5.4 * PPY, 5.4 * PPY); g.restore(); }
    g.restore();
    // eindzone: naam + logo
    for (const e of ez) {
      const cx = (e.x0 + e.x1) / 2;
      g.save(); g.translate(X(cx - (e.rot > 0 ? 1.3 : -1.3)), Y(12.5)); g.rotate(e.rot);
      let size = 3.2 * PPY; g.font = `800 ${size}px "Saira Condensed","Arial Narrow",sans-serif`;
      const maxW = 21 * PPY, mw = g.measureText(e.team.name).width;
      if (mw > maxW) { size *= maxW / mw; g.font = `800 ${size}px "Saira Condensed","Arial Narrow",sans-serif`; }
      g.lineWidth = size * 0.07; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText(e.team.name, 0, 0);
      g.fillStyle = e.team.ink; g.fillText(e.team.name, 0, 0);
      g.restore();
      const im = await getImg(e.team.name);
      if (im) {
        const lx = cx + (e.rot > 0 ? 3.3 : -3.3), r = 1.9 * PPY;
        g.save(); g.translate(X(lx), Y(12.5));
        g.beginPath(); g.arc(0, 0, r + 0.12 * PPY, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill();
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip(); g.drawImage(im, -r, -r, 2 * r, 2 * r); g.restore();
      }
    }
    tex.needsUpdate = true;
  }

  return { group, setTeams: draw, grass };
}

