// Journey home hazards: boats crossing overhead with spinning propellers and a
// deadly turbulence zone, and gill nets hanging from the surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std, U } from '../core/shared.js';
import { rand, pick, clamp, smoothstep } from '../core/util.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

function hullGeo() {
  const g = new THREE.BoxGeometry(8, 4.6, 26, 8, 6, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = smoothstep(3, 13, z);
    x *= 1 - t * 0.96;
    if (y > 0) y += t * 1.0;
    if (y < 0) x *= 1 - (-y / 2.3) * 0.55;
    if (z < -12 && y < 0) y *= 0.8;
    p.setXYZ(i, x, y - 1.2, z);
  }
  g.computeVertexNormals();
  return g;
}

function propGeo() {
  const parts = [];
  const hub = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10);
  hub.rotateX(Math.PI / 2);
  parts.push(NI(hub));
  for (let i = 0; i < 3; i++) {
    const b = new THREE.SphereGeometry(1, 10, 6);
    b.scale(0.45, 1.45, 0.08);
    b.translate(0, 1.3, 0);
    b.rotateY(0.5);
    b.rotateZ((i / 3) * Math.PI * 2);
    parts.push(NI(b));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Boats {
  constructor(scene, lanes) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const hull = hullGeo();
    const prop = propGeo();
    const hullMat = std({ color: 0xffffff, roughness: 0.6 }, {
      key: 'hull', caustics: 0.4, rim: 0.2,
      uniforms: { uTop: { value: new THREE.Color('#e8e4da') } },
      fragHead: 'uniform vec3 uTop;',
      fragDiffuse: /* glsl */ `
        vec3 c = vObj.y < -0.2 ? vec3(0.12, 0.05, 0.05) : uTop;
        c = mix(c, vec3(0.1, 0.18, 0.35), step(abs(vObj.y - 0.1), 0.18));
        c *= 0.85 + 0.15 * vnoise(vObj.xz * 3.0);
        diffuseColor.rgb = c;
      `,
    });
    const cabinMat = std({ color: 0xf2efe6, roughness: 0.5 }, {
      key: 'cabin', caustics: 0,
      fragDiffuse: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.08, 0.12), step(0.3, vObj.y) * step(vObj.y, 0.75) * step(0.2, fract(vObj.z * 0.6)));',
    });
    const propMat = std({ color: 0xb08d57, roughness: 0.25, metalness: 0.8 }, { key: 'prop', caustics: 0.6 });
    this.boats = [];
    for (const L of lanes) {
      for (let k = 0; k < L.count; k++) {
        const g = new THREE.Group();
        const h = new THREE.Mesh(hull, hullMat);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 8), cabinMat);
        cabin.position.set(0, 2.6, -3);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), cabinMat);
        mast.position.set(0, 5.5, 2);
        const pr = new THREE.Mesh(prop, propMat);
        pr.position.set(0, -2.8, -13.4);
        const rud = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.4), hullMat);
        rud.position.set(0, -2.6, -14.6);
        g.add(h, cabin, mast, pr, rud);
        g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        this.group.add(g);
        const dir = k % 2 === 0 ? 1 : -1;
        this.boats.push({ g, prop: pr, lane: L.z, x: rand(-250, 250) * (k ? -1 : 1), dir, speed: rand(15, 21), bob: rand(0, 10), propWorld: new THREE.Vector3(), back: new THREE.Vector3() });
      }
    }
    this.visible = false;
    this.group.visible = false;
    this.tmp = new THREE.Vector3();
    this.local = new THREE.Vector3();
    this.inv = new THREE.Matrix4();
  }

  setVisible(v) { this.visible = v; this.group.visible = v; }

  // returns { damage, push:Vector3|null, drone: 0..1, nearest }
  update(dt, time, player, fx) {
    const out = { damage: 0, drone: 0, pitch: 0, hullHit: false };
    if (!this.visible) return out;
    for (const b of this.boats) {
      b.x += b.dir * b.speed * dt;
      if (Math.abs(b.x) > 290) { b.dir *= -1; b.x = Math.sign(b.x) * 289; b.speed = rand(15, 22); }
      const yaw = b.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      b.g.position.set(b.x, Math.sin(time * 1.3 + b.bob) * 0.15 + 0.15, b.lane);
      b.g.rotation.set(Math.sin(time * 0.9 + b.bob) * 0.02, yaw, Math.sin(time * 1.1 + b.bob) * 0.03);
      b.prop.rotation.z += dt * 28;
      b.g.updateMatrixWorld(true);
      b.prop.getWorldPosition(b.propWorld);
      b.back.set(-b.dir, 0, 0);
      // wake and prop turbulence
      if (fx && Math.abs(b.x - player.pos.x) < 150 && Math.abs(b.lane - player.pos.z) < 150) {
        if (Math.random() < 0.9) fx.bubbles.spawn(b.propWorld.x + rand(-1, 1), b.propWorld.y + rand(-1, 1), b.propWorld.z + rand(-1, 1), b.back.x * rand(2, 6), rand(0, 1), rand(-1, 1), rand(0.8, 1.6), rand(0.15, 0.4));
        if (Math.random() < 0.7) fx.splash.spawn(b.x + b.back.x * rand(10, 30), 0.1, b.lane + rand(-3, 3), rand(-0.5, 0.5), 0.6, rand(-0.5, 0.5), 1.2, rand(0.6, 1.2));
      }
      // turbulence zone: capsule from prop backwards
      const p = player.pos;
      const ax = b.propWorld.x, ay = b.propWorld.y, az = b.propWorld.z;
      const bx = ax + b.back.x * 14;
      const t = clamp(((p.x - ax) * (bx - ax)) / ((bx - ax) * (bx - ax)), 0, 1);
      const cx = ax + (bx - ax) * t;
      const dx = p.x - cx, dy = p.y - ay, dz = p.z - az;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 3.4 + player.size * 0.3) out.damage = Math.max(out.damage, 60);
      // hull contact
      this.inv.copy(b.g.matrixWorld).invert();
      this.local.copy(p).applyMatrix4(this.inv);
      if (Math.abs(this.local.x) < 4.4 && this.local.y > -4.2 && this.local.y < 2 && Math.abs(this.local.z) < 13.5) out.hullHit = true;
      // engine drone
      const dd = Math.hypot(b.x - p.x, b.lane - p.z, p.y);
      const lvl = 1 / (1 + (dd / 30) ** 2);
      if (lvl > out.drone) { out.drone = lvl; out.pitch = b.dir * Math.sign(p.x - b.x); }
    }
    return out;
  }
}

export class Nets {
  constructor(scene, nets) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.nets = [];
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying float vY;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv;
          vec3 p = position;
          p.z += sin(uTime * 0.8 + p.x * 0.15) * (1.0 - uv.y) * 1.2;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          vY = p.y;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vY;
        #include <fog_pars_fragment>
        void main(){
          vec2 g = vUv * vec2(120.0, 24.0);
          vec2 f = abs(fract(g) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.07, min(f.x, f.y));
          float torn = step(0.2, fract(sin(dot(floor(g), vec2(12.9898, 78.233))) * 43758.5453));
          float a = line * torn * 0.8 * smoothstep(0.0, 0.08, vUv.y);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vec3(0.6, 0.65, 0.6), a);
          #include <fog_fragment>
        }`,
    });
    this.mat = mat;
    const floatMat = std({ color: 0xff7a2a, roughness: 0.5 }, { key: 'netfloat', caustics: 0.4 });
    const floatGeo = new THREE.SphereGeometry(0.35, 8, 6);
    for (const N of nets) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(N.w, N.h, 40, 6), mat);
      plane.position.set(N.x, -N.h / 2, N.z);
      plane.renderOrder = 6;
      this.group.add(plane);
      const nf = Math.floor(N.w / 2.5);
      const floats = new THREE.InstancedMesh(floatGeo, floatMat, nf);
      const m = new THREE.Matrix4();
      for (let i = 0; i < nf; i++) { m.makeTranslation(N.x - N.w / 2 + i * 2.5, 0, N.z); floats.setMatrixAt(i, m); }
      floats.frustumCulled = false;
      this.group.add(floats);
      this.nets.push({ ...N, plane });
    }
    this.setVisible(false);
  }
  setVisible(v) { this.group.visible = v; this.visible = v; }
  update(dt, time, player) {
    this.mat.uniforms.uTime.value = time;
    if (!this.visible) return null;
    const p = player.pos;
    for (const N of this.nets) {
      if (Math.abs(p.z - N.z) < player.size * 0.4 + 0.4 && Math.abs(p.x - N.x) < N.w / 2 && p.y > -N.h && p.y < 0.5) return N;
    }
    return null;
  }
}

export { U };

// A ghost net: abandoned fishing gear drifting through the Gulf.
export class GhostNet {
  constructor(scene) {
    let g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.35 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 - x) + 0.2 * Math.sin(y * 7 + z * 5);
      p.setXYZ(i, x * n * 1.3, y * n * 0.8, z * n);
    }
    g.computeVertexNormals();
    this.mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uA: { value: 1 } }]),
      vertexShader: /* glsl */ `
        uniform float uTime; varying vec3 vP;
        #include <fog_pars_vertex>
        void main(){
          vP = position;
          vec3 p = position + normal * sin(uTime * 1.3 + position.y * 3.0) * 0.06;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uA; varying vec3 vP;
        #include <fog_pars_fragment>
        void main(){
          vec3 q = vP * 7.0 + vec3(sin(vP.y * 3.0), sin(vP.z * 2.0), sin(vP.x * 2.5)) * 0.6;
          vec3 f = abs(fract(q) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.03, min(min(f.x, f.y), f.z));
          if (line * uA < 0.05) discard;
          vec3 col = mix(vec3(0.3, 0.33, 0.28), vec3(0.2, 0.28, 0.14), step(0.5, fract(q.x * 0.21 + q.y * 0.13)));
          gl_FragColor = vec4(col, line * 0.75 * uA);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
}
