// Per-zone fog, light and color grading. Water color shifts with depth and zone:
// turquoise shallows, sapphire open ocean, emerald kelp, indigo to black in the deep.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { smoothstep, lerp, clamp } from '../core/util.js';
import { MOON_DIR, SUN_DIR } from './sky.js';

const C = (h) => new THREE.Color(h);
const ZONE = [
  // shore, reef, kelp, open, deep
  { day: C('#3cc8c2'), night: C('#05202a'), dens: 0.03, grade: { sat: 1.12, con: 1.04, gain: [0.96, 1.04, 1.04], lift: [0, 0.01, 0.02] } },
  { day: C('#22b0c8'), night: C('#052433'), dens: 0.017, grade: { sat: 1.22, con: 1.06, gain: [1.06, 1.02, 0.95], lift: [0.0, 0.012, 0.02] } },
  { day: C('#1f7a5a'), night: C('#041d17'), dens: 0.024, grade: { sat: 1.12, con: 1.06, gain: [0.96, 1.08, 0.92], lift: [0.0, 0.02, 0.01] } },
  { day: C('#1756b3'), night: C('#031236'), dens: 0.0115, grade: { sat: 1.12, con: 1.04, gain: [0.9, 1.0, 1.12], lift: [0.0, 0.005, 0.02] } },
  { day: C('#0b1447'), night: C('#050a2a'), dens: 0.02, grade: { sat: 1.28, con: 1.14, gain: [0.86, 0.95, 1.15], lift: [0.0, 0.0, 0.018] } },
];
const BEACH_NIGHT = { sat: 0.86, con: 1.06, gain: [0.9, 0.97, 1.12], lift: [0.0, 0.008, 0.03] };
const ABOVE_DAY = { sat: 1.08, con: 1.03, gain: [1.03, 1.0, 0.97], lift: [0, 0, 0] };
const NEAR_BLACK = C('#020309');

function zoneWeights(z) {
  const b = [1e9, -80, -420, -720, -1050, -1e9];
  const s = (x) => smoothstep(-20, 20, x);
  const w = [];
  for (let i = 0; i < 5; i++) w.push(s(z - b[i + 1]) * (1 - s(z - b[i])));
  return w;
}

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.fog = new THREE.FogExp2(0x05202a, 0.02);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0x88aacc, 0x223344, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.copy(MOON_DIR).multiplyScalar(100);
    this.fill = new THREE.PointLight(0x9fd8ff, 0, 30, 1.5);
    scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    this.grade = { sat: 1, con: 1, gain: new THREE.Vector3(1, 1, 1), lift: new THREE.Vector3(), wobble: 0 };
    this.zone = 0;
    this.depth = 0;
    this.underwater = false;
    this.fogBoost = 0; // chapters can thicken fog
    this.tmp = new THREE.Color();
    this.tmp2 = new THREE.Color();
    this.lightDir = new THREE.Vector3();
  }

  update(dt, cam, surfaceY, day, playerSize = 1) {
    const under = cam.position.y < surfaceY;
    this.underwater = under;
    U.uCamUnder.value = under ? 1 : 0;
    const z = cam.position.z;
    const depth = Math.max(0, -cam.position.y);
    this.depth = depth;
    const w = zoneWeights(z);
    let zi = 0; for (let i = 1; i < 5; i++) if (w[i] > w[zi]) zi = i;
    if (zi === 3 && cam.position.y < -95) zi = 4;
    this.zone = zi;

    // light direction: moon at night, sun by day
    this.lightDir.copy(MOON_DIR).lerp(SUN_DIR, smoothstep(0.15, 0.85, day)).normalize();
    U.uSunDir.value.copy(this.lightDir);
    const sunCol = this.tmp2.setRGB(0.55, 0.65, 0.95).lerp(C('#fff1d6'), day);
    U.uSunColor.value.copy(sunCol);

    // underwater color for this spot
    const uc = this.tmp.setRGB(0, 0, 0);
    let dens = 0;
    const gr = { sat: 0, con: 0, gain: [0, 0, 0], lift: [0, 0, 0] };
    for (let i = 0; i < 5; i++) {
      if (w[i] <= 0) continue;
      const Z = ZONE[i];
      const zc = Z.night.clone().lerp(Z.day, day);
      uc.r += zc.r * w[i]; uc.g += zc.g * w[i]; uc.b += zc.b * w[i];
      dens += Z.dens * w[i];
      gr.sat += Z.grade.sat * w[i]; gr.con += Z.grade.con * w[i];
      for (let k = 0; k < 3; k++) { gr.gain[k] += Z.grade.gain[k] * w[i]; gr.lift[k] += Z.grade.lift[k] * w[i]; }
    }
    // Deep water darkens toward indigo, then near black.
    const dk = Math.exp(-Math.max(0, depth - 8) * 0.011);
    uc.multiplyScalar(lerp(0.25, 1, dk));
    uc.lerp(NEAR_BLACK, smoothstep(90, 175, depth) * 0.85);
    U.uUnderColor.value.copy(uc);

    if (under) {
      this.fog.color.copy(uc);
      this.fog.density = dens * (1 + (1 - day) * 0.25) * (1 + this.fogBoost);
      const lightK = Math.exp(-depth * 0.028);
      this.sun.color.copy(sunCol).lerp(uc, 0.25);
      this.sun.intensity = lerp(0.45, 1.9, day) * lightK;
      this.hemi.color.copy(uc).multiplyScalar(2.2).lerp(sunCol, 0.15);
      this.hemi.groundColor.copy(uc).multiplyScalar(0.5);
      this.hemi.intensity = lerp(0.5, 0.95, day) * lerp(0.35, 1, lightK) + 0.15;
      U.uCaustic.value = lerp(0.3, 1.0, day);
      U.uRimColor.value.copy(uc).multiplyScalar(1.4).addScalar(0.05).lerp(C('#1f6f8f'), smoothstep(50, 130, depth) * 0.8);
      this.fillK = lerp(0.4, 2.4, smoothstep(30, 140, depth)) * (1 + (1 - day) * 0.6);
      this.fill.color.set(zi === 4 ? 0x6fb6ff : 0x9fe0ff);
      Object.assign(this.grade, { sat: gr.sat, con: gr.con });
      this.grade.gain.set(...gr.gain); this.grade.lift.set(...gr.lift);
      this.grade.wobble = 1;
    } else {
      const fogCol = this.tmp.setRGB(0.035, 0.07, 0.14).lerp(C('#a6d4ea'), day);
      this.fog.color.copy(fogCol);
      this.fog.density = lerp(0.0045, 0.0016, day) * (1 + this.fogBoost);
      this.sun.color.copy(sunCol);
      this.sun.intensity = lerp(0.9, 2.8, day);
      this.hemi.color.setRGB(0.3, 0.42, 0.7).lerp(C('#bfe2ff'), day);
      this.hemi.groundColor.setRGB(0.12, 0.1, 0.1).lerp(C('#c7b28a'), day);
      this.hemi.intensity = lerp(0.55, 1.3, day);
      U.uCaustic.value = 0.4;
      U.uRimColor.value.setRGB(0.32, 0.42, 0.68).lerp(C('#fff0d0'), day * 0.6);
      this.fillK = lerp(0.75, 0.15, day);
      const g = day > 0.5 ? ABOVE_DAY : BEACH_NIGHT;
      Object.assign(this.grade, { sat: g.sat, con: g.con });
      this.grade.gain.set(...g.gain); this.grade.lift.set(...g.lift);
      this.grade.wobble = 0;
    }
    const camD = playerSize * 3.3 + 1.0;
    this.fill.intensity = this.fillK * Math.pow(camD, 1.5) * 1.6;
    this.fill.distance = camD * 4 + 10;
    this.fill.position.copy(cam.position);
    this.sun.position.copy(cam.position).addScaledVector(this.lightDir, 120);
    this.sun.target.position.copy(cam.position);
    this.scene.background = this.fog.color;
    this.surfaceY = surfaceY;
    return zi;
  }
}
