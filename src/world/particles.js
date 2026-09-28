// Marine snow, bubbles, splashes, sand puffs and glowing plankton trails.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { rand } from '../core/util.js';

// Drifting marine snow that wraps around the camera (shader only, no CPU cost).
export function createMarineSnow(scene, count = 2600) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random();
    seed[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: 44 },
      uColor: { value: new THREE.Color(0.7, 0.85, 0.9) }, uOpacity: { value: 0 }, uSize: { value: 26 },
      uGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uSize;
      attribute float aSeed; varying float vA; varying float vSeed;
      void main(){
        vec3 p = position * uBox;
        p.y -= uTime * (0.12 + aSeed * 0.25);
        p.x += sin(uTime * 0.2 + aSeed * 30.0) * 1.2;
        p.z += cos(uTime * 0.17 + aSeed * 21.0) * 1.2;
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = length(p - uCam);
        vA = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.3, 1.2, d) * step(p.y, -0.2);
        vSeed = aSeed;
        gl_PointSize = uSize * (0.35 + aSeed * 0.9) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uGlow; uniform float uTime;
      varying float vA; varying float vSeed;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * vA * uOpacity;
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + vSeed * 3.0) + vSeed * 50.0);
        vec3 col = mix(uColor, vec3(0.3, 0.9, 1.0) * 2.5 * tw, uGlow * step(0.8, vSeed));
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  scene.add(pts);
  return { pts, mat, update(cam, under, color, glow, scale) {
    mat.uniforms.uCam.value.copy(cam.position);
    mat.uniforms.uOpacity.value += ((under ? 0.55 : 0) - mat.uniforms.uOpacity.value) * 0.1;
    mat.uniforms.uColor.value.copy(color);
    mat.uniforms.uGlow.value = glow;
    mat.uniforms.uBox.value = 22 + scale * 14;
    mat.uniforms.uSize.value = 18 + scale * 10;
  } };
}

// Generic CPU particle pool rendered as soft points.
// kind: 'bubble' (rises, wobbles, pops at surface), 'splash' (gravity), 'sand', 'glow' (fades)
export class ParticlePool {
  constructor(scene, max, kind, { color = 0xffffff, additive = false, size = 1 } = {}) {
    this.max = max; this.kind = kind;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.sizeA = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizeA, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setAttribute('aColor', this.colAttr);
    const bubble = kind === 'bubble';
    this.baseColor = new THREE.Color(color);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 300 * size } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vA; varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          vA = aAlpha; vC = aColor;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vC;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          ${bubble
            ? 'float ring = smoothstep(0.5, 0.42, d) * (0.25 + 0.75 * smoothstep(0.25, 0.46, d)); float hl = smoothstep(0.14, 0.0, length(c - vec2(-0.14, 0.14))); float a = (ring * 0.7 + hl) * vA;'
            : 'float a = smoothstep(0.5, 0.05, d) * vA;'}
          gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -99999;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.sizeA[i] = size;
    const c = color || this.baseColor;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    return i;
  }

  burst(p, n, speed, life, size, color, up = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(rand(-1, 1));
      const s = speed * rand(0.3, 1);
      this.spawn(p.x, p.y, p.z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s + up, Math.sin(b) * Math.sin(a) * s,
        life * rand(0.6, 1.2), size * rand(0.6, 1.3), color);
    }
  }

  update(dt, surfaceAt) {
    const K = this.kind;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; P[i * 3 + 1] = -99999; } continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      const j = i * 3;
      if (K === 'bubble') {
        V[j + 1] += dt * 3.0;
        V[j] *= 0.96; V[j + 2] *= 0.96; V[j + 1] *= 0.985;
        P[j] += Math.sin(this.age[i] * 9 + i) * dt * 0.3;
        const sy = surfaceAt ? surfaceAt(P[j], P[j + 2]) : 0;
        if (P[j + 1] > sy - 0.05) this.age[i] = this.life[i];
        this.alpha[i] = Math.min(1, t * 8) * (1 - t * t) * 0.9;
      } else if (K === 'splash') {
        V[j + 1] -= dt * 14;
        V[j] *= 0.99; V[j + 2] *= 0.99;
        this.alpha[i] = (1 - t) * 0.95;
      } else if (K === 'sand') {
        V[j + 1] -= dt * 6;
        V[j] *= 0.95; V[j + 2] *= 0.95;
        this.alpha[i] = (1 - t) * 0.8;
      } else {
        V[j] *= 0.97; V[j + 1] *= 0.97; V[j + 2] *= 0.97;
        this.alpha[i] = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
      }
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
    }
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
