// Sky dome: starry moonlit night blending to a bright day, with a dawn glow.
import * as THREE from 'three';
import { U, GLSL_NOISE } from '../core/shared.js';

export const MOON_DIR = new THREE.Vector3(0.22, 0.36, -1).normalize();
// The Gulf lies west of Casey Key (-z), so the sun rises over the land (+z).
export const SUN_DIR = new THREE.Vector3(0.25, 1.0, 0.55).normalize();
// On the journey home the sun sets over the Gulf behind her.
export const SUNSET_DIR = new THREE.Vector3(-0.15, 0.22, -1).normalize();

export function createSky(scene) {
  const g = new THREE.SphereGeometry(1500, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: U.uTime, uDay: U.uDay, uWarm: U.uWarm,
      uMoonDir: { value: MOON_DIR.clone() },
      uSunDir: U.uSkySun,
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDay; uniform float uWarm; uniform vec3 uMoonDir; uniform vec3 uSunDir;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float hp = max(h, 0.0);
        vec3 nightTop = vec3(0.006, 0.012, 0.04), nightHor = vec3(0.05, 0.09, 0.17);
        vec3 dayTop = vec3(0.1, 0.32, 0.76), dayHor = vec3(0.5, 0.74, 0.92);
        vec3 night = mix(nightHor, nightTop, pow(hp, 0.45));
        vec3 day = mix(dayHor, dayTop, pow(hp, 0.55));
        vec3 col = mix(night, day, uDay);
        // dawn band
        float dawn = max(smoothstep(0.0, 0.35, uDay) * (1.0 - smoothstep(0.45, 0.95, uDay)), uWarm);
        float toward = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 2.0);
        col += mix(vec3(1.0, 0.45, 0.25), vec3(1.0, 0.42, 0.12) * 1.8, uWarm) * dawn * exp(-hp * 4.0) * (0.45 + 1.1 * toward);
        col = mix(col, col * vec3(1.3, 0.9, 0.75) + vec3(0.12, 0.05, 0.0), uWarm * smoothstep(0.6, 0.0, hp));
        // stars
        vec3 sp = d * 320.0;
        vec3 cell = floor(sp);
        vec3 fr = fract(sp) - 0.5;
        float r = hash13(cell);
        vec3 off = hash33(cell) - 0.5;
        float star = smoothstep(0.12, 0.0, length(fr - off * 0.6)) * step(0.985, r);
        float tw = 0.6 + 0.4 * sin(uTime * (2.0 + r * 6.0) + r * 40.0);
        col += vec3(0.85, 0.9, 1.0) * star * tw * 2.2 * (1.0 - uDay) * smoothstep(0.02, 0.2, h);
        // milky haze
        col += vec3(0.05, 0.06, 0.1) * fbm2(d.xz * 6.0 / (0.3 + hp)) * (1.0 - uDay) * smoothstep(0.1, 0.6, h) * 0.6;
        // moon
        float md = dot(d, normalize(uMoonDir));
        float disc = smoothstep(0.99955, 0.99975, md);
        float mare = 0.82 + 0.18 * vnoise(d.xy * 900.0);
        float moonVis = smoothstep(0.32, 0.04, uDay);
        col += vec3(1.0, 0.96, 0.85) * disc * 5.0 * mare * moonVis;
        col += vec3(0.5, 0.6, 0.8) * (pow(max(md, 0.0), 300.0) * 0.6 + pow(max(md, 0.0), 12.0) * 0.12) * (1.0 - uDay) * moonVis;
        // sun
        float sd = dot(d, normalize(uSunDir));
        col += mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.55, 0.22), uWarm) * (smoothstep(0.9993, 0.9996, sd) * mix(10.0, 4.0, uWarm) + pow(max(sd, 0.0), 64.0) * 0.8 + pow(max(sd, 0.0), 5.0) * 0.8 * uWarm) * max(uDay, uWarm);
        // below horizon fades to deep sea
        col = mix(col, mix(vec3(0.004, 0.012, 0.022), vec3(0.04, 0.2, 0.3), uDay), smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);
  return {
    mesh,
    update(camPos) { mesh.position.copy(camPos); },
  };
}
