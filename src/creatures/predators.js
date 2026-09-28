// Sharks that hunt turtles smaller than themselves, and deep-sea anglerfish.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from '../world/terrain.js';
import { rand, clamp, wrapAngle, damp, dampAngle } from '../core/util.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

function finGeo(pts) {
  const g = new THREE.BufferGeometry();
  const [a, b, c] = pts;
  const pos = [...a, ...b, ...c, ...a, ...c, ...b];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function sharkGeo() {
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24; // 0 tail .. 1 nose
    let r = 0.15 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    if (t > 0.92) r *= 1 - (t - 0.92) * 4;
    prof.push(new THREE.Vector2(Math.max(0.004, r), t * 2 - 1));
  }
  const body = new THREE.LatheGeometry(prof, 16);
  body.rotateX(Math.PI / 2);
  body.scale(0.85, 1.05, 1);
  const parts = [NI(body)];
  parts.push(finGeo([[0, 0.12, 0.2], [0, 0.42, -0.12], [0, 0.12, -0.18]])); // dorsal
  parts.push(finGeo([[0, 0.02, -0.86], [0, 0.42, -1.18], [0, 0.0, -1.0]])); // upper tail lobe
  parts.push(finGeo([[0, 0.0, -0.9], [0, -0.26, -1.08], [0, 0.0, -1.0]])); // lower tail lobe
  for (const s of [-1, 1]) {
    parts.push(finGeo([[s * 0.1, -0.06, 0.35], [s * 0.46, -0.2, 0.05], [s * 0.1, -0.06, 0.12]]));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function sharkMat(top, belly, stripes) {
  return std({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }, {
    key: 'shark' + (stripes ? 'S' : ''),
    rim: 0.4, caustics: 1.0,
    uniforms: { uTop: { value: new THREE.Color(top) }, uBelly: { value: new THREE.Color(belly) }, uSwim: { value: 1 }, uPh: { value: 0 } },
    vertexHead: 'uniform float uSwim; uniform float uPh;',
    vertexTransform: /* glsl */ `
      float tk = smoothstep(0.4, -1.2, position.z);
      transformed.x += sin(uPh - position.z * 3.0) * 0.16 * tk * uSwim;
    `,
    fragHead: 'uniform vec3 uTop; uniform vec3 uBelly;',
    fragDiffuse: /* glsl */ `
      float cs = smoothstep(-0.06, 0.05, vObj.y);
      vec3 c = mix(uBelly, uTop, cs);
      ${stripes ? 'c *= 1.0 - 0.35 * step(0.6, fract(vObj.z * 7.0 + sin(vObj.y * 20.0) * 0.2)) * cs;' : ''}
      c *= 0.9 + 0.15 * vnoise(vObj.xz * 30.0);
      diffuseColor.rgb = c;
    `,
    fragEmissive: /* glsl */ `
      float eye = smoothstep(0.03, 0.015, length(vec2(abs(vObj.x) - 0.075, vObj.y - 0.035) ) ) * step(0.62, vObj.z) * step(vObj.z, 0.7);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), eye);
    `,
  });
}

const SHARK_TYPES = {
  reef: { len: 5.5, top: '#6d7f8c', belly: '#e8eef0', stripes: false, speed: 5, detect: 20, threshold: 0.38, dmg: 28 },
  tiger: { len: 10, top: '#5f6b5c', belly: '#e6e2d4', stripes: true, speed: 7.5, detect: 30, threshold: 0.78, dmg: 34 },
  sixgill: { len: 12, top: '#3a3f4a', belly: '#6a6f7a', stripes: false, speed: 6.5, detect: 26, threshold: 0.93, dmg: 34 },
};

export class Shark {
  constructor(scene, type, home, range) {
    const T = SHARK_TYPES[type];
    this.T = T;
    this.type = type;
    this.mat = sharkMat(T.top, T.belly, T.stripes);
    this.mesh = new THREE.Mesh(Shark.geo || (Shark.geo = sharkGeo()), this.mat);
    this.mesh.scale.setScalar(T.len / 2);
    scene.add(this.mesh);
    this.home = home.clone();
    this.range = range;
    this.pos = home.clone();
    this.yaw = rand(0, 6.28); this.pitch = 0; this.roll = 0;
    this.speed = T.speed * 0.5;
    this.state = 'patrol';
    this.stateT = 0;
    this.target = new THREE.Vector3();
    this.pickWaypoint();
    this.ph = rand(0, 10);
    this.cool = 0;
  }

  pickWaypoint() {
    const a = rand(0, 6.28), d = rand(0.3, 1) * this.range;
    this.target.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
    const g = groundHeight(this.target.x, this.target.z);
    this.target.y = clamp(this.home.y + rand(-6, 6), g + 3, -2.5);
  }

  // returns damage dealt to the player this frame (0 if none)
  update(dt, player, active) {
    const T = this.T;
    let hit = 0;
    this.stateT += dt;
    this.cool -= dt;
    const toP = player.pos.clone().sub(this.pos);
    const dist = toP.length();
    const vulnerable = active && player.growth < T.threshold && player.alive && !player.safe;
    const hidden = player.hidden ? 0.45 : 1;
    let desiredSpeed = T.speed * 0.45;
    let aim = this.target;
    if (this.state === 'patrol') {
      if (this.pos.distanceTo(this.target) < 4 || this.stateT > 20) { this.pickWaypoint(); this.stateT = 0; }
      if (vulnerable && this.cool <= 0 && dist < T.detect * hidden) { this.state = 'stalk'; this.stateT = 0; }
    } else if (this.state === 'stalk') {
      aim = player.pos;
      desiredSpeed = T.speed * 0.7;
      if (!vulnerable || dist > T.detect * 1.8) { this.state = 'patrol'; this.stateT = 0; }
      else if (dist < T.len * 1.5 || this.stateT > 5) { this.state = 'charge'; this.stateT = 0; }
    } else if (this.state === 'charge') {
      aim = player.pos.clone().addScaledVector(player.vel, 0.35);
      desiredSpeed = Math.max(T.speed * 1.25, player.maxSpeed * 1.08);
      if (dist < T.len * 0.38 + player.size * 0.4 && vulnerable) {
        hit = T.dmg;
        this.state = 'retreat'; this.stateT = 0; this.cool = 7;
      } else if (this.stateT > 2.6 || !vulnerable) { this.state = 'retreat'; this.stateT = 0; this.cool = 4; }
    } else if (this.state === 'retreat') {
      aim = this.pos.clone().sub(toP.clone().setY(0).normalize().multiplyScalar(20));
      desiredSpeed = T.speed * 0.8;
      if (this.stateT > 4) { this.state = 'patrol'; this.stateT = 0; this.pickWaypoint(); }
    }
    // stay in range
    const hx = this.pos.x - this.home.x, hz = this.pos.z - this.home.z;
    if (hx * hx + hz * hz > (this.range * 1.6) ** 2 && this.state !== 'charge') { aim = this.home; }

    const d = aim.clone().sub(this.pos);
    const wantYaw = Math.atan2(d.x, d.z);
    const wantPitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.6);
    const turnRate = this.state === 'charge' ? 2.2 : 1.1;
    const dy = clamp(wrapAngle(wantYaw - this.yaw), -turnRate * dt, turnRate * dt);
    this.yaw += dy;
    this.roll = damp(this.roll, -dy / Math.max(dt, 1e-4) * 0.35, 4, dt);
    this.pitch = damp(this.pitch, wantPitch, 2, dt);
    this.speed = damp(this.speed, desiredSpeed, 2.5, dt);
    const cp = Math.cos(this.pitch);
    this.pos.x += Math.sin(this.yaw) * cp * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * cp * this.speed * dt;
    this.pos.y += Math.sin(this.pitch) * this.speed * dt;
    const g = groundHeight(this.pos.x, this.pos.z) + T.len * 0.15;
    if (this.pos.y < g) this.pos.y = g;
    if (this.pos.y > -T.len * 0.12) this.pos.y = -T.len * 0.12;
    this.ph += dt * (2 + this.speed * 0.9);
    this.mat.userData.uniforms.uPh.value = this.ph;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    return hit;
  }
}

// --------------------------------------------------------------- anglerfish
function anglerGeo() {
  const body = new THREE.SphereGeometry(1, 20, 14);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0 && z > 0) { y *= 1.25; z *= 1.1; }
    if (z < 0) { x *= 1 + z * 0.35; y *= 1 + z * 0.3; }
    p.setXYZ(i, x * 0.85, y * 0.75, z);
  }
  const parts = [NI(body)];
  for (let i = 0; i < 12; i++) {
    const a = (i / 11) * Math.PI - Math.PI / 2;
    const tooth = new THREE.ConeGeometry(0.035, 0.22, 4);
    tooth.rotateX(Math.PI);
    tooth.translate(Math.sin(a) * 0.62, 0.08, 0.72 + Math.cos(a) * 0.2);
    parts.push(NI(tooth));
    const t2 = new THREE.ConeGeometry(0.035, 0.2, 4);
    t2.translate(Math.sin(a) * 0.62, -0.1, 0.74 + Math.cos(a) * 0.2);
    parts.push(NI(t2));
  }
  parts.push(finGeo([[0, 0, -0.9], [0, 0.4, -1.4], [0, -0.4, -1.4]]));
  const stalk = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0.7, 0.3), new THREE.Vector3(0, 1.6, 0.8), new THREE.Vector3(0, 1.0, 1.55)), 10, 0.025, 4);
  parts.push(NI(stalk));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Anglers {
  constructor(scene, count = 6) {
    const mat = std({ color: 0x2a2630, roughness: 0.4 }, {
      key: 'angler', rim: 0.6, caustics: 0,
      fragDiffuse: 'diffuseColor.rgb *= 0.7 + 0.5 * vnoise(vObj.xy * 12.0 + vObj.z * 4.0);',
      fragEmissive: 'totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * step(0.5, vObj.z) * step(abs(vObj.y), 0.26) * step(0.55, abs(vObj.x)) * 0.0;',
    });
    const geo = anglerGeo();
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 2.2) });
    const bulbGeo = new THREE.SphereGeometry(0.11, 12, 8);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const z = rand(-1350, -1080), x = rand(-120, 120);
      const y = groundHeight(x, z) + rand(3, 10);
      const grp = new THREE.Group();
      const body = new THREE.Mesh(geo, mat);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, 1.0, 1.58);
      grp.add(body, bulb);
      const s = rand(1.4, 2.6);
      grp.scale.setScalar(s);
      grp.position.set(x, y, z);
      scene.add(grp);
      this.list.push({ grp, bulb, home: grp.position.clone(), s, yaw: rand(0, 6.28), ph: rand(0, 10), snap: 0, cool: 0 });
    }
  }
  update(dt, time, player) {
    let dmg = 0;
    for (const a of this.list) {
      const t = time + a.ph;
      const toP = player.pos.clone().sub(a.grp.position);
      const d = toP.length();
      a.cool -= dt;
      if (d < 18) a.yaw = dampAngle(a.yaw, Math.atan2(toP.x, toP.z), 1.2, dt);
      else a.yaw += dt * 0.1;
      a.grp.position.set(a.home.x + Math.sin(t * 0.2) * 2, a.home.y + Math.sin(t * 0.5) * 0.6, a.home.z + Math.cos(t * 0.17) * 2);
      if (d < a.s * 2.2 && a.cool <= 0 && player.alive) { a.snap = 1; a.cool = 4; dmg += 12; }
      a.snap = Math.max(0, a.snap - dt * 3);
      a.grp.rotation.set(Math.sin(t * 0.7) * 0.05 - a.snap * 0.3, a.yaw, Math.sin(t * 0.5) * 0.06);
      a.bulb.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    }
    return dmg;
  }
}
