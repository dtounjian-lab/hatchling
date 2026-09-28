// Procedural sea turtle: geometry, species shaders, rig and flipper poses.
// Shared by the player, the mate, the title turtle and the instanced crowd.
import * as THREE from 'three';
import { std } from '../core/shared.js';
import { lerp, TAU } from '../core/util.js';

// ---------------------------------------------------------------- geometry
function shellGeo(variant = 'dome') {
  if (variant === 'ridged') {
    // leatherback: seven longitudinal ridges and a long tapered rear point
    const g = new THREE.SphereGeometry(1, 72, 40);
    g.rotateX(Math.PI / 2); // poles front and back so ridges follow longitude lines
    const p = g.attributes.position;
    const R = [0, 0.36, -0.36, 0.74, -0.74, 1.12, -1.12];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y > -0.05) {
        const th = Math.atan2(x, y);
        let b = 0;
        for (const r of R) b = Math.max(b, Math.exp(-Math.pow((th - r) / 0.075, 2)));
        const k = 1 + 0.11 * b * (1 - z * z * 0.7);
        x *= k; y *= k;
      }
      if (y < 0) y *= 0.42;
      if (z < 0) { x *= 1 - 0.42 * Math.pow(-z, 1.4); y *= 1 - 0.3 * z * z; z *= 1.14; }
      y *= 1 + 0.08 * Math.cos(z * 1.4);
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  const g = new THREE.SphereGeometry(1, 64, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rim = Math.exp(-Math.pow(y / 0.14, 2));
    if (y < 0) y *= 0.42;
    const taper = variant === 'round' ? 0.08 : variant === 'serrated' ? 0.3 : 0.24;
    if (z < 0) x *= 1 - taper * Math.pow(-z, 1.6);
    if (variant === 'serrated') {
      // hawksbill: saw-toothed rear margin
      const ang = Math.atan2(z, x);
      const saw = (ang * 13) / (Math.PI * 2) - Math.floor((ang * 13) / (Math.PI * 2));
      const back = Math.min(1, Math.max(0, (-z + 0.1) / 0.6));
      const d = 0.07 * saw * rim * back;
      const l = Math.hypot(x, z) || 1;
      x += (x / l) * d; z += (z / l) * d;
      y *= 1.08;
    }
    if (variant === 'round') x *= 1.03;
    y *= 1 + 0.08 * Math.cos(z * 1.4);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function headGeo(variant = 'normal') {
  const g = new THREE.SphereGeometry(1, 32, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0) { const k = 1 - 0.28 * z * z; x *= k; y *= 1 - 0.18 * z * z; }
    if (y < 0) y *= 0.8;
    if (variant === 'hooked') {
      // hawksbill: narrow, pointed beak whose upper jaw hooks down
      const t = Math.max(0, z - 0.3);
      x *= 1 - t * 0.55;
      z *= 1 + Math.max(0, z) * 0.22;
      if (y > -0.35) y -= t * t * 1.25;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function flipperGeo(width, thick, sweep, side) {
  const g = new THREE.SphereGeometry(1, 26, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (x + 1) / 2;
    const w = width * (0.32 + 0.68 * Math.sin(Math.PI * Math.pow(t, 0.72))) * (1 - 0.55 * Math.pow(t, 2.5)) + 0.02;
    const X = t * side;
    const Z = z * w - sweep * t * t;
    const Y = y * thick * (1 - 0.55 * t) - 0.04 * t * t;
    p.setXYZ(i, X, Y, Z);
  }
  if (side < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  }
  g.computeVertexNormals();
  return g;
}

function tailGeo() {
  const g = new THREE.ConeGeometry(1, 1, 8, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -0.5);
  return g;
}

let GEO = null;
export function turtleGeos() {
  if (GEO) return GEO;
  GEO = {
    shells: { dome: shellGeo('dome'), ridged: shellGeo('ridged'), serrated: shellGeo('serrated'), round: shellGeo('round') },
    heads: { normal: headGeo('normal'), hooked: headGeo('hooked') },
    eye: new THREE.SphereGeometry(1, 16, 12),
    ffR: flipperGeo(0.3, 0.07, 0.34, 1),
    ffL: flipperGeo(0.3, 0.07, 0.34, -1),
    rfR: flipperGeo(0.5, 0.1, 0.12, 1),
    rfL: flipperGeo(0.5, 0.1, 0.12, -1),
    tail: tailGeo(),
  };
  GEO.shell = GEO.shells.dome;
  GEO.head = GEO.heads.normal;
  return GEO;
}

// ---------------------------------------------------------------- shaders
const SHELL_FN = /* glsl */ `
const vec2 SEEDS[13] = vec2[13](
  vec2(0.0, 0.64), vec2(0.0, 0.31), vec2(0.0, -0.01), vec2(0.0, -0.33), vec2(0.0, -0.64),
  vec2(0.49, 0.44), vec2(-0.49, 0.44), vec2(0.57, 0.11), vec2(-0.57, 0.11),
  vec2(0.55, -0.22), vec2(-0.55, -0.22), vec2(0.42, -0.52), vec2(-0.42, -0.52));
vec3 shellPattern(vec3 p, vec3 A, vec3 B, vec3 C, float pat){
  if (p.y < -0.03) {
    vec2 q = p.xz;
    float seam = min(abs(q.x) * 1.4, abs(fract(q.y * 2.3) - 0.5) * 0.7);
    return mix(C * 0.72, C, smoothstep(0.0, 0.05, seam));
  }
  vec2 q = vec2(p.x, p.z);
  if (pat > 1.5 && pat < 2.5) {
    float ridge = 0.0;
    float th = atan(p.x, max(p.y, 0.001));
    for (int k = -3; k <= 3; k++) {
      ridge = max(ridge, 1.0 - smoothstep(0.02, 0.07, abs(th - float(k) * 0.37)));
    }
    float sp = step(0.8, vnoise(q * 30.0)) * (0.5 + 0.5 * vnoise(q * 70.0));
    vec3 col = mix(A, B, sp * 0.55);
    col = mix(col, A * 2.2 + 0.035, ridge * 0.55);
    return col;
  }
  float f1 = 9.0, f2 = 9.0; vec2 s1 = vec2(0.0);
  for (int i = 0; i < 13; i++) {
    float d = length(q - SEEDS[i]);
    if (d < f1) { f2 = f1; f1 = d; s1 = SEEDS[i]; } else if (d < f2) { f2 = d; }
  }
  float seam = f2 - f1;
  float r = length(q * vec2(1.0, 0.96));
  if (r > 0.84) {
    float ang = atan(q.y, q.x);
    float seg = abs(fract(ang * 23.0 / 6.2831853) - 0.5);
    seam = min(abs(r - 0.84) * 2.5, seg * 0.22);
    s1 = normalize(q) * 0.93;
  }
  vec2 d = q - s1 + vec2(0.0, 0.07);
  float ang = atan(d.y, d.x);
  float n = vnoise(q * 9.0 + pat * 3.1);
  float streak = 0.5 + 0.5 * sin(ang * 7.0 + n * 4.0);
  float rings = 0.5 + 0.5 * sin(length(d) * 55.0);
  vec3 col;
  if (pat < 0.5) {
    col = mix(A, B, streak * 0.6 * smoothstep(0.0, 0.25, length(d)) + n * 0.15);
  } else if (pat < 1.5) {
    col = mix(A, B, 0.28 * streak + 0.3 * n);
  } else if (pat < 3.5) {
    float flame = smoothstep(0.3, 0.8, 0.5 + 0.5 * sin(ang * 5.0 + n * 6.0 + length(d) * 9.0));
    col = mix(B, A, flame);
    col = mix(col, vec3(0.05, 0.025, 0.01), smoothstep(0.62, 0.85, vnoise(q * 6.0 + 2.0)) * 0.75);
    // imbricate (overlapping) scutes: each plate is lit at its front lip and shadowed where it tucks under the next
    float lip = (q - s1).y;
    col *= 0.72 + 0.5 * smoothstep(-0.22, 0.14, lip);
  } else {
    col = mix(A, B, 0.22 * n + 0.12 * streak);
  }
  col *= 0.9 + 0.1 * rings;
  float seamLine = 1.0 - smoothstep(0.0, 0.03, seam);
  vec3 seamCol = (pat > 2.5 && pat < 3.5) ? B * 1.25 : (pat < 0.5 ? B * 1.15 : A * 0.5);
  col = mix(col, seamCol, seamLine * 0.8);
  return col;
}
`;

function shellMaterial(instanced) {
  const u = instanced
    ? { uGlow: { value: 0 } }
    : {
      uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() },
      uPat: { value: new THREE.Vector2() }, uGlow: { value: 0 },
    };
  const vHead = instanced
    ? 'attribute vec3 aColA; attribute vec3 aColB; attribute vec3 aColC; attribute vec2 aPat;'
    : 'uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC; uniform vec2 uPat;';
  const vAssign = instanced
    ? 'vColA = aColA; vColB = aColB; vColC = aColC; vPat = aPat;'
    : 'vColA = uColA; vColB = uColB; vColC = uColC; vPat = uPat;';
  return std(
    { roughness: 0.42, metalness: 0.0 },
    {
      key: 'shell' + (instanced ? 'I' : 'S'),
      uniforms: u,
      rim: 0.28,
      caustics: 1.0,
      vertexHead: vHead + 'varying vec3 vColA; varying vec3 vColB; varying vec3 vColC; varying vec2 vPat;',
      vertexTransform: vAssign,
      fragHead: 'uniform float uGlow; varying vec3 vColA; varying vec3 vColB; varying vec3 vColC; varying vec2 vPat;' + SHELL_FN,
      fragDiffuse: `
        vec3 sc = shellPattern(vObj, vColA, vColB, vColC, vPat.x);
        sc *= mix(0.8, 1.0, vPat.y);
        diffuseColor.rgb = sc;
      `,
      fragEmissive: `
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * uGlow * (0.05 + 0.9 * smoothstep(0.0, -0.3, vObj.y)) * (0.75 + 0.25 * sin(uTime * 1.6));
      `,
    }
  );
}

function skinMaterial(instanced) {
  const u = instanced ? {} : { uSkinA: { value: new THREE.Color() }, uSkinB: { value: new THREE.Color() }, uSkinPat: { value: new THREE.Vector2() } };
  const vHead = instanced ? 'attribute vec3 aSkinA; attribute vec3 aSkinB; attribute vec2 aSkinPat;' : 'uniform vec3 uSkinA; uniform vec3 uSkinB; uniform vec2 uSkinPat;';
  const vAssign = instanced ? 'vSkinA = aSkinA; vSkinB = aSkinB; vSkinPat = aSkinPat;' : 'vSkinA = uSkinA; vSkinB = uSkinB; vSkinPat = uSkinPat;';
  return std(
    { roughness: 0.62, metalness: 0.0 },
    {
      key: 'skin' + (instanced ? 'I' : 'S'),
      uniforms: u,
      rim: 0.3,
      caustics: 0.8,
      vertexHead: vHead + 'varying vec3 vSkinA; varying vec3 vSkinB; varying vec2 vSkinPat;',
      vertexTransform: vAssign,
      fragHead: 'varying vec3 vSkinA; varying vec3 vSkinB; varying vec2 vSkinPat;',
      fragDiffuse: `
        vec2 vr = voronoi3(vObj * 5.5);
        float edge = vr.y - vr.x;
        vec3 c;
        if (vSkinPat.x < 0.5) {
          c = mix(mix(vSkinA, vSkinB, 0.7), vSkinA, smoothstep(0.02, 0.13, edge));
        } else {
          float spot = (1.0 - smoothstep(0.12, 0.2, vr.x)) * step(0.6, hash13(floor(vObj * 5.5) + 3.0));
          c = mix(vSkinA, vSkinB, spot * 0.85);
        }
        c = mix(c, vSkinB * 0.95, smoothstep(0.0, -0.7, vObj.y) * 0.35);
        c *= mix(0.78, 1.0, vSkinPat.y);
        diffuseColor.rgb = c;
      `,
    }
  );
}

export function makeTurtleMaterials(instanced) {
  return {
    shell: shellMaterial(instanced),
    skin: skinMaterial(instanced),
    eye: new THREE.MeshStandardMaterial({ color: 0x040507, roughness: 0.12, metalness: 0.0 }),
    hi: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
}

// ---------------------------------------------------------------- rig
// Local transforms for each part at maturity m (0 hatchling .. 1 adult).
export function computeRig(m, shape) {
  const hs = lerp(1.5, 1.0, m) * shape.head;
  const es = lerp(1.8, 1.0, m);
  const fl = lerp(1.1, 1.0, m) * shape.flipper;
  const sw = shape.shellW, sl = shape.shellL;
  const headR = 0.105 * hs;
  const eyeR = 0.03 * es * Math.sqrt(shape.head);
  const r = {
    shell: { p: [0, 0.04, 0], s: [0.4 * sw, lerp(0.25, 0.19, m) * (shape.shellH ?? 1), 0.5 * sl] },
    head: { p: [0, 0.03 + 0.03 * (hs - 1), 0.5 * sl + headR * 0.85], s: [headR * 0.95 * (shape.headW ?? 1), headR * 0.86, headR * (1.22 + shape.snout)] },
    eye: { p: [headR * 0.6, headR * 0.34, headR * 0.5], r: eyeR },
    hi: { p: [headR * 0.6 + eyeR * 0.3, headR * 0.34 + eyeR * 0.45, headR * 0.5 + eyeR * 0.6], r: eyeR * 0.36 },
    ff: { p: [0.31 * sw, -0.005, 0.25 * sl], s: 0.52 * fl },
    rf: { p: [0.21 * sw, -0.015, -0.37 * sl], s: 0.2 * lerp(1.1, 1.0, m) },
    tail: { p: [0, -0.01, -0.44 * sl], s: [0.035, 0.028, 0.11 * lerp(0.7, 1.0, m)] },
  };
  return r;
}

// Flipper pose: returns Euler angles (twist, sweep, elev) for right-side front and rear flippers.
// Left side mirrors sweep and elev.
export function flipperPose(mode, phase, amp, glide, turn, sync, out) {
  const ph = phase * TAU;
  if (mode === 'land') {
    const pr = ph, pl = sync ? ph : ph + Math.PI;
    for (const [k, p] of [['R', pr], ['L', pl]]) {
      out['f' + k].x = 0.25;
      out['f' + k].y = -0.05 + 0.6 * Math.sin(p) * amp;
      out['f' + k].z = -0.14 + 0.3 * Math.max(0, Math.cos(p)) * amp;
      out['r' + k].x = 0.0;
      out['r' + k].y = 1.05 + 0.35 * Math.sin(p + Math.PI) * amp;
      out['r' + k].z = -0.12 + 0.12 * Math.max(0, Math.cos(p + Math.PI)) * amp;
    }
    return out;
  }
  if (mode === 'dig') {
    const s = Math.sin(ph);
    out.fR.set(0.2, 0.35, -0.2); out.fL.set(0.2, 0.35, -0.2);
    out.rR.set(0.0, 1.0 + 0.4 * s, 0.1 + 0.45 * Math.max(0, s));
    out.rL.set(0.0, 1.0 - 0.4 * s, 0.1 + 0.45 * Math.max(0, -s));
    return out;
  }
  // swim: synchronized "flight" stroke blended toward a swept-back glide pose
  const s = Math.sin(ph), c = Math.cos(ph);
  const strokeElev = 0.85 * c * amp + 0.05;
  const strokeSweep = 0.35 + 0.42 * (0.5 - 0.5 * c) * amp - 0.1 * amp;
  const strokeTwist = -0.55 * s * amp;
  const g = glide;
  const fe = lerp(strokeElev, -0.06, g);
  const fs = lerp(strokeSweep, 1.2, g);
  const ft = lerp(strokeTwist, 0.25, g);
  out.fR.set(ft, fs - turn * 0.25, fe);
  out.fL.set(ft, fs + turn * 0.25, fe);
  const re = 0.08 * Math.sin(ph + 1.2) * (1 - g * 0.6);
  out.rR.set(0.0, 1.2 + turn * 0.45, re + turn * 0.2);
  out.rL.set(0.0, 1.2 - turn * 0.45, re - turn * 0.2);
  return out;
}

export function newPose() {
  return { fR: new THREE.Vector3(), fL: new THREE.Vector3(), rR: new THREE.Vector3(), rL: new THREE.Vector3() };
}

// ---------------------------------------------------------------- single model
export class TurtleModel {
  constructor(species) {
    const G = turtleGeos();
    this.mats = makeTurtleMaterials(false);
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.shell = new THREE.Mesh(G.shell, this.mats.shell);
    this.headPivot = new THREE.Group();
    this.head = new THREE.Mesh(G.head, this.mats.skin);
    this.headPivot.add(this.head);
    this.eyeR = new THREE.Mesh(G.eye, this.mats.eye);
    this.eyeL = new THREE.Mesh(G.eye, this.mats.eye);
    this.hiR = new THREE.Mesh(G.eye, this.mats.hi);
    this.hiL = new THREE.Mesh(G.eye, this.mats.hi);
    this.headPivot.add(this.eyeR, this.eyeL, this.hiR, this.hiL);
    this.ffR = new THREE.Mesh(G.ffR, this.mats.skin);
    this.ffL = new THREE.Mesh(G.ffL, this.mats.skin);
    this.rfR = new THREE.Mesh(G.rfR, this.mats.skin);
    this.rfL = new THREE.Mesh(G.rfL, this.mats.skin);
    this.tail = new THREE.Mesh(G.tail, this.mats.skin);
    for (const f of [this.ffR, this.ffL, this.rfR, this.rfL]) f.rotation.order = 'YZX';
    this.body.add(this.shell, this.headPivot, this.ffR, this.ffL, this.rfR, this.rfL, this.tail);
    this.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    this.pose = newPose();
    this.blinkT = 2 + Math.random() * 3;
    this.blink = 0;
    this.maturity = -1;
    this.setSpecies(species);
    this.setMaturity(0);
  }

  setSpecies(sp) {
    this.species = sp;
    const G = turtleGeos();
    this.shell.geometry = G.shells[sp.shellType || 'dome'];
    this.head.geometry = G.heads[sp.headType || 'normal'];
    const c = sp.colors;
    const su = this.mats.shell.userData.uniforms;
    su.uColA.value.set(c.shellA); su.uColB.value.set(c.shellB); su.uColC.value.set(c.plastron);
    su.uPat.value.x = sp.pattern;
    const ku = this.mats.skin.userData.uniforms;
    ku.uSkinA.value.set(c.skinA); ku.uSkinB.value.set(c.skinB); ku.uSkinPat.value.x = sp.skinPattern;
    const m = this.maturity;
    this.maturity = -1;
    this.setMaturity(m < 0 ? 0 : m);
  }

  setMaturity(m) {
    if (Math.abs(m - this.maturity) < 0.002) return;
    this.maturity = m;
    this.mats.shell.userData.uniforms.uPat.value.y = m;
    this.mats.skin.userData.uniforms.uSkinPat.value.y = m;
    const r = computeRig(m, this.species.shape);
    this.rig = r;
    this.shell.position.fromArray(r.shell.p); this.shell.scale.fromArray(r.shell.s);
    this.headPivot.position.fromArray(r.head.p);
    this.head.scale.fromArray(r.head.s);
    this.eyeR.position.set(r.eye.p[0], r.eye.p[1], r.eye.p[2]);
    this.eyeL.position.set(-r.eye.p[0], r.eye.p[1], r.eye.p[2]);
    this.hiR.position.set(r.hi.p[0], r.hi.p[1], r.hi.p[2]);
    this.hiL.position.set(-r.hi.p[0] + (r.hi.p[0] - r.eye.p[0]) * 2, r.hi.p[1], r.hi.p[2]);
    this.eyeR.scale.setScalar(r.eye.r); this.eyeL.scale.setScalar(r.eye.r);
    this.hiR.scale.setScalar(r.hi.r); this.hiL.scale.setScalar(r.hi.r);
    this.ffR.position.set(r.ff.p[0], r.ff.p[1], r.ff.p[2]);
    this.ffL.position.set(-r.ff.p[0], r.ff.p[1], r.ff.p[2]);
    this.ffR.scale.setScalar(r.ff.s); this.ffL.scale.setScalar(r.ff.s);
    this.rfR.position.set(r.rf.p[0], r.rf.p[1], r.rf.p[2]);
    this.rfL.position.set(-r.rf.p[0], r.rf.p[1], r.rf.p[2]);
    this.rfR.scale.setScalar(r.rf.s); this.rfL.scale.setScalar(r.rf.s);
    this.tail.position.fromArray(r.tail.p); this.tail.scale.fromArray(r.tail.s);
  }

  setGlow(v) { this.mats.shell.userData.uniforms.uGlow.value = v; }

  // a: { mode, phase, amp, glide, turn, headYaw, headPitch }
  animate(dt, a) {
    const P = flipperPose(a.mode, a.phase, a.amp, a.glide ?? 0, a.turn ?? 0, this.species.gaitSync, this.pose);
    this.ffR.rotation.set(P.fR.x, P.fR.y, P.fR.z);
    this.ffL.rotation.set(P.fL.x, -P.fL.y, -P.fL.z);
    this.rfR.rotation.set(P.rR.x, P.rR.y, P.rR.z);
    this.rfL.rotation.set(P.rL.x, -P.rL.y, -P.rL.z);
    this.headPivot.rotation.set(-(a.headPitch ?? 0), a.headYaw ?? 0, 0, 'YXZ');
    this.tail.rotation.y = Math.sin(a.phase * TAU) * 0.2 * a.amp;

    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2.5 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const bl = 1 - Math.sin(this.blink * Math.PI) * 0.9;
    const er = this.rig.eye.r;
    this.eyeR.scale.set(er, er * bl, er); this.eyeL.scale.set(er, er * bl, er);
    this.hiR.visible = this.hiL.visible = bl > 0.5;
  }
}
