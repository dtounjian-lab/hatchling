// Eggs, collectible shells, ocean currents and deep-sea vents.
import * as THREE from 'three';
import { std, U } from '../core/shared.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    const mat = std({ color: 0xcdbfa3, roughness: 0.8 }, {
      key: 'egg', caustics: 0, rim: 0.2,
      vertexHead: 'attribute float aCrack; varying float vCrack;',
      vertexTransform: 'vCrack = aCrack;',
      fragHead: 'varying float vCrack;',
      fragDiffuse: /* glsl */ `
        float lines = abs(sin(vObj.x * 18.0 + sin(vObj.z * 14.0) * 2.0 + vObj.y * 6.0));
        float mask = smoothstep(1.0 - vCrack * 1.6, 1.0 - vCrack * 1.6 + 0.2, vObj.y);
        float crack = (1.0 - smoothstep(0.0, 0.12, lines)) * mask * step(0.01, vCrack);
        vec3 base = diffuseColor.rgb * (0.88 + 0.12 * vnoise(vObj.xy * 20.0));
        base = mix(base, vec3(0.55, 0.48, 0.38), smoothstep(-0.1, -0.8, vObj.y) * 0.8);
        base = mix(base, vec3(0.6, 0.53, 0.42), step(0.7, vnoise(vObj.xz * 26.0 + vObj.y * 9.0)) * 0.6);
        diffuseColor.rgb = mix(base, vec3(0.12, 0.09, 0.06), crack);
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

// ------------------------------------------------------------------ shark teeth and sea glass
function toothGeo() {
  const sh = new THREE.Shape();
  // a fossil tooth: broad root, triangular blade with a slightly curved tip
  sh.moveTo(-0.4, 0);
  sh.quadraticCurveTo(-0.44, -0.2, -0.22, -0.22);
  sh.lineTo(0.22, -0.22);
  sh.quadraticCurveTo(0.44, -0.2, 0.4, 0);
  sh.quadraticCurveTo(0.12, 0.5, 0.03, 1.1);
  sh.lineTo(-0.01, 1.1);
  sh.quadraticCurveTo(-0.16, 0.5, -0.4, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, -0.3, -0.04);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
function glassGeo() {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.12 * Math.sin(x * 4 + z * 3) * Math.cos(y * 5);
    p.setXYZ(i, x * n * 1.1, y * n * 0.38, z * n * 0.8);
  }
  g.computeVertexNormals();
  return g;
}

export class Shells {
  constructor(scene) {
    this.items = [];
    const add = (kind, x, z, lift) => this.items.push({ kind, pos: new THREE.Vector3(x, groundHeight(x, z) + lift, z), got: false, ph: rand(0, 10), land: z > -1 });
    // the beach: teeth and glass wash up along the tide line and scatter up the sand
    for (let i = 0; i < 8; i++) add('tooth', rand(-26, 26), rand(4, 54), 0.06);
    for (let i = 0; i < 6; i++) add('glass', rand(-26, 26), rand(2, 30), 0.06);
    const zones = [[-95, -410, 7, 5], [-430, -710, 3, 3], [-730, -1040, 3, 2], [-1060, -1350, 3, 2]];
    for (const [z0, z1, nt, ng] of zones) {
      for (let i = 0; i < nt; i++) add('tooth', rand(-140, 140) * (z0 > -100 ? 0.5 : 1), rand(z1, z0), 0.25);
      for (let i = 0; i < ng; i++) add('glass', rand(-140, 140) * (z0 > -100 ? 0.5 : 1), rand(z1, z0), 0.25);
    }
    this.totalTeeth = this.items.filter((i) => i.kind === 'tooth').length;
    this.totalGlass = this.items.filter((i) => i.kind === 'glass').length;
    this.teeth = 0; this.glass = 0;
    const toothMat = std({ color: 0xffffff, roughness: 0.28, metalness: 0.1 }, {
      key: 'tooth', rim: 0.6,
      fragDiffuse: 'diffuseColor.rgb *= 0.8 + 0.3 * vnoise(vObj.xz * 14.0); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.2, 0.12), smoothstep(0.1, 0.35, vObj.z) * 0.8);',
      fragEmissive: 'totalEmissiveRadiance += vec3(0.5, 0.55, 0.65) * 0.12 * (0.6 + 0.4 * sin(uTime * 3.0 + vWPos.x));',
    });
    const glassMat = std({ color: 0xffffff, roughness: 0.5, transparent: true, opacity: 0.88 }, {
      key: 'seaglass', rim: 1.1,
      fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * (0.35 + 0.2 * sin(uTime * 2.5 + vWPos.z));',
    });
    const teeth = this.items.filter((i) => i.kind === 'tooth');
    const glass = this.items.filter((i) => i.kind === 'glass');
    this.toothMesh = new THREE.InstancedMesh(toothGeo(), toothMat, teeth.length);
    this.glassMesh = new THREE.InstancedMesh(glassGeo(), glassMat, glass.length);
    const c = new THREE.Color();
    teeth.forEach((t, i) => { t.i = i; t.mesh = this.toothMesh; this.toothMesh.setColorAt(i, c.set(['#2b2d33', '#3d3a36', '#4a4f5a', '#5b4a3a'][i % 4])); });
    glass.forEach((t, i) => { t.i = i; t.mesh = this.glassMesh; this.glassMesh.setColorAt(i, c.set(['#7fc79a', '#a0e0d6', '#e8f4ef', '#9a6a3a', '#4f7fe0'][i % 5])); });
    for (const m of [this.toothMesh, this.glassMesh]) { m.frustumCulled = false; scene.add(m); }
    // sparkles
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.items.flatMap((p) => [p.pos.x, p.pos.y + 0.25, p.pos.z]), 3));
    this.sparkMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime },
      vertexShader: 'uniform float uTime; varying float vT; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vT = 0.5 + 0.5 * sin(uTime * 4.0 + position.x); gl_PointSize = (60.0 + 40.0 * vT) / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vT; void main(){ vec2 c = gl_PointCoord - 0.5; float s = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2); s += smoothstep(0.25, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * s * vT * 1.4, s); }',
    });
    this.spark = new THREE.Points(g, this.sparkMat);
    this.spark.frustumCulled = false;
    scene.add(this.spark);
    this.land = false; this.sea = false;
  }
  get collected() { return this.teeth + this.glass; }
  get total() { return this.totalTeeth + this.totalGlass; }
  setVisible(land, sea = land) {
    this.land = land; this.sea = sea;
    const any = land || sea;
    this.toothMesh.visible = this.glassMesh.visible = this.spark.visible = any;
  }
  update(time, player) {
    let got = null;
    const arr = this.spark.geometry.attributes.position;
    let dirty = false;
    for (const s of this.items) {
      const show = !s.got && (s.land ? this.land : this.sea);
      if (!show) {
        s.mesh.setMatrixAt(s.i, ZERO);
        if (arr.getY(this.items.indexOf(s)) > -9999) { arr.setY(this.items.indexOf(s), -99999); dirty = true; }
        continue;
      }
      const idx = this.items.indexOf(s);
      if (arr.getY(idx) < -9999) { arr.setY(idx, s.pos.y + 0.25); dirty = true; }
      const sc = (s.land ? 0.22 : 0.45) * (s.kind === 'glass' ? 0.7 : 1);
      _q.setFromEuler(_e.set(0, time * (s.land ? 0 : 0.8) + s.ph, 0));
      _p.copy(s.pos); if (!s.land) _p.y += Math.sin(time * 1.5 + s.ph) * 0.1;
      _m.compose(_p, _q, _s.setScalar(sc));
      s.mesh.setMatrixAt(s.i, _m);
      if (!got && player.pos.distanceTo(s.pos) < player.size * 0.6 + (s.land ? 0.35 : 0.6)) {
        s.got = true; got = s;
        if (s.kind === 'tooth') this.teeth++; else this.glass++;
        arr.setY(idx, -99999); dirty = true;
      }
    }
    if (dirty) arr.needsUpdate = true;
    this.toothMesh.instanceMatrix.needsUpdate = true;
    this.glassMesh.instanceMatrix.needsUpdate = true;
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
      [[140, -6, -110], [60, -7, -180], [-40, -8, -260], [-130, -7, -330]],
      [[-150, -5, -440], [-40, -4, -500], [70, -5, -560], [160, -6, -640]],
      // a homeward current that helps on the journey back to Casey Key
      [[-40, -14, -690], [-25, -11, -520], [10, -9, -330], [0, -7, -150], [5, -5, -70]],
    ];
    this.list = defs.map((pts, ci) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const N = 240;
      const samples = [], tangents = [];
      for (let i = 0; i <= N; i++) { samples.push(curve.getPointAt(i / N)); tangents.push(curve.getTangentAt(i / N)); }
      return { curve, samples, tangents, len: curve.getLength(), radius: 8, strength: 13, home: ci === defs.length - 1 };
    });
    // streak particles flowing along each current
    const per = 300;
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
      vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_PointSize = 150.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * smoothstep(110.0, 30.0, vD) * 0.75; gl_FragColor = vec4(vec3(0.75, 1.0, 1.0) * a, a); }',
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  setVisible(v) { this.points.visible = v; }
  // returns force vector on player (or null)
  update(dt, player, out, allowHome = false) {
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
      P[i * 3 + 1] = C.home && !allowHome ? -99999 : Math.min(-0.5, a.y + (b.y - a.y) * t + q.off.y);
      P[i * 3 + 2] = a.z + (b.z - a.z) * t + q.off.z;
    }
    this.posAttr.needsUpdate = true;
    out.set(0, 0, 0);
    let inside = false;
    for (const C of this.list) {
      if (C.home && !allowHome) continue;
      let best = 1e9, bi = 0;
      for (let i = 0; i < C.samples.length; i += 2) {
        const d = C.samples[i].distanceToSquared(player.pos);
        if (d < best) { best = d; bi = i; }
      }
      const d = Math.sqrt(best);
      if (d < C.radius + player.size) {
        const k = clamp(1 - d / (C.radius + player.size), 0, 1);
        const u = bi / (C.samples.length - 1);
        const ends = Math.min(1, u / 0.06, (1 - u) / 0.12);
        if (ends <= 0.05) continue;
        out.addScaledVector(C.tangents[bi], C.strength * (0.4 + 0.6 * k) * ends);
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
