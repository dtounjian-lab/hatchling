// Eggs, collectible shells, ocean currents and deep-sea vents.
import * as THREE from 'three';
import { std, U } from '../core/shared.js';
import { groundHeight, WORLD } from './terrain.js';
import { rand, TAU, clamp } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ------------------------------------------------------------------ eggs
export class Eggs {
  constructor(scene, max = 140) {
    const geo = new THREE.SphereGeometry(1, 20, 14);
    geo.scale(1, 1.08, 1);
    this.crack = new Float32Array(max);
    geo.setAttribute('aCrack', new THREE.InstancedBufferAttribute(this.crack, 1));
    const mat = std({ color: 0xf6f0e2, roughness: 0.55 }, {
      key: 'egg', caustics: 0, rim: 0.35,
      vertexHead: 'attribute float aCrack; varying float vCrack;',
      vertexTransform: 'vCrack = aCrack;',
      fragHead: 'varying float vCrack;',
      fragDiffuse: /* glsl */ `
        float lines = abs(sin(vObj.x * 18.0 + sin(vObj.z * 14.0) * 2.0 + vObj.y * 6.0));
        float mask = smoothstep(1.0 - vCrack * 1.6, 1.0 - vCrack * 1.6 + 0.2, vObj.y);
        float crack = (1.0 - smoothstep(0.0, 0.12, lines)) * mask * step(0.01, vCrack);
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + 0.08 * vnoise(vObj.xy * 20.0)), vec3(0.12, 0.09, 0.06), crack);
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.list = [];
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, ZERO); this.list.push({ i, on: false, pos: new THREE.Vector3(), r: 0.16, wob: 0, crack: 0, rot: new THREE.Euler() }); }
    scene.add(this.mesh);
  }
  clear() { for (const e of this.list) e.on = false; this.sync(); }
  add(pos, r = 0.16) {
    const e = this.list.find((x) => !x.on);
    if (!e) return null;
    e.on = true; e.pos.copy(pos); e.r = r; e.wob = 0; e.crack = 0;
    e.rot.set(rand(-0.3, 0.3), rand(0, TAU), rand(-0.3, 0.3));
    return e;
  }
  sync(time = 0) {
    for (const e of this.list) {
      if (!e.on) { this.mesh.setMatrixAt(e.i, ZERO); continue; }
      _q.setFromEuler(_e.set(e.rot.x + Math.sin(time * 30) * 0.12 * e.wob, e.rot.y, e.rot.z + Math.cos(time * 27) * 0.12 * e.wob));
      _m.compose(e.pos, _q, _s.setScalar(e.r));
      this.mesh.setMatrixAt(e.i, _m);
      this.crack[e.i] = e.crack;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aCrack.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ shells
function scallopGeo() {
  const g = new THREE.CircleGeometry(1, 24, 0, Math.PI);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const a = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    p.setXYZ(i, x, y, r * 0.35 * (1 - r * 0.6) + Math.abs(Math.sin(a * 9)) * 0.06 * r);
  }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2 + 0.5);
  return g;
}

export class Shells {
  constructor(scene) {
    const spots = [];
    const zones = [[-95, -410, 9], [-430, -710, 6], [-730, -1040, 4], [-1060, -1350, 5]];
    for (const [z0, z1, n] of zones) {
      for (let i = 0; i < n; i++) {
        const z = rand(z1, z0), x = rand(-150, 150) * (z0 > -100 ? 0.5 : 1);
        spots.push(new THREE.Vector3(x, groundHeight(x, z) + 0.35, z));
      }
    }
    this.total = spots.length;
    const mat = std({ color: 0xffffff, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide }, {
      key: 'shell_c', rim: 0.8,
      fragDiffuse: /* glsl */ `
        float a = atan(vObj.z, vObj.x);
        vec3 pearl = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + length(vObj.xz) * 1.5 + uTime * 0.1));
        diffuseColor.rgb = mix(vec3(1.0, 0.86, 0.72), pearl, 0.35) * (0.85 + 0.15 * abs(sin(a * 9.0)));
      `,
      fragEmissive: 'totalEmissiveRadiance += vec3(1.0, 0.85, 0.6) * (0.35 + 0.25 * sin(uTime * 3.0 + vWPos.x));',
    });
    this.mesh = new THREE.InstancedMesh(scallopGeo(), mat, this.total);
    this.mesh.frustumCulled = false;
    this.items = spots.map((p, i) => ({ i, pos: p, got: false, ph: rand(0, 10) }));
    scene.add(this.mesh);
    // sparkles
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(spots.flatMap((p) => [p.x, p.y + 0.3, p.z]), 3));
    this.sparkMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime },
      vertexShader: 'uniform float uTime; varying float vT; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vT = 0.5 + 0.5 * sin(uTime * 4.0 + position.x); gl_PointSize = (60.0 + 40.0 * vT) / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vT; void main(){ vec2 c = gl_PointCoord - 0.5; float s = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2); s += smoothstep(0.25, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * s * vT * 1.5, s); }',
    });
    this.spark = new THREE.Points(g, this.sparkMat);
    this.spark.frustumCulled = false;
    scene.add(this.spark);
    this.collected = 0;
  }
  setVisible(v) { this.mesh.visible = v; this.spark.visible = v; }
  update(time, player) {
    let got = null;
    for (const s of this.items) {
      if (s.got) { this.mesh.setMatrixAt(s.i, ZERO); continue; }
      _q.setFromEuler(_e.set(0, time * 0.8 + s.ph, 0));
      _p.copy(s.pos); _p.y += Math.sin(time * 1.5 + s.ph) * 0.1;
      _m.compose(_p, _q, _s.setScalar(0.45));
      this.mesh.setMatrixAt(s.i, _m);
      if (!got && player.pos.distanceTo(s.pos) < player.size * 0.6 + 0.6) {
        s.got = true; this.collected++; got = s;
        const arr = this.spark.geometry.attributes.position;
        arr.setY(s.i, -99999); arr.needsUpdate = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }
}

// ------------------------------------------------------------------ currents
export class Currents {
  constructor(scene) {
    const defs = [
      [[-150, -12, -470], [-60, -9, -540], [40, -12, -600], [140, -10, -690]],
      [[120, -20, -760], [40, -26, -850], [-60, -22, -930], [-150, -28, -1010]],
      [[-160, -35, -860], [-50, -40, -800], [70, -32, -760], [160, -30, -720]],
      [[-100, -8, -150], [-20, -6, -230], [60, -7, -300], [120, -9, -380]],
    ];
    this.list = defs.map((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const N = 240;
      const samples = [], tangents = [];
      for (let i = 0; i <= N; i++) { samples.push(curve.getPointAt(i / N)); tangents.push(curve.getTangentAt(i / N)); }
      return { curve, samples, tangents, len: curve.getLength(), radius: 7, strength: 11 };
    });
    // streak particles flowing along each current
    const per = 260;
    this.per = per;
    const count = per * this.list.length;
    this.params = [];
    const pos = new Float32Array(count * 3);
    for (let c = 0; c < this.list.length; c++) {
      for (let i = 0; i < per; i++) this.params.push({ c, s: Math.random(), off: new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 6), sp: rand(0.6, 1.2) });
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uDay: U.uDay },
      vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_PointSize = 70.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * smoothstep(90.0, 30.0, vD) * 0.55; gl_FragColor = vec4(vec3(0.7, 0.95, 1.0) * a, a); }',
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  setVisible(v) { this.points.visible = v; }
  // returns force vector on player (or null)
  update(dt, player, out) {
    const P = this.posAttr.array;
    for (let i = 0; i < this.params.length; i++) {
      const q = this.params[i];
      const C = this.list[q.c];
      q.s += (dt * C.strength * q.sp) / C.len;
      if (q.s > 1) q.s -= 1;
      const f = q.s * (C.samples.length - 1);
      const i0 = Math.floor(f);
      const a = C.samples[i0], b = C.samples[Math.min(i0 + 1, C.samples.length - 1)];
      const t = f - i0;
      P[i * 3] = a.x + (b.x - a.x) * t + q.off.x;
      P[i * 3 + 1] = Math.min(-0.5, a.y + (b.y - a.y) * t + q.off.y);
      P[i * 3 + 2] = a.z + (b.z - a.z) * t + q.off.z;
    }
    this.posAttr.needsUpdate = true;
    out.set(0, 0, 0);
    let inside = false;
    for (const C of this.list) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < C.samples.length; i += 2) {
        const d = C.samples[i].distanceToSquared(player.pos);
        if (d < best) { best = d; bi = i; }
      }
      const d = Math.sqrt(best);
      if (d < C.radius + player.size) {
        const k = clamp(1 - d / (C.radius + player.size), 0, 1);
        out.addScaledVector(C.tangents[bi], C.strength * (0.4 + 0.6 * k));
        inside = true;
      }
    }
    return inside;
  }
}

// ------------------------------------------------------------------ vents
export class Vents {
  constructor(scene) {
    const mat = std({ color: 0x2a2522, roughness: 0.9 }, {
      key: 'vent', caustics: 0,
      fragEmissive: 'totalEmissiveRadiance += vec3(1.0, 0.35, 0.1) * smoothstep(0.35, 0.5, vObj.y) * (0.7 + 0.3 * sin(uTime * 2.0 + vWPos.x)) * 1.5;',
    });
    const geo = new THREE.CylinderGeometry(0.35, 1.0, 1, 10, 4);
    geo.translate(0, 0.5, 0);
    this.list = [];
    const wormMat = std({ color: 0xffffff, roughness: 0.6 }, {
      key: 'worm', caustics: 0,
      fragDiffuse: 'diffuseColor.rgb = mix(vec3(0.9, 0.88, 0.82), vec3(0.9, 0.1, 0.12), smoothstep(0.85, 0.9, vObj.y));',
      fragEmissive: 'totalEmissiveRadiance += vec3(0.6, 0.05, 0.05) * smoothstep(0.85, 0.95, vObj.y);',
    });
    const wormGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 5);
    wormGeo.translate(0, 0.5, 0);
    const worms = new THREE.InstancedMesh(wormGeo, wormMat, 300);
    let wi = 0;
    for (let i = 0; i < 6; i++) {
      const x = rand(-100, 100), z = rand(-1330, -1100);
      const y = groundHeight(x, z);
      const h = rand(6, 14);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y - 0.5, z);
      m.scale.set(h * 0.25, h, h * 0.25);
      scene.add(m);
      this.list.push({ top: new THREE.Vector3(x, y + h - 0.6, z) });
      for (let k = 0; k < 50 && wi < 300; k++) {
        const a = rand(0, TAU), r = rand(2, 6);
        const wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
        _m.compose(_p.set(wx, groundHeight(wx, wz) - 0.1, wz), _q.setFromEuler(_e.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))), _s.set(1, rand(1.2, 3), 1));
        worms.setMatrixAt(wi++, _m);
      }
    }
    worms.count = wi;
    worms.computeBoundingSphere();
    scene.add(worms);
  }
  update(dt, camPos, bubbles) {
    for (const v of this.list) {
      if (v.top.distanceToSquared(camPos) > 120 * 120) continue;
      if (Math.random() < 0.6) bubbles.spawn(v.top.x + rand(-0.4, 0.4), v.top.y, v.top.z + rand(-0.4, 0.4), rand(-0.2, 0.2), rand(1, 2), rand(-0.2, 0.2), rand(3, 6), rand(0.2, 0.5));
    }
  }
}

export { WORLD };
