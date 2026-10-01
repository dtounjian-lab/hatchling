// The water surface: Gerstner swells, depth-based color (clear turquoise over
// shallow sand, deep blue offshore), shoreline and crest foam, sky reflections
// from above, and a shimmering Snell's window from below. The surf waves are
// shared with gameplay (they push you), so JS and GLSL use the same formulas.
import * as THREE from 'three';
import { U, GLSL_NOISE, GLSL_SWASH } from '../core/shared.js';
import { smoothstep } from '../core/util.js';
import { groundHeight } from './terrain.js';

export const WAVE = { c: 5.2, L: 30, amp: 0.95 };

// Gerstner swell: [dirX, dirZ, wavelength, amplitude, steepness]
const SWELL = [
  [0.2, 1.0, 23, 0.15, 0.55],
  [-0.38, 1.0, 13.5, 0.085, 0.5],
  [0.62, 0.8, 7.2, 0.045, 0.45],
  [-0.8, 0.6, 4.3, 0.022, 0.4],
].map(([x, z, L, A, Q]) => {
  const l = Math.hypot(x, z);
  const k = (Math.PI * 2) / L;
  return { dx: x / l, dz: z / l, k, A, Q, w: Math.sqrt(9.8 * k) * 0.75 };
});

export function surfEnvelope(z) {
  return smoothstep(-78, -26, z) * (1 - smoothstep(-5, 1.5, z));
}
export function surfPhase(z, t) {
  const p = (z - WAVE.c * t) / WAVE.L;
  return p - Math.floor(p);
}
// swash (must match GLSL_SWASH): front position, cycle phase, uprush flag
export function swashFront(x, t) {
  const cyc = (WAVE.c * t + 2) / WAVE.L;
  const s = cyc - Math.floor(cyc);
  const R = 6.5 + 2.2 * Math.sin(x * 0.07 + Math.floor(cyc) * 1.7) + 1.2 * Math.sin(x * 0.19);
  const f = s < 0.32 ? -1 + R * Math.sin((s / 0.32) * Math.PI / 2) : -1 + R * (1 - smoothstep(0.32, 0.95, s));
  return { f, s, up: s < 0.32 };
}
function swashLevel(x, z, t) {
  if (z < -8 || z > 12) return -1e9;
  const { f, up } = swashFront(x, t);
  if (z > f) return -1e9;
  const th = (up ? 0.13 : 0.07) * smoothstep(f + 0.2, f - 2.5, z);
  return groundHeight(x, z) + th;
}
export function surfaceHeight(x, z, t) {
  return Math.max(baseHeight(x, z, t), swashLevel(x, z, t));
}
function baseHeight(x, z, t) {
  const env = surfEnvelope(z);
  let sw = 0;
  for (const s of SWELL) sw += s.A * Math.sin(s.k * (s.dx * x + s.dz * z) - s.w * t);
  const A = env * WAVE.amp;
  const u = surfPhase(z, t);
  const w = A * (Math.exp(-u * 16) + Math.exp(-(1 - u) * 3.5) * 0.85);
  return sw * (1 - env * 0.5) + w - A * 0.35;
}

const f = (n) => n.toFixed(4);
const GLSL_WAVES = /* glsl */ `
float surfEnv(float z){ return smoothstep(-78.0, -26.0, z) * (1.0 - smoothstep(-5.0, 1.5, z)); }
float surfPh(float z, float t){ return fract((z - ${f(WAVE.c)} * t) / ${f(WAVE.L)}); }
float surfH(vec2 p, float t){
  float A = surfEnv(p.y) * ${f(WAVE.amp)};
  float u = surfPh(p.y, t);
  return A * (exp(-u * 16.0) + exp(-(1.0 - u) * 3.5) * 0.85) - A * 0.35;
}
// Gerstner swell: displaced position and analytic normal
void gerstner(vec2 p, float t, float scale, inout vec3 disp, inout vec3 nrm){
  ${SWELL.map((s) => `{
    vec2 D = vec2(${f(s.dx)}, ${f(s.dz)});
    float ph = ${f(s.k)} * dot(D, p) - ${f(s.w)} * t;
    float A = ${f(s.A)} * scale; float Q = ${f(s.Q)};
    float c = cos(ph), sn = sin(ph);
    disp.xz += Q * A * D * c;
    disp.y += A * sn;
    float WA = ${f(s.k)} * A;
    nrm.xz -= D * WA * c;
    nrm.y -= Q * WA * sn;
  }`).join('\n  ')}
}
`;

// Terrain heights baked into textures so the shader knows how deep the water is.
function heightTexture(x0, x1, z0, z1, w, h) {
  const data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = z0 + ((j + 0.5) / h) * (z1 - z0);
    for (let i = 0; i < w; i++) {
      const x = x0 + ((i + 0.5) / w) * (x1 - x0);
      data[j * w + i] = THREE.DataUtils.toHalfFloat(groundHeight(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createWater(scene) {
  const N = 260;
  const g = new THREE.PlaneGeometry(2, 2, N, N);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const R = 900;
  for (let i = 0; i < p.count; i++) {
    const remap = (u) => R * (0.12 * u + 0.88 * u * u * u);
    p.setXYZ(i, remap(p.getX(i)), 0, remap(p.getZ(i)));
  }
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1e5;

  // coarse heights for the whole world, fine heights for the beach and surf
  const coarse = heightTexture(-330, 330, -1460, 170, 192, 480);
  const fine = heightTexture(-72, 72, -64, 112, 288, 352);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uCenter: { value: new THREE.Vector2() },
      uNightDeep: { value: new THREE.Color(0.004, 0.018, 0.032) },
      uDayDeep: { value: new THREE.Color(0.008, 0.1, 0.2) },
    },
  ]);
  uniforms.uHCoarse = { value: coarse };
  uniforms.uHFine = { value: fine };
  for (const k of ['uTime', 'uDay', 'uSunDir', 'uSunColor', 'uUnderColor', 'uWarm']) uniforms[k] = U[k];

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uCenter;
      varying vec3 vW; varying vec3 vN; varying float vEnv; varying float vPh; varying float vCrest;
      #include <fog_pars_vertex>
      uniform sampler2D uHCoarse; uniform sampler2D uHFine;
      varying float vSheet;
      ${GLSL_WAVES}
      ${GLSL_SWASH}
      float groundV(vec2 p){
        vec2 uf = (p - vec2(-72.0, -64.0)) / vec2(144.0, 176.0);
        if (uf.x > 0.0 && uf.x < 1.0 && uf.y > 0.0 && uf.y < 1.0) return texture2D(uHFine, uf).r;
        vec2 uc = (p - vec2(-330.0, -1460.0)) / vec2(660.0, 1630.0);
        return texture2D(uHCoarse, clamp(uc, 0.0, 1.0)).r;
      }
      void main(){
        vec3 base = position + vec3(uCenter.x, 0.0, uCenter.y);
        vec2 xz = base.xz;
        float env = surfEnv(xz.y);
        vec3 disp = vec3(0.0); vec3 nrm = vec3(0.0, 1.0, 0.0);
        gerstner(xz, uTime, 1.0 - env * 0.5, disp, nrm);
        float e = 0.25;
        float hs = surfH(xz, uTime);
        float hx = surfH(xz + vec2(e, 0.0), uTime);
        float hz = surfH(xz + vec2(0.0, e), uTime);
        nrm += vec3(hs - hx, 0.0, hs - hz) / e;
        vec3 wp = base + disp;
        wp.y += hs;
        // the swash sheet rides up over the sand behind its front
        vSheet = 0.0;
        if (wp.z > -8.0 && wp.z < 12.0) {
          vec3 sw = swashFront(wp.x, uTime);
          if (wp.z < sw.x) {
            float th = (sw.z > 0.5 ? 0.13 : 0.07) * smoothstep(sw.x + 0.2, sw.x - 2.5, wp.z);
            float lvl = groundV(wp.xz) + th;
            if (lvl > wp.y) { vSheet = 1.0; wp.y = lvl; nrm = mix(nrm, vec3(0.0, 1.0, 0.0), 0.6); }
          }
        }
        vN = normalize(nrm);
        vW = wp;
        vEnv = env;
        vPh = surfPh(xz.y, uTime);
        vCrest = disp.y;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDay; uniform float uWarm; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uUnderColor;
      uniform vec3 uNightDeep; uniform vec3 uDayDeep;
      uniform sampler2D uHCoarse; uniform sampler2D uHFine;
      varying vec3 vW; varying vec3 vN; varying float vEnv; varying float vPh; varying float vCrest; varying float vSheet;
      #include <fog_pars_fragment>
      ${GLSL_SWASH}
      ${GLSL_NOISE}
      float groundAt(vec2 p){
        vec2 uf = (p - vec2(-72.0, -64.0)) / vec2(144.0, 176.0);
        if (uf.x > 0.0 && uf.x < 1.0 && uf.y > 0.0 && uf.y < 1.0) return texture2D(uHFine, uf).r;
        vec2 uc = (p - vec2(-330.0, -1460.0)) / vec2(660.0, 1630.0);
        return texture2D(uHCoarse, clamp(uc, 0.0, 1.0)).r;
      }
      vec3 skyColor(vec3 R){
        float h = max(R.y, 0.0);
        vec3 nightC = mix(vec3(0.05, 0.09, 0.17), vec3(0.006, 0.012, 0.04), pow(h, 0.45));
        vec3 dayC = mix(vec3(0.48, 0.72, 0.9), vec3(0.1, 0.32, 0.74), pow(h, 0.45));
        vec3 c = mix(nightC, dayC, uDay);
        float toward = max(dot(normalize(vec3(R.x, 0.0, R.z) + 1e-4), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4)), 0.0);
        c += vec3(1.0, 0.5, 0.2) * uWarm * exp(-h * 4.0) * (0.4 + toward * toward);
        return c;
      }
      void main(){
        vec2 q = vW.xz;
        // fine ripples on top of the swell
        vec2 rip = vec2(fbm2(q * 0.35 + uTime * 0.25), fbm2(q * 0.35 - uTime * 0.21 + 5.3)) - 0.5;
        vec2 rip2 = vec2(vnoise(q * 1.9 + uTime * 0.9), vnoise(q * 1.9 - uTime * 0.8 + 3.0)) - 0.5;
        vec3 N = normalize(vN + vec3(rip.x + rip2.x * 0.4, 0.0, rip.y + rip2.y * 0.4) * 0.35);
        vec3 V = normalize(cameraPosition - vW);
        float depth = max(0.0, vW.y - groundAt(q));
        vec3 col; float alpha = 1.0;
        if (gl_FrontFacing) {
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 refl = skyColor(R);
          // light absorbed with depth: clear turquoise over sand, deep blue offshore
          float absorb = 1.0 - exp(-depth * 0.2);
          vec3 shallow = mix(vec3(0.03, 0.09, 0.11), vec3(0.12, 0.72, 0.68), uDay);
          vec3 deep = mix(mix(uNightDeep, uDayDeep, uDay), vec3(0.22, 0.15, 0.1), uWarm * 0.45);
          vec3 body = mix(shallow, deep, absorb);
          // light scattering up through wave crests
          body += mix(vec3(0.0, 0.05, 0.06), vec3(0.05, 0.3, 0.28), uDay) * smoothstep(0.0, 0.2, vCrest) * (1.0 - absorb * 0.5);
          col = mix(body, refl, fres * 0.85);
          float sd = max(dot(R, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 400.0) * 7.0 + pow(sd, 60.0) * 0.45);
          // foam: breaking crests, the swash on the sand, and whitecaps on steep swell
          float front = smoothstep(0.16, 0.0, vPh) + smoothstep(0.93, 1.0, vPh) * 0.4;
          float fn = fbm2(q * vec2(1.2, 2.6) + vec2(0.0, -uTime * 1.2));
          float crest = vEnv * front * smoothstep(0.45, 0.7, fn + vEnv * 0.3);
          float lf = fbm2(q * vec2(0.9, 1.9) + vec2(uTime * 0.1, -uTime * 0.6));
          float lace = smoothstep(0.5, 0.56, lf) - smoothstep(0.6, 0.68, lf) + smoothstep(0.7, 0.75, lf) * 0.6;
          float swash = smoothstep(0.7, 0.05, depth) * (0.55 + 0.45 * sin(uTime * 0.9 + q.x * 0.05));
          float shoreLine = smoothstep(0.18, 0.0, depth) * 0.9;
          float caps = smoothstep(0.17, 0.22, vCrest) * smoothstep(0.55, 0.7, vnoise(q * 0.8 + uTime * 0.3)) * 0.5;
          // the leading edge of each swash: a bright lacy line of foam and bubbles
          vec3 sf = swashFront(q.x, uTime);
          float dF = sf.x - q.y;
          float swFront = smoothstep(0.55, 0.04, dF) * smoothstep(-0.12, 0.04, dF);
          float trail = smoothstep(2.5, 0.3, dF) * step(0.0, dF) * sf.z * 0.3;
          float bub = smoothstep(0.55, 0.75, vnoise(q * vec2(3.0, 5.0) + vec2(0.0, uTime * 2.0)));
          float sheetFoam = (swFront * (0.7 + 0.3 * lace) + trail * bub) * smoothstep(-6.0, -1.0, q.y) * (1.0 - smoothstep(10.0, 12.0, q.y));
          float notSheet = 1.0 - vSheet;
          float foam = clamp(crest * 1.1 + (swash * lace * 0.55 + shoreLine * (0.25 + lace * 0.6)) * notSheet + vEnv * 0.08 * lace + caps + sheetFoam, 0.0, 1.0);
          vec3 foamCol = mix(vec3(0.55, 1.0, 0.95) * 1.9, vec3(1.0), uDay);
          col = mix(col, foamCol, foam);
          // see the sand through shallow water, opaque offshore
          alpha = mix(0.32, 0.97, smoothstep(0.0, 6.0, depth));
          alpha = max(alpha, fres * 0.95);
          alpha = max(alpha, foam);
          alpha *= smoothstep(0.0, 0.06, depth + 0.03);
        } else {
          N = -N;
          vec3 D = -V; // camera ray going up
          float cw = D.y + (N.x * D.x + N.z * D.z) * 0.6;
          float window = smoothstep(0.58, 0.8, cw);
          float shimmer = pow(vnoise(q * 3.0 + uTime * 1.5 + rip * 6.0), 6.0) * 2.0;
          vec3 skyTint = mix(mix(vec3(0.12, 0.2, 0.3), vec3(0.75, 0.95, 1.0), uDay), vec3(1.0, 0.6, 0.42), uWarm * 0.75);
          // the window shows the sky gradient, brightest straight up
          skyTint *= 0.75 + 0.35 * smoothstep(0.7, 1.0, cw);
          vec3 tir = uUnderColor * (0.72 + 0.35 * rip.x + 0.2 * smoothstep(0.0, 0.2, vCrest));
          col = mix(tir, skyTint * (0.8 + shimmer * 0.45 * uDay), window);
          float sd = max(dot(D, normalize(uSunDir + vec3(rip.x, 0.0, rip.y) * 0.4)), 0.0);
          col += uSunColor * (pow(sd, 60.0) * 3.5 + pow(sd, 8.0) * 0.4) * (0.3 + 0.7 * uDay);
          col += uSunColor * shimmer * 0.12 * (1.0 - window);
          alpha = 1.0;
        }
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  return {
    mesh,
    update(camPos) {
      uniforms.uCenter.value.set(Math.round(camPos.x), Math.round(camPos.z));
    },
  };
}
