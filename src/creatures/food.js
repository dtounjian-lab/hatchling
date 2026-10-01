// Everything a turtle might eat (and the plastic she must not), spread through
// every zone. Each type is one InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight, zoneIndexAt } from '../world/terrain.js';
import { resolve as resolveColliders } from '../world/colliders.js';
import { rand, pick, TAU } from '../core/util.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };
const merge = (arr) => { const g = mergeGeometries(arr.map(NI)); g.computeVertexNormals(); return g; };

function bladeTuft(n, h) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.PlaneGeometry(0.07, h, 1, 5);
    b.translate(0, h / 2, 0);
    b.rotateZ((Math.random() - 0.5) * 0.5);
    b.rotateY((i / n) * Math.PI + Math.random());
    b.translate((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15);
    parts.push(b);
  }
  return merge(parts);
}

function algaeGeo() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const l = new THREE.SphereGeometry(1, 8, 6);
    l.scale(0.16, 0.42, 0.05);
    l.translate(0, 0.38, 0);
    l.rotateZ((Math.random() - 0.5) * 1.2);
    l.rotateY((i / 9) * TAU);
    l.translate(0, 0.05 * (i % 3), 0);
    parts.push(l);
  }
  return merge(parts);
}

function crabGeo() {
  const parts = [];
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(0.5, 0.22, 0.38);
  body.translate(0, 0.25, 0);
  parts.push(body);
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.CylinderGeometry(0.035, 0.045, 0.55, 4);
      leg.rotateZ(s * (1.0 + k * 0.1));
      leg.translate(s * 0.55, 0.12, -0.2 + k * 0.2);
      parts.push(leg);
    }
    const claw = new THREE.SphereGeometry(0.13, 8, 6);
    claw.scale(1.3, 0.8, 1);
    claw.translate(s * 0.32, 0.26, 0.48);
    parts.push(claw);
    const eye = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4);
    eye.translate(s * 0.12, 0.45, 0.28);
    parts.push(eye);
  }
  return merge(parts);
}

function shrimpGeo() {
  const parts = [];
  const body = new THREE.TorusGeometry(0.3, 0.09, 6, 12, Math.PI * 1.15);
  body.rotateY(Math.PI / 2);
  body.rotateX(-0.3);
  parts.push(body);
  const tail = new THREE.ConeGeometry(0.1, 0.18, 4);
  tail.translate(0, -0.3, -0.05);
  parts.push(tail);
  for (let s = -1; s <= 1; s += 2) {
    const ant = new THREE.CylinderGeometry(0.008, 0.008, 0.7, 3);
    ant.rotateX(1.1);
    ant.rotateY(s * 0.3);
    ant.translate(s * 0.05, 0.35, 0.45);
    parts.push(ant);
  }
  return merge(parts);
}

function conchGeo() {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push(new THREE.Vector2(0.02 + Math.sin(t * Math.PI) * 0.35 * (1 - t * 0.5) + (i % 2 ? 0.03 : 0), t * 0.9));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  g.rotateZ(Math.PI / 2 - 0.2);
  g.translate(0.4, 0.2, 0);
  const lip = new THREE.SphereGeometry(0.25, 10, 8);
  lip.scale(1.2, 0.6, 0.9);
  lip.translate(0.1, 0.18, 0.1);
  return merge([g, lip]);
}

export function jellyGeo() {
  const parts = [];
  const bellPts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.5;
    bellPts.push(new THREE.Vector2(Math.sin(a) * 0.5 + (i === 12 ? 0.04 : 0), Math.cos(a) * 0.42));
  }
  const bell = new THREE.LatheGeometry(bellPts, 18);
  parts.push(bell);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const t = new THREE.CylinderGeometry(0.012, 0.006, 1.2, 3, 8);
    t.translate(Math.cos(a) * 0.38, -0.6, Math.sin(a) * 0.38);
    parts.push(t);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const t = new THREE.CylinderGeometry(0.05, 0.02, 0.7, 4, 6);
    t.translate(Math.cos(a) * 0.08, -0.35, Math.sin(a) * 0.08);
    parts.push(t);
  }
  return merge(parts);
}

function spongeGeo() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.22 + 0.12 * Math.sin(t * 2.6) + (i === 10 ? 0.04 : 0), t * 1.0));
  }
  for (let i = 10; i >= 1; i--) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.16 + 0.1 * Math.sin(t * 2.6), t * 0.98));
  }
  const a = new THREE.LatheGeometry(pts, 14);
  const b = a.clone(); b.scale(0.7, 0.7, 0.7); b.translate(0.35, 0, 0.1);
  return merge([a, b]);
}

function squirtGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector2(0.02 + Math.sin(t * Math.PI * 0.9) * 0.14 + (k === 8 ? 0.02 : 0), t * 0.45));
    }
    const g = new THREE.LatheGeometry(pts, 10);
    g.rotateZ((Math.random() - 0.5) * 0.6);
    g.translate(Math.cos(i * 1.7) * 0.15, 0, Math.sin(i * 1.7) * 0.15);
    parts.push(g);
  }
  return merge(parts);
}

function plasticGeo() {
  const g = new THREE.SphereGeometry(0.5, 14, 10, 0, TAU, 0, Math.PI * 0.75);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 13) * Math.cos(z * 11) * 0.06 + Math.sin(y * 17 + x * 5) * 0.04;
    p.setXYZ(i, x * (1 + n) * 0.8, y * 1.3 + n, z * (1 + n) * 0.8);
  }
  const h1 = new THREE.TorusGeometry(0.14, 0.02, 4, 10, Math.PI);
  h1.translate(-0.15, 0.62, 0);
  const h2 = h1.clone(); h2.translate(0.3, 0, 0);
  return merge([g, h1, h2]);
}

// type config: geometry, material, colors, placement ('floor' | 'mid' | 'surface'), motion
function makeTypes() {
  const sway = /* glsl */ `
    { float hh = max(position.y, 0.0); vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
      float ph = uTime * 1.2 + ip.x * 0.3 + ip.z * 0.2;
      transformed.x += sin(ph) * hh * hh * 0.4; transformed.z += cos(ph * 1.2) * hh * hh * 0.25; }`;
  const glowFrag = (k) => /* glsl */ `totalEmissiveRadiance += diffuseColor.rgb * (${k} + 1.6 * smoothstep(-50.0, -130.0, vWPos.y)) * (0.8 + 0.2 * sin(uTime * 2.0 + vWPos.x));`;
  return {
    seagrass: { geo: bladeTuft(8, 1.0), mat: std({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }, { key: 'f_sg', vertexTransform: sway, fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.12;' }), colors: ['#6fdc6a', '#8be36b', '#58c96e'], place: 'floor', max: 90 },
    algae: { geo: algaeGeo(), mat: std({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }, { key: 'f_al', vertexTransform: sway, fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.15;' }), colors: ['#e0584e', '#7fcf5a', '#d9a33f', '#c7486e'], place: 'floor', max: 150 },
    crab: { geo: crabGeo(), mat: std({ color: 0xffffff, roughness: 0.5 }, { key: 'f_cr', rim: 0.3, fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.18;' }), colors: ['#ff6a3d', '#ff8a4c', '#e8503a'], place: 'floor', max: 100, move: 'scuttle' },
    shrimp: { geo: shrimpGeo(), mat: std({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.9 }, { key: 'f_sh', rim: 0.6, fragEmissive: glowFrag('0.2') }), colors: ['#ff9fb8', '#ffb3a0', '#ff6f7f'], place: 'low', max: 110, move: 'dart' },
    conch: { geo: conchGeo(), mat: std({ color: 0xffffff, roughness: 0.4 }, { key: 'f_co', rim: 0.25, fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.15;' }), colors: ['#f7c9a0', '#f2b48a', '#fcd9b8'], place: 'floor', max: 60, move: 'creep' },
    jelly: { geo: jellyGeo(), mat: std({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }, {
      key: 'f_je', rim: 0.9, caustics: 0.4,
      vertexTransform: /* glsl */ `
        { vec3 ip = instanceMatrix[3].xyz; float ph = uTime * 2.2 + ip.x * 0.7 + ip.z * 0.3;
          float pulse = sin(ph);
          if (position.y > -0.02) { transformed.xz *= 1.0 + pulse * 0.12; transformed.y *= 1.0 - pulse * 0.1; }
          else { float d = -position.y; transformed.x += sin(ph * 0.7 - d * 3.0) * d * 0.15; transformed.z += cos(ph * 0.6 - d * 2.5) * d * 0.15; } }`,
      fragEmissive: glowFrag('0.35'),
    }), colors: ['#c9a8ff', '#8fd8ff', '#ffb3e6', '#a0fff0'], place: 'mid', max: 170, move: 'drift' },
    sponge: { geo: spongeGeo(), mat: std({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }, { key: 'f_sp', fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.16;' }), colors: ['#ff9a3c', '#a56bff', '#ffd23c', '#ff5f7e', '#e8e2d0'], place: 'floor', max: 90 },
    squirt: { geo: squirtGeo(), mat: std({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.8 }, { key: 'f_sq', rim: 0.6, fragEmissive: glowFrag('0.25') }), colors: ['#8fd3ff', '#ffe36b', '#b8a4ff', '#7fffd4'], place: 'floor', max: 80 },
    plastic: { geo: plasticGeo(), mat: std({ color: 0xffffff, roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }, { key: 'f_pl', rim: 0.8, caustics: 0.3 }), colors: ['#f4f4f4', '#e8f0f2', '#dfe8ff', '#ffe9e9'], place: 'mid', max: 120, move: 'drift' },
  };
}

// counts per zone: reef, kelp, open, deep
const ZONE_TABLE = {
  reef: { z: [-95, -415], sizeK: 1.0, counts: { seagrass: 40, algae: 30, crab: 22, shrimp: 22, conch: 14, jelly: 12, sponge: 34, squirt: 24, plastic: 14 } },
  kelp: { z: [-425, -715], sizeK: 1.6, counts: { seagrass: 12, algae: 44, crab: 26, shrimp: 24, conch: 16, jelly: 26, sponge: 16, squirt: 16, plastic: 16 } },
  open: { z: [-725, -1045], sizeK: 2.2, counts: { seagrass: 0, algae: 34, crab: 14, shrimp: 28, conch: 0, jelly: 70, sponge: 10, squirt: 24, plastic: 26 } },
  deep: { z: [-1055, -1360], sizeK: 2.6, counts: { seagrass: 0, algae: 22, crab: 26, shrimp: 26, conch: 14, jelly: 46, sponge: 26, squirt: 12, plastic: 12 } },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Food {
  constructor(scene) {
    this.types = makeTypes();
    this.items = [];
    this.meshes = {};
    const col = new THREE.Color();
    for (const [t, cfg] of Object.entries(this.types)) {
      const m = new THREE.InstancedMesh(cfg.geo, cfg.mat, cfg.max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      if (t === 'jelly' || t === 'plastic') m.renderOrder = 6;
      scene.add(m);
      this.meshes[t] = m;
      cfg.used = 0;
      for (let i = 0; i < cfg.max; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, col.set('#ffffff')); }
    }
    for (const [zid, Z] of Object.entries(ZONE_TABLE)) {
      for (const [t, n] of Object.entries(Z.counts)) {
        const cfg = this.types[t];
        for (let k = 0; k < n && cfg.used < cfg.max; k++) {
          const idx = cfg.used++;
          const x = rand(-170, 170) * (Z.z[0] > -200 ? 0.6 : 1);
          const z = rand(Z.z[1], Z.z[0]);
          const g = groundHeight(x, z);
          let y;
          if (cfg.place === 'floor') y = g;
          else if (cfg.place === 'low') y = g + rand(0.4, 2.5) * Z.sizeK;
          else if (t === 'algae' && zid === 'open') y = rand(-2.5, -0.8); // sargassum rafts
          else y = Math.min(-1.2, rand(g + 3, Math.max(g + 4, zid === 'deep' ? -60 : -2)));
          if (zid === 'open' && cfg.place === 'floor' && t !== 'algae') y = rand(-40, -4); // drifting in the blue
          const size = rand(0.28, 0.45) * Z.sizeK * (t === 'jelly' ? 1.4 : 1) * (t === 'seagrass' ? 1.5 : 1);
          const it = {
            type: t, idx, zone: zid, home: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x, y, z),
            size, alive: true, respawn: 0, phase: rand(0, 100), yaw: rand(0, TAU), onFloor: cfg.place === 'floor' && !(zid === 'open'),
            float: zid === 'open' && t === 'algae',
          };
          this.items.push(it);
          col.set(pick(cfg.colors)).offsetHSL(rand(-0.03, 0.03), 0, rand(-0.06, 0.06));
          this.meshes[t].setColorAt(idx, col);
        }
      }
    }
    // nothing edible hides inside a rock
    for (const it of this.items) { resolveColliders(it.home, it.size * 0.4); it.pos.copy(it.home); }
    for (const m of Object.values(this.meshes)) m.instanceColor.needsUpdate = true;
    // twinkles that mark food in her diet, so it is easy to spot
    this.glintMax = 72;
    const gg = new THREE.BufferGeometry();
    this.glintPos = new Float32Array(this.glintMax * 3).fill(-99999);
    this.glintSize = new Float32Array(this.glintMax);
    gg.setAttribute('position', new THREE.BufferAttribute(this.glintPos, 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute('aSize', new THREE.BufferAttribute(this.glintSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.glint = new THREE.Points(gg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'uniform float uTime; attribute float aSize; varying float vT; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vT = 0.55 + 0.45 * sin(uTime * 3.2 + position.x * 1.7 + position.z); gl_PointSize = aSize * (110.0 + 60.0 * vT) / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vT; void main(){ vec2 c = gl_PointCoord - 0.5; float s = max(0.0, 1.0 - abs(c.x) * 12.0) * max(0.0, 1.0 - abs(c.y) * 2.4) + max(0.0, 1.0 - abs(c.y) * 12.0) * max(0.0, 1.0 - abs(c.x) * 2.4); s = s * 0.8 + smoothstep(0.3, 0.0, length(c)) * 0.9; gl_FragColor = vec4(vec3(0.75, 1.0, 0.8) * s * vT, s * vT); }',
    }));
    this.glint.frustumCulled = false;
    this.glint.renderOrder = 10;
    scene.add(this.glint);
    this.enabled = true;
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    this.glint.visible = v;
    for (const m of Object.values(this.meshes)) m.visible = v;
  }

  // Returns the item eaten this frame (at most one), or null.
  update(dt, time, player, canEat, diet = []) {
    if (!this.visible) return null;
    let eaten = null;
    const mouth = player.mouth;
    const reach = player.size * 0.62;
    const pp = player.pos;
    for (const it of this.items) {
      const mesh = this.meshes[it.type];
      if (!it.alive) {
        it.respawn -= dt;
        if (it.respawn <= 0 && it.home.distanceToSquared(pp) > 45 * 45) { it.alive = true; it.pos.copy(it.home); }
        else { mesh.setMatrixAt(it.idx, ZERO); continue; }
      }
      const t = time + it.phase;
      const cfg = this.types[it.type];
      // cheap distance cull for motion updates
      const dx = it.home.x - pp.x, dz = it.home.z - pp.z;
      const far = dx * dx + dz * dz > 200 * 200;
      if (!far || this._first !== false) {
        if (cfg.move === 'drift') {
          it.pos.set(it.home.x + Math.sin(t * 0.15) * 2, it.home.y + Math.sin(t * 0.4) * 0.8, it.home.z + Math.cos(t * 0.12) * 2);
        } else if (cfg.move === 'dart') {
          it.pos.set(it.home.x + Math.sin(t * 0.6) * 1.2 * it.size * 3, it.home.y + Math.sin(t * 1.3) * 0.3, it.home.z + Math.cos(t * 0.45) * 1.2 * it.size * 3);
          it.yaw = t * 0.6;
        } else if (cfg.move === 'scuttle' && it.onFloor) {
          const a = Math.sin(t * 0.3) * 2.5 * it.size;
          it.pos.set(it.home.x + a, 0, it.home.z + Math.cos(t * 0.21) * it.size);
          it.pos.y = groundHeight(it.pos.x, it.pos.z);
        } else if (it.float) {
          it.pos.y = it.home.y + Math.sin(t * 0.6) * 0.2;
        }
        _q.setFromEuler(_e.set(it.type === 'plastic' ? Math.sin(t * 0.5) * 0.6 : 0, it.yaw + (cfg.move === 'scuttle' ? Math.PI / 2 : 0), it.type === 'plastic' ? Math.cos(t * 0.4) * 0.5 : 0));
        _m.compose(it.pos, _q, _s.setScalar(it.size));
        mesh.setMatrixAt(it.idx, _m);
      }
      // a gentle pull: food in her diet drifts into reach when she is close
      if (canEat && diet.includes(it.type)) {
        const md = it.pos.distanceTo(mouth);
        const pull = reach * 2.6 + it.size;
        if (md < pull && md > 1e-3) {
          const k = Math.min(1, dt * 3.5 * (1 - md / pull) + dt);
          _p.copy(mouth).sub(it.pos).multiplyScalar(k);
          it.home.add(_p); it.pos.add(_p);
          _m.compose(it.pos, _q, _s.setScalar(it.size));
          mesh.setMatrixAt(it.idx, _m);
        }
      }
      if (!eaten && canEat) {
        const r = reach + it.size * 0.55;
        if (it.pos.distanceToSquared(mouth) < r * r) {
          eaten = it;
          it.alive = false;
          it.respawn = it.type === 'plastic' ? 30 : 50;
          mesh.setMatrixAt(it.idx, ZERO);
        }
      }
    }
    this._first = false;
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
    // glints on the nearest edible items
    let g = 0;
    const R2 = 55 * 55;
    for (const it of this.items) {
      if (g >= this.glintMax) break;
      if (!it.alive || !diet.includes(it.type) || it.pos.distanceToSquared(pp) > R2) continue;
      this.glintPos[g * 3] = it.pos.x; this.glintPos[g * 3 + 1] = it.pos.y + it.size * 0.6; this.glintPos[g * 3 + 2] = it.pos.z;
      this.glintSize[g] = 0.6 + it.size;
      g++;
    }
    for (let i = g; i < this.glintMax; i++) this.glintPos[i * 3 + 1] = -99999;
    this.glint.geometry.attributes.position.needsUpdate = true;
    this.glint.geometry.attributes.aSize.needsUpdate = true;
    this.glint.material.uniforms.uTime.value = time;
    return eaten;
  }

  // Keep a handful of edible items near the player so she never runs dry.
  ensureNear(player, types, zoneId, want = 8) {
    const Z = ZONE_TABLE[zoneId];
    if (!Z || !types.length) return;
    const pp = player.pos;
    const R2 = 42 * 42;
    let near = 0, nearPlastic = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      const d = it.pos.distanceToSquared(pp);
      if (d < R2) { if (types.includes(it.type)) near++; else if (it.type === 'plastic') nearPlastic++; }
    }
    const fwd = player.forward(_p).setY(0).normalize();
    const place = (it) => {
      const a = Math.atan2(fwd.x, fwd.z) + rand(-1.9, 1.9);
      const d = rand(16, 38) * Math.max(1, Z.sizeK * 0.8);
      const x = Math.max(-190, Math.min(190, pp.x + Math.sin(a) * d));
      const z = Math.min(Z.z[0], Math.max(Z.z[1], pp.z + Math.cos(a) * d));
      const g = groundHeight(x, z);
      const cfg = this.types[it.type];
      let y;
      if (zoneId === 'kelp' && ['algae', 'crab', 'shrimp', 'squirt'].includes(it.type)) y = rand(-4, -0.8);
      else if (zoneId === 'open' && it.type !== 'jelly' && it.type !== 'plastic') y = Math.min(-1.5, Math.max(g + 2, pp.y + rand(-5, 5)));
      else if (cfg.place === 'floor') y = g;
      else if (cfg.place === 'low') y = g + rand(0.4, 2.2) * Z.sizeK;
      else y = Math.min(-1.2, Math.max(g + 2, pp.y + rand(-5, 5)));
      it.home.set(x, y, z);
      resolveColliders(it.home, 0.3);
      it.pos.copy(it.home);
      it.zone = zoneId;
      it.size = rand(0.28, 0.45) * Z.sizeK * (it.type === 'jelly' ? 1.4 : 1) * (it.type === 'seagrass' ? 1.5 : 1);
      it.onFloor = cfg.place === 'floor' && y === g;
      it.float = zoneId === 'kelp' && y > -4.5 && it.type === 'algae';
      it.alive = true; it.respawn = 0;
    };
    const far = (it) => !it.alive || it.pos.distanceToSquared(pp) > 130 * 130;
    let need = want - near;
    for (const it of this.items) {
      if (need <= 0) break;
      if (types.includes(it.type) && far(it)) { place(it); need--; }
    }
    if (nearPlastic < 1) {
      const it = this.items.find((i) => i.type === 'plastic' && far(i));
      if (it) place(it);
    }
  }

  nearestOfTypes(pos, types, maxD = 60) {
    let best = null, bd = maxD * maxD;
    for (const it of this.items) {
      if (!it.alive || !types.includes(it.type)) continue;
      const d = it.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
}

// Ambient (non-food) jellyfish that glow in the deep.
export class AmbientJellies {
  constructor(scene) {
    const geo = jellyGeo();
    const mat = std({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }, {
      key: 'amb_je', rim: 1.0, caustics: 0.2,
      vertexTransform: /* glsl */ `
        { vec3 ip = instanceMatrix[3].xyz; float ph = uTime * 1.6 + ip.x * 0.7 + ip.z * 0.3; float pulse = sin(ph);
          if (position.y > -0.02) { transformed.xz *= 1.0 + pulse * 0.14; transformed.y *= 1.0 - pulse * 0.1; }
          else { float d = -position.y; transformed.x += sin(ph * 0.7 - d * 3.0) * d * 0.2; transformed.z += cos(ph * 0.6 - d * 2.5) * d * 0.2; } }`,
      fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * (0.2 + 2.6 * smoothstep(-70.0, -140.0, vWPos.y));',
    });
    const N = 150;
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.list = [];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const deep = i < 95;
      const z = deep ? rand(-1360, -1060) : rand(-1040, -740);
      const x = rand(-180, 180);
      const g = groundHeight(x, z);
      const y = deep ? rand(g + 5, -70) : rand(-60, -8);
      this.list.push({ home: new THREE.Vector3(x, y, z), s: rand(0.8, deep ? 3.2 : 2.2), ph: rand(0, 100) });
      col.set(pick(deep ? ['#4fd6ff', '#b06bff', '#4dffb8', '#ff6bd6'] : ['#cfe0ff', '#e6d0ff', '#ffd6ec'])).multiplyScalar(deep ? 1 : 0.9);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }
  update(time) {
    let i = 0;
    for (const j of this.list) {
      const t = time * 0.2 + j.ph;
      _p.set(j.home.x + Math.sin(t * 0.5) * 4, j.home.y + Math.sin(t) * 2, j.home.z + Math.cos(t * 0.4) * 4);
      _q.setFromEuler(_e.set(Math.sin(t) * 0.2, 0, Math.cos(t * 0.8) * 0.2));
      _m.compose(_p, _q, _s.setScalar(j.s));
      this.mesh.setMatrixAt(i++, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export { zoneIndexAt };
