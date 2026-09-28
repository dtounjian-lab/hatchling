// Chapter base + shared helpers for crowd behaviours.
import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';
import { surfaceHeight } from '../world/water.js';
import { rand, clamp, wrapAngle, damp, dampAngle, TAU } from '../core/util.js';

export class Chapter {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.ready = false;
  }
  enter() {}
  update(dt) { this.t += dt; }
  exit() {}
  onDeath() { this.game.defaultRespawn(); }
}

// A sibling hatchling scrambling toward the moonlit sea, then swimming away.
export function updateRunner(a, dt, time, obstacles) {
  a.t += dt;
  if (a.state === 'emerge') {
    a.mode = 'land';
    a.phase += dt * 1.5;
    a.amp = 0.8;
    if (a.t > a.data.delay) { a.state = 'run'; a.t = 0; }
    a.pos.y = groundHeight(a.pos.x, a.pos.z) + a.size * 0.1;
    return;
  }
  if (a.state === 'run') {
    const seed = a.data.seed ?? 0;
    const want = Math.PI + Math.sin(time * 0.8 + seed * 7) * 0.45 + (a.pos.x > 30 ? 0.4 : a.pos.x < -30 ? -0.4 : 0);
    a.yaw = dampAngle(a.yaw, want, 3, dt);
    const sp = a.data.speed * (0.75 + 0.25 * Math.sin(time * 3 + seed * 11));
    a.pos.x += Math.sin(a.yaw) * sp * dt;
    a.pos.z += Math.cos(a.yaw) * sp * dt;
    for (const o of obstacles) {
      const dx = a.pos.x - o.x, dz = a.pos.z - o.z;
      const d = Math.hypot(dx, dz), m = o.r + a.size * 0.4;
      if (d < m && d > 1e-4) { a.pos.x = o.x + (dx / d) * m; a.pos.z = o.z + (dz / d) * m; a.yaw += 0.05; }
    }
    a.vel.set(Math.sin(a.yaw) * sp, 0, Math.cos(a.yaw) * sp);
    const g = groundHeight(a.pos.x, a.pos.z);
    a.pos.y = g + a.size * 0.1;
    a.mode = 'land';
    a.phase += dt * (sp / (a.size * 1.0) + 0.2);
    a.amp = 1;
    a.roll = Math.sin(a.phase * TAU * 2) * 0.1;
    if (a.pos.z < 0.2) { a.state = 'swim'; a.t = 0; a.data.reached = true; }
    return;
  }
  if (a.state === 'lured') {
    // confused by artificial light, crawling inland away from the sea
    const L = a.data.lure;
    a.yaw = dampAngle(a.yaw, Math.atan2(L.x - a.pos.x, L.z - a.pos.z) + Math.sin(time * 2 + (a.data.seed ?? 0)) * 0.3, 2.5, dt);
    const sp = a.data.speed * 0.8;
    a.pos.x += Math.sin(a.yaw) * sp * dt;
    a.pos.z += Math.cos(a.yaw) * sp * dt;
    a.pos.y = groundHeight(a.pos.x, a.pos.z) + a.size * 0.1;
    a.mode = 'land';
    a.phase += dt * (sp / a.size + 0.2);
    a.amp = 1;
    if (a.pos.z > L.z - 12) a.active = false;
    return;
  }
  if (a.state === 'swim') {
    a.mode = 'swim';
    a.yaw = dampAngle(a.yaw, Math.PI + Math.sin(seedOf(a) + time) * 0.3, 2, dt);
    const sp = 2.4;
    a.pos.x += Math.sin(a.yaw) * sp * dt;
    a.pos.z += Math.cos(a.yaw) * sp * dt;
    const sy = surfaceHeight(a.pos.x, a.pos.z, time);
    const g = groundHeight(a.pos.x, a.pos.z);
    a.pos.y = damp(a.pos.y, Math.max(g + a.size * 0.4, sy - 0.25 - Math.min(1.2, a.t * 0.3)), 3, dt);
    a.pitch = damp(a.pitch, -0.15, 2, dt);
    a.roll = damp(a.roll, 0, 3, dt);
    a.phase += dt * 1.4;
    a.amp = 1; a.glide = 0;
    if (a.t > 14 || a.pos.z < -60) a.active = false;
  }
}
function seedOf(a) { return a.data.seed ?? 0; }

export function spawnSibling(crowd, sp, pos, delay = 0) {
  const a = crowd.spawn(sp, 0, pos);
  if (!a) return null;
  a.size = 0.34 * (0.85 + 0.15 * sp.stats.size) * rand(0.92, 1.08);
  a.yaw = Math.PI + rand(-0.6, 0.6);
  a.state = delay > 0 ? 'emerge' : 'run';
  a.data = { delay, seed: rand(0, 100), speed: rand(1.7, 2.5) };
  return a;
}

export { THREE, rand, clamp, wrapAngle, damp, dampAngle, TAU };
