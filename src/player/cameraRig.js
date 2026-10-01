// Third-person camera: spring follow with slight lag, FOV widening on dash,
// terrain and surface avoidance, footstep shake and cinematic overrides.
import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';
import { resolve as resolveColliders } from '../world/colliders.js';
import { surfaceHeight } from '../world/water.js';
import { clamp, lerp, damp, dampV3, smoothstep, noise2 } from '../core/util.js';

const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _l = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 5, 70);
    this.look = new THREE.Vector3(0, 0, 50);
    this.fov = 60;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.override = null; // { pos, look, fov, lambda }
    this.blend = 0;
    this.roll = 0;
    this.distScale = 1;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  snap(player) {
    this.compute(player, 1 / 60);
    this.pos.copy(this.desired);
    this.look.copy(this.desiredLook);
  }

  compute(player, dt) {
    const size = player.size;
    const g = player.growth;
    const des = (this.desired ||= new THREE.Vector3());
    const dl = (this.desiredLook ||= new THREE.Vector3());
    if (player.mode === 'land' || player.mode === 'locked') {
      const dist = lerp(2.4, 6.2, g) * this.distScale;
      const el = clamp(0.32 - player.aimPitch * 0.75, -0.02, 0.95);
      const yaw = player.aimYaw;
      _t.copy(player.pos); _t.y += size * 0.35;
      des.set(_t.x - Math.sin(yaw) * Math.cos(el) * dist, _t.y + Math.sin(el) * dist + size * 0.3, _t.z - Math.cos(yaw) * Math.cos(el) * dist);
      dl.set(_t.x + Math.sin(yaw) * size * 1.6, _t.y + Math.max(0, player.aimPitch) * dist * 1.3, _t.z + Math.cos(yaw) * size * 1.6);
      this.lambda = 7;
      this.baseFov = 58;
    } else {
      const sp = player.vel.length();
      const dir = player.mode === 'air' ? _d.copy(player.vel).normalize().lerp(player.aimDir(_p), 0.5).normalize() : player.aimDir(_d);
      const dist = (size * 3.3 + 0.9 + sp * 0.1) * this.distScale;
      _t.copy(player.pos);
      des.copy(_t).addScaledVector(dir, -dist);
      des.y += size * 0.75 + 0.2;
      dl.copy(_t).addScaledVector(dir, size * 2.6);
      this.lambda = 5.5;
      this.baseFov = 60 + clamp(sp / player.maxSpeed, 0, 1.5) * 5 + (player.inCurrent ? 9 : 0);
    }
    // terrain: pull in if the line to the camera dips into the ground
    const tgt = player.pos;
    let clip = 1;
    for (let k = 1; k <= 6; k++) {
      const f = k / 6;
      _p.lerpVectors(tgt, des, f);
      const gh = groundHeight(_p.x, _p.z) + 0.25 + size * 0.15;
      if (_p.y < gh) { clip = Math.min(clip, Math.max(0.25, (k - 1) / 6)); break; }
    }
    if (clip < 1) des.lerpVectors(tgt, des, clip).y += size * 0.5;
  }

  update(dt, player, time) {
    this.compute(player, dt);
    let lambda = this.lambda;
    let fov = this.baseFov + player.dashT * 18;
    if (this.override) {
      this.blend = damp(this.blend, 1, this.override.lambda ?? 2, dt);
    } else this.blend = damp(this.blend, 0, 2.5, dt);
    if (this.blend > 0.001 && this.override) {
      this.desired.lerp(this.override.pos, this.blend);
      this.desiredLook.lerp(this.override.look, this.blend);
      fov = lerp(fov, this.override.fov ?? fov, this.blend);
      lambda = lerp(lambda, this.override.follow ?? 3, this.blend);
    }
    dampV3(this.pos, this.desired, lambda, dt);
    dampV3(this.look, this.desiredLook, lambda * 1.6, dt);

    // hard constraints: never inside the ground; stay on the player's side of the surface
    const gh = groundHeight(this.pos.x, this.pos.z) + 0.2 + player.size * 0.12;
    if (this.pos.y < gh) this.pos.y = gh;
    const sy = surfaceHeight(this.pos.x, this.pos.z, time);
    const pSurf = surfaceHeight(player.pos.x, player.pos.z, time);
    const playerUnder = player.mode === 'swim' && player.pos.y < pSurf - player.size * 0.6;
    if (!this.override || this.blend < 0.5) {
      if (playerUnder && this.pos.y > sy - 0.3) this.pos.y = sy - 0.3;
      if (player.mode === 'land' && this.pos.y < sy + 0.3 && this.pos.z < 6) this.pos.y = sy + 0.3;
    }
    // keep the lens out of rocks and coral boulders
    if (this.pos.y < sy) resolveColliders(this.pos, 0.3 + player.size * 0.1);
    // avoid sitting exactly on the waterline
    if (Math.abs(this.pos.y - sy) < 0.12) this.pos.y = sy + (this.pos.y > sy ? 0.12 : -0.12);

    this.fov = damp(this.fov, fov, 4, dt);
    this.roll = damp(this.roll, player.mode === 'swim' ? player.roll * 0.12 : 0, 3, dt);
    this.shakeT += dt;
    this.shakeAmt *= Math.exp(-5 * dt);
    const s = this.shakeAmt;
    const cam = this.cam;
    cam.position.set(
      this.pos.x + noise2(this.shakeT * 25, 1.3) * s,
      this.pos.y + noise2(this.shakeT * 25, 7.1) * s,
      this.pos.z + noise2(this.shakeT * 25, 13.7) * s
    );
    _l.copy(this.look);
    cam.lookAt(_l);
    cam.rotateZ(this.roll + noise2(this.shakeT * 20, 3.3) * s * 0.08);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

export { smoothstep };
