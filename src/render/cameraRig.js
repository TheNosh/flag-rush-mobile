// Drie cameraposities, wisselen met R3 (of C): achter de offense, achter de defense, van boven.
import * as THREE from 'three';
import { clamp, damp } from '../game/math.js';

export const CAM_MODES = ['achter offense', 'achter defense', 'van boven'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(-10, 8, 12);
    this.look = new THREE.Vector3(10, 0, 12);
    this.fov = 52;
    this.snap = true;
  }
  cycle() { this.mode = (this.mode + 1) % CAM_MODES.length; return CAM_MODES[this.mode]; }

  /** focus {x,y} in spelcoördinaten; dir = aanvalsrichting van de bal (+1 of -1) */
  update(dt, focus, dir) {
    const lat = 12.5 + (focus.y - 12.5) * 0.6;
    let px, py, pz, lx, ly, lz;
    if (this.mode === 0 || this.mode === 1) {
      const d = this.mode === 0 ? dir : -dir; // kijkrichting van de camera
      px = focus.x - d * 15; py = 7.2; pz = lat;
      lx = focus.x + d * 9; ly = 0.4; lz = lat;
    } else {
      px = focus.x - 1; py = 36; pz = 12.5 + (focus.y - 12.5) * 0.3 + 15;
      lx = focus.x; ly = 0; lz = 12.5 + (focus.y - 12.5) * 0.3;
    }
    px = clamp(px, -26, 76);
    const k = this.snap ? 1000 : 3.4;
    this.pos.set(damp(this.pos.x, px, k, dt), damp(this.pos.y, py, 2.6, dt), damp(this.pos.z, pz, k, dt));
    this.look.set(damp(this.look.x, lx, k * 1.2, dt), damp(this.look.y, ly, k, dt), damp(this.look.z, lz, k * 1.2, dt));
    this.snap = false;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
