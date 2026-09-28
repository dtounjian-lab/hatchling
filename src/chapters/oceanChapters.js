// III Breaking the Surf, IV Growing Up, V The Gathering, VI Finding a Mate, VII The Journey Home.
import * as THREE from 'three';
import { Chapter, spawnSibling, updateRunner } from './base.js';
import { groundHeight, WORLD, ZONES, zoneIndexAt } from '../world/terrain.js';
import { surfaceHeight, surfEnvelope, surfPhase } from '../world/water.js';
import { TurtleModel } from '../player/turtleModel.js';
import { SPECIES } from '../species.js';
import { rand, clamp, lerp, smoothstep, damp, dampAngle, wrapAngle, TAU } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ============================================================== III Breaking the Surf
export class Surf extends Chapter {
  static meta = { num: 'Chapter III', title: 'Breaking the Surf', sub: 'The ocean pushes back. Push harder.', mood: 'night' };

  enter() {
    const G = this.game, P = G.player;
    G.setDay(0);
    P.mode = 'swim';
    P.control = true;
    P.visible = true;
    P.growth = 0;
    if (P.pos.z > 2 || P.pos.z < -10) P.placeAt(new THREE.Vector3(0, 0, -0.5), Math.PI, 'swim');
    P.pos.y = surfaceHeight(P.pos.x, P.pos.z, G.time) - P.size * 0.3;
    P.vel.set(0, 0, -1.5);
    P.aimPitch = -0.05;
    P.bounds = { minX: -60, maxX: 60, minZ: -120, maxZ: 3 };
    P.canBreach = true;
    P.breath = 1;
    P.health = P.maxHealth;
    G.hud({ meters: true, growth: false, diet: false });
    G.ui.setObjective('Swim out past the breaking waves');
    G.ui.tips('<b>Mouse</b> steer<br><b>W</b> swim<br><b>Ctrl</b> or <b>C</b> dive under waves<br><b>Space</b> rise<br><b>Shift</b> dash');
    G.showCard(Surf.meta);
    this.lastPh = surfPhase(P.pos.z, G.time);
    this.ripWarned = false;
    this.revealing = false;
    // a few siblings swim with you
    for (const a of G.crowd.agents) if (a.active && a.state !== 'swim') a.active = false;
    for (let i = 0; i < 6; i++) {
      const a = spawnSibling(G.crowd, G.species, new THREE.Vector3(rand(-6, 6), -0.3, rand(-6, 1)));
      if (a) { a.state = 'swim'; a.t = rand(0, 3); }
    }
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player;
    for (const a of G.crowd.agents) if (a.active) updateRunner(a, dt, G.time, G.obstacles);
    if (this.revealing) return this.reveal(dt);
    const z = P.pos.z;
    const t = G.time;
    const env = surfEnvelope(z);
    const sy = surfaceHeight(P.pos.x, z, t);
    const below = Math.max(0, sy - P.pos.y);
    if (env > 0.02) {
      const u = surfPhase(z, t);
      const k = Math.exp(-below / (0.55 + P.size));
      const crest = Math.exp(-u * 9) * 12;
      const back = 2.6 * smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.8, 0.98, u));
      P.ext.z += (crest - back) * env * k;
      P.ext.y -= crest * env * k * 0.15;
      // a crest just passed over us
      if (u < this.lastPh - 0.5 && env > 0.25) {
        G.audio.wave(clamp(env * (0.4 + k), 0.2, 1));
        G.rig.shake(0.12 * env * k);
        if (k > 0.4) {
          P.roll += 0.8 * k;
          G.particles.bubbles.burst(P.pos, 20, 1.5, 1.2, 0.06);
          G.ui.toast(k > 0.7 ? 'Tumbled by a wave. Dive under the next one.' : 'The wave rolls over you', 'meh');
        } else G.ui.toast('Under the wave. Nice.', 'good');
      }
      this.lastPh = u;
    }
    // riptide
    if (z < WORLD.ripStart && z > WORLD.ripEnd) {
      const band = smoothstep(WORLD.ripStart, WORLD.ripStart - 6, z) * smoothstep(WORLD.ripEnd, WORLD.ripEnd + 6, z);
      const k2 = Math.exp(-below / 2.4) * band;
      P.ext.x += 8.5 * k2;
      P.ext.z += 3.2 * k2 * (0.6 + 0.4 * Math.sin(t * 1.3));
      if (!this.ripWarned && k2 > 0.3) {
        this.ripWarned = true;
        G.ui.setObjective('A riptide! Dive deep and swim across it');
        G.ui.toast('Riptide', 'bad');
      }
      if (Math.random() < 0.6) {
        const p = P.pos.clone().add(new THREE.Vector3(rand(-6, -2), rand(-0.5, 0.6), rand(-3, 3)));
        G.particles.glow.spawn(p.x, Math.min(p.y, -0.1), p.z, rand(6, 9), 0, rand(-0.5, 0.5), 0.9, rand(0.04, 0.08), new THREE.Color(0.55, 0.75, 0.8));
      }
    }
    if (z < -84 && !this.revealing) this.startReveal();
  }

  startReveal() {
    const G = this.game, P = G.player;
    this.revealing = true;
    this.rt = 0;
    P.control = false;
    P.auto = { forward: true, back: false, left: false, right: false, rise: false, dive: false, dash: false, sprint: false };
    P.aimPitch = -0.12;
    G.ui.setObjective('');
    G.ui.tips('');
    G.audio.swell();
    G.rig.override = { pos: P.pos.clone(), look: P.pos.clone(), fov: 66, follow: 1.0, lambda: 1.2 };
  }

  reveal(dt) {
    const G = this.game, P = G.player;
    this.rt += dt;
    const k = smoothstep(0, 7, this.rt);
    G.setDay(smoothstep(0.5, 6.5, this.rt));
    G.audio.intensity = 0.4 + k * 0.5;
    P.aimYaw = Math.PI; P.aimPitch = -0.1;
    const o = G.rig.override;
    const orbit = -0.9 + k * 1.3;
    o.pos.set(P.pos.x + Math.sin(orbit) * (4 + k * 7), P.pos.y + 1 + k * 3, P.pos.z + Math.cos(orbit) * (4 + k * 7));
    o.look.set(P.pos.x, P.pos.y - 2 - k * 3, P.pos.z - 14 - k * 12);
    if (this.rt > 7.5 && !this.done) {
      this.done = true;
      G.goto(3);
    }
  }

  exit() {
    const G = this.game;
    G.rig.override = null;
    G.player.control = true;
    for (const a of G.crowd.agents) a.active = false;
  }
}

// ============================================================== IV Growing Up
const STAGES = ['Hatchling', 'Juvenile', 'Subadult', 'Adult'];
export function stageName(g) { return g >= 0.999 ? 'Adult' : STAGES[Math.min(3, Math.floor(g * 4))]; }

export class Growing extends Chapter {
  static meta = { num: 'Chapter IV', title: 'Growing Up', sub: 'Eat. Grow. Go deeper.', mood: 'reef' };

  enter() {
    const G = this.game, P = G.player;
    G.setDay(1);
    P.mode = P.mode === 'air' ? 'air' : 'swim';
    P.control = true;
    P.bounds = { minX: -215, maxX: 215, minZ: -415, maxZ: -40 };
    G.sys.food = true; G.sys.shells = true; G.sys.sharks = true; G.sys.currents = true;
    G.hud({ meters: true, growth: true, diet: true });
    G.ui.tips('Eat what your species eats<br>Your diet is shown bottom left<br>Avoid plastic<br>Surface to breathe');
    setTimeout(() => G.ui.tips(''), 16000);
    G.showCard(Growing.meta);
    this.lastStage = -1;
    this.warnT = 0;
    this.hintT = 0;
    this.deepGate = P.species.id === 'leatherback' ? 0.68 : 0.75;
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player;
    const g = P.growth;
    // size-gated zones
    let minZ = -415, msg = 'Grow to Juvenile to brave the kelp forest currents';
    if (g >= 0.25) { minZ = -715; msg = 'Grow to Subadult to cross into the open ocean'; }
    if (g >= 0.5) { minZ = -1045; msg = 'Grow larger to survive the crushing deep'; }
    if (g >= this.deepGate) { minZ = -1370; msg = ''; }
    P.bounds.minZ = minZ;
    P.depthLimit = g >= this.deepGate ? -1e9 : -88;
    this.warnT -= dt;
    const nearGate = msg && (P.pos.z < minZ + 12 || (P.pos.y < -80 && g < this.deepGate));
    if (nearGate) {
      if (this.warnT <= 0) { G.ui.toast(msg, 'meh'); this.warnT = 6; }
      if (Math.random() < 0.8) {
        const p = new THREE.Vector3(P.pos.x + rand(-10, 10), Math.min(-0.5, P.pos.y + rand(-4, 4)), (P.pos.y < -80 && g < this.deepGate) ? P.pos.z + rand(-6, 6) : minZ + rand(-2, 2));
        G.particles.glow.spawn(p.x, p.y, p.z, rand(-3, 3), 0, rand(2, 4), 1.2, rand(0.08, 0.16), new THREE.Color(0.6, 0.85, 1.0));
      }
    }
    const st = Math.min(3, Math.floor(g * 4));
    if (st !== this.lastStage) {
      if (this.lastStage >= 0 && st > this.lastStage) {
        G.ui.toast(`She has grown: ${STAGES[st]}`, 'gold');
        G.audio.chime();
        const zoneName = ['', 'The kelp forest is open to you', 'The open ocean is open to you', 'The deep is open to you'][st];
        if (zoneName) setTimeout(() => G.ui.toast(zoneName, 'gold'), 1400);
      }
      this.lastStage = st;
    }
    // objective
    const zi = zoneIndexAt(P.pos.z, P.pos.y);
    const cap = [0.3, 0.3, 0.55, 0.8, 1.0][zi];
    let obj;
    if (g >= 0.999) obj = 'Fully grown';
    else if (g >= cap - 0.001) obj = 'These waters cannot feed you now. Swim farther from shore';
    else obj = `Eat and grow  ·  ${stageName(g)}`;
    G.ui.setObjective(obj);
    if (g >= 0.999 && !this.doneFlag) {
      this.doneFlag = true;
      G.ui.toast('Fully grown', 'gold');
      setTimeout(() => G.goto(4), 1800);
    }
  }

  onDeath() {
    const G = this.game, P = G.player;
    const zi = zoneIndexAt(P.pos.z, P.pos.y);
    const spots = [[0, -5, -95], [0, -5, -110], [0, -10, -440], [0, -18, -740], [0, -40, -1070]];
    const s = spots[zi];
    G.respawnAt(new THREE.Vector3(s[0], Math.max(s[1], groundHeight(s[0], s[2]) + 3), s[2]), Math.PI);
  }

  exit() { this.game.player.depthLimit = -1e9; }
}

// ============================================================== V The Gathering
export class Gathering extends Chapter {
  static meta = { num: 'Chapter V', title: 'The Gathering', sub: 'You are not alone out here.', mood: 'gathering' };

  enter() {
    const G = this.game, P = G.player;
    G.setDay(1);
    P.control = true;
    P.growth = 1;
    P.depthLimit = -1e9;
    P.bounds = { minX: -215, maxX: 215, minZ: -1370, maxZ: -60 };
    G.sys.food = true; G.sys.sharks = false;
    G.crowd.clear();
    const fwd = P.forward(new THREE.Vector3()); fwd.y = 0; fwd.normalize();
    const center = P.pos.clone().addScaledVector(fwd, 70);
    center.x = clamp(center.x, -150, 150);
    center.z = clamp(center.z, -1300, -120);
    center.y = clamp(P.pos.y, -45, -8);
    const gh = groundHeight(center.x, center.z);
    if (center.y < gh + 8) center.y = Math.min(-6, gh + 8);
    this.center = center;
    this.boids = [];
    const N = 60;
    for (let i = 0; i < N; i++) {
      const sp = SPECIES[i % SPECIES.length];
      const p = center.clone().add(new THREE.Vector3(rand(-14, 14), rand(-5, 5), rand(-14, 14)));
      const a = G.crowd.spawn(sp, 1, p);
      if (!a) break;
      a.size = 2.0 * sp.stats.size * rand(0.85, 1.02);
      a.mode = 'swim';
      a.vel.set(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(3);
      a.phase = rand(0, 1);
      a.data = { slot: new THREE.Vector3(((i % 7) - 3) * 4.2, (Math.floor(i / 7) % 3 - 1) * 3.2, -7 - Math.floor(i / 21) * 6.5), prevYaw: 0 };
      this.boids.push(a);
    }
    this.harmony = 0;
    G.hud({ meters: true, growth: false, diet: false });
    G.ui.harmony(0);
    G.ui.setObjective('A gathering of turtles. Swim to them');
    G.ui.tips('Swim into the school<br>Lead them: turn, climb and dive<br>They will follow you');
    G.showCard(Gathering.meta);
    G.audio.intensity = 0.55;
    this.joined = false;
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player;
    const pf = P.forward(new THREE.Vector3());
    const pSpeed = P.vel.length();
    let aligned = 0, near = 0;
    const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
    for (const a of this.boids) {
      if (!a.active) continue;
      const acc = _v.set(0, 0, 0);
      let sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), n = 0;
      for (const b of this.boids) {
        if (b === a || !b.active) continue;
        const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y, dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 100) {
          n++;
          ali.add(b.vel); coh.add(b.pos);
          if (d2 < 12) { const d = Math.sqrt(d2) + 1e-3; sep.x += dx / d / d; sep.y += dy / d / d; sep.z += dz / d / d; }
        }
      }
      if (n) {
        ali.divideScalar(n).sub(a.vel).multiplyScalar(0.6);
        coh.divideScalar(n).sub(a.pos).multiplyScalar(0.25);
        acc.add(ali).add(coh);
      }
      acc.addScaledVector(sep, 9);
      const toP = _w.copy(P.pos).sub(a.pos);
      const dP = toP.length();
      if (dP < 45) {
        // formation slot around the leader, rotated with her heading
        const s = a.data.slot;
        const tx = P.pos.x + s.x * cy + s.z * sy;
        const tz = P.pos.z - s.x * sy + s.z * cy;
        const ty = P.pos.y + s.y + pf.y * s.z;
        const slot = new THREE.Vector3(tx - a.pos.x, ty - a.pos.y, tz - a.pos.z);
        acc.addScaledVector(slot, 0.9);
        acc.addScaledVector(P.vel.clone().sub(a.vel), 1.3); // mirror her turns and dives
        if (dP < 3.2) acc.addScaledVector(toP, -3 / Math.max(dP, 0.5));
        near++;
        if (a.vel.lengthSq() > 1 && a.vel.clone().normalize().dot(pf) > 0.72) aligned++;
      } else {
        acc.addScaledVector(toP.normalize(), 2.5);
      }
      a.vel.addScaledVector(acc, dt);
      const maxS = Math.max(3, P.maxSpeed * 1.2);
      const sp = a.vel.length();
      if (sp > maxS) a.vel.multiplyScalar(maxS / sp);
      if (sp < 1.8) a.vel.multiplyScalar(1.8 / Math.max(sp, 0.01));
      a.pos.addScaledVector(a.vel, dt);
      const gh = groundHeight(a.pos.x, a.pos.z) + a.size * 0.6;
      if (a.pos.y < gh) { a.pos.y = gh; a.vel.y = Math.abs(a.vel.y); }
      if (a.pos.y > -a.size * 0.4) { a.pos.y = -a.size * 0.4; a.vel.y = -Math.abs(a.vel.y) * 0.5; }
      const v = a.vel;
      const yaw = Math.atan2(v.x, v.z);
      const turn = wrapAngle(yaw - a.yaw) / Math.max(dt, 1e-4);
      a.yaw = dampAngle(a.yaw, yaw, 5, dt);
      a.pitch = damp(a.pitch, Math.asin(clamp(v.y / Math.max(v.length(), 1e-3), -0.9, 0.9)), 4, dt);
      a.roll = damp(a.roll, clamp(-turn * 0.3, -0.8, 0.8), 3, dt);
      const accel = acc.dot(v) > 0;
      a.amp = damp(a.amp, accel ? 1 : 0.4, 2, dt);
      a.glide = damp(a.glide, accel ? 0 : 0.6, 2, dt);
      a.phase += dt * (0.35 + v.length() * 0.08);
      a.turn = clamp(turn * 0.2, -1, 1);
    }
    const N = this.boids.length;
    if (near > N * 0.3 && !this.joined) {
      this.joined = true;
      G.ui.setObjective('Lead them. Turn, climb and dive together');
      G.audio.swell();
    }
    const frac = aligned / N;
    this.dbg = { aligned, near, pSpeed, frac };
    if (frac > 0.45 && pSpeed > P.maxSpeed * 0.3) this.harmony = Math.min(1, this.harmony + dt / 20);
    else this.harmony = Math.max(0, this.harmony - dt / 70);
    G.ui.harmony(this.harmony);
    G.audio.intensity = 0.5 + this.harmony * 0.5;
    if (this.harmony >= 1 && !this.doneFlag) {
      this.doneFlag = true;
      G.ui.toast('In perfect harmony', 'gold');
      G.audio.chime();
      setTimeout(() => G.goto(5), 1500);
    }
  }

  exit() { this.game.ui.harmony(null); }
}

// ============================================================== VI Finding a Mate
export class Mate extends Chapter {
  static meta = { num: 'Chapter VI', title: 'Finding a Mate', sub: 'One turns from the gathering toward you.', mood: 'gathering' };

  enter() {
    const G = this.game, P = G.player;
    G.hud({ meters: false, growth: false, diet: false });
    G.ui.tips('');
    G.ui.setObjective('');
    G.showCard(Mate.meta);
    P.control = false;
    P.auto = { forward: false, back: false, left: false, right: false, rise: false, dive: false, dash: false, sprint: false };
    this.male = new TurtleModel(G.species);
    this.male.setMaturity(1);
    this.male.tail.scale.z *= 2.2;
    G.scene.add(this.male.group);
    this.msize = P.size * 1.04;
    this.male.group.scale.setScalar(this.msize);
    // he breaks from the nearest part of the school
    let best = null, bd = 1e9;
    for (const a of G.crowd.agents) if (a.active && a.sp.id === G.species.id) { const d = a.pos.distanceToSquared(P.pos); if (d < bd) { bd = d; best = a; } }
    this.mpos = best ? best.pos.clone() : P.pos.clone().add(new THREE.Vector3(12, 2, -12));
    if (best) best.active = false;
    this.myaw = 0; this.mpitch = 0; this.mroll = 0; this.mph = 0;
    this.stage = 'approach';
    this.t = 0;
    this.center = P.pos.clone();
    this.startY = P.pos.y;
    G.rig.override = { pos: G.rig.pos.clone(), look: P.pos.clone(), fov: 58, follow: 1.2, lambda: 1.5 };
    G.audio.intensity = 0.75;
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player;
    const S = P.size;
    const o = G.rig.override;
    this.mph += dt * 0.55;
    let mTarget;
    if (this.stage === 'approach') {
      // she slows and waits, he comes to her
      P.vel.multiplyScalar(1 - dt * 1.5);
      mTarget = P.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw + 1.2) * S * 2.2, 0.3, Math.cos(P.yaw + 1.2) * S * 2.2));
      this.mpos.lerp(mTarget, 1 - Math.exp(-0.7 * dt));
      const d = mTarget.clone().sub(this.mpos);
      this.myaw = dampAngle(this.myaw, Math.atan2(P.pos.x - this.mpos.x, P.pos.z - this.mpos.z), 2, dt);
      this.center.copy(P.pos).lerp(this.mpos, 0.5);
      o.pos.lerp(this.center.clone().add(new THREE.Vector3(S * 7, S * 2, S * 5)), 1 - Math.exp(-1 * dt));
      o.look.lerp(this.center, 1 - Math.exp(-2 * dt));
      if (this.t > 4.5 || d.length() < S * 0.4) { this.stage = 'dance'; this.t = 0; this.center.copy(P.pos).lerp(this.mpos, 0.5); this.ang = Math.atan2(P.pos.x - this.center.x, P.pos.z - this.center.z); P.mode = 'locked'; P.lockAnim = 'swim'; G.audio.swell(); }
    } else if (this.stage === 'dance') {
      // circling and rising together toward the light
      const R = S * 1.5;
      const w = 0.85;
      this.ang += w * dt;
      const riseTo = -3.5;
      this.center.y = Math.min(riseTo, this.center.y + dt * 1.25);
      const a1 = this.ang, a2 = this.ang + Math.PI;
      const bob = Math.sin(this.t * 1.4) * 0.3;
      P.pos.set(this.center.x + Math.sin(a1) * R, this.center.y + bob, this.center.z + Math.cos(a1) * R);
      this.mpos.set(this.center.x + Math.sin(a2) * R, this.center.y - bob + 0.2, this.center.z + Math.cos(a2) * R);
      const tyaw = a1 + Math.PI / 2, myaw = a2 + Math.PI / 2;
      P.yaw = dampAngle(P.yaw, tyaw, 3, dt); P.aimYaw = P.yaw;
      P.pitch = damp(P.pitch, 0.22, 2, dt);
      P.roll = damp(P.roll, -0.45, 2, dt);
      P.stroke += dt * 0.55; P.amp = 0.8; P.glide = 0.2;
      this.myaw = dampAngle(this.myaw, myaw, 3, dt);
      this.mpitch = damp(this.mpitch, 0.22, 2, dt);
      this.mroll = damp(this.mroll, -0.45, 2, dt);
      const ca = this.t * 0.18 + 0.6;
      o.pos.lerp(new THREE.Vector3(this.center.x + Math.sin(ca) * S * 8, this.center.y - S * 1.5, this.center.z + Math.cos(ca) * S * 8), 1 - Math.exp(-1.2 * dt));
      o.look.lerp(this.center.clone().add(new THREE.Vector3(0, S * 0.8, 0)), 1 - Math.exp(-2 * dt));
      o.fov = 54;
      G.godrayBoost = smoothstep(2, 10, this.t) * 1.5;
      // the school rings around them
      for (const a of G.crowd.agents) {
        if (!a.active) continue;
        const ang = Math.atan2(a.pos.x - this.center.x, a.pos.z - this.center.z) + dt * 0.25;
        const rr = 20 + (a.i % 5) * 3;
        const tgt = new THREE.Vector3(this.center.x + Math.sin(ang) * rr, this.center.y - 4 + (a.i % 7) * 1.2, this.center.z + Math.cos(ang) * rr);
        const nv = tgt.sub(a.pos);
        a.vel.lerp(nv.multiplyScalar(0.8), 1 - Math.exp(-1.5 * dt));
        a.pos.addScaledVector(a.vel, dt);
        a.yaw = dampAngle(a.yaw, Math.atan2(a.vel.x, a.vel.z), 3, dt);
        a.pitch = damp(a.pitch, 0, 2, dt);
        a.phase += dt * 0.5;
      }
      if (this.t > 13 && !this.ending) this.end();
    }
    this.male.group.position.copy(this.mpos);
    this.male.group.rotation.set(-this.mpitch, this.myaw, this.mroll, 'YXZ');
    this.male.animate(dt, { mode: 'swim', phase: this.mph % 1, amp: 0.85, glide: this.stage === 'dance' ? 0.2 : 0.1, turn: 0, headYaw: 0, headPitch: 0 });
  }

  async end() {
    const G = this.game, P = G.player;
    this.ending = true;
    G.audio.chime();
    await G.ui.fade(1, 2200);
    P.eggs = true;
    P.model.setGlow(0.45);
    G.scene.remove(this.male.group);
    G.godrayBoost = 0;
    await G.ui.line('She carries the next generation.', 3000);
    G.goto(6);
  }

  exit() {
    const G = this.game;
    G.rig.override = null;
    G.player.lockAnim = null;
    G.crowd.clear();
  }
}

// ============================================================== VII The Journey Home
export const LANES = [{ z: -600, count: 2 }, { z: -470, count: 2 }, { z: -340, count: 2 }, { z: -210, count: 2 }];
export const NETS = [{ x: 0, z: -535, w: 110, h: 13 }, { x: 40, z: -405, w: 90, h: 15 }, { x: -30, z: -275, w: 100, h: 12 }];

export class Journey extends Chapter {
  static meta = { num: 'Chapter VII', title: 'The Journey Home', sub: 'The earth itself remembers the way.', mood: 'journey' };

  enter() {
    const G = this.game, P = G.player;
    this.ready = false;
    this.startZ = -700;
    (async () => {
      if (G.ui.fadeValue < 1) await G.ui.fade(1, 800);
      G.setDay(1);
      P.growth = 1;
      P.eggs = true;
      P.model.setGlow(0.45);
      P.visible = true;
      P.lockAnim = null;
      P.placeAt(new THREE.Vector3(WORLD.nest.x, -14, this.startZ), 0, 'swim');
      P.control = true;
      P.health = P.maxHealth;
      P.breath = 1;
      P.bounds = { minX: -200, maxX: 200, minZ: -740, maxZ: 8 };
      G.crowd.clear();
      G.sys.food = true; G.sys.shells = true; G.sys.sharks = true; G.sys.currents = false;
      G.boats.setVisible(true);
      G.nets.setVisible(true);
      G.rig.override = null;
      G.rig.snap(P);
      G.hud({ meters: true, growth: false, diet: true });
      G.ui.setObjective('Swim home to the beach where you were born');
      G.ui.tips('Follow the shimmer and the compass<br>Dive under boats and nets<br>Surface to breathe between boat lanes');
      setTimeout(() => G.ui.tips(''), 15000);
      this.checkpoint = P.pos.clone();
      this.netTaps = 0;
      this.shimmerT = 0;
      this.ready = true;
      await G.sleep(0.3);
      G.ui.fade(0, 1200);
      G.showCard(Journey.meta);
    })();
  }

  update(dt) {
    super.update(dt);
    if (!this.ready) return;
    const G = this.game, P = G.player, I = G.input;
    const progress = clamp((P.pos.z - this.startZ) / -this.startZ, 0, 1);
    G.setDay(lerp(1, 0.04, smoothstep(0.15, 0.97, progress)));
    // compass
    const nx = WORLD.nest.x - P.pos.x, nz = WORLD.nest.z - P.pos.z;
    const ang = Math.atan2(nx, nz);
    const rel = wrapAngle(ang - P.yaw);
    G.ui.compass(-rel, `Home  ·  ${Math.round(Math.hypot(nx, nz) * 0.9)} m`);
    // magnetic shimmer leading home
    this.shimmerT -= dt;
    if (this.shimmerT <= 0) {
      this.shimmerT = 0.05;
      const dir = new THREE.Vector3(nx, 0, nz).normalize();
      const p = P.pos.clone().addScaledVector(dir, P.size * rand(2, 9)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 1.5), rand(-1.5, 1.5)));
      G.particles.glow.spawn(p.x, Math.min(-0.3, p.y), p.z, dir.x * 3, rand(-0.2, 0.2), dir.z * 3, 1.6, rand(0.07, 0.13), new THREE.Color(1.0, 0.82, 0.5));
    }
    // checkpoints at each lane cleared
    for (const L of LANES) if (P.pos.z > L.z + 25 && this.checkpoint.z < L.z + 25) { this.checkpoint.set(P.pos.x, Math.min(P.pos.y, -6), L.z + 25); }
    // boats
    const B = G.boats.update(dt, G.time, P, G.particles);
    G.engineLevel = B.drone;
    G.enginePitch = B.pitch;
    if (B.damage > 0 && P.invuln <= 0) {
      P.hurt(B.damage, new THREE.Vector3(P.pos.x, P.pos.y + 3, P.pos.z));
      G.rig.shake(0.6);
      G.ui.toast('Propeller strike!', 'bad');
      G.particles.bubbles.burst(P.pos, 40, 3, 1.5, 0.12);
      G.stats.boatHits++;
    }
    if (B.hullHit) { P.vel.y -= 20 * dt; P.ext.y -= 10; }
    // nets
    const net = G.nets.update(dt, G.time, P);
    if (net && !P.entangled && P.invuln <= 0) {
      P.entangled = net;
      this.netTaps = 0;
      this.netSide = Math.sign(P.pos.z - net.z) || -1;
      G.ui.toast('Tangled in a net!', 'bad');
      G.audio.hurt();
      G.stats.nets++;
    }
    if (P.entangled) {
      G.ui.prompt('Tap Space to break free');
      P.health -= 5 * dt;
      if (P.health <= 0 && P.alive) { P.health = 0; P.alive = false; G.onPlayerHurt(0); }
      if (I.action) {
        this.netTaps++;
        G.rig.shake(0.12);
        G.particles.bubbles.burst(P.pos, 6, 1.5, 0.8, 0.08);
        G.audio.dig();
        if (this.netTaps >= 8) {
          const n = P.entangled;
          P.entangled = null;
          P.invuln = 2.2;
          P.pos.z = n.z + this.netSide * (P.size * 0.6 + 1.2);
          P.vel.set(0, -2, this.netSide * 3);
          G.ui.prompt('');
          G.ui.toast('Free', 'good');
        }
      }
    }
    if (P.pos.z > -24 && !this.doneFlag) {
      this.doneFlag = true;
      (async () => {
        P.control = false;
        P.auto = { forward: true };
        G.ui.compass(null);
        await G.ui.fade(1, 1600);
        G.goto(7);
      })();
    }
  }

  onDeath() {
    const G = this.game, P = G.player;
    P.entangled = null;
    G.ui.prompt('');
    G.respawnAt(this.checkpoint.clone(), 0);
  }

  exit() {
    const G = this.game;
    G.boats.setVisible(false);
    G.nets.setVisible(false);
    G.engineLevel = 0;
    G.ui.compass(null);
    G.player.entangled = null;
    G.player.bounds = null;
  }
}

export { ZONES };
