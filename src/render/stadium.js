// Nachtelijk stadion: tribunes met geïnstancede toeschouwers, reclameborden, lichtmasten.
import * as THREE from 'three';
import { FIELD } from '../config.js';

const rand = (() => { let s = 1337; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(0.25, 'rgba(255,230,170,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createStadium(teams) {
  const group = new THREE.Group();
  const cx = (FIELD.xMin + FIELD.xMax) / 2, cz = FIELD.width / 2;

  // --- ondergrond buiten het gras
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(cx, -0.03, cz); apron.receiveShadow = true;
  group.add(apron);

  // --- tribunes
  const concrete = new THREE.MeshStandardMaterial({ color: 0x2a3330, roughness: 0.95 });
  const palette = [0x3a4a66, 0x6b3b3b, 0x4d5d4a, 0x80725a, 0x2c3340, 0xb8b8b0, 0x5c4a66, 0x2f2f33];
  const personGeo = new THREE.BoxGeometry(0.34, 0.62, 0.3);
  const people = [];
  const tierBoxes = [];

  /** Een tribune langs een as. along: eenheidsvector langs de tribune, out: eenheidsvector weg van het veld. */
  function stand(origin, along, out, length, tiers, firstGap, tierDepth = 1.5, tierRise = 0.85) {
    const rotY = Math.atan2(-out.z, out.x); // lokale +x wijst weg van het veld
    for (let t = 0; t < tiers; t++) {
      const d = firstGap + t * tierDepth, h = (t + 1) * tierRise;
      const pos = new THREE.Vector3().copy(origin).addScaledVector(out, d + tierDepth / 2);
      tierBoxes.push({ pos: pos.clone().setY(h / 2), rotY, size: [tierDepth, h, length] });
      // mensen op deze trede
      const n = Math.floor(length / 0.62);
      for (let i = 0; i < n; i++) {
        if (rand() < 0.1) continue;
        const a = (i - n / 2) * 0.62 + (rand() - 0.5) * 0.1;
        const p = new THREE.Vector3().copy(origin).addScaledVector(out, d + tierDepth * 0.55).addScaledVector(along, a);
        p.y = h + 0.31;
        people.push({ p, rotY, color: palette[Math.floor(rand() * palette.length)], s: 0.9 + rand() * 0.25 });
      }
    }
  }
  const zA = { x: 0, z: 1 }, zOut = (s) => new THREE.Vector3(0, 0, s);
  // zijtribunes (lang), eindtribunes (lager)
  stand(new THREE.Vector3(cx, 0, -4.5), new THREE.Vector3(1, 0, 0), zOut(-1), 84, 11, 2.5);
  stand(new THREE.Vector3(cx, 0, FIELD.width + 4.5), new THREE.Vector3(1, 0, 0), zOut(1), 84, 11, 2.5);
  stand(new THREE.Vector3(FIELD.xMin - 7, 0, cz), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), 44, 8, 2.5);
  stand(new THREE.Vector3(FIELD.xMax + 7, 0, cz), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), 44, 8, 2.5);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const tiersMesh = new THREE.InstancedMesh(boxGeo, concrete, tierBoxes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  tierBoxes.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rotY); sc.set(b.size[0], b.size[1], b.size[2]);
    m4.compose(b.pos, q, sc); tiersMesh.setMatrixAt(i, m4);
  });
  tiersMesh.receiveShadow = true; group.add(tiersMesh);

  const crowd = new THREE.InstancedMesh(personGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), people.length);
  const col = new THREE.Color();
  people.forEach((o, i) => {
    q.setFromAxisAngle(up, o.rotY + Math.PI); sc.set(1, o.s, 1);
    m4.compose(o.p, q, sc); crowd.setMatrixAt(i, m4);
    crowd.setColorAt(i, col.setHex(o.color).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1));
  });
  crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  // --- reclameborden langs de zijlijn en eindlijn
  const adCv = document.createElement('canvas'); adCv.width = 1024; adCv.height = 64;
  const ag = adCv.getContext('2d');
  ag.fillStyle = '#10161a'; ag.fillRect(0, 0, 1024, 64);
  ag.font = '800 44px "Saira Condensed","Arial Narrow",sans-serif'; ag.textBaseline = 'middle';
  const names = ['FLAG RUSH', 'IFAF 5v5', 'FLAG FOOTBALL', ...teams.map((t) => t.short)];
  let xx = 20;
  for (let i = 0; xx < 1024; i++) { const n = names[i % names.length]; ag.fillStyle = i % 2 ? '#ffb547' : '#eef3ee'; ag.fillText(n, xx, 34); xx += ag.measureText(n).width + 60; }
  const adTex = new THREE.CanvasTexture(adCv); adTex.colorSpace = THREE.SRGBColorSpace; adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshStandardMaterial({ map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.55, roughness: 0.6 });
  const adGeo = (w) => new THREE.PlaneGeometry(w, 0.9);
  const addAd = (x, z, rotY, w) => {
    const m = new THREE.Mesh(adGeo(w), adMat.clone()); m.material.map = adTex.clone(); m.material.emissiveMap = m.material.map; m.material.map.repeat.set(w / 16, 1); m.material.map.needsUpdate = true;
    m.position.set(x, 0.45, z); m.rotation.y = rotY; group.add(m);
  };
  addAd(cx, -3.2, 0, 84); addAd(cx, FIELD.width + 3.2, Math.PI, 84);
  addAd(FIELD.xMin - 3.2, cz, Math.PI / 2, 30); addAd(FIELD.xMax + 3.2, cz, -Math.PI / 2, 30);

  // --- lichtmasten op de vier hoeken
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x59615e, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xfff0c8, emissiveIntensity: 2.2 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x22282a, roughness: 0.7 });
  const glow = glowTexture();
  const masts = [];
  for (const [x, z] of [[-20, -12], [-20, FIELD.width + 12], [70, -12], [70, FIELD.width + 12]]) {
    const mast = new THREE.Group(); mast.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 30, 10), poleMat); pole.position.y = 15; pole.castShadow = false; mast.add(pole);
    const head = new THREE.Group(); head.position.y = 30.5;
    head.add(new THREE.Mesh(new THREE.BoxGeometry(7, 4, 0.5), frameMat));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.3), lampMat); l.position.set(-2.55 + i * 1.7, -1.4 + j * 1.35, 0.3); head.add(l);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    sp.scale.set(26, 26, 1); sp.position.z = 1.2; head.add(sp);
    head.lookAt(cx, 0, cz); // lampvlak kijkt naar het veld
    mast.add(head); group.add(mast);
    masts.push(new THREE.Vector3(x, 31, z));
  }
  return { group, mastPositions: masts };
}
