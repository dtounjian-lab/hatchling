// The dangers of the run: diving gulls, sideways-scuttling ghost crabs and
// huge, oblivious humans whose footsteps shake the sand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from '../world/terrain.js';
import { MOON_DIR } from '../world/sky.js';
import { rand, pick, clamp, damp, dampAngle, TAU, lerp } from '../core/util.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

// ------------------------------------------------------------------ decals
function decalMaterial(color, additive = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uA: { value: 0 }, uColor: { value: new THREE.Color(color) }, uRing: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uA; uniform vec3 uColor; uniform float uRing; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d);
        a = mix(a, smoothstep(1.0, 0.85, d) * smoothstep(0.6, 0.8, d) + a * 0.5, uRing);
        gl_FragColor = vec4(uColor * (${additive ? 'a * uA' : '1.0'}), a * uA); }`,
  });
}
function decal(scene, size, color, additive) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), decalMaterial(color, additive));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  scene.add(m);
  return m;
}

// ------------------------------------------------------------------ gull
function makeGull() {
  const white = std({ color: 0xf2f2ee, roughness: 0.8 }, { key: 'gullw', caustics: 0, rim: 0.3 });
  const wingMat = std({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }, {
    key: 'gullwing', caustics: 0, rim: 0.3,
    fragDiffuse: /* glsl */ `
      float tip = smoothstep(2.5, 2.8, abs(vObj.x));
      vec3 top = mix(vec3(0.62, 0.66, 0.7), vec3(0.06), tip);
      diffuseColor.rgb = mix(vec3(0.93), top, step(0.0, vObj.y) * 0.9 + tip * 0.1);
    `,
  });
  const beakMat = std({ color: 0xf2c230, roughness: 0.5 }, { key: 'gullbeak', caustics: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), white);
  body.scale.set(0.34, 0.34, 0.95);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), white);
  head.position.set(0, 0.22, 0.85);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), beakMat);
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.18, 1.18);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dark); eyeL.position.set(0.15, 0.3, 0.98);
  const eyeR = eyeL.clone(); eyeR.position.x = -0.15;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), wingMat);
  tail.scale.set(0.26, 0.03, 0.35); tail.position.set(0, 0.05, -0.95);
  const wingGeo = (side) => {
    const g = new THREE.SphereGeometry(1, 24, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (x + 1) / 2;
      const w = 0.62 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.4))) * (1 - Math.pow(t, 3) * 0.92);
      const X = t * 3.3 * side;
      const Z = z * w - t * t * 1.1 + 0.1;
      const Y = y * 0.06 * (1 - t * 0.7) + Math.sin(t * Math.PI) * 0.18 - t * t * 0.25;
      p.setXYZ(i, X, Y, Z);
    }
    if (side < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const a = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = a; } }
    g.computeVertexNormals();
    return g;
  };
  const wgL = new THREE.Group(), wgR = new THREE.Group();
  const wl = new THREE.Mesh(wingGeo(1), wingMat);
  const wr = new THREE.Mesh(wingGeo(-1), wingMat);
  wgL.add(wl); wgR.add(wr);
  wgL.position.set(0.22, 0.12, 0.1); wgR.position.set(-0.22, 0.12, 0.1);
  g.add(body, head, beak, eyeL, eyeR, tail, wgL, wgR);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  g.scale.setScalar(1.35);
  return { g, wgL, wgR };
}

// ------------------------------------------------------------------ crab
function crabGeo() {
  const parts = [];
  const leg = [];
  const push = (geo, legIdx) => { const n = NI(geo); const c = n.attributes.position.count; parts.push(n); leg.push(...new Array(c).fill(legIdx)); };
  const body = new THREE.SphereGeometry(1, 16, 10);
  body.scale(0.48, 0.2, 0.36);
  body.translate(0, 0.32, 0);
  push(body, -1);
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 4; k++) {
      const l1 = new THREE.CylinderGeometry(0.035, 0.045, 0.5, 5);
      l1.translate(0, -0.25, 0);
      l1.rotateZ(s * 1.05);
      l1.translate(s * 0.35, 0.34, -0.24 + k * 0.16);
      push(l1, k + (s > 0 ? 4 : 0));
      const l2 = new THREE.CylinderGeometry(0.02, 0.035, 0.55, 5);
      l2.translate(0, -0.27, 0);
      l2.rotateZ(s * 0.25);
      l2.translate(s * 0.78, 0.13, -0.24 + k * 0.16);
      push(l2, k + (s > 0 ? 4 : 0));
    }
    const claw = new THREE.SphereGeometry(s > 0 ? 0.17 : 0.11, 10, 8);
    claw.scale(1.1, 0.8, 1.4);
    claw.translate(s * 0.28, 0.3, 0.46);
    push(claw, -1);
    const stalk = new THREE.CylinderGeometry(0.02, 0.025, 0.28, 5);
    stalk.translate(s * 0.13, 0.55, 0.26);
    push(stalk, -1);
    const eye = new THREE.SphereGeometry(0.06, 8, 6);
    eye.translate(s * 0.13, 0.72, 0.26);
    push(eye, -2);
  }
  const g = mergeGeometries(parts);
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 1));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ human
const SKIN = ['#8d5a3b', '#c68863', '#e0ac85', '#5c3a26', '#f1c7a6', '#a86d4a'];
const PANTS = ['#2d4a6b', '#6b2d3a', '#3f5f3f', '#c9b18a', '#222831', '#7b5ea7', '#d06a3c'];

function makeHuman() {
  const skin = std({ color: pick(SKIN), roughness: 0.7 }, { key: 'hskin', caustics: 0, rim: 0.25 });
  const cloth = std({ color: pick(PANTS), roughness: 0.9 }, { key: 'hcloth', caustics: 0, rim: 0.2 });
  const top = std({ color: pick(PANTS), roughness: 0.9 }, { key: 'htop', caustics: 0, rim: 0.2 });
  const L = 2.2;
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);
  const shorts = new THREE.Mesh(new THREE.CapsuleGeometry(0.92, 0.7, 6, 18), cloth);
  shorts.scale.set(1, 1, 0.72);
  shorts.position.y = 0.25;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.9, 8, 18), top);
  torso.scale.set(1, 1, 0.62);
  torso.position.y = 2.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), skin);
  head.scale.set(0.9, 1.08, 0.95);
  head.position.y = 4.4;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), std({ color: pick(['#1d1510', '#3a2616', '#6b4a2a', '#c9a060']), roughness: 0.9 }, { key: 'hhair', caustics: 0 }));
  hair.position.y = 4.48;
  pelvis.add(hair);
  pelvis.add(shorts, torso, head);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.48, 0, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, L - 0.6, 6, 16), skin);
    thigh.position.y = -L / 2;
    const knee = new THREE.Group(); knee.position.y = -L;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, L - 0.5, 6, 16), skin);
    shin.scale.set(1, 1, 1.05);
    shin.position.y = -L / 2;
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), skin);
    knee.add(kneeCap);
    const ankle = new THREE.Group(); ankle.position.y = -L;
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), skin);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.5, 1, 0.9); foot.position.set(0, -0.12, 0.38);
    ankle.add(foot); knee.add(shin, ankle); hip.add(thigh, knee); pelvis.add(hip);
    legs.push({ hip, knee, ankle, prevC: 0, side: s });
    // arms
    const sh = new THREE.Group(); sh.position.set(s * 1.25, 3.4, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 2.3, 6, 12), skin);
    arm.position.y = -1.3;
    sh.add(arm); pelvis.add(sh);
    legs[legs.length - 1].arm = sh;
  }
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, pelvis, legs, legLen: 2 * L };
}

function humanShadowMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uStride: { value: 0 }, uA: { value: 0.55 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uStride; uniform float uA; varying vec2 vUv;
      void main(){
        float v = vUv.y; float x = (vUv.x - 0.5) * 2.0;
        float legs = v < 0.42 ? min(abs(x - 0.28 - uStride * (0.42 - v)), abs(x + 0.28 + uStride * (0.42 - v))) : 9.0;
        float legM = 1.0 - smoothstep(0.1, 0.18, legs);
        float body = (1.0 - smoothstep(0.42, 0.62, abs(x))) * step(0.4, v) * (1.0 - smoothstep(0.86, 0.9, v));
        float head = 1.0 - smoothstep(0.14, 0.2, length(vec2(x * 0.9, (v - 0.94) * 3.2)));
        float a = max(max(legM, body), head) * smoothstep(1.0, 0.6, v + 0.05) * uA;
        a *= smoothstep(0.0, 0.03, v);
        gl_FragColor = vec4(0.0, 0.0, 0.02, a);
      }`,
  });
}

export class BeachLife {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    // gulls
    this.gulls = [];
    for (let i = 0; i < 3; i++) {
      const m = makeGull();
      this.group.add(m.g);
      const tele = decal(this.group, 1, 0x000000);
      const shadow = decal(this.group, 1, 0x000000);
      this.gulls.push({ ...m, pos: new THREE.Vector3(rand(-15, 15), 16, rand(15, 50)), state: 'circle', t: rand(0, 10), cool: rand(3, 7), ang: rand(0, TAU), center: new THREE.Vector3(rand(-8, 8), 0, rand(18, 44)), target: null, strike: new THREE.Vector3(), carry: null, tele, shadow, flap: rand(0, 10), yaw: 0, pitch: 0 });
    }
    // crabs
    const cg = crabGeo();
    this.crabs = [];
    const spots = [[-4, 50], [5, 42], [-6, 33], [3, 26], [-2, 17], [7, 10], [-8, 8], [9, 22]];
    for (const [x, z] of spots) {
      const mat = std({ color: 0xdccfb2, roughness: 0.55 }, {
        key: 'ghostcrab', caustics: 0, rim: 0.35,
        uniforms: { uPh: { value: 0 }, uAmp: { value: 0 } },
        vertexHead: 'attribute float aLeg; uniform float uPh; uniform float uAmp; varying float vLeg;',
        vertexTransform: /* glsl */ `
          vLeg = aLeg;
          if (aLeg >= 0.0) { float lp = uPh + aLeg * 1.7; transformed.y += max(0.0, sin(lp)) * 0.14 * uAmp * max(0.0, 0.4 - position.y) * 2.0; transformed.z += cos(lp) * 0.06 * uAmp; }`,
        fragHead: 'varying float vLeg;',
        fragDiffuse: 'if (vLeg < -1.5) diffuseColor.rgb = vec3(0.02);',
      });
      const mesh = new THREE.Mesh(cg, mat);
      mesh.frustumCulled = false;
      mesh.scale.setScalar(1.15);
      this.group.add(mesh);
      const burrow = decal(this.group, 1.1, 0x14100a);
      const bp = new THREE.Vector3(x, groundHeight(x, z), z);
      burrow.position.set(x, bp.y + 0.03, z);
      burrow.material.uniforms.uA.value = 0.8;
      this.crabs.push({ mesh, mat, home: bp, pos: bp.clone(), yaw: rand(0, TAU), state: 'idle', t: rand(0, 3), target: null, carry: null, ph: 0 });
    }
    // humans
    this.humans = [];
    const lanes = [[16, 1, -30], [31, -1, 25], [45, 1, 5]];
    for (const [z, dir, x] of lanes) {
      const h = makeHuman();
      this.group.add(h.root);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), humanShadowMat());
      shadow.renderOrder = 3;
      this.group.add(shadow);
      const pool = decal(this.group, 7, 0xfff1c9, true);
      const beamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = f * (0.15 + 0.85 * vUv.y) * 0.1; gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a); }',
      });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.8, 7, 24, 1, true), beamMat);
      this.group.add(beam);
      this.humans.push({ ...h, shadow, pool, beam, pos: new THREE.Vector3(x, 0, z), dir, speed: rand(3.4, 4.2), ph: rand(0, TAU), yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, turning: 0, laneZ: z, light: z !== 31 });
    }
    this.shadowDir = new THREE.Vector2(-MOON_DIR.x, -MOON_DIR.z).normalize();
    this.active = false;
    this.setVisible(false);
  }

  setVisible(v) { this.group.visible = v; }

  // let go of the player (she wriggled free)
  release() {
    for (const g of this.gulls) if (g.carry && g.carry.isPlayer) g.carry = null;
    for (const c of this.crabs) if (c.carry && c.carry.isPlayer) { c.carry = null; c.state = 'return'; c.t = 0; }
  }

  reset() {
    for (const g of this.gulls) { g.state = 'circle'; g.cool = rand(3, 6); g.target = null; if (g.carry) g.carry = null; }
    for (const c of this.crabs) { c.state = 'idle'; c.pos.copy(c.home); c.target = null; c.carry = null; }
  }

  // targets: [{ pos, isPlayer, agent, alive }]
  // events: callbacks { onCatch(target, byWhat), onThud(pos, strength), onGullCry(pos), onCrab(pos) }
  update(dt, time, targets, ev, player) {
    if (!this.group.visible) return;
    const live = targets.filter((t) => t.alive());
    // ---- gulls
    for (const g of this.gulls) {
      g.t += dt; g.flap += dt;
      let flapSpeed = 5, flapAmp = 0.6, glide = 0;
      if (g.state === 'circle') {
        g.ang += dt * 0.35;
        const want = new THREE.Vector3(g.center.x + Math.cos(g.ang) * 11, 15 + Math.sin(g.t * 0.5) * 2, g.center.z + Math.sin(g.ang) * 11);
        g.pos.lerp(want, 1 - Math.exp(-1.5 * dt));
        glide = 0.6 + 0.4 * Math.sin(g.t * 0.7);
        g.cool -= dt;
        if (g.cool <= 0 && live.length) {
          // prefer the player a third of the time, otherwise a sibling
          const cand = live.filter((t) => Math.abs(t.pos.z - g.center.z) < 30);
          const pl = cand.find((t) => t.isPlayer);
          const tgt = pl && Math.random() < 0.28 ? pl : pick(cand.length ? cand : live);
          if (tgt) { g.target = tgt; g.state = 'windup'; g.t = 0; ev.onGullCry && ev.onGullCry(g.pos); if (tgt.isPlayer && ev.onGullTarget) ev.onGullTarget(); }
          else g.cool = 2;
        }
      } else if (g.state === 'windup') {
        const tp = g.target.pos;
        g.strike.copy(tp);
        if (g.target.vel) g.strike.addScaledVector(g.target.vel, 0.5);
        g.strike.y = groundHeight(g.strike.x, g.strike.z);
        const hover = g.strike.clone().add(new THREE.Vector3(0, 9, -6));
        g.pos.lerp(hover, 1 - Math.exp(-2.2 * dt));
        flapSpeed = 9; flapAmp = 0.8;
        const k = Math.min(1, g.t / 1.8);
        g.tele.visible = true;
        g.tele.position.set(g.strike.x, g.strike.y + 0.05, g.strike.z);
        g.tele.scale.setScalar(lerp(3.2, 1.6, k));
        g.tele.material.uniforms.uA.value = 0.25 + 0.45 * k;
        g.tele.material.uniforms.uRing.value = 1;
        if (g.t > 1.8 || !g.target.alive()) { g.state = g.target.alive() ? 'dive' : 'rise'; g.t = 0; g.from = g.pos.clone(); }
      } else if (g.state === 'dive') {
        const k = Math.min(1, g.t / 0.55);
        g.pos.lerpVectors(g.from, g.strike.clone().add(new THREE.Vector3(0, 0.6, 0)), k * k);
        flapAmp = 0.1; glide = 1;
        g.tele.material.uniforms.uA.value = 0.7;
        if (k >= 1) {
          const tp = g.target.pos;
          const dx = tp.x - g.strike.x, dz = tp.z - g.strike.z;
          const lucky = !g.target.isPlayer && Math.random() < 0.55;
          if (g.target.alive() && !lucky && dx * dx + dz * dz < (g.target.isPlayer ? 0.7 : 0.85) ** 2 && !(g.target.isPlayer && player.invuln > 0)) {
            g.carry = g.target;
            ev.onCatch && ev.onCatch(g.target, 'gull', g.pos);
          }
          ev.onGullCry && ev.onGullCry(g.pos);
          g.state = 'rise'; g.t = 0; g.tele.visible = false;
        }
      } else if (g.state === 'rise') {
        g.pos.y += dt * 7; g.pos.z += dt * 3;
        flapSpeed = 11; flapAmp = 0.9;
        if (g.carry && g.carry.agent) { g.carry.agent.pos.copy(g.pos).add(new THREE.Vector3(0, -0.5, 1.1)); }
        if (g.t > 2.2) {
          if (g.carry && g.carry.agent) g.carry.agent.active = false;
          g.carry = null; g.state = 'circle'; g.cool = rand(4, 7);
        }
      }
      // orientation from motion
      const vx = Math.cos(g.ang + Math.PI / 2), vz = Math.sin(g.ang + Math.PI / 2);
      let wantYaw = Math.atan2(vx, vz);
      if (g.state !== 'circle') wantYaw = Math.atan2(g.strike.x - g.pos.x, g.strike.z - g.pos.z);
      g.yaw = dampAngle(g.yaw, wantYaw, 3, dt);
      g.pitch = damp(g.pitch, g.state === 'dive' ? 0.9 : g.state === 'rise' ? -0.5 : 0, 5, dt);
      g.g.position.copy(g.pos);
      g.g.rotation.set(g.pitch, g.yaw, g.state === 'circle' ? -0.35 : 0, 'YXZ');
      const fl = Math.sin(g.flap * flapSpeed) * flapAmp * (1 - glide) + (glide ? 0.12 : 0);
      g.wgL.rotation.z = fl; g.wgR.rotation.z = -fl;
      if (g.state === 'dive') { g.wgL.rotation.z = 0.9; g.wgR.rotation.z = -0.9; }
      // soft shadow under gull
      const gy = groundHeight(g.pos.x, g.pos.z);
      g.shadow.position.set(g.pos.x, gy + 0.04, g.pos.z);
      const hgt = g.pos.y - gy;
      g.shadow.scale.setScalar(2.5 + hgt * 0.15);
      g.shadow.material.uniforms.uA.value = clamp(0.5 - hgt * 0.02, 0.12, 0.5);
      if (g.state !== 'windup' && g.state !== 'dive') g.tele.visible = false;
    }

    // ---- crabs
    for (const c of this.crabs) {
      c.t += dt;
      let amp = 0, speed = 0;
      if (c.state === 'idle') {
        c.yaw += Math.sin(time * 0.7 + c.home.x) * dt * 0.4;
        if (c.t > 1) {
          let best = null, bd = 1e9;
          for (const t of live) {
            const d = t.pos.distanceToSquared(c.pos);
            const R = t.isPlayer ? 4.2 : 2.6;
            if (d < R * R && d < bd && !(t.isPlayer && player.invuln > 0)) { bd = d; best = t; }
          }
          if (best) { c.target = best; c.lucky = !best.isPlayer && Math.random() < 0.5; c.state = 'charge'; c.t = 0; ev.onCrab && ev.onCrab(c.pos); }
        }
      } else if (c.state === 'charge') {
        const tp = c.target.pos;
        const dx = tp.x - c.pos.x, dz = tp.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        speed = c.target.isPlayer ? 3.0 : 3.4; amp = 1;
        // body sideways to motion: crab faces 90 degrees off travel direction
        c.yaw = dampAngle(c.yaw, Math.atan2(dx, dz) + Math.PI / 2, 6, dt);
        if (d > 0.01) { c.pos.x += (dx / d) * speed * dt; c.pos.z += (dz / d) * speed * dt; }
        if (d < 0.45 && c.target.alive() && !(c.target.isPlayer && player.invuln > 0) && !c.lucky) {
          c.carry = c.target;
          ev.onCatch && ev.onCatch(c.target, 'crab', c.pos);
          c.state = 'return'; c.t = 0;
        } else if (c.t > 1.5 || !c.target.alive()) { c.state = 'return'; c.t = 0; }
      } else if (c.state === 'return') {
        const dx = c.home.x - c.pos.x, dz = c.home.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        speed = 2.2; amp = 0.8;
        c.yaw = dampAngle(c.yaw, Math.atan2(dx, dz) - Math.PI / 2, 5, dt);
        if (d > 0.1) { c.pos.x += (dx / d) * speed * dt; c.pos.z += (dz / d) * speed * dt; }
        if (c.carry && c.carry.agent) c.carry.agent.pos.copy(c.pos).add(new THREE.Vector3(0, 0.2, 0));
        if (d < 0.2) {
          if (c.carry && c.carry.agent) c.carry.agent.active = false;
          c.carry = null;
          if (c.t > 3.2) { c.state = 'idle'; c.t = 0; }
        }
      }
      c.ph += dt * (speed * 5 + 1);
      c.mat.userData.uniforms.uPh.value = c.ph;
      c.mat.userData.uniforms.uAmp.value = amp;
      c.pos.y = groundHeight(c.pos.x, c.pos.z);
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.set(0, c.yaw, 0);
    }

    // ---- humans
    for (const h of this.humans) {
      if (h.turning > 0) {
        h.turning -= dt;
        h.yaw = dampAngle(h.yaw, h.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 2.5, dt);
      } else {
        h.pos.x += h.dir * h.speed * dt;
        if (Math.abs(h.pos.x) > 55 && Math.sign(h.pos.x) === h.dir) { h.dir *= -1; h.turning = 1.6; h.laneZ += rand(-4, 4); h.laneZ = clamp(h.laneZ, 12, 50); }
      }
      h.pos.z = damp(h.pos.z, h.laneZ + Math.sin(time * 0.1 + h.speed) * 2, 0.5, dt);
      const moving = h.turning <= 0 ? 1 : 0.2;
      const L = 2.2, A = 0.42;
      const omega = (h.speed * Math.PI) / (2 * 2 * L * Math.sin(A));
      h.ph += dt * omega * moving;
      const gy = groundHeight(h.pos.x, h.pos.z);
      h.root.position.set(h.pos.x, gy, h.pos.z);
      h.root.rotation.y = h.yaw;
      h.pelvis.position.y = h.legLen - 0.15 + 0.12 * Math.cos(2 * h.ph) * moving;
      for (const [i, lg] of h.legs.entries()) {
        const p = h.ph + i * Math.PI;
        const s = Math.sin(p), c = Math.cos(p);
        const hipA = A * s * moving;
        const knee = 1.05 * Math.max(0, c) * Math.max(0, Math.sin(p + 0.6)) * moving + 0.08;
        lg.hip.rotation.x = -hipA;
        lg.knee.rotation.x = knee;
        lg.ankle.rotation.x = hipA - knee * 0.8;
        lg.arm.rotation.x = hipA * 0.8;
        // foot strike: swing -> stance
        if (lg.prevC > 0 && c <= 0 && moving > 0.5) {
          const fp = new THREE.Vector3();
          lg.ankle.getWorldPosition(fp);
          fp.y = groundHeight(fp.x, fp.z);
          ev.onThud && ev.onThud(fp, 1);
          for (const t of live) {
            const dx = t.pos.x - fp.x, dz = t.pos.z - (fp.z);
            if (dx * dx + dz * dz < 0.95 * 0.95 && !(t.isPlayer && player.invuln > 0)) ev.onCatch && ev.onCatch(t, 'human', fp);
          }
        }
        lg.prevC = c;
      }
      // long moonlit shadow
      const sd = this.shadowDir;
      const len = 26, wid = 4.2;
      const cx = h.pos.x + sd.x * len * 0.5, cz = h.pos.z + sd.y * len * 0.5;
      const y0 = gy, y1 = groundHeight(h.pos.x + sd.x * len, h.pos.z + sd.y * len);
      h.shadow.position.set(cx, (y0 + y1) / 2 + 0.06, cz);
      h.shadow.rotation.set(0, 0, 0);
      h.shadow.rotation.order = 'YXZ';
      h.shadow.rotation.y = Math.atan2(-sd.x, -sd.y);
      h.shadow.rotation.x = -Math.PI / 2 + Math.atan2(y1 - y0, len);
      h.shadow.scale.set(wid, len, 1);
      h.shadow.material.uniforms.uStride.value = Math.sin(h.ph) * 0.6 * moving;
      // flashlight
      h.beam.visible = h.pool.visible = h.light;
      if (h.light) {
        const fx = h.pos.x + Math.sin(h.yaw) * 7 + Math.sin(time * 0.8) * 1.2, fz = h.pos.z + Math.cos(h.yaw) * 7;
        const fy = groundHeight(fx, fz);
        h.pool.position.set(fx, fy + 0.05, fz);
        h.pool.material.uniforms.uA.value = 0.5;
        const hand = new THREE.Vector3(h.pos.x + Math.sin(h.yaw) * 1.2, gy + 6.2, h.pos.z + Math.cos(h.yaw) * 1.2);
        const mid = hand.clone().lerp(new THREE.Vector3(fx, fy, fz), 0.5);
        h.beam.position.copy(mid);
        const dir = new THREE.Vector3(fx, fy, fz).sub(hand);
        h.beam.scale.set(1, dir.length() / 7, 1);
        h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      }
    }
  }
}
