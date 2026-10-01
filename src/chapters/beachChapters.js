// I Hatching, II The Run to the Sea, VIII Nesting.
import * as THREE from 'three';
import { Chapter, updateRunner, spawnSibling } from './base.js';
import { std } from '../core/shared.js';
import { groundHeight, WORLD } from '../world/terrain.js';
import { surfaceHeight, swashFront } from '../world/water.js';
import { rand, clamp, lerp, smoothstep, TAU } from '../core/util.js';
import { SPECIES } from '../species.js';

const NEST = WORLD.nest;
const nestY = () => groundHeight(NEST.x, NEST.z);

// ============================================================== I Hatching
// Sea turtle eggs are soft and leathery. The hatchling slits the shell with its
// egg tooth, pokes its head out, pushes free as the egg crumples, rests, and then
// climbs with its siblings toward the surface of the sand.
function leatheryEgg(r) {
  const g = new THREE.SphereGeometry(r, 48, 32);
  g.scale(1, 1.08, 1);
  const mat = std({ color: 0xb9ad94, roughness: 0.9, side: THREE.DoubleSide }, {
    key: 'playerEgg', caustics: 0, rim: 0.15,
    uniforms: { uSlit: { value: 0 }, uDent: { value: 0 }, uR: { value: r } },
    vertexHead: 'uniform float uDent; uniform float uR;',
    vertexTransform: /* glsl */ `
      {
        vec3 u = position / uR;
        float n = vnoise(u.xz * 3.1 + u.y * 2.3);
        float d = uDent * (0.45 + 0.55 * n);
        // collapse from the top down, wrinkling as it deflates
        float top = smoothstep(-0.7, 1.0, u.y);
        transformed *= 1.0 - d * top * 0.55;
        transformed.y -= uDent * uR * 0.55 * (u.y + 1.0) * 0.5;
        transformed.xz *= 1.0 + uDent * 0.22 * (1.0 - top);
        transformed += normal * sin(u.x * 18.0 + u.y * 11.0) * uDent * uR * 0.03;
      }`,
    fragHead: 'uniform float uSlit; uniform float uR;',
    fragDiffuse: /* glsl */ `
      {
        vec3 u = normalize(vObj);
        // the tear opens at the top front, where the egg tooth cuts
        vec3 c = normalize(vec3(0.0, 0.62, 0.78));
        float ang = acos(clamp(dot(u, c), -1.0, 1.0));
        float jag = vnoise(vec2(atan(u.x, u.z) * 6.0, u.y * 9.0)) * 0.12;
        float open = uSlit * 0.95;
        if (ang < open * (0.8 + jag * 3.0) - 0.02) discard;
        float edge = 1.0 - smoothstep(0.0, 0.08, ang - open * (0.8 + jag * 3.0));
        vec3 shell = diffuseColor.rgb * (0.88 + 0.12 * vnoise(vObj.xy * 120.0));
        shell = mix(shell, vec3(0.55, 0.48, 0.38), smoothstep(-0.1, -0.8, u.y) * 0.8);
        shell = mix(shell, vec3(0.45, 0.36, 0.3), edge * step(0.01, uSlit));
        vec3 inner = vec3(0.6, 0.48, 0.42) * 0.55;
        diffuseColor.rgb = gl_FrontFacing ? shell : inner;
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return { mesh: m, u: mat.userData.uniforms };
}

export class Hatching extends Chapter {
  static meta = { num: 'Chapter I', title: 'Hatching', sub: 'Under a full moon on Casey Key, the sand begins to stir.', mood: 'night' };

  enter() {
    const G = this.game;
    G.setDay(0);
    const P = G.player;
    P.growth = 0;
    P.mode = 'locked';
    P.visible = false;
    P.control = false;
    G.hud({ meters: false, growth: false, diet: false });
    G.ui.setObjective('');
    G.beach.pit.visible = false;
    // the clutch in the nest hollow
    G.eggs.clear();
    const c = new THREE.Vector3(NEST.x, nestY(), NEST.z);
    this.sibEggs = [];
    // siblings fill the back and sides of the hollow, leaving her egg in clear view
    for (let i = 0; i < 12; i++) {
      const a = rand(-0.15, Math.PI + 0.15);
      const r = 0.26 + (i / 12) * 0.5;
      const p = new THREE.Vector3(c.x + Math.cos(a) * r * 1.2, 0, c.z + 0.05 + Math.sin(a) * r);
      p.y = groundHeight(p.x, p.z) + 0.07 + (i < 3 ? 0.08 : 0);
      this.sibEggs.push(G.eggs.add(p, 0.14));
    }
    const ep = new THREE.Vector3(c.x, 0, c.z - 0.42);
    ep.y = groundHeight(ep.x, ep.z) + 0.16;
    this.eggPos = ep.clone();
    this.egg = leatheryEgg(0.17);
    this.egg.mesh.position.copy(ep);
    this.egg.mesh.rotation.y = Math.PI; // the tear faces the sea, where she will head
    G.scene.add(this.egg.mesh);
    P.placeAt(ep.clone(), Math.PI, 'locked');
    G.eggs.sync(0);
    // opening shot: the moon over the Gulf, then down to the nest
    G.rig.override = { pos: new THREE.Vector3(4, 9, 34), look: new THREE.Vector3(0, 8, -60), fov: 55, follow: 1.2, lambda: 50 };
    G.rig.blend = 1;
    G.rig.pos.copy(G.rig.override.pos); G.rig.look.copy(G.rig.override.look);
    this.stage = 'intro';
    this.taps = 0;
    this.digTaps = 0;
    this.k = 0; // emergence progress 0..1
    this.wob = 0;
    G.audio.intensity = 0.3;
    (async () => {
      G.showCard(Hatching.meta);
      await G.sleep(3.6);
      // low and close, facing the egg from the seaward side
      G.rig.override = { pos: new THREE.Vector3(ep.x + 0.3, ep.y + 0.18, ep.z - 0.78), look: ep.clone().add(new THREE.Vector3(0, 0.06, 0)), fov: 46, follow: 0.9, lambda: 3 };
      await G.sleep(3.2);
      this.stage = 'pip';
      G.ui.setObjective(`Cut your way out of the egg, ${G.turtleName || 'little one'}`);
      G.ui.prompt('Tap Space');
    })();
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player, I = G.input, U = this.egg.u;
    G.eggs.sync(G.time);
    for (const e of G.eggs.list) e.wob = Math.max(0, e.wob - dt * 3);
    this.wob = Math.max(0, this.wob - dt * 3);
    const em = this.egg.mesh;
    em.rotation.x = Math.sin(G.time * 31) * 0.1 * this.wob;
    em.rotation.z = Math.cos(G.time * 27) * 0.1 * this.wob;

    // tapping: the egg tooth cuts, the head pokes out, flippers push
    if (this.stage === 'pip' && I.action) {
      this.taps++;
      this.wob = 1;
      G.audio.dig();
      if (this.taps % 2) G.audio.chirp();
      G.particles.sand.burst(this.eggPos, 3, 0.6, 0.5, 0.025);
      if (this.taps === 3) { P.visible = true; P.lockAnim = 'swim'; G.ui.setObjective('Push free of the shell'); }
      if (this.taps >= 5) {
        P.lockAnim = null;
        this.stage = 'emerge';
        this.et = 0;
        G.ui.prompt('');
        G.audio.chirp();
      }
    }
    const slitT = [0, 0.1, 0.18, 0.28, 0.36, 0.44][Math.min(5, this.taps)];
    U.uSlit.value += (slitT + (this.stage === 'emerge' || this.stage === 'rest' || this.stage === 'dig' || this.stage === 'out' ? 0.14 : 0) - U.uSlit.value) * Math.min(1, dt * 6);

    if (this.stage === 'emerge') {
      this.et += dt;
      this.k = Math.min(1, this.et / 2.2);
      U.uDent.value = smoothstep(0.15, 1, this.k);
      if (this.k >= 1) { this.stage = 'rest'; this.rt = 0; G.ui.setObjective('Catch your breath'); }
    } else if (this.stage === 'rest') {
      this.rt += dt;
      if (this.rt > 1.4) { this.stage = 'dig'; G.ui.setObjective('Dig your way out of the nest'); G.ui.prompt('Tap Space to dig'); }
    }

    if (this.taps >= 3 || this.stage !== 'pip') {
      const e = this.eggPos;
      const fwd = new THREE.Vector3(0, 0, -1);
      // inside the egg, curled with the head up at the tear; then out onto the sand
      const k = this.stage === 'pip' ? 0 : this.k;
      const poke = this.stage === 'pip' ? (this.taps - 2) * 0.012 : 0;
      const ke = k * k * (3 - 2 * k);
      const inside = e.clone().addScaledVector(fwd, 0.02 + poke).add(new THREE.Vector3(0, -0.03 + poke * 0.8, 0));
      const outside = e.clone().addScaledVector(fwd, 0.34);
      outside.y = groundHeight(outside.x, outside.z) + 0.02;
      if (this.digTaps === 0) {
        P.pos.lerpVectors(inside, outside, ke);
        P.pos.y += Math.sin(ke * Math.PI) * 0.06;
      } else {
        const rim = new THREE.Vector3(NEST.x, 0, NEST.z - 1.9);
        const target = outside.clone().lerp(rim, this.digTaps / 4);
        target.y = groundHeight(target.x, target.z) + P.size * 0.1;
        P.pos.lerp(target, 1 - Math.exp(-6 * dt));
      }
      P.mode = 'locked';
      P.yaw = Math.PI + Math.sin(G.time * 9) * 0.1 * (1 - ke) * (this.stage === 'rest' ? 0 : 1);
      P.pitch = this.digTaps === 0 ? 0.95 * (1 - ke) + 0.08 : 0.15 * (1 - this.digTaps / 4);
      P.roll = this.stage === 'emerge' ? Math.sin(G.time * 10) * 0.12 * (1 - ke) : 0;
      P.displayScale = this.digTaps === 0 ? 0.62 + 0.38 * ke : 1;
      // flippers flail while pushing free; at rest she breathes and looks around
      const resting = this.stage === 'rest';
      P.stroke += dt * (resting ? 0.4 : this.stage === 'emerge' ? 2.6 : this.stage === 'pip' ? 1.8 : 1.1);
      P.amp = resting ? 0.25 : this.stage === 'pip' ? 0.35 : 1;
      P.glide = this.stage === 'pip' ? 1 : 0;
      P.aimYaw = Math.PI + (resting ? Math.sin(this.rt * 2.2) * 0.5 : 0);
      P.aimPitch = resting ? 0.25 + Math.sin(this.rt * 3) * 0.08 : 0.1;
      if (this.stage === 'emerge' && Math.random() < dt * 6) G.particles.sand.burst(P.pos, 2, 0.6, 0.4, 0.02);
      // the camera eases back as she comes out
      const o = G.rig.override;
      if (o && this.digTaps === 0) {
        o.pos.lerp(new THREE.Vector3(e.x + 0.45, e.y + 0.32, e.z - 1.15), 1 - Math.exp(-dt * 0.8 * ke));
        o.look.lerp(P.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 1 - Math.exp(-3 * dt));
      } else if (o) o.look.lerp(P.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 1 - Math.exp(-3 * dt));
    }

    if (this.stage === 'dig' && I.action) {
      this.digTaps++;
      G.audio.dig();
      G.particles.sand.burst(P.pos.clone().add(new THREE.Vector3(0, 0.05, 0.1)), 14, 1.6, 0.8, 0.05, null, 1.2);
      P.stroke += 0.5;
      G.tracks.step(P.pos, P.yaw, P.size, 60, 0.7);
      if (this.digTaps === 1) G.rig.override.pos.set(this.eggPos.x + 0.7, this.eggPos.y + 0.85, this.eggPos.z - 1.6);
      const n = Math.floor((this.digTaps / 4) * this.sibEggs.length);
      for (let i = 0; i < n; i++) this.hatchSibling(this.sibEggs[i], rand(0.2, 0.9));
      if (this.digTaps >= 4) {
        this.stage = 'out';
        G.ui.prompt('');
        for (const e of this.sibEggs) this.hatchSibling(e, rand(0.3, 1.2));
        G.later(1.6, () => G.goto(1));
      }
    }
    // siblings' eggs deflate as they push out
    for (const e of this.sibEggs) if (e.hatched && e.on) e.sq = Math.min(1, (e.sq || 0) + dt * 1.6);
    for (const a of G.crowd.agents) if (a.active) updateRunner(a, dt, G.time, G.obstacles);
  }

  hatchSibling(e, delay) {
    if (!e.on || e.hatched) return;
    const G = this.game;
    e.wob = 1; e.hatched = true;
    G.later(delay, () => {
      const a = spawnSibling(G.crowd, G.species, e.pos.clone(), rand(0.6, 2.2));
      if (a) a.pos.y = groundHeight(a.pos.x, a.pos.z);
      G.particles.sand.burst(e.pos, 6, 1, 0.5, 0.03, null, 0.6);
      G.later(3, () => { e.on = false; });
    });
  }

  exit() {
    const G = this.game;
    G.player.displayScale = 1;
    G.player.lockAnim = null;
    const egg = this.egg.mesh;
    G.sleep(20).then(() => G.scene.remove(egg));
  }
}

// ============================================================== II The Run to the Sea
export class Run extends Chapter {
  static meta = { num: 'Chapter II', title: 'The Run to the Sea', sub: 'Follow the brightest horizon. Do not stop.', mood: 'night' };

  enter() {
    const G = this.game, P = G.player;
    G.setDay(0);
    P.mode = 'land';
    P.visible = true;
    P.control = true;
    P.growth = 0;
    P.health = P.maxHealth;
    P.bounds = { minX: -42, maxX: 42, minZ: -4, maxZ: 64 };
    if (P.pos.z > 70 || P.pos.z < 30) P.placeAt(new THREE.Vector3(NEST.x, 0, NEST.z - 1.7), Math.PI, 'land');
    P.pos.y = groundHeight(P.pos.x, P.pos.z);
    P.aimYaw = P.yaw = Math.PI;
    P.aimPitch = 0.1;
    G.rig.override = null;
    G.eggs.clear();
    G.beachLife.setVisible(true);
    G.beachLife.reset();
    G.sys.shells = 'land';
    this.checkpoint = new THREE.Vector3(NEST.x, 0, NEST.z - 2);
    if (G.crowd.activeCount < 4) {
      for (let i = 0; i < 14; i++) spawnSibling(G.crowd, G.species, new THREE.Vector3(NEST.x + rand(-1.5, 1.5), 0, NEST.z + rand(-2, 1)), rand(0, 1.5));
    }
    G.later(2.5, () => { G.stats.siblingsTotal = Math.max(G.stats.siblingsTotal || 0, G.crowd.activeCount); });
    G.hud({ meters: 'stamina', growth: false, diet: false });
    G.ui.setObjective('Reach the Gulf. Head for the moonlit surf.');
    G.ui.tips('<b>W A S D</b> crawl<br><b>Mouse</b> look around<br><b>Shift</b> scramble<br>Watch for gull shadows on the sand<br>Grabbed? Tap <b>Space</b> fast<br>Follow the moon, not the porch lights');
    for (const l of G.beach.lures) G.beach.setLure(l, true);
    this.lureWarned = false;
    this.lightsOff = 0;
    G.showCard(Run.meta);
    this.caughtLock = false;
    this.ready = false;
    G.later(2.5, () => (this.ready = true));
    this.targets = [];
    this.lastSurf = 0;
  }

  buildTargets() {
    const G = this.game, P = G.player;
    const T = [{ pos: P.pos, vel: P.vel, isPlayer: true, alive: () => this.ready && P.mode === 'land' && !this.caughtLock && !this.grab }];
    for (const a of G.crowd.agents) {
      if (a.active && (a.state === 'run')) T.push({ pos: a.pos, vel: a.vel, agent: a, alive: () => a.active && a.state === 'run' });
    }
    return T;
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player;
    for (const a of G.crowd.agents) if (a.active) updateRunner(a, dt, G.time, G.obstacles);
    const targets = this.buildTargets();
    G.beachLife.update(dt, G.time, targets, {
      onCatch: (t, by, from) => {
        if (t.isPlayer) { if (by === 'human') this.closeCall(from); else this.grabbed(by); }
        else if (by !== 'human' && t.agent) { t.agent.state = 'taken'; G.stats.siblingsLost++; }
      },
      onThud: (p, s) => {
        const d = p.distanceTo(P.pos);
        G.audio.thud(clamp(1.2 / (1 + d * 0.08), 0.1, 1));
        G.rig.shake(clamp(0.35 * Math.exp(-d / 7), 0, 0.35));
        G.particles.sand.burst(p.clone().add(new THREE.Vector3(0, 0.1, 0)), 10, 2.5, 0.6, 0.1, null, 1.5);
      },
      onGullCry: (p) => G.audio.gull(clamp(1.2 - p.distanceTo(P.pos) / 40, 0.2, 1)),
      onCrab: () => G.audio.crab(),
      onGullTarget: () => { G.ui.toast('A gull is diving at you. Move!', 'bad'); },
    }, P);
    this.updateGrab(dt);
    // porch lights on Casey Key pull hatchlings inland, until neighbors switch them off
    if (this.ready) {
      const offAt = [12, 26];
      if (this.lightsOff < 2 && this.t > offAt[this.lightsOff]) {
        const l = G.beach.lures.find((x) => x.on);
        if (l) { G.beach.setLure(l, false); G.ui.toast('A neighbor switched off a porch light. Thank you.', 'good'); }
        this.lightsOff++;
      }
      for (const l of G.beach.lures) {
        if (!l.on) continue;
        const dx = l.pos.x - P.pos.x, dz = l.pos.z - P.pos.z;
        const d = Math.hypot(dx, dz);
        if (P.pos.z > 14 && d < 70) {
          const k = (1 - d / 70) * 0.45;
          P.landDrift.x += (dx / d) * k; P.landDrift.z += (dz / d) * k;
          if (!this.lureWarned && k > 0.25) { this.lureWarned = true; G.ui.toast('Porch lights pull you inland. Turn toward the moon.', 'meh'); }
        }
        for (const a of G.crowd.agents) {
          if (!a.active || a.state !== 'run' || a.pos.z < 16) continue;
          if (Math.abs(a.pos.x - l.pos.x) < 22 && Math.random() < dt * 0.03) {
            a.state = 'lured'; a.data.lure = l.pos; G.stats.siblingsLost++;
          }
        }
      }
    }
    for (const cz of [48, 38, 28, 18, 9]) {
      if (P.pos.z < cz && this.checkpoint.z > cz + 1) { this.checkpoint.set(P.pos.x, 0, cz + 1); if (cz === 28) G.ui.toast('Halfway there. Keep going!', 'good'); }
    }
    // the swash: waves run up the sand over her, then drag her back toward the Gulf
    const wd = surfaceHeight(P.pos.x, P.pos.z, G.time) - groundHeight(P.pos.x, P.pos.z);
    if (wd > 0.02 && P.mode === 'land' && !this.grab) {
      const sw = swashFront(P.pos.x, G.time);
      const k = Math.min(1, wd / 0.1);
      P.landDrift.z += (sw.up ? 1.4 : -2.4) * k;
      P.roll = Math.sin(G.time * 9) * 0.12 * k;
      if (Math.random() < dt * 8 * k) G.particles.splash.spawn(P.pos.x + rand(-0.2, 0.2), P.pos.y + 0.05, P.pos.z + rand(-0.2, 0.2), rand(-0.4, 0.4), rand(0.6, 1.2), rand(-0.4, 0.4), 0.5, rand(0.02, 0.05));
      if (!this.wetToast) { this.wetToast = true; G.ui.toast('A wave washes over you. Let it carry you out!', 'good'); G.audio.splash(0.3); }
    }
    // the sea draws her in once the water is deep enough to swim
    if (((wd > P.size * 0.3 && P.pos.z < 1.5) || P.pos.z < -3) && !this.caughtLock) {
      G.splashAt(P.pos, 2);
      G.audio.splash(0.45);
      G.particles.bubbles.burst(P.pos, 14, 0.8, 1.2, 0.03);
      G.stats.siblingsSaved = G.crowd.agents.filter((a) => a.data.reached || (a.active && a.state === 'run')).length;
      G.goto(2);
    }
  }

  // a gull or crab has her: tap to wriggle free before she is carried off
  grabbed(by) {
    const G = this.game, P = G.player;
    if (this.grab || this.caughtLock) return;
    this.grab = { by, t: 0, taps: 0 };
    P.control = false;
    P.landSpeed = 0;
    G.audio.hurt();
    G.ui.hurtFlash(0.5);
    G.ui.prompt(by === 'gull' ? 'A gull has you! Tap Space to wriggle free' : 'A crab has you! Tap Space to wriggle free');
  }

  updateGrab(dt) {
    const G = this.game, P = G.player, gr = this.grab;
    if (!gr) return;
    gr.t += dt;
    P.stroke += dt * 4;
    P.amp = 1;
    P.roll = Math.sin(gr.t * 30) * 0.25;
    G.rig.shake(0.05);
    if (G.input.action) {
      gr.taps++;
      G.audio.chirp();
      G.particles.sand.burst(P.pos, 6, 1.4, 0.5, 0.04, null, 1);
    }
    G.ui.hold(Math.min(1, gr.taps / 5));
    if (gr.taps >= 5) {
      this.grab = null;
      G.beachLife.release();
      P.control = true;
      P.invuln = 2.5;
      P.roll = 0;
      G.ui.prompt(''); G.ui.hold(null);
      G.stats.closeCalls = (G.stats.closeCalls || 0) + 1;
      G.ui.toast('You wriggled free!', 'good');
    } else if (gr.t > 2.8) {
      const by = gr.by;
      this.grab = null;
      G.ui.prompt(''); G.ui.hold(null);
      this.caught(by);
    }
  }

  // a huge foot lands right beside her: a scare and a tumble, not the end
  closeCall(from) {
    const G = this.game, P = G.player;
    if (P.invuln > 0 || this.grab) return;
    const away = P.pos.clone().sub(from || P.pos); away.y = 0;
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    away.normalize();
    P.pos.addScaledVector(away, 0.6);
    P.invuln = 1.5;
    P.landSpeed = 0;
    G.rig.shake(0.4);
    G.ui.hurtFlash(0.35);
    G.ui.toast('Whoa! Nearly squashed', 'meh');
  }

  async caught(by) {
    if (this.caughtLock) return;
    const G = this.game, P = G.player;
    this.caughtLock = true;
    P.control = false;
    G.stats.caught++;
    G.audio.hurt();
    const msg = { gull: 'Snatched by a gull.', crab: 'Grabbed by a ghost crab.', human: 'Stepped on.' }[by] || 'Caught.';
    G.ui.toast(msg, 'bad');
    G.ui.hurtFlash(0.8);
    if (by === 'gull') P.visible = false;
    await G.ui.fade(1, 700);
    P.visible = true;
    P.placeAt(this.checkpoint.clone(), Math.PI, 'land');
    P.pos.y = groundHeight(P.pos.x, P.pos.z);
    P.invuln = 2.5;
    G.beachLife.reset();
    G.rig.snap(P);
    await G.sleep(0.3);
    G.ui.fade(0, 700);
    G.ui.toast('Try again. Tap fast when something grabs you.', 'meh');
    P.control = true;
    this.caughtLock = false;
  }

  exit() {
    this.game.beachLife.setVisible(false);
    this.game.player.bounds = null;
  }
}

// ============================================================== VIII Nesting
export class Nesting extends Chapter {
  static meta = { num: 'Chapter VIII', title: 'Nesting', sub: 'Back to the sand of Casey Key, where it all began.', mood: 'nest' };

  enter() {
    const G = this.game, P = G.player;
    G.setDay(0);
    G.sys.food = false; G.sys.shells = 'land'; G.sys.sharks = false; G.sys.currents = false;
    G.boats.setVisible(false); G.nets.setVisible(false);
    G.crowd.clear();
    G.eggs.clear();
    P.growth = 1;
    P.eggs = true;
    P.model.setGlow(0.35);
    P.visible = true;
    P.control = true;
    P.placeAt(new THREE.Vector3(NEST.x + 3, 0, 5), 0, 'land');
    P.pos.y = groundHeight(P.pos.x, P.pos.z);
    P.bounds = { minX: -45, maxX: 45, minZ: -2, maxZ: 66 };
    P.health = P.maxHealth;
    G.rig.override = null;
    G.rig.snap(P);
    G.beach.shimmer.visible = true;
    G.beach.shimmerMat.uniforms.uA.value = 0;
    G.beach.pit.visible = false;
    G.hud({ meters: false, growth: false, diet: false });
    G.ui.compass(null);
    G.ui.setObjective('Return to the sand where you were born');
    G.ui.tips('<b>W A S D</b> crawl<br>Follow the shimmer');
    this.stage = 'crawl';
    this.prog = 0;
    this.eggCount = 0;
    this.digSound = 0;
    (async () => {
      await G.ui.fade(0, 1400);
      G.showCard(Nesting.meta);
    })();
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player, I = G.input;
    const sm = G.beach.shimmerMat.uniforms.uA;
    sm.value = Math.min(1, sm.value + dt * 0.3) * (this.stage === 'crawl' ? 1 : Math.max(0, sm.value - dt));
    const d = Math.hypot(P.pos.x - NEST.x, P.pos.z - NEST.z);
    const held = I.actionHeld;
    if (this.stage === 'crawl') {
      if (d < 2.4) {
        this.stage = 'dig';
        const f = P.forward(new THREE.Vector3()); f.y = 0; f.normalize();
        const side = new THREE.Vector3(f.z, 0, -f.x);
        const S = P.size;
        const pit = P.pos.clone().addScaledVector(f, -S * 0.55);
        G.rig.override = { pos: P.pos.clone().addScaledVector(side, S * 2.6).addScaledVector(f, -S * 1.6).add(new THREE.Vector3(0, S * 1.2, 0)), look: pit, fov: 50, follow: 1.5, lambda: 1.2 };
        P.control = false;
        G.ui.setObjective('Dig a nest in the warm sand');
        G.ui.prompt('Hold Space to dig');
        G.ui.tips('');
        G.audio.chime();
      }
    } else if (this.stage === 'dig' || this.stage === 'lay' || this.stage === 'cover') {
      P.digging = held || this.stage === 'lay';
      const dur = { dig: 4.5, lay: 6, cover: 3.2 }[this.stage];
      if (held) this.prog = Math.min(1, this.prog + dt / dur);
      G.ui.hold(this.prog);
      const behind = P.pos.clone().addScaledVector(P.forward(), -P.size * 0.55);
      behind.y = groundHeight(behind.x, behind.z);
      if (this.stage === 'dig') {
        G.beach.pit.visible = true;
        G.beach.pit.position.set(behind.x, behind.y + 0.04, behind.z);
        G.beach.pit.scale.setScalar(0.3 + this.prog * 2.2);
        G.beach.pitMat.uniforms.uA.value = this.prog;
      }
      if (held) {
        this.digSound -= dt;
        if (this.digSound <= 0) {
          this.digSound = 0.4;
          if (this.stage !== 'lay') {
            G.audio.dig();
            G.particles.sand.burst(behind.clone().add(new THREE.Vector3(0, 0.2, 0)), 16, 3, 0.9, 0.12, null, 2);
          }
        }
        if (this.stage === 'lay') {
          const target = Math.floor(this.prog * 108);
          while (this.eggCount < target) {
            this.eggCount++;
            if (this.eggCount % 3 === 0) {
              const p = behind.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0.1 + rand(0, 0.2), rand(-0.4, 0.4)));
              G.eggs.add(p, 0.1);
            }
            if (this.eggCount % 4 === 0) G.audio.egg();
          }
          G.ui.prompt(`Hold Space to lay your eggs  ·  ${this.eggCount}`);
          G.eggs.sync(G.time);
        }
        if (this.stage === 'cover') {
          for (const e of G.eggs.list) if (e.on) e.pos.y -= dt * 0.08;
          G.beach.pitMat.uniforms.uA.value = 1 - this.prog;
          G.eggs.sync(G.time);
        }
      }
      if (this.prog >= 1) {
        this.prog = 0;
        if (this.stage === 'dig') { this.stage = 'lay'; G.ui.setObjective('Lay the next generation'); G.ui.prompt('Hold Space to lay your eggs'); P.model.setGlow(0.9); }
        else if (this.stage === 'lay') { this.stage = 'cover'; G.stats.eggs = this.eggCount; G.ui.setObjective('Cover and hide the nest'); G.ui.prompt('Hold Space to cover the nest'); P.model.setGlow(0); P.eggs = false; }
        else { this.stage = 'done'; G.ui.prompt(''); G.ui.hold(null); P.digging = false; this.finale(); }
      }
    }
    for (const a of G.crowd.agents) if (a.active) updateRunner(a, dt, G.time, G.obstacles);
    if (this.stage === 'finale') {
      // follow the wave of hatchlings to the sea
      const act = G.crowd.agents.filter((a) => a.active);
      if (act.length) {
        const c = new THREE.Vector3();
        for (const a of act) c.add(a.pos);
        c.divideScalar(act.length);
        const o = G.rig.override;
        o.look.lerp(c.clone().add(new THREE.Vector3(0, 0.3, -2)), 1 - Math.exp(-1.5 * dt));
        o.pos.lerp(new THREE.Vector3(c.x + 2.5, c.y + 1.6, c.z + 3.8), 1 - Math.exp(-0.6 * dt));
      }
      for (const a of act) if (a.state === 'swim' && !a.data.counted) { a.data.counted = true; G.stats.finaleSaved++; }
    }
  }

  async finale() {
    const G = this.game, P = G.player;
    P.control = false;
    G.stats.nested = true;
    await G.sleep(1.2);
    await G.ui.fade(1, 1500);
    G.eggs.clear();
    G.beach.pit.visible = false;
    G.beach.shimmer.visible = false;
    P.visible = false;
    P.mode = 'locked';
    G.ui.tips('');
    G.ui.setObjective('');
    await G.ui.line('Sixty nights later', 3000);
    this.stage = 'finale';
    const c = new THREE.Vector3(NEST.x, groundHeight(NEST.x, NEST.z), NEST.z);
    G.rig.override = { pos: c.clone().add(new THREE.Vector3(2.2, 1.3, 2.8)), look: c.clone().add(new THREE.Vector3(0, 0.2, -1.5)), fov: 54, follow: 2, lambda: 40 };
    G.rig.blend = 1;
    G.rig.pos.copy(G.rig.override.pos); G.rig.look.copy(G.rig.override.look);
    G.audio.intensity = 0.8;
    G.ui.fade(0, 1800);
    // the sand stirs, then they erupt
    for (let k = 0; k < 14; k++) {
      G.particles.sand.burst(c.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0.05, rand(-0.6, 0.6))), 6, 1.2, 0.7, 0.05, null, 1);
      await G.sleep(0.12);
    }
    const n = 48;
    for (let i = 0; i < n; i++) {
      const p = c.clone().add(new THREE.Vector3(rand(-0.7, 0.7), 0, rand(-0.7, 0.7)));
      const a = spawnSibling(G.crowd, G.species, p, rand(0, 0.6));
      if (a) { a.data.speed = rand(2.8, 3.8); G.stats.hatchlings = (G.stats.hatchlings || 0) + 1; }
      if (i % 6 === 0) { G.particles.sand.burst(p, 8, 1.5, 0.6, 0.05, null, 1.2); G.audio.chirp(); }
      await G.sleep(0.07);
    }
    G.ui.setObjective('');
    await G.sleep(14);
    G.audio.chime();
    await G.ui.line('And so the ocean begins again.', 3600);
    await G.ui.fade(1, 1600);
    G.finish();
  }

  exit() { this.game.player.bounds = null; }
}

export { SPECIES, lerp, smoothstep };
