// Renderer, belichting (nachtstadion) en schaduwen.
import * as THREE from 'three';

export function createRenderer(canvas, mobile = false) {
  // mobiel: geen MSAA (de resolutie is al hoog) en een lager pixelratio
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function createScene(mastPositions = [], mobile = false) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080e);
  scene.fog = new THREE.FogExp2(0x060a12, 0.0042);

  scene.add(new THREE.HemisphereLight(0x8fa6d8, 0x1a2a18, 0.55));

  // hoofdlicht met schaduw; volgt de actie
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
  sun.position.set(14, 46, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const e = 26;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 5, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // vier lichtmasten vullen het veld zonder extra schaduwen
  // mobiel: twee lichtmasten in plaats van vier (minder lichtberekeningen per pixel), iets sterker
  const masts = mobile ? mastPositions.slice(0, 2) : mastPositions;
  const fills = masts.map((p) => {
    const s = new THREE.SpotLight(0xfff0d0, mobile ? 800 : 450, 0, 0.9, 0.7, 1.6);
    s.position.copy(p); s.target.position.set(25, 0, 12.5);
    scene.add(s, s.target);
    return s;
  });
  return { scene, sun, fills };
}

/** Laat het schaduwvenster meebewegen met de actie (op texelgrid, geen flikkering). */
export function followShadow(sun, fx, fz) {
  const texel = 52 / sun.shadow.mapSize.x;
  const sx = Math.round(fx / texel) * texel, sz = Math.round(fz / texel) * texel;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + 14, 46, sz - 10);
}

export function resizeTo(renderer, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}


