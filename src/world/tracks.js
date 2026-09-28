// Flipper tracks in the sand: the little furrows hatchlings (and a nesting mother) leave behind.
import * as THREE from 'three';
import { groundHeight } from './terrain.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Tracks {
  constructor(scene, max = 900) {
    const g = new THREE.PlaneGeometry(1, 1);
    this.alpha = new Float32Array(max);
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `varying vec2 vUv; varying float vA;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
          float d = length(p * vec2(1.0, 0.55));
          float dent = smoothstep(1.0, 0.55, d);
          float lip = smoothstep(0.55, 0.9, d) * smoothstep(1.05, 0.9, d) * step(0.0, p.y);
          vec3 col = mix(vec3(0.0, 0.0, 0.02), vec3(1.0, 0.98, 0.92), lip);
          float a = (dent * 0.55 + lip * 0.25) * vA;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.max = max;
    this.list = [];
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, ZERO); this.list.push({ age: 1e9, life: 1, a: 0 }); }
    this.cursor = 0;
    scene.add(this.mesh);
  }
  add(x, z, yaw, size, life = 30, a = 0.8) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const y = groundHeight(x, z);
    if (y < 0.02) return; // the sea erases them
    _q.setFromAxisAngle(UP, yaw).multiply(FLAT);
    _m.compose(_p.set(x, y + 0.01, z), _q, _s.set(size * 0.5, size, 1));
    this.mesh.setMatrixAt(i, _m);
    const t = this.list[i];
    t.age = 0; t.life = life; t.a = a;
    this.dirty = true;
  }
  // a pair of flipper prints on either side of a crawling turtle
  step(pos, yaw, size, life, a) {
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const w = size * 0.42;
    this.add(pos.x + sx * w, pos.z + sz * w, yaw + 0.3, size * 0.28, life, a);
    this.add(pos.x - sx * w, pos.z - sz * w, yaw - 0.3, size * 0.28, life, a);
  }
  clear() { for (let i = 0; i < this.max; i++) { this.list[i].age = 1e9; this.alpha[i] = 0; } this.mesh.geometry.attributes.aAlpha.needsUpdate = true; }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const t = this.list[i];
      if (t.age > t.life) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.dirty = true; } continue; }
      t.age += dt;
      this.alpha[i] = t.a * Math.min(1, (t.life - t.age) / (t.life * 0.4));
      this.dirty = true;
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.geometry.attributes.aAlpha.needsUpdate = true; this.dirty = false; }
  }
}
