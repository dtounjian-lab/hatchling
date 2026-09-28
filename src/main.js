// Hatchling: game bootstrap, main loop and shared systems.
import * as THREE from 'three';
import { U } from './core/shared.js';
import { Input } from './core/input.js';
import { createPost } from './core/post.js';
import { clamp, lerp, smoothstep, rand } from './core/util.js';
import { UI, wait } from './ui/ui.js';
import { AudioEngine } from './audio/audio.js';
import { SPECIES, speciesById, FOODS } from './species.js';
import { createTerrain, groundHeight, WORLD, ZONES, zoneIndexAt } from './world/terrain.js';
import { createWater, surfaceHeight } from './world/water.js';
import { createSky } from './world/sky.js';
import { Atmosphere } from './world/atmosphere.js';
import { createMarineSnow, ParticlePool } from './world/particles.js';
import { createGodRays } from './world/godrays.js';
import { createReef } from './world/reef.js';
import { createKelp } from './world/kelp.js';
import { createBeach } from './world/beach.js';
import { Eggs, Shells, Currents, Vents } from './world/extras.js';
import { BlobShadows } from './world/shadows.js';
import { FishSchools } from './creatures/fish.js';
import { Food, AmbientJellies } from './creatures/food.js';
import { Shark, Anglers } from './creatures/predators.js';
import { Whale } from './creatures/whale.js';
import { BeachLife } from './creatures/beachLife.js';
import { Boats, Nets } from './creatures/hazards.js';
import { TurtleCrowd } from './creatures/turtleCrowd.js';
import { Player } from './player/player.js';
import { CameraRig } from './player/cameraRig.js';
import { Hatching, Run, Nesting } from './chapters/beachChapters.js';
import { Surf, Growing, Gathering, Mate, Journey, LANES, NETS, stageName } from './chapters/oceanChapters.js';

const CHAPTERS = [Hatching, Run, Surf, Growing, Gathering, Mate, Journey, Nesting];
const nextFrame = () => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const params = new URLSearchParams(location.search);
if (params.has('nolock')) {
  // debug runs: collect errors and warnings so automated checks can read them back
  window.__errs = [];
  for (const k of ['error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { window.__errs.push(k + ': ' + a.map(String).join(' ').slice(0, 300)); orig(...a); };
  }
  window.addEventListener('error', (e) => window.__errs.push('uncaught: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + (e.reason && e.reason.message)));
}

class Game {
  constructor() {
    this.ui = new UI();
    this.audio = new AudioEngine();
    this.time = 0;
    this.day = 0;
    this.state = 'loading';
    this.paused = false;
    this.timers = [];
    this.sys = { food: false, shells: false, sharks: false, currents: false };
    this.hudFlags = { meters: false, growth: false, diet: false };
    this.stats = { eaten: 0, plastic: 0, shells: 0, deaths: 0, caught: 0, eggs: 0, finaleSaved: 0, siblingsLost: 0, siblingsSaved: 0, boatHits: 0, nets: 0, breaches: 0, playTime: 0 };
    this.engineLevel = 0; this.enginePitch = 0;
    this.godrayBoost = 0;
    this.speciesIdx = 0;
    this.hudTimer = 0;
    this.fps = 60;
    this.frameAcc = 0; this.frameCount = 0;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.whaleT = 10;
    this.breathBubbleT = 2;
  }

  async init() {
    const canvas = document.getElementById('gl');
    const R = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' }));
    R.setPixelRatio(this.pixelRatio);
    R.setSize(window.innerWidth, window.innerHeight);
    R.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 1800);
    this.input = new Input(canvas);
    const S = this.scene;
    const steps = [
      () => { this.atmos = new Atmosphere(S, R); this.sky = createSky(S); this.water = createWater(S); },
      () => { this.terrain = createTerrain(S); },
      () => { this.reef = createReef(S); },
      () => { this.kelp = createKelp(S); this.beach = createBeach(S); this.obstacles = this.beach.obstacles; },
      () => {
        this.snow = createMarineSnow(S);
        this.godrays = createGodRays(S);
        this.particles = {
          bubbles: new ParticlePool(S, 900, 'bubble', { color: 0xdff6ff, size: 1 }),
          splash: new ParticlePool(S, 700, 'splash', { color: 0xeaf8ff, size: 1 }),
          sand: new ParticlePool(S, 500, 'sand', { color: 0xcdbb95, size: 1 }),
          glow: new ParticlePool(S, 1400, 'glow', { color: 0x66e0ff, additive: true, size: 1 }),
        };
      },
      () => { this.fish = new FishSchools(S); this.jellies = new AmbientJellies(S); this.whale = new Whale(S); },
      () => { this.food = new Food(S); this.shells = new Shells(S); this.currents = new Currents(S); this.vents = new Vents(S); },
      () => {
        this.sharks = [
          new Shark(S, 'reef', new THREE.Vector3(-60, -8, -200), 60),
          new Shark(S, 'reef', new THREE.Vector3(70, -9, -320), 60),
          new Shark(S, 'reef', new THREE.Vector3(0, -10, -390), 50),
          new Shark(S, 'reef', new THREE.Vector3(-50, -14, -520), 70),
          new Shark(S, 'reef', new THREE.Vector3(60, -15, -640), 70),
          new Shark(S, 'tiger', new THREE.Vector3(0, -30, -850), 90),
          new Shark(S, 'tiger', new THREE.Vector3(-80, -35, -980), 90),
          new Shark(S, 'sixgill', new THREE.Vector3(0, -125, -1200), 100),
        ];
        this.anglers = new Anglers(S, 7);
      },
      () => {
        this.beachLife = new BeachLife(S);
        this.boats = new Boats(S, LANES);
        this.nets = new Nets(S, NETS);
        this.eggs = new Eggs(S);
        this.crowd = new TurtleCrowd(S, 64);
        this.blobs = new BlobShadows(S, 120);
      },
      () => {
        this.species = speciesById(params.get('sp') || 'green');
        this.speciesIdx = SPECIES.indexOf(this.species);
        this.player = new Player(this, this.species);
        this.player.setSpecies(this.species);
        this.rig = new CameraRig(this.camera);
        this.post = createPost(R, S, this.camera);
        this.onResize();
      },
    ];
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      this.ui.setLoading((i + 1) / (steps.length + 1));
      await nextFrame();
    }
    this.setDay(0);
    this.setupTitle();
    this.updateTitle(0.016);
    this.atmos.update(0.016, this.camera, 0, 0, 0.3);
    try { await R.compileAsync(S, this.camera); } catch (e) { /* not critical */ }
    this.ui.setLoading(1);
    window.addEventListener('resize', () => this.onResize());
    this.bindUI();
    this.clock = new THREE.Timer();
    this.loop();
    await wait(200);
    this.ui.hideLoading();
    const ch = params.get('ch');
    if (ch !== null) {
      const g = parseFloat(params.get('g') || '0');
      this.startGame(parseInt(ch, 10), g);
    } else {
      this.state = 'title';
      this.ui.showTitle(true);
    }
  }

  // ------------------------------------------------------------------ title
  setupTitle() {
    const P = this.player;
    const n = WORLD.nest;
    P.placeAt(new THREE.Vector3(n.x, groundHeight(n.x, n.z) + 0.02, n.z), 0.4, 'locked');
    P.growth = 0;
    this.titleT = 0;
    this.hop = 0;
    this.rig.override = { pos: new THREE.Vector3(n.x - 0.15, groundHeight(n.x, n.z) + 0.5, n.z + 1.85), look: new THREE.Vector3(n.x + 0.2, groundHeight(n.x, n.z) + 0.36, n.z - 0.5), fov: 38, follow: 3, lambda: 60 };
    if (!this.keyLight) {
      this.keyLight = new THREE.PointLight(0xd6e4ff, 2.5, 6, 1.2);
      this.scene.add(this.keyLight);
    }
    this.keyLight.position.set(n.x + 0.7, groundHeight(n.x, n.z) + 0.9, n.z + 0.6);
    this.rig.blend = 1;
    this.rig.pos.copy(this.rig.override.pos);
    this.rig.look.copy(this.rig.override.look);
  }

  updateTitle(dt) {
    const P = this.player;
    this.titleT += dt;
    this.hop = Math.max(0, this.hop - dt * 2.5);
    P.yaw += dt * 0.45;
    P.aimYaw = P.yaw;
    P.aimPitch = 0.15 + Math.sin(this.titleT * 0.7) * 0.1;
    P.stroke += dt * (0.35 + this.hop * 2);
    P.amp = 0.45 + this.hop;
    const n = WORLD.nest;
    P.pos.y = groundHeight(n.x, n.z) + 0.02 + Math.sin(this.hop * Math.PI) * 0.12;
    P.mode = 'locked';
  }

  cycleSpecies(d) {
    this.speciesIdx = (this.speciesIdx + d + SPECIES.length) % SPECIES.length;
    this.species = SPECIES[this.speciesIdx];
    this.player.setSpecies(this.species);
    this.ui.setSpecies(this.species, this.speciesIdx, SPECIES.length);
    this.hop = 1;
    this.audio.chirp();
  }

  bindUI() {
    this.ui.setSpecies(this.species, this.speciesIdx, SPECIES.length);
    document.getElementById('spPrev').onclick = () => { this.audio.init(); this.cycleSpecies(-1); };
    document.getElementById('spNext').onclick = () => { this.audio.init(); this.cycleSpecies(1); };
    document.getElementById('beginBtn').onclick = () => this.startGame(0, 0);
    document.getElementById('resumeBtn').onclick = () => this.resume();
    document.getElementById('capture').onclick = () => this.resume();
    document.getElementById('againBtn').onclick = () => { window.onbeforeunload = null; location.href = location.pathname; };
    document.getElementById('optInvert').onchange = (e) => (this.input.invertY = e.target.checked);
    document.getElementById('optVol').oninput = (e) => this.audio.setVolume(parseFloat(e.target.value));
    document.getElementById('optSens').oninput = (e) => (this.input.sensitivity = parseFloat(e.target.value));
    window.addEventListener('keydown', (e) => {
      if (this.state === 'title') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.audio.init(); this.cycleSpecies(-1); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.audio.init(); this.cycleSpecies(1); }
        if (e.code === 'Enter') this.startGame(0, 0);
      } else if (this.state === 'play' && e.code === 'KeyP') {
        this.paused ? this.resume() : this.pause();
      }
    });
    window.addEventListener('pointerdown', () => this.audio.init(), { once: false });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked && !params.has('nolock')) { this.input.lock(); if (this.paused) this.unpause(); }
    });
    this.input.onLockChange = (locked) => {
      if (locked) { this.hadLock = true; if (this.paused) this.unpause(); }
      else if (this.state === 'play' && this.hadLock && !this.paused) this.pause();
    };
  }

  startGame(ch, growth = 0) {
    if (this.state === 'play') return;
    this.audio.init();
    this.ui.showTitle(false);
    this.state = 'play';
    this.player.setSpecies(this.species);
    this.player.growth = growth;
    this.rig.override = null;
    if (!params.has('nolock')) this.input.lock();
    if (!params.has('nolock') && params.get('ch') === null) window.onbeforeunload = (e) => { if (this.state === 'play') { e.preventDefault(); return ''; } };
    this.ui.showHUD(true);
    if (ch >= 3) {
      // debug entry points
      const P = this.player;
      if (ch === 3) P.placeAt(new THREE.Vector3(0, -4, -100), Math.PI, 'swim');
      if (ch === 4 || ch === 5) { P.growth = 1; P.placeAt(new THREE.Vector3(0, -20, -800), Math.PI, 'swim'); }
      if (ch === 5) this.goto(4);
      if (ch === 7) { P.growth = 1; }
      this.rig.snap(P);
    }
    if (ch === 5) this.goto(5); else this.goto(ch);
  }

  pause() {
    if (this.state !== 'play') return;
    this.paused = true;
    this.ui.pause(true);
    this.audio.ctx && this.audio.ctx.suspend();
  }
  resume() {
    if (!params.has('nolock')) this.input.lock();
    this.unpause();
  }
  unpause() {
    this.paused = false;
    this.ui.pause(false);
    this.ui.capture(false);
    this.audio.resume();
  }

  // ------------------------------------------------------------------ chapters
  goto(i) {
    if (this.chapter) this.chapter.exit();
    const C = CHAPTERS[i];
    this.chapterIndex = i;
    this.chapter = new C(this);
    const m = C.meta;
    this.ui.setChapter(`${m.num.replace('Chapter ', '')}  ·  ${m.title}`);
    this.mood = m.mood;
    this.ui.prompt('');
    this.ui.hold(null);
    this.chapter.enter();
  }

  showCard(m) {
    this.audio.chime();
    this.ui.card(m.num, m.title, m.sub);
  }

  hud(flags) { Object.assign(this.hudFlags, flags); }

  setDay(v) { this.day = v; U.uDay.value = v; }

  sleep(s) { return new Promise((resolve) => this.timers.push({ t: s, resolve })); }

  // ------------------------------------------------------------------ player events
  onPlayerHurt(amount) {
    const P = this.player;
    if (amount > 0) {
      this.ui.hurtFlash(clamp(amount / 40, 0.4, 1));
      this.audio.hurt();
      this.rig.shake(0.25);
    }
    if (!P.alive && !this.dying) this.handleDeath();
  }

  async handleDeath() {
    this.dying = true;
    const P = this.player;
    P.control = false;
    this.stats.deaths++;
    this.ui.toast('Life is fragile. Try again.', 'bad');
    await this.ui.fade(1, 900);
    this.chapter.onDeath();
    await this.sleep(0.4);
    await this.ui.fade(0, 900);
    this.dying = false;
  }

  respawnAt(pos, yaw) {
    const P = this.player;
    P.placeAt(pos, yaw, 'swim');
    P.alive = true;
    P.health = P.maxHealth;
    P.breath = 1;
    P.invuln = 3;
    P.control = true;
    this.rig.snap(P);
  }

  defaultRespawn() {
    const P = this.player;
    this.respawnAt(P.pos.clone().setY(Math.min(-2, P.pos.y + 4)), P.yaw);
  }

  onDash() {
    const P = this.player;
    this.audio.dash();
    const back = P.forward().multiplyScalar(-P.size * 0.5).add(P.pos);
    this.particles.bubbles.burst(back, 16, 1.5 + P.size, 1.2, 0.05 + P.size * 0.04);
  }

  onBreach(pos, speed) {
    this.stats.breaches++;
    this.audio.splash(clamp(speed / 8, 0.4, 1));
    this.splashAt(pos, speed);
    if (this.stats.breaches === 1) this.ui.toast('Breach!', 'gold');
  }
  onSplashDown(pos, speed) {
    this.audio.splash(clamp(speed / 8, 0.3, 1));
    this.splashAt(pos, speed);
    this.particles.bubbles.burst(pos, 30, 2, 1.4, 0.05 + this.player.size * 0.05);
  }
  splashAt(pos, speed) {
    const P = this.player;
    const p = pos.clone(); p.y = surfaceHeight(p.x, p.z, this.time);
    this.particles.splash.burst(p, 40, 2 + speed * 0.5, 1.1, 0.12 + P.size * 0.12, null, 3 + speed * 0.4);
  }

  handleEat(it) {
    const P = this.player;
    const name = FOODS[it.type].name;
    P.chomp = 1;
    const col = this.food.meshes[it.type].instanceColor;
    const c = new THREE.Color(col.getX(it.idx), col.getY(it.idx), col.getZ(it.idx));
    this.particles.glow.burst(it.pos, 8, 1.2, 0.6, 0.05 + P.size * 0.03, c);
    if (it.type === 'plastic') {
      this.stats.plastic++;
      this.audio.chomp(0);
      P.hurt(14);
      P.slowT = 6;
      if (this.chapterIndex === 3) P.growth = Math.max(0, P.growth - 0.012);
      this.ui.toast('Plastic. It fills the belly but feeds nothing.', 'bad');
      return;
    }
    const match = this.species.diet(it.type, P.growth);
    this.audio.chomp(match);
    P.health = Math.min(P.maxHealth, P.health + 12 * match);
    if (match >= 0.25) this.stats.eaten++;
    if (this.chapterIndex === 3) {
      const zi = { reef: 1, kelp: 2, open: 3, deep: 4 }[it.zone];
      const cap = [0.3, 0.3, 0.55, 0.8, 1.0][zi];
      const mult = [1, 1, 1.15, 1.3, 1.45][zi];
      const gain = FOODS[it.type].base * match * mult;
      if (P.growth < cap) P.growth = Math.min(cap, P.growth + gain);
      else P.growth = Math.min(1, P.growth + gain * 0.1);
      if (P.growth > 0.985) P.growth = 1;
    }
    if (match >= 0.75) this.ui.toast(`+ ${name}`, 'good');
    else if (match >= 0.25) this.ui.toast(`${name}  ·  a little nourishment`, 'meh');
    else this.ui.toast(`${name} are not her food`, 'meh');
  }

  // ------------------------------------------------------------------ results
  finish() {
    this.state = 'results';
    window.onbeforeunload = null;
    this.input.unlock();
    this.ui.showHUD(false);
    const s = this.stats;
    const mm = Math.floor(s.playTime / 60), ss = Math.floor(s.playTime % 60);
    this.ui.results({
      title: 'A life, complete',
      sub: `${this.species.name} sea turtle  ·  ${this.species.latin}`,
      items: [
        ['Time', `${mm}:${String(ss).padStart(2, '0')}`],
        ['Food eaten', s.eaten],
        ['Shells', `${this.shells.collected} / ${this.shells.total}`],
        ['Distance', `${(this.player.distance * 0.0012).toFixed(1)} km`],
        ['Eggs laid', s.eggs || 108],
        ['Hatchlings', s.hatchlings || 48],
        ['Plastic eaten', s.plastic],
        ['Second chances', s.deaths + s.caught],
      ],
    });
    this.ui.fade(0, 1200);
  }

  // ------------------------------------------------------------------ loop
  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 2 || h < 2) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    this.clock.update();
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    const visible = window.innerWidth > 1 && window.innerHeight > 1 && !document.hidden;
    if (visible && (this.renderer.domElement.width < 2)) this.onResize();
    if (visible) this.adaptResolution(dt);
    if (this.paused) { if (visible) this.post.render(0); return; }
    this.update(dt);
    if (visible) this.post.render(dt);
    this.input.endFrame();
  }

  // Debug helper: advance the simulation manually (used for automated checks while the page is hidden).
  step(seconds, dt = 1 / 60) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { this.update(dt); this.input.endFrame(); }
    this.post.render(dt);
    return this.time;
  }

  adaptResolution(dt) {
    this.frameAcc += dt; this.frameCount++;
    if (this.frameAcc > 2) {
      this.fps = this.frameCount / this.frameAcc;
      this.frameAcc = 0; this.frameCount = 0;
      const maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
      let pr = this.pixelRatio;
      if (this.fps < 50 && pr > 0.75) pr = Math.max(0.75, pr - 0.125);
      else if (this.fps > 58.5 && pr < maxPR) pr = Math.min(maxPR, pr + 0.125);
      if (pr !== this.pixelRatio) {
        this.pixelRatio = pr;
        this.renderer.setPixelRatio(pr);
        this.onResize();
      }
    }
  }

  update(dt) {
    this.time += dt;
    U.uTime.value = this.time;
    const P = this.player;
    // timers (game time)
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.resolve(); }
    }
    const [mdx, mdy] = this.input.consumeMouse();
    if (this.state === 'title' || this.state === 'loading') {
      this.updateTitle(dt);
      P.syncModel(dt);
    } else if (this.state === 'play') {
      this.stats.playTime += dt;
      if (P.control) P.look(mdx, mdy);
      this.chapter && this.chapter.update(dt);
      P.update(dt, this.input);
    }
    if (this.keyLight) this.keyLight.intensity = (this.state === 'title' || this.chapterIndex === 0) ? 2.5 : 0;
    this.updateWorld(dt);
    this.rig.update(dt, P, this.time);
    this.updateAudio(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && this.state === 'play') { this.hudTimer = 0.1; this.updateHUD(); }
  }

  updateWorld(dt) {
    const P = this.player, cam = this.camera;
    const time = this.time;
    const camPos = cam.position;
    const surfY = surfaceHeight(camPos.x, camPos.z, time);
    this.water.update(camPos);
    this.sky.update(camPos);
    const zi = this.atmos.update(dt, cam, surfY, this.day, P.size);
    this.zone = zi;
    const under = this.atmos.underwater;
    this.sky.mesh.visible = !under;
    const snowCol = this.atmos.fog.color.clone().multiplyScalar(2.2).addScalar(0.12);
    this.snow.update(cam, under, snowCol, zi === 4 ? 1 : (1 - this.day) * 0.6, P.size);
    const depth = Math.max(0, -camPos.y);
    const rays = under ? this.day * Math.exp(-depth / 45) * (zi === 4 ? 0 : zi === 2 ? 1.1 : 1) * 0.5 + this.godrayBoost * 0.5 : 0;
    this.godrays.update(cam, rays, U.uSunColor.value.clone().lerp(this.atmos.fog.color, 0.3).multiplyScalar(0.8), P.size);
    this.post.update(dt, time, this.atmos.grade, P.pos, P.size * 6 + 5);

    const underPlayer = P.mode === 'swim';
    // creatures
    const threats = [{ pos: P.pos, r: 2.5 + P.size * 3 }];
    for (const s of this.sharks) if (s.pos.distanceToSquared(camPos) < 80 * 80) threats.push({ pos: s.pos, r: 8 });
    this.fish.update(dt, time, camPos, threats);
    this.jellies.update(time);
    this.whale.update(dt);
    if (this.state === 'play' && underPlayer) {
      this.whaleT -= dt;
      if (this.whaleT <= 0 && this.whale.pos.distanceTo(P.pos) < 200) { this.whaleT = 22; this.audio.whale(); }
    }
    const active = this.state === 'play' && P.alive && P.control;
    // food
    if (this.sys.food !== this.food.visible) this.food.setVisible(this.sys.food);
    if (this.sys.food) {
      const it = this.food.update(dt, time, P, active && underPlayer);
      if (it) this.handleEat(it);
    }
    this.shells.setVisible(this.sys.shells);
    if (this.sys.shells && active) {
      const s = this.shells.update(time, P);
      if (s) { this.audio.pickup(); this.ui.toast(`Shell found  ·  ${this.shells.collected} / ${this.shells.total}`, 'gold'); P.health = P.maxHealth; }
    }
    this.currents.setVisible(this.sys.currents);
    if (this.sys.currents) {
      const f = this._cf || (this._cf = new THREE.Vector3());
      const inside = this.currents.update(dt, P, f);
      if (inside && underPlayer) {
        P.ext.add(f);
        if (!this.inCurrent) { this.ui.toast('Riding the current', 'good'); this.audio.swell(); }
      }
      this.inCurrent = inside;
    }
    // predators
    P.hidden = (zi === 2 && P.pos.y < groundHeight(P.pos.x, P.pos.z) + 16) || (zi === 1 && P.pos.y < groundHeight(P.pos.x, P.pos.z) + 2.5);
    for (const s of this.sharks) {
      if (s.pos.distanceToSquared(P.pos) > 260 * 260 && this.state === 'play') continue;
      const dmg = s.update(dt, P, this.sys.sharks && active && underPlayer);
      if (dmg) {
        P.hurt(dmg, s.pos);
        this.ui.toast('Bitten!', 'bad');
        this.particles.bubbles.burst(P.pos, 20, 2, 1, 0.06 + P.size * 0.04);
      }
    }
    if (P.pos.z < -1040) {
      const dmg = this.anglers.update(dt, time, P);
      if (dmg && active) { P.hurt(dmg, P.pos.clone().add(new THREE.Vector3(0, 0, -1))); this.ui.toast('An anglerfish snaps!', 'bad'); }
    }
    if (camPos.z < -1000) this.vents.update(dt, camPos, this.particles.bubbles);

    // player trails: speed-line bubbles on fast dives, plankton glow in the dark, breath bubbles
    if (underPlayer && this.state === 'play') {
      const sp = P.vel.length();
      const f = P.forward();
      const side = new THREE.Vector3(f.z, 0, -f.x).normalize();
      if ((sp > P.maxSpeed * 0.85 && P.pitch < -0.25) || P.dashT > 0) {
        for (let k = 0; k < 3; k++) {
          const s = k % 2 ? 1 : -1;
          const p = P.pos.clone().addScaledVector(side, s * P.size * rand(0.4, 0.7)).addScaledVector(f, -P.size * rand(0, 0.5));
          this.particles.bubbles.spawn(p.x, p.y, p.z, -f.x * sp * 0.3, -f.y * sp * 0.3, -f.z * sp * 0.3, rand(0.6, 1.2), rand(0.03, 0.06) + P.size * 0.02);
        }
      }
      const dark = zi === 4 || this.day < 0.3;
      if (dark && sp > 0.8 && Math.random() < 0.9) {
        const p = P.pos.clone().addScaledVector(f, -P.size * 0.5).addScaledVector(side, rand(-1, 1) * P.size * 0.6);
        this.particles.glow.spawn(p.x, p.y, p.z, rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(1.5, 2.8), rand(0.04, 0.08) + P.size * 0.02, new THREE.Color(0.25, 1.4, 1.8));
      }
      this.breathBubbleT -= dt;
      if (this.breathBubbleT <= 0 && !P.atSurface) {
        this.breathBubbleT = rand(2.5, 5);
        this.particles.bubbles.burst(P.mouth, 3, 0.4, 3, 0.03 + P.size * 0.015, null, 0.5);
      }
    }
    const surfAt = (x, z) => surfaceHeight(x, z, time);
    for (const k in this.particles) this.particles[k].update(dt, surfAt);
    this.crowd.update();
    // contact shadows
    const B = this.blobs;
    B.begin();
    if (P.visible) B.add(P.pos.x, P.pos.y, P.pos.z, P.size * 0.95, P.size * 1.25, P.yaw, 0.55);
    for (const a of this.crowd.agents) if (a.active && a.pos.distanceToSquared(camPos) < 90 * 90) B.add(a.pos.x, a.pos.y, a.pos.z, a.size * 0.95, a.size * 1.25, a.yaw, 0.5);
    for (const e of this.eggs.list) if (e.on) B.add(e.pos.x, e.pos.y - e.r, e.pos.z, e.r * 2.6, e.r * 2.6, 0, 0.45);
    B.end();
  }

  updateAudio(dt) {
    const camPos = this.camera.position;
    const under = this.atmos.underwater;
    const shoreD = Math.max(0, -camPos.z);
    const surf = Math.exp(-shoreD / 45) * (under ? 0.5 : 1);
    let mood = this.mood || 'night';
    if (this.chapterIndex === 3) mood = ['reef', 'reef', 'kelp', 'open', 'deep'][this.zone ?? 1];
    if (this.state === 'title') mood = 'night';
    const intensity = this.chapterIndex === 4 || this.chapterIndex === 5 ? this.audio.intensity : this.state === 'play' ? 0.4 : 0.3;
    this.audio.update(dt, {
      under, surf, wind: under ? 0 : 1 - this.day * 0.5, depth: Math.max(0, -camPos.y),
      engine: this.engineLevel, enginePitch: this.enginePitch, mood, intensity,
    });
    // low air heartbeat
    const P = this.player;
    if (this.state === 'play' && P.mode === 'swim' && P.breath < 0.25) {
      this.hbT = (this.hbT ?? 0) - dt;
      if (this.hbT <= 0) { this.hbT = 1.1; this.audio.heartbeat(); }
    }
  }

  updateHUD() {
    const P = this.player, ui = this.ui, F = this.hudFlags;
    const swim = P.mode === 'swim' || P.mode === 'air';
    if (F.meters === 'stamina') ui.meters(0, 0, P.stamina, false, false, true);
    else if (F.meters) ui.meters(P.health / P.maxHealth, P.breath, 1 - P.dashCD / 2.3, true, swim, swim);
    else ui.meters(0, 0, 0, false, false, false);
    ui.growth(P.growth, stageName(P.growth), F.growth);
    ui.diet(this.species, P.growth, F.diet);
    ui.lowAir(swim && P.breath < 0.3 ? (0.3 - P.breath) * 2.5 : 0);
    if (swim && P.breath < 0.3 && P.breath > 0) ui.prompt(P.entangled ? 'Tap Space to break free' : 'Low on air. Surface to breathe');
    else if (!P.entangled && ui.promptText && ui.promptText.startsWith('Low on air')) ui.prompt('');
    if (P.mode === 'land' || this.chapterIndex <= 1 || this.chapterIndex === 7) ui.setZone('Moonlit beach');
    else {
      const zi = zoneIndexAt(P.pos.z, P.pos.y);
      ui.setZone(`${ZONES[zi].name}  ·  ${Math.round(Math.max(0, -P.pos.y) * 0.9)} m`);
    }
    ui.setShells(this.sys.shells ? this.shells.collected : 0, this.sys.shells ? this.shells.total : 0);
  }
}

const game = new Game();
window.game = game;
game.init().catch((e) => {
  console.error(e);
  const t = document.querySelector('.load-text');
  if (t) t.textContent = 'Something went wrong. Please reload.';
});

export { lerp, smoothstep };
