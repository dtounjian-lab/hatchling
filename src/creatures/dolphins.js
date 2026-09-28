// A pod of bottlenose dolphins, like the residents of nearby Sarasota Bay.
// They cruise past now and then, porpoising at the surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from '../world/terrain.js';
import { rand, clamp, dampAngle, damp } from '../core/util.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

function fin(pts) {
  const g = new THREE.BufferGeometry();
  const [a, b, c] = pts;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return g;
}

function dolphinGeo() {
  const prof = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28; // 0 tail .. 1 beak
    let r = 0.16 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.8);
    if (t > 0.86) r = 0.16 * 0.5 * (1 - (t - 0.86) / 0.14) + 0.012; // rostrum
    if (t > 0.78 && t <= 0.86) r *= 1.05; // melon
    prof.push(new THREE.Vector2(Math.max(0.006, r), t * 2 - 1));
  }
  const body = new THREE.LatheGeometry(prof, 18);
  body.rotateX(Math.PI / 2);
  body.scale(0.9, 1, 1);
  const parts = [NI(body)];
  parts.push(fin([[0, 0.13, 0.05], [0, 0.36, -0.22], [0, 0.12, -0.28]])); // curved dorsal
  for (const s of [-1, 1]) parts.push(fin([[s * 0.12, -0.06, 0.4], [s * 0.36, -0.16, 0.18], [s * 0.1, -0.06, 0.22]]));
  const fl = new THREE.SphereGeometry(1, 14, 6);
  fl.scale(0.3, 0.012, 0.09);
  const fp = fl.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, fp.getZ(i) - Math.abs(fp.getX(i)) * 0.4);
  fl.translate(0, 0, -1.0);
  parts.push(NI(fl));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Dolphins {
  constructor(scene, count = 5) {
    this.mat = std({ color: 0xffffff, roughness: 0.35, side: THREE.DoubleSide }, {
      key: 'dolphin', rim: 0.5, caustics: 1.0,
      vertexHead: 'attribute float aPh;',
      vertexTransform: /* glsl */ `
        float tk = smoothstep(0.2, -1.1, position.z);
        transformed.y += sin(uTime * 5.0 + aPh - position.z * 2.4) * 0.09 * tk;
      `,
      fragDiffuse: /* glsl */ `
        float belly = smoothstep(0.02, -0.07, vObj.y);
        diffuseColor.rgb = mix(vec3(0.42, 0.46, 0.52), vec3(0.86, 0.87, 0.88), belly);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.33, 0.38), smoothstep(0.04, 0.12, vObj.y) * 0.6);
        float eye = smoothstep(0.02, 0.012, length(vec2(abs(vObj.x) - 0.075, vObj.y - 0.01))) * step(0.66, vObj.z) * step(vObj.z, 0.72);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), eye);
      `,
    });
    const geo = dolphinGeo();
    this.ph = new Float32Array(count);
    for (let i = 0; i < count; i++) this.ph[i] = rand(0, 6.28);
    geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(this.ph, 1));
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    for (let i = 0; i < count; i++) {
      this.list.push({ pos: new THREE.Vector3(0, -3, -200), vel: new THREE.Vector3(0, 0, -6), off: new THREE.Vector3(rand(-5, 5), rand(-1.5, 1.5), rand(-6, 6)), yaw: 0, pitch: 0, roll: 0, leap: rand(0, 10), size: rand(2.2, 2.8) });
    }
    this.center = new THREE.Vector3(0, -3, -200);
    this.dir = new THREE.Vector3(1, 0, 0);
    this.visitT = 20;
    this.active = false;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3();
  }

  // returns distance from the pod to the player (for sound)
  update(dt, time, player, allowed) {
    this.visitT -= dt;
    const pp = player.pos;
    if (allowed && this.visitT <= 0 && pp.z < -90 && pp.z > -1000) {
      // swing the pod's path across in front of her
      const f = player.forward(new THREE.Vector3()); f.y = 0; f.normalize();
      const side = new THREE.Vector3(f.z, 0, -f.x);
      const s = Math.random() < 0.5 ? 1 : -1;
      this.center.copy(pp).addScaledVector(f, rand(25, 40)).addScaledVector(side, 70 * s);
      this.center.y = -3;
      this.dir.copy(side).multiplyScalar(-s);
      for (const d of this.list) { d.pos.copy(this.center).add(d.off); d.vel.copy(this.dir).multiplyScalar(7); }
      this.active = true;
      this.visitT = rand(70, 110);
    }
    this.mesh.visible = this.active;
    if (!this.active) return 1e9;
    this.center.addScaledVector(this.dir, 7 * dt);
    this.center.x = clamp(this.center.x, -200, 200);
    if (this.center.distanceTo(pp) > 260) { this.active = false; return 1e9; }
    let i = 0;
    for (const d of this.list) {
      d.leap -= dt;
      const tgt = this.center.clone().add(d.off);
      tgt.y += Math.sin(time * 1.2 + i) * 1.2;
      if (d.leap < 0) { tgt.y = 2.5; if (d.leap < -1.2) d.leap = rand(4, 9); }
      const g = groundHeight(tgt.x, tgt.z) + 2;
      if (tgt.y < g) tgt.y = g;
      d.vel.lerp(tgt.sub(d.pos).multiplyScalar(1.2).add(this.dir.clone().multiplyScalar(7)), 1 - Math.exp(-2 * dt));
      if (d.pos.y > 0.2) d.vel.y -= 14 * dt; // airborne
      d.pos.addScaledVector(d.vel, dt);
      const yaw = Math.atan2(d.vel.x, d.vel.z);
      d.yaw = dampAngle(d.yaw, yaw, 4, dt);
      d.pitch = damp(d.pitch, Math.asin(clamp(d.vel.y / Math.max(d.vel.length(), 0.01), -0.9, 0.9)), 5, dt);
      this.q.setFromEuler(this.e.set(-d.pitch, d.yaw, 0, 'YXZ'));
      this.m.compose(d.pos, this.q, this.s.setScalar(d.size));
      this.mesh.setMatrixAt(i++, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.center.distanceTo(pp);
  }
}
