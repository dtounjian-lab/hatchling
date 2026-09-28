// The player turtle: land scramble, full 3D swimming with momentum and glide,
// breaching, breath, health and continuous growth.
import * as THREE from 'three';
import { TurtleModel } from './turtleModel.js';
import { groundHeight } from '../world/terrain.js';
import { surfaceHeight } from '../world/water.js';
import { clamp, lerp, damp, wrapAngle, TAU, rand, smoothstep } from '../core/util.js';

const NO_INPUT = { forward: false, back: false, left: false, right: false, rise: false, dive: false, dash: false, sprint: false };

export class Player {
  constructor(game, species) {
    this.game = game;
    this.model = new TurtleModel(species);
    game.scene.add(this.model.group);
    this.species = species;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0; this.roll = 0;
    this.yawRate = 0; this.pitchRate = 0;
    this.aimYaw = Math.PI; this.aimPitch = 0;
    this.mode = 'land';
    this.growth = 0;
    this.health = 100;
    this.breath = 1;
    this.dashCD = 0; this.dashT = 0;
    this.stamina = 1;
    this.stroke = 0; this.amp = 0.3; this.glide = 0.5;
    this.control = true;
    this.auto = { ...NO_INPUT };
    this.alive = true;
    this.invuln = 0;
    this.safe = false;
    this.hidden = false;
    this.ext = new THREE.Vector3();
    this.landDrift = new THREE.Vector3();
    this.eggs = false;
    this.slowT = 0;
    this.hurtT = 10;
    this.entangled = null;
    this.mouth = new THREE.Vector3();
    this.landSpeed = 0;
    this.atSurface = false;
    this.distance = 0;
    this.bounds = null; // {minX,maxX,minZ,maxZ}
    this.depthLimit = -1e9;
    this.chomp = 0;
    this.digging = false;
    this.headLook = 0;
    this.visible = true;
  }

  setSpecies(sp) {
    this.species = sp;
    this.model.setSpecies(sp);
    this.health = this.maxHealth;
  }

  get size() {
    const s = this.species.stats.size;
    const hatch = 0.34 * (0.85 + 0.15 * s);
    return lerp(hatch, 2.0 * s, Math.pow(this.growth, 0.85));
  }
  get maxSpeed() {
    const airBoost = 1 + 0.15 * smoothstep(0.75, 1, this.breath);
    return lerp(2.8, 7.8, this.growth) * this.species.stats.speed * (this.eggs ? 0.9 : 1) * (this.slowT > 0 ? 0.6 : 1) * airBoost * (this.inCurrent ? 1.55 : 1);
  }
  get turnRate() { return lerp(3.0, 1.8, this.growth) * this.species.stats.agility * (this.eggs ? 0.9 : 1); }
  get breathCap() { return lerp(40, 115, this.growth) * this.species.stats.dive * 10; }
  get maxHealth() { return 100 * this.species.stats.health; }
  get landMax() { return lerp(2.5, 1.7, this.growth) * Math.sqrt(this.species.stats.speed) * (this.eggs ? 0.85 : 1); }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }
  aimDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.aimPitch);
    return out.set(Math.sin(this.aimYaw) * cp, Math.sin(this.aimPitch), Math.cos(this.aimYaw) * cp);
  }

  look(dx, dy) {
    this.aimYaw -= dx;
    const lim = this.mode === 'land' ? [-0.45, 0.75] : [-1.3, 1.3];
    this.aimPitch = clamp(this.aimPitch - dy, lim[0], lim[1]);
  }

  placeAt(p, yaw, mode) {
    this.pos.copy(p); this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = this.aimYaw = yaw;
    this.pitch = this.aimPitch = 0;
    this.roll = 0; this.yawRate = 0; this.pitchRate = 0;
    this.landSpeed = 0;
    if (mode) this.mode = mode;
  }

  hurt(amount, from) {
    if (this.invuln > 0 || !this.alive || amount <= 0) return false;
    this.health -= amount;
    this.invuln = 1.3;
    this.hurtT = 0;
    if (from) {
      const push = this.pos.clone().sub(from).normalize().multiplyScalar(6);
      this.vel.add(push);
    }
    if (this.health <= 0) { this.health = 0; this.alive = false; }
    this.game.onPlayerHurt(amount);
    return true;
  }

  update(dt, input) {
    const I = this.control ? {
      forward: input.forward, back: input.back, left: input.left, right: input.right,
      rise: input.rise, dive: input.dive, dash: input.dash, sprint: input.sprint,
    } : this.auto;
    this.prevPos.copy(this.pos);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hurtT += dt;
    this.chomp = Math.max(0, this.chomp - dt * 4);

    if (this.mode === 'land') this.updateLand(dt, I);
    else if (this.mode === 'air') this.updateAir(dt);
    else if (this.mode === 'swim') this.updateSwim(dt, I);
    // 'locked' mode: position driven externally

    // vitals
    if (this.mode === 'swim' || this.mode === 'air') {
      if (this.atSurface || this.mode === 'air') this.breath = Math.min(1, this.breath + dt * 0.55);
      else this.breath = Math.max(0, this.breath - (dt / this.breathCap) * (this.dashT > 0 ? 1.8 : 1));
      if (this.breath <= 0 && this.alive) {
        this.health -= 7 * dt;
        if (this.health <= 0) { this.health = 0; this.alive = false; this.game.onPlayerHurt(0); }
      }
    } else this.breath = 1;
    if (this.hurtT > 4 && this.breath > 0 && this.alive) this.health = Math.min(this.maxHealth, this.health + 4 * dt);

    this.distance += this.pos.distanceTo(this.prevPos);
    this.syncModel(dt);
  }

  updateLand(dt, I) {
    const f = (I.forward ? 1 : 0) - (I.back ? 1 : 0);
    const s = (I.right ? 1 : 0) - (I.left ? 1 : 0);
    const cy = this.aimYaw;
    let mx = Math.sin(cy) * f - Math.cos(cy) * s;
    let mz = Math.cos(cy) * f + Math.sin(cy) * s;
    const len = Math.hypot(mx, mz);
    let target = 0;
    if (this.digging) { this.landSpeed = damp(this.landSpeed, 0, 10, dt); }
    else if (len > 0.01) {
      mx /= len; mz /= len;
      const want = Math.atan2(mx, mz);
      const diff = wrapAngle(want - this.yaw);
      const tr = lerp(5.0, 2.4, this.growth);
      this.yaw += clamp(diff, -tr * dt, tr * dt);
      let factor = 1;
      if (I.sprint && this.stamina > 0.05) { factor = 1.6; this.stamina = Math.max(0, this.stamina - dt / 1.8); }
      target = this.landMax * factor * Math.max(0.25, Math.cos(diff));
    }
    if (!(I.sprint && len > 0.01)) this.stamina = Math.min(1, this.stamina + dt / 3.2);
    this.landSpeed = damp(this.landSpeed, target, 7, dt);
    const sp = this.landSpeed;
    this.pos.x += Math.sin(this.yaw) * sp * dt + this.landDrift.x * dt;
    this.pos.z += Math.cos(this.yaw) * sp * dt + this.landDrift.z * dt;
    this.landDrift.set(0, 0, 0);
    // obstacles
    const r = this.size * 0.45;
    for (const o of this.game.obstacles) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz), m = o.r + r;
      if (d < m && d > 1e-4) { this.pos.x = o.x + (dx / d) * m; this.pos.z = o.z + (dz / d) * m; }
    }
    if (this.bounds) {
      this.pos.x = clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
      this.pos.z = clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
    }
    const g = groundHeight(this.pos.x, this.pos.z);
    this.pos.y = g + this.size * 0.1;
    const e = this.size * 0.5;
    const ha = groundHeight(this.pos.x + Math.sin(this.yaw) * e, this.pos.z + Math.cos(this.yaw) * e);
    const hb = groundHeight(this.pos.x - Math.sin(this.yaw) * e, this.pos.z - Math.cos(this.yaw) * e);
    this.pitch = damp(this.pitch, Math.atan2(ha - hb, 2 * e), 10, dt);
    this.vel.set(Math.sin(this.yaw) * sp, 0, Math.cos(this.yaw) * sp);
    const freq = this.digging ? 1.4 : sp / (this.size * 1.0);
    this.stroke += dt * (freq + 0.2);
    this.amp = damp(this.amp, this.digging ? 1 : clamp(sp / (this.landMax * 0.45), 0, 1), 8, dt);
    this.roll = Math.sin(this.stroke * TAU * (this.species.gaitSync ? 1 : 2)) * 0.1 * this.amp;
    this.yawRate = 0;
    this.atSurface = true;
  }

  updateSwim(dt, I) {
    const size = this.size;
    const vmax = this.maxSpeed;
    // entangled in a net
    if (this.entangled) {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.stroke += dt * 3;
      this.amp = 1; this.glide = 0;
      this.roll = Math.sin(this.stroke * 5) * 0.3;
      return;
    }
    // keep aim leashed to the body so the camera never spins away
    const leash = 1.15;
    this.aimYaw = this.yaw + clamp(wrapAngle(this.aimYaw - this.yaw), -leash, leash);
    if (I.left) this.aimYaw += 1.6 * dt;
    if (I.right) this.aimYaw -= 1.6 * dt;
    const vIn = (I.rise ? 1 : 0) - (I.dive ? 1 : 0);
    const pitchTarget = clamp(this.aimPitch + vIn * 0.6, -1.35, 1.35);
    const tr = this.turnRate;
    const wantYawRate = clamp(wrapAngle(this.aimYaw - this.yaw) * 4.5, -tr, tr);
    this.yawRate = damp(this.yawRate, wantYawRate, 6, dt);
    this.yaw += this.yawRate * dt;
    const wantPitchRate = clamp((pitchTarget - this.pitch) * 4.0, -tr * 0.85, tr * 0.85);
    this.pitchRate = damp(this.pitchRate, wantPitchRate, 6, dt);
    this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.4, 1.4);
    this.roll = damp(this.roll, clamp(-this.yawRate * 0.42, -0.95, 0.95), 4, dt);

    const fwd = this.forward(_f);
    const speed = this.vel.length();
    const thrusting = I.forward;
    // stroke cadence syncs to speed; bigger turtles stroke slower
    const cad = thrusting ? lerp(0.75, 1.45, clamp(speed / vmax, 0, 1)) / Math.sqrt(0.6 + size * 0.5) + (this.dashT > 0 ? 0.8 : 0) : 0.28;
    this.stroke += dt * cad;
    this.amp = damp(this.amp, thrusting ? 1 : 0.28, 3, dt);
    this.glide = damp(this.glide, thrusting || this.dashT > 0 ? 0 : clamp(speed / (vmax * 0.35), 0, 0.85), 2.5, dt);
    if (thrusting) {
      const ph = this.stroke * TAU;
      const power = 0.32 + 0.68 * Math.pow(Math.max(0, -Math.cos(ph)), 1.5) * 1.35;
      this.vel.addScaledVector(fwd, vmax * 1.05 * power * (this.species.stats.accel ?? 1) * dt);
    }
    if (I.back) this.vel.multiplyScalar(Math.exp(-1.8 * dt));
    if (vIn) this.vel.y += vIn * vmax * 0.55 * dt;
    if (I.dash && this.dashCD <= 0) {
      this.vel.addScaledVector(fwd, vmax * 1.15);
      this.dashT = 0.6; this.dashCD = 2.3;
      this.game.onDash();
    }
    if (this.dashT > 0) this.vel.addScaledVector(fwd, vmax * 1.2 * dt);
    // carve: velocity bends toward the heading like a wing
    const sp = this.vel.length();
    if (sp > 1e-3) {
      _t.copy(fwd).multiplyScalar(sp);
      this.vel.lerp(_t, 1 - Math.exp(-2.4 * dt));
    }
    // drag: gentle, for a long glide after every stroke
    const cap = vmax * (this.dashT > 0 ? 2.1 : 1);
    const k = 0.24 + (0.36 / vmax) * sp + (sp > cap ? (sp - cap) * 0.6 : 0);
    this.vel.multiplyScalar(Math.max(0, 1 - k * dt));
    // external forces (surf, currents, rips)
    this.vel.addScaledVector(this.ext, dt);
    this.ext.set(0, 0, 0);
    this.pos.addScaledVector(this.vel, dt);

    // surface
    const t = this.game.time;
    const sy = surfaceHeight(this.pos.x, this.pos.z, t);
    const top = sy - size * 0.3;
    if (this.pos.y > top) {
      if (this.vel.y > vmax * 0.42 && this.pitch > 0.28 && this.canBreach !== false) {
        this.mode = 'air';
        this.game.onBreach(this.pos, this.vel.length());
      } else {
        this.pos.y = top;
        if (this.vel.y > 0) this.vel.y *= 0.3;
      }
    }
    this.atSurface = this.pos.y > sy - size * 0.95;
    // floor
    const g = groundHeight(this.pos.x, this.pos.z);
    const fl = g + size * 0.32;
    if (this.pos.y < fl) {
      this.pos.y = fl;
      if (this.vel.y < 0) this.vel.y *= -0.1;
      this.vel.multiplyScalar(1 - 1.5 * dt);
    }
    // depth limit (size-gated pressure)
    if (this.pos.y < this.depthLimit) {
      this.vel.y += (this.depthLimit - this.pos.y) * 4 * dt;
    }
    if (this.bounds) {
      const b = this.bounds;
      if (this.pos.x < b.minX) this.vel.x += (b.minX - this.pos.x) * 3 * dt;
      if (this.pos.x > b.maxX) this.vel.x -= (this.pos.x - b.maxX) * 3 * dt;
      if (this.pos.z < b.minZ) this.vel.z += (b.minZ - this.pos.z) * 3 * dt;
      if (this.pos.z > b.maxZ) this.vel.z -= (this.pos.z - b.maxZ) * 3 * dt;
    }
  }

  updateAir(dt) {
    this.vel.y -= 15 * dt;
    this.vel.multiplyScalar(1 - 0.08 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.pitch = damp(this.pitch, Math.atan2(this.vel.y, hs), 5, dt);
    this.roll += dt * 2.2;
    this.stroke += dt * 0.6;
    this.amp = damp(this.amp, 0.7, 4, dt);
    this.glide = damp(this.glide, 0.2, 4, dt);
    const sy = surfaceHeight(this.pos.x, this.pos.z, this.game.time);
    if (this.pos.y < sy && this.vel.y < 0) {
      this.mode = 'swim';
      this.roll = wrapAngle(this.roll);
      this.vel.multiplyScalar(0.7);
      this.game.onSplashDown(this.pos, this.vel.length());
    }
    this.atSurface = true;
  }

  syncModel(dt) {
    const m = this.model;
    const size = this.size;
    m.group.visible = this.visible;
    m.group.position.copy(this.pos);
    m.group.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    m.group.scale.setScalar(size * (this.displayScale || 1));
    m.setMaturity(this.growth);
    const isLand = this.mode === 'land' || (this.mode === 'locked' && this.lockAnim !== 'swim');
    const bob = isLand ? Math.abs(Math.sin(this.stroke * TAU)) * 0.035 * this.amp : Math.sin(this.stroke * TAU) * 0.02 * this.amp;
    m.body.position.y = bob;
    m.body.rotation.x = isLand ? 0 : -Math.cos(this.stroke * TAU) * 0.04 * this.amp;
    const headYaw = clamp(wrapAngle(this.aimYaw - this.yaw), -0.6, 0.6) * 0.6;
    const headPitch = clamp(this.aimPitch - this.pitch, -0.5, 0.5) * 0.5 + this.chomp * 0.25;
    m.headPivot.position.z = m.rig.head.p[2] + this.chomp * 0.09;
    m.animate(dt, {
      mode: this.digging ? 'dig' : isLand ? 'land' : 'swim',
      phase: this.stroke % 1, amp: this.amp, glide: this.glide,
      turn: clamp(this.yawRate * 0.5, -1, 1), headYaw, headPitch,
    });
    // mouth position for eating
    this.forward(_f);
    this.mouth.copy(this.pos).addScaledVector(_f, size * 0.62);
  }
}

const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
export { rand, smoothstep };
