// I Hatching, II The Run to the Sea, VIII Nesting.
import * as THREE from 'three';
import { Chapter, updateRunner, spawnSibling } from './base.js';
import { groundHeight, WORLD } from '../world/terrain.js';
import { rand, clamp, lerp, smoothstep, TAU } from '../core/util.js';
import { SPECIES } from '../species.js';

const NEST = WORLD.nest;
const nestY = () => groundHeight(NEST.x, NEST.z);

// ============================================================== I Hatching
function eggPiece(r, top) {
  // a jagged half shell: the cap flies off, the cup stays in the sand
  const g = top
    ? new THREE.SphereGeometry(r, 22, 10, 0, TAU, 0, Math.PI * 0.46)
    : new THREE.SphereGeometry(r, 22, 12, 0, TAU, Math.PI * 0.46, Math.PI * 0.54);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = Math.abs(y - Math.cos(Math.PI * 0.46) * r) < r * 0.02;
    if (edge) p.setY(i, y + Math.sin(Math.atan2(z, x) * 9) * r * 0.12);
    p.setY(i, p.getY(i) * 1.08);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xcdbfa3, roughness: 0.8, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
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
    // eggs in the nest hollow
    G.eggs.clear();
    const c = new THREE.Vector3(NEST.x, nestY(), NEST.z);
    this.sibEggs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU * 1.9 + rand(-0.2, 0.2);
      const r = 0.2 + (i / 12) * 0.55;
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + 0.1 + Math.sin(a) * r);
      p.y = groundHeight(p.x, p.z) + 0.1 + (i < 3 ? 0.1 : 0);
      this.sibEggs.push(G.eggs.add(p, 0.15));
    }
    const ep = new THREE.Vector3(c.x, 0, c.z - 0.42);
    ep.y = groundHeight(ep.x, ep.z) + 0.15;
    this.egg = G.eggs.add(ep, 0.17);
    this.eggPos = ep.clone();
    this.cap = eggPiece(0.17, true);
    this.cup = eggPiece(0.17, false);
    this.cap.visible = this.cup.visible = false;
    G.scene.add(this.cap, this.cup);
    P.placeAt(ep.clone(), Math.PI, 'locked');
    G.eggs.sync(0);
    // opening shot: the moon over the Gulf, then down to the nest
    G.rig.override = { pos: new THREE.Vector3(4, 9, 34), look: new THREE.Vector3(0, 8, -60), fov: 55, follow: 1.2, lambda: 50 };
    G.rig.blend = 1;
    G.rig.pos.copy(G.rig.override.pos); G.rig.look.copy(G.rig.override.look);
    this.stage = 'intro';
    this.taps = 0;
    this.digTaps = 0;
    this.pop = 0;
    G.audio.intensity = 0.3;
    (async () => {
      G.showCard(Hatching.meta);
      await G.sleep(3.6);
      G.rig.override = { pos: new THREE.Vector3(ep.x + 0.7, ep.y + 0.8, ep.z - 1.2), look: ep.clone().add(new THREE.Vector3(0, 0.02, 0.15)), fov: 48, follow: 0.9, lambda: 3 };
      await G.sleep(3.2);
      this.stage = 'crack';
      G.ui.setObjective(`Break free of your shell, ${G.turtleName || 'little one'}`);
      G.ui.prompt('Tap Space');
    })();
  }

  breakEgg() {
    const G = this.game, P = G.player;
    this.stage = 'emerge';
    this.egg.on = false;
    const e = this.eggPos;
    this.cup.visible = true;
    this.cup.position.copy(e);
    this.cap.visible = true;
    this.cap.position.copy(e);
    this.capVel = new THREE.Vector3(rand(-0.4, 0.4), 1.6, rand(0.3, 0.7));
    this.capSpin = new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-6, 6));
    G.particles.splash.burst(e.clone().add(new THREE.Vector3(0, 0.12, 0)), 14, 0.9, 0.6, 0.035, new THREE.Color(0.95, 0.93, 0.85), 0.8);
    P.visible = true;
    P.placeAt(e.clone(), Math.PI, 'locked');
    this.pop = 0;
    G.audio.crack();
    G.audio.chirp();
    G.ui.prompt('');
    G.ui.setObjective('Dig your way out of the nest');
  }

  update(dt) {
    super.update(dt);
    const G = this.game, P = G.player, I = G.input;
    G.eggs.sync(G.time);
    for (const e of G.eggs.list) e.wob = Math.max(0, e.wob - dt * 3);
    if (this.stage === 'crack' && I.action) {
      this.taps++;
      this.egg.crack = Math.min(1, this.taps / 5);
      this.egg.wob = 1;
      G.audio.crack();
      if (this.taps % 2) G.audio.chirp();
      G.particles.sand.burst(this.eggPos, 4, 0.8, 0.5, 0.03);
      if (this.taps >= 5) this.breakEgg();
    }
    // the cap tumbles away and settles on the sand
    if (this.cap && this.cap.visible && this.capVel) {
      this.capVel.y -= 6 * dt;
      this.cap.position.addScaledVector(this.capVel, dt);
      this.cap.rotation.x += this.capSpin.x * dt; this.cap.rotation.z += this.capSpin.z * dt;
      const gy = groundHeight(this.cap.position.x, this.cap.position.z) + 0.03;
      if (this.cap.position.y < gy) { this.cap.position.y = gy; this.capVel.set(0, 0, 0); this.capSpin.multiplyScalar(0); this.cap.rotation.x = Math.PI; }
    }
    if (this.stage === 'emerge' || this.stage === 'dig' || this.stage === 'out') {
      this.pop += dt;
      const e = this.eggPos;
      const out = Math.min(1, this.pop / 1.4);
      const wr = this.stage === 'emerge' ? 1 : 0.5;
      // wriggle up out of the cup, head first, then flop forward onto the sand
      P.stroke += dt * (this.stage === 'emerge' ? 2.4 : 1.1);
      P.amp = 0.6 + 0.4 * wr;
      P.aimYaw = Math.PI + Math.sin(this.pop * 0.9) * 0.25;
      P.aimPitch = 0.1 + Math.sin(this.pop * 0.7) * 0.08;
      P.mode = 'locked';
      P.yaw = Math.PI + Math.sin(this.pop * 7) * 0.12 * (1 - out);
      const rim = new THREE.Vector3(NEST.x, 0, NEST.z - 1.9);
      const start = e.clone().add(new THREE.Vector3(0, 0.02, -0.12 * out));
      const target = start.clone().lerp(rim, this.digTaps / 4);
      const gy = groundHeight(target.x, target.z) + P.size * 0.1;
      target.y = this.digTaps === 0 ? lerp(e.y - 0.02, gy, out) + Math.sin(out * Math.PI) * 0.05 : gy;
      P.pos.lerp(target, 1 - Math.exp(-6 * dt));
      P.pitch = this.digTaps === 0 ? lerp(0.9, 0.12, out) : 0.18 * (1 - this.digTaps / 4);
      P.roll = Math.sin(this.pop * 8) * 0.08 * (1 - out * 0.7);
      P.displayScale = this.digTaps === 0 ? lerp(0.72, 1, out) : 1;
      G.rig.override.look.lerp(P.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 1 - Math.exp(-3 * dt));
      if (this.stage === 'emerge' && out >= 1) { this.stage = 'dig'; G.ui.prompt('Tap Space to dig'); }
    }
    if (this.stage === 'dig' && I.action) {
      this.digTaps++;
      G.audio.dig();
      G.particles.sand.burst(P.pos.clone().add(new THREE.Vector3(0, 0.05, 0.1)), 14, 1.6, 0.8, 0.05, null, 1.2);
      P.stroke += 0.5;
      G.tracks.step(P.pos, P.yaw, P.size, 60, 0.7);
      // siblings begin to hatch around you
      const n = Math.floor((this.digTaps / 4) * this.sibEggs.length);
      for (let i = 0; i < n; i++) this.hatchSibling(this.sibEggs[i], rand(200, 900));
      if (this.digTaps >= 4) {
        this.stage = 'out';
        G.ui.prompt('');
        for (const e of this.sibEggs) this.hatchSibling(e, rand(300, 1200));
        G.later(1.6, () => G.goto(1));
      }
    }
    for (const a of G.crowd.agents) if (a.active) updateRunner(a, dt, G.time, G.obstacles);
  }

  hatchSibling(e, delay) {
    if (!e.on || e.hatched) return;
    const G = this.game;
    e.crack = 1; e.wob = 1; e.hatched = true;
    setTimeout(() => {
      e.on = false;
      const a = spawnSibling(G.crowd, G.species, e.pos.clone(), rand(0.3, 2.2));
      if (a) a.pos.y = groundHeight(a.pos.x, a.pos.z);
      G.particles.splash.burst(e.pos, 8, 1, 0.5, 0.04, new THREE.Color(0.95, 0.93, 0.85), 0.8);
    }, delay);
  }

  exit() {
    const G = this.game;
    G.player.displayScale = 1;
    setTimeout(() => { G.scene.remove(this.cap, this.cup); }, 20000);
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
    // the sea draws her in
    if (P.pos.z < 0.6 && !this.caughtLock) {
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
