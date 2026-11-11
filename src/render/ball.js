// 3D-bal: ellipsoïde met veters, draait in een spiraal rond zijn lengteas tijdens de worp.
import * as THREE from 'three';

const brown = new THREE.MeshStandardMaterial({ color: 0x7a3f1d, roughness: 0.55 });
const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.6 });

export class BallView {
  constructor(world) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), brown);
    m.scale.set(1.65, 1, 1); m.castShadow = true; this.body.add(m);
    for (const x of [-0.09, 0.09]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.009, 6, 20), white);
      r.position.x = x * 1.55; r.rotation.y = Math.PI / 2; r.scale.setScalar(Math.sqrt(1 - (x / 0.1) ** 2) * 1.0); this.body.add(r);
    }
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.02), white); lace.position.set(0, 0.098, 0); this.body.add(lace);
    this.group.add(this.body);
    world.add(this.group);
    this.spin = 0;
    this.holder = null;
  }

  /** In de handen van een speler */
  attach(view) {
    this.holder = view;
    view.handR.add(this.group);
    this.group.position.set(0.02, 0.02, 0.03); this.group.quaternion.identity();
    this.body.quaternion.set(0, 0, 0.7071, 0.7071); // lengteas langs het onderarm
    this.group.scale.setScalar(1);
  }
  detach(world) {
    if (this.holder) { this.group.removeFromParent(); world.add(this.group); this.holder = null; }
  }
  /** in de lucht: positie + richting (eenheidsvector) */
  setFlight(p, dir, dt) {
    this.group.position.copy(p);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    this.group.quaternion.copy(q);
    this.spin += dt * 24;
    this.body.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.spin);
  }
  setGround(p, yaw = 0) {
    this.group.position.set(p.x, 0.1, p.z); this.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.quaternion.identity();
  }
}
