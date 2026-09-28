// The water surface: moonlit and glowing with foam from above, a shimmering
// Snell's window from below. Surf waves are shared with gameplay (they push you).
import * as THREE from 'three';
import { U, GLSL_NOISE } from '../core/shared.js';
import { smoothstep } from '../core/util.js';

export const WAVE = { c: 5.2, L: 30, amp: 0.95 };

export function surfEnvelope(z) {
  return smoothstep(-78, -26, z) * (1 - smoothstep(-5, 1.5, z));
}
export function surfPhase(z, t) {
  const p = (z - WAVE.c * t) / WAVE.L;
  return p - Math.floor(p);
}
export function surfaceHeight(x, z, t) {
  const env = surfEnvelope(z);
  const sw = 0.14 * Math.sin(0.09 * x + 0.7 * t) + 0.1 * Math.sin(0.07 * z - 0.9 * t + 0.015 * x) + 0.05 * Math.sin(0.21 * (x + z) + 1.3 * t);
  const A = env * WAVE.amp;
  const u = surfPhase(z, t);
  const w = A * (Math.exp(-u * 16) + Math.exp(-(1 - u) * 3.5) * 0.85);
  return sw * (1 - env * 0.5) + w - A * 0.35;
}

const GLSL_WAVES = /* glsl */ `
float surfEnv(float z){ return smoothstep(-78.0, -26.0, z) * (1.0 - smoothstep(-5.0, 1.5, z)); }
float surfPh(float z, float t){ return fract((z - ${WAVE.c.toFixed(3)} * t) / ${WAVE.L.toFixed(3)}); }
float waterH(vec2 p, float t){
  float env = surfEnv(p.y);
  float sw = 0.14 * sin(0.09 * p.x + 0.7 * t) + 0.1 * sin(0.07 * p.y - 0.9 * t + 0.015 * p.x) + 0.05 * sin(0.21 * (p.x + p.y) + 1.3 * t);
  float A = env * ${WAVE.amp.toFixed(3)};
  float u = surfPh(p.y, t);
  float w = A * (exp(-u * 16.0) + exp(-(1.0 - u) * 3.5) * 0.85);
  return sw * (1.0 - env * 0.5) + w - A * 0.35;
}
`;

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

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uCenter: { value: new THREE.Vector2() },
      uNightDeep: { value: new THREE.Color(0.004, 0.018, 0.032) },
      uDayDeep: { value: new THREE.Color(0.02, 0.22, 0.3) },
    },
  ]);
  for (const k of ['uTime', 'uDay', 'uSunDir', 'uSunColor', 'uUnderColor', 'uWarm']) uniforms[k] = U[k];

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uCenter;
      varying vec3 vW; varying vec3 vN; varying float vEnv; varying float vPh;
      #include <fog_pars_vertex>
      ${GLSL_WAVES}
      void main(){
        vec3 wp = position + vec3(uCenter.x, 0.0, uCenter.y);
        float h = waterH(wp.xz, uTime);
        float e = 0.25;
        float hx = waterH(wp.xz + vec2(e, 0.0), uTime);
        float hz = waterH(wp.xz + vec2(0.0, e), uTime);
        vN = normalize(vec3(h - hx, e, h - hz));
        wp.y = h;
        vW = wp;
        vEnv = surfEnv(wp.z);
        vPh = surfPh(wp.z, uTime);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDay; uniform float uWarm; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uUnderColor;
      uniform vec3 uNightDeep; uniform vec3 uDayDeep;
      varying vec3 vW; varying vec3 vN; varying float vEnv; varying float vPh;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        vec2 q = vW.xz;
        vec2 rip = vec2(fbm2(q * 0.35 + uTime * 0.25), fbm2(q * 0.35 - uTime * 0.21 + 5.3)) - 0.5;
        vec2 rip2 = vec2(vnoise(q * 1.7 + uTime * 0.9), vnoise(q * 1.7 - uTime * 0.8 + 3.0)) - 0.5;
        vec3 N = normalize(vN + vec3(rip.x + rip2.x * 0.35, 0.0, rip.y + rip2.y * 0.35) * 0.55);
        vec3 V = normalize(cameraPosition - vW);
        vec3 col; float alpha = 1.0;
        if (gl_FrontFacing) {
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 skyN = mix(vec3(0.03, 0.06, 0.13), vec3(0.45, 0.68, 0.88), uDay);
          skyN = mix(skyN, vec3(1.0, 0.6, 0.32), uWarm * 0.7);
          vec3 deep = mix(mix(uNightDeep, uDayDeep, uDay), vec3(0.22, 0.15, 0.1), uWarm * 0.45);
          col = mix(deep, skyN, fres);
          vec3 R = reflect(-V, N);
          float sd = max(dot(R, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 350.0) * 6.0 + pow(sd, 40.0) * 0.35);
          // glowing foam: breaking crests and the shoreline
          float front = smoothstep(0.16, 0.0, vPh) + smoothstep(0.93, 1.0, vPh) * 0.4;
          float fn = fbm2(q * vec2(1.2, 2.6) + vec2(0.0, -uTime * 1.2));
          float crest = vEnv * front * smoothstep(0.45, 0.7, fn + vEnv * 0.3);
          float shore = smoothstep(-5.0, -0.5, vW.z) * (1.0 - smoothstep(0.8, 4.5, vW.z));
          float lf = fbm2(q * vec2(0.9, 1.9) + vec2(uTime * 0.1, -uTime * 0.6));
          float lace = smoothstep(0.5, 0.56, lf) - smoothstep(0.6, 0.68, lf) + smoothstep(0.7, 0.75, lf) * 0.6;
          float foam = clamp(crest * 1.1 + shore * lace * 0.75 + vEnv * 0.08 * lace, 0.0, 1.0);
          vec3 foamCol = mix(vec3(0.55, 1.0, 0.95) * 1.9, vec3(1.0), uDay);
          col = mix(col, foamCol, foam);
          alpha = mix(0.84, 0.97, fres) ;
          alpha = max(alpha, foam);
        } else {
          N = -N;
          vec3 D = -V; // camera ray going up
          float cw = D.y + (N.x * D.x + N.z * D.z) * 0.6;
          float window = smoothstep(0.58, 0.8, cw);
          float shimmer = pow(vnoise(q * 3.0 + uTime * 1.5 + rip * 6.0), 6.0) * 2.0;
          vec3 skyTint = mix(mix(vec3(0.12, 0.2, 0.3), vec3(0.75, 0.95, 1.0), uDay), vec3(1.0, 0.6, 0.42), uWarm * 0.75);
          vec3 tir = uUnderColor * (0.75 + 0.3 * rip.x);
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
