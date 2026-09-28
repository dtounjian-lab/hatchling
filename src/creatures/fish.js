// Instanced fish schools that mill, drift and scatter around the turtle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from '../world/terrain.js';
import { rand, pick, clamp } from '../core/util.js';

function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 10, 6);
  body.scale(0.28, 0.55, 1.0);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.42, 0, 0.26, -0.72, 0, -0.26, -0.72,
    0, 0, -0.42, 0, -0.26, -0.72, 0, 0.26, -0.72,
  ], 3));
  tail.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.2, 0.15, 0, 0.42, -0.1, 0, 0.2, -0.25,
    0, 0.2, 0.15, 0, 0.2, -0.25, 0, 0.42, -0.1,
  ], 3));
  dorsal.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
  const b = body.toNonIndexed();
  b.deleteAttribute('uv');
  return mergeGeometries([b, tail, dorsal]);
}

const REEF_FISH = [['#f2d24a', '#e8c23a'], ['#3f7fd8', '#5d9ae8'], ['#e0703c', '#d9573a'], ['#c8c040', '#e8e0a0'], ['#d85a5a', '#e89a8a'], ['#e8e2cc', '#f0d860']];
const SCHOOLS = [
  // reef: grunts, snapper, chromis, sergeant majors
  ...Array.from({ length: 16 }, (_, i) => ({ z: -100 - i * 19, x: rand(-90, 90), yOff: rand(1.5, 5), n: 44, r: 4.5, scale: [0.22, 0.36], colors: pick(REEF_FISH), glow: 0 })),
  // sargassum line: jacks and filefish sheltering under the mats
  ...Array.from({ length: 7 }, (_, i) => ({ z: -450 - i * 40, x: rand(-110, 110), yAbs: rand(-8, -2.5), n: 44, r: 5, scale: [0.3, 0.46], colors: ['#c9c28a', '#b8b070', '#d8d0a0'], glow: 0 })),
  // open Gulf: sardine balls, mackerel, a few big tuna
  ...Array.from({ length: 4 }, (_, i) => ({ z: -770 - i * 70, x: rand(-60, 60), yAbs: rand(-40, -18), n: 150, r: 9, scale: [0.3, 0.38], colors: ['#c9d8e6', '#aebfd0', '#e6eef5'], glow: 0, ball: true })),
  { z: -900, x: 30, yAbs: -30, n: 18, r: 14, scale: [1.3, 1.7], colors: ['#4a5f7a', '#5b7090'], glow: 0, roam: 60 },
  // the escarpment: lanternfish
  ...Array.from({ length: 5 }, (_, i) => ({ z: -1100 - i * 50, x: rand(-80, 80), yAbs: rand(-150, -110), n: 40, r: 6, scale: [0.2, 0.28], colors: ['#27304a', '#1f2740'], glow: 1 })),
  // roaming schools that pass through wherever she swims
  ...Array.from({ length: 4 }, (_, i) => ({ z: -120, x: 0, yOff: 3, n: 60, r: 6, scale: [0.26, 0.4], colors: i % 2 ? ['#d0dae6', '#b8c8d8'] : pick(REEF_FISH), glow: 0, follow: true })),
];

export class FishSchools {
  constructor(scene) {
    const total = SCHOOLS.reduce((a, s) => a + s.n, 0);
    this.count = total;
    const geo = fishGeo();
    const wig = new Float32Array(total * 2);
    const glow = new Float32Array(total);
    const mat = std(
      { color: 0xffffff, roughness: 0.35, metalness: 0.25 },
      {
        key: 'fish', caustics: 0.9, rim: 0.3,
        vertexHead: 'attribute vec2 aWig; attribute float aGlow; varying float vGlow;',
        vertexTransform: /* glsl */ `
          vGlow = aGlow;
          float k = clamp(-position.z * 1.3 + 0.15, 0.0, 1.0);
          transformed.x += sin(uTime * aWig.y + aWig.x - position.z * 5.0) * 0.12 * k;
        `,
        fragHead: 'varying float vGlow;',
        fragDiffuse: /* glsl */ `
          diffuseColor.rgb *= mix(1.35, 0.6, smoothstep(-0.15, 0.2, vObj.y));
          diffuseColor.rgb *= 0.9 + 0.2 * step(0.5, fract(vObj.z * 6.0 + 0.2));
        `,
        fragEmissive: /* glsl */ `
          float dots = step(0.7, fract(vObj.z * 9.0)) * smoothstep(0.02, -0.06, vObj.y) * vGlow;
          totalEmissiveRadiance += vec3(0.3, 0.9, 1.0) * dots * 3.0;
        `,
      }
    );
    geo.setAttribute('aWig', new THREE.InstancedBufferAttribute(wig, 2));
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
    this.mesh = new THREE.InstancedMesh(geo, mat, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.fish = [];
    this.schools = [];
    const col = new THREE.Color();
    let idx = 0;
    for (const s of SCHOOLS) {
      const ground = groundHeight(s.x, s.z);
      const home = new THREE.Vector3(s.x, s.yAbs ?? Math.min(-1.5, ground + s.yOff), s.z);
      const sc = { ...s, home, center: home.clone(), phase: rand(0, 100), start: idx, spin: rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1) };
      this.schools.push(sc);
      for (let i = 0; i < s.n; i++) {
        const slot = new THREE.Vector3().randomDirection().multiplyScalar(s.r * Math.cbrt(Math.random()));
        slot.y *= s.ball ? 0.8 : 0.45;
        const f = {
          i: idx, school: sc, slot, pos: home.clone().add(slot), vel: new THREE.Vector3(0, 0, 1),
          size: rand(s.scale[0], s.scale[1]),
        };
        this.fish.push(f);
        col.set(pick(s.colors)).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
        this.mesh.setColorAt(idx, col);
        wig[idx * 2] = rand(0, 6.28); wig[idx * 2 + 1] = rand(9, 14) / Math.sqrt(f.size * 3);
        glow[idx] = s.glow;
        idx++;
      }
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.tmp = new THREE.Vector3();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3();
    this.first = true;
  }

  update(dt, time, camPos, threats) {
    const T = this.tmp;
    for (const sc of this.schools) {
      if (sc.follow && camPos.y < -1) {
        // keep these schools near the swimmer: relocate out of sight when they fall behind
        const hx = sc.home.x - camPos.x, hz = sc.home.z - camPos.z;
        if (hx * hx + hz * hz > 85 * 85 || this.first) {
          const a = Math.random() * Math.PI * 2, d = rand(45, 70);
          const nx = clamp(camPos.x + Math.cos(a) * d, -190, 190), nz = Math.min(-40, camPos.z + Math.sin(a) * d);
          const g = groundHeight(nx, nz);
          const ny = clamp(camPos.y + rand(-4, 4), g + sc.r * 0.6 + 1, -2);
          const shift = new THREE.Vector3(nx, ny, nz).sub(sc.home);
          sc.home.add(shift); sc.center.add(shift);
          for (let i = 0; i < sc.n; i++) this.fish[sc.start + i].pos.add(shift);
        }
      }
      const dx = sc.home.x - camPos.x, dz = sc.home.z - camPos.z;
      sc.active = this.first || dx * dx + dz * dz < 170 * 170;
      if (!sc.active) continue;
      const roam = sc.roam ?? 10;
      const t = time * 0.12 + sc.phase;
      sc.center.set(
        sc.home.x + Math.sin(t) * roam,
        sc.home.y + Math.sin(t * 1.7) * 1.5,
        sc.home.z + Math.cos(t * 0.8) * roam
      );
      const gy = groundHeight(sc.center.x, sc.center.z) + sc.r * 0.5 + 1;
      if (sc.center.y < gy) sc.center.y = gy;
      if (sc.center.y > -1.5) sc.center.y = -1.5;
      sc.angle = time * sc.spin;
    }
    for (const f of this.fish) {
      const sc = f.school;
      if (!sc.active) continue;
      const ca = Math.cos(sc.angle), sa = Math.sin(sc.angle);
      T.set(f.slot.x * ca - f.slot.z * sa, f.slot.y, f.slot.x * sa + f.slot.z * ca).add(sc.center);
      // steer toward slot
      T.sub(f.pos).multiplyScalar(1.2);
      f.vel.addScaledVector(T, dt);
      // flee threats (turtle, sharks)
      for (const th of threats) {
        const ex = f.pos.x - th.pos.x, ey = f.pos.y - th.pos.y, ez = f.pos.z - th.pos.z;
        const d2 = ex * ex + ey * ey + ez * ez;
        const R = th.r;
        if (d2 < R * R && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const k = (1 - d / R) * 30 * dt / d;
          f.vel.x += ex * k; f.vel.y += ey * k; f.vel.z += ez * k;
        }
      }
      const sp = f.vel.length();
      const maxS = 6 + sc.r * 0.3;
      if (sp > maxS) f.vel.multiplyScalar(maxS / sp);
      if (sp < 0.8) f.vel.multiplyScalar(0.8 / Math.max(sp, 0.01));
      f.vel.multiplyScalar(1 - dt * 0.5);
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y > -0.5) f.pos.y = -0.5;
      const v = f.vel;
      const yaw = Math.atan2(v.x, v.z);
      const pitch = Math.asin(clamp(v.y / Math.max(v.length(), 1e-4), -0.8, 0.8));
      this.q.setFromEuler(this.e.set(-pitch, yaw, 0, 'YXZ'));
      this.m.compose(f.pos, this.q, this.s.setScalar(f.size));
      this.mesh.setMatrixAt(f.i, this.m);
    }
    this.first = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
