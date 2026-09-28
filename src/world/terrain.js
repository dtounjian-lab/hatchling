// One continuous seabed: moonlit beach -> surf -> reef -> kelp -> open ocean -> the deep.
import * as THREE from 'three';
import { std } from '../core/shared.js';
import { fbm2, ridged2, smoothstep, clamp } from '../core/util.js';

export const WORLD = {
  nest: new THREE.Vector3(0, 0, 58),
  shoreZ: 0,
  surfEnd: -50,
  ripStart: -52,
  ripEnd: -80,
  reefStart: -80,
  kelpStart: -420,
  openStart: -720,
  deepStart: -1050,
  endZ: -1380,
  halfWidth: 220,
};

export const ZONES = [
  { id: 'shore', name: 'The Shallows', z0: 1e9, z1: -80 },
  { id: 'reef', name: 'Sunlit Reef', z0: -80, z1: -420 },
  { id: 'kelp', name: 'Kelp Forest', z0: -420, z1: -720 },
  { id: 'open', name: 'Open Ocean', z0: -720, z1: -1050 },
  { id: 'deep', name: 'The Deep', z0: -1050, z1: -1e9 },
];

export function zoneIndexAt(z, y = 0) {
  if (z > -80) return 0;
  if (z > -420) return 1;
  if (z > -720) return 2;
  if (z > -1050) return y < -95 ? 4 : 3;
  return 4;
}

// Depth profile keypoints (z, height), sorted by descending z.
const KEYS = [
  [160, 9.0], [118, 6.8], [98, 4.4], [84, 3.4], [58, 2.3], [20, 0.75], [0, 0.0],
  [-12, -0.9], [-25, -1.9], [-45, -3.3], [-62, -5.0], [-80, -7.2], [-200, -10.5],
  [-420, -15], [-560, -21], [-720, -27], [-790, -86], [-1050, -106], [-1140, -162], [-1500, -182],
];

function profile(z) {
  if (z >= KEYS[0][0]) return KEYS[0][1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [z0, h0] = KEYS[i], [z1, h1] = KEYS[i + 1];
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1);
      const s = t * t * (3 - 2 * t);
      // blend smooth and linear so long segments are not S-shaped
      const w = Math.abs(z0 - z1) > 60 ? 0.3 : 1.0;
      return h0 + (h1 - h0) * (s * w + t * (1 - w));
    }
  }
  return KEYS[KEYS.length - 1][1];
}

function zoneAmp(z) {
  // [low-frequency amplitude, ridged amplitude]
  const beach = smoothstep(-8, 6, z);
  const reef = smoothstep(-60, -110, z) * (1 - smoothstep(-400, -440, z));
  const kelp = smoothstep(-400, -440, z) * (1 - smoothstep(-700, -740, z));
  const open = smoothstep(-700, -760, z) * (1 - smoothstep(-1030, -1080, z));
  const deep = smoothstep(-1030, -1080, z);
  const surf = (1 - beach) * (1 - smoothstep(-60, -110, z));
  const low = beach * 0.45 + surf * 0.5 + reef * 2.6 + kelp * 4.0 + open * 9 + deep * 16;
  const mid = beach * 0.12 + surf * 0.15 + reef * 3.2 + kelp * 3.0 + open * 3.5 + deep * 7;
  return [low, mid];
}

export function groundHeight(x, z) {
  let h = profile(z);
  const [aLow, aMid] = zoneAmp(z);
  h += fbm2(x * 0.012, z * 0.012, 3) * aLow;
  if (aMid > 0.2) h += (ridged2(x * 0.045, z * 0.045, 3) - 0.55) * aMid;
  else h += fbm2(x * 0.08, z * 0.08, 2) * aMid;
  // sandbar in the surf
  h += 0.55 * Math.exp(-Math.pow((z + 32 + 4 * Math.sin(x * 0.05)) / 6, 2));
  // dunes
  h += smoothstep(80, 110, z) * (1.2 * fbm2(x * 0.04 + 5, z * 0.04, 3));
  // nest hollow
  const dx = x - WORLD.nest.x, dz = z - WORLD.nest.z;
  const d2 = dx * dx + dz * dz;
  h -= 0.22 * Math.exp(-d2 / 2.2) - 0.06 * Math.exp(-Math.pow(Math.sqrt(d2) - 1.9, 2) / 0.5);
  // side walls underwater
  const ax = Math.abs(x);
  h += smoothstep(170, 270, ax) * (z < -10 ? 30 : 6);
  return h;
}

export function groundNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.35;
  const hL = groundHeight(x - e, z), hR = groundHeight(x + e, z);
  const hD = groundHeight(x, z - e), hU = groundHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

function buildGrid(x0, x1, z0, z1, nx, nz, sink) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz;
    let y = groundHeight(x, z);
    if (sink) y -= sink(x, z);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createTerrain(scene) {
  const mat = std(
    { roughness: 0.95, metalness: 0.0, color: 0xffffff },
    {
      key: 'terrain',
      caustics: 0.95,
      fragDiffuse: /* glsl */ `
        vec3 wp = vWPos;
        float z = wp.z;
        vec3 nW = normalize(vWNrm);
        float slope = 1.0 - clamp(nW.y, 0.0, 1.0);
        float n1 = fbm2(wp.xz * 0.08);
        float n2 = vnoise(wp.xz * 0.9);
        vec3 dry = vec3(0.84, 0.78, 0.64);
        vec3 wet = vec3(0.50, 0.46, 0.38);
        vec3 under = vec3(0.7, 0.65, 0.53);
        vec3 c = mix(wet, dry, smoothstep(0.1, 2.0, wp.y + n1 * 0.6));
        c = mix(c, under, smoothstep(-0.6, -2.5, wp.y));
        c *= 0.93 + 0.1 * n2;
        float fine = vnoise(wp.xz * 7.0) * 0.6 + vnoise(wp.xz * 29.0) * 0.4;
        c *= 0.9 + 0.16 * fine;
        float grain = step(0.965, hash12(floor(wp.xz * 60.0)));
        c += grain * 0.22 * smoothstep(0.0, 1.0, wp.y) * smoothstep(9.0, 1.5, length(cameraPosition - wp));
        // wrack line of dark seaweed
        c = mix(c, vec3(0.2, 0.18, 0.12), smoothstep(0.72, 0.8, vnoise(wp.xz * vec2(0.6, 2.2))) * smoothstep(8.0, 11.0, z) * (1.0 - smoothstep(13.0, 16.0, z)) * 0.8);
        // zones
        float reef = smoothstep(-70.0, -100.0, z) * (1.0 - smoothstep(-400.0, -440.0, z));
        float kelp = smoothstep(-400.0, -440.0, z) * (1.0 - smoothstep(-700.0, -740.0, z));
        float open = smoothstep(-700.0, -760.0, z);
        float deep = smoothstep(-1030.0, -1100.0, z);
        float rockMask = smoothstep(0.18, 0.42, slope + (n1 - 0.5) * 0.5);
        vec3 reefRock = mix(vec3(0.52, 0.45, 0.40), vec3(0.72, 0.42, 0.48), smoothstep(0.5, 0.75, vnoise(wp.xz * 0.35)));
        vec3 reefSand = vec3(0.68, 0.63, 0.51);
        vec3 reefC = mix(reefSand, reefRock, max(rockMask, smoothstep(0.55, 0.7, n1)));
        c = mix(c, reefC, reef);
        vec3 kelpC = mix(vec3(0.55, 0.52, 0.42), vec3(0.24, 0.27, 0.22), max(rockMask, smoothstep(0.45, 0.6, n1)));
        c = mix(c, kelpC, kelp);
        vec3 openC = mix(vec3(0.42, 0.42, 0.44), vec3(0.2, 0.22, 0.26), rockMask);
        c = mix(c, openC, open);
        vec3 deepC = mix(vec3(0.16, 0.16, 0.2), vec3(0.08, 0.08, 0.11), rockMask);
        c = mix(c, deepC, deep);
        c *= mix(1.0, 0.82, smoothstep(-0.5, -3.0, wp.y));
        diffuseColor.rgb = c;
      `,
      fragNormal: /* glsl */ `
        {
          float sandy = 1.0 - smoothstep(-400.0, -500.0, vWPos.z);
          float rp = vWPos.x * 0.35 + vWPos.z * 1.6 + fbm2(vWPos.xz * 0.12) * 6.0;
          float rip = (cos(rp * 2.2) * 0.12 + cos(rp * 9.0 + vWPos.x * 0.8) * 0.05) * sandy * smoothstep(0.35, 0.0, 1.0 - normalize(vWNrm).y);
          vec3 pn = vec3(rip * 0.35, 0.0, rip * 1.6);
          normal = normalize(normal + (viewMatrix * vec4(pn, 0.0)).xyz * 0.5);
        }
      `,
    }
  );

  const group = new THREE.Group();
  // Coarse whole-world mesh, sunk slightly under the fine beach mesh.
  const FX0 = -72, FX1 = 72, FZ0 = -64, FZ1 = 112;
  const sink = (x, z) => {
    const inX = smoothstep(FX1, FX1 - 6, Math.abs(x));
    const inZ = smoothstep(FZ0, FZ0 + 6, z) * smoothstep(FZ1, FZ1 - 6, z);
    return inX * inZ * 0.35;
  };
  const coarse = new THREE.Mesh(buildGrid(-330, 330, -1460, 170, 165, 408, sink), mat);
  const fine = new THREE.Mesh(buildGrid(FX0, FX1, FZ0, FZ1, 288, 352), mat);
  coarse.matrixAutoUpdate = fine.matrixAutoUpdate = false;
  group.add(coarse, fine);
  scene.add(group);
  return { group, mat };
}
