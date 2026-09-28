// Soft contact shadows (blob decals) that ground turtles and eggs on the sand and seabed.
import * as THREE from 'three';
import { groundHeight } from './terrain.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export class BlobShadows {
  constructor(scene, max = 96) {
    const g = new THREE.PlaneGeometry(1, 1);
    this.alpha = new Float32Array(max);
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; varying float vA; void main(){ float d = length((vUv - 0.5) * 2.0); float a = pow(1.0 - smoothstep(0.0, 1.0, d), 1.6) * vA; gl_FragColor = vec4(0.0, 0.01, 0.02, a); }',
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.max = max;
    this.n = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sz, yaw, a) {
    if (this.n >= this.max) return;
    const gy = groundHeight(x, z);
    const h = Math.max(0, y - gy);
    const fade = Math.max(0, 1 - h / (sx * 2.5));
    if (fade <= 0.01) return;
    _q.setFromAxisAngle(_p.set(0, 1, 0), yaw).multiply(FLAT);
    _m.compose(_p.set(x, gy + 0.015, z), _q, _s.set(sx * (1 + h * 0.3), sz * (1 + h * 0.3), 1));
    this.mesh.setMatrixAt(this.n, _m);
    this.alpha[this.n] = a * fade;
    this.n++;
  }
  end() {
    for (let i = this.n; i < this.max; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
