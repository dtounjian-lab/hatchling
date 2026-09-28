// Volumetric-looking light shafts: camera-facing additive ribbons that wrap
// around the viewer, slanted along the sun and fading with depth.
import * as THREE from 'three';
import { U, GLSL_NOISE } from '../core/shared.js';

export function createGodRays(scene, count = 46) {
  const g = new THREE.PlaneGeometry(1, 1, 1, 12);
  g.translate(0, -0.5, 0); // top edge at y=0
  const ig = new THREE.InstancedBufferGeometry().copy(g);
  ig.instanceCount = count;
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    off[i * 4] = Math.random(); off[i * 4 + 1] = Math.random();
    off[i * 4 + 2] = 1.5 + Math.random() * 5.5; // width
    off[i * 4 + 3] = Math.random();
  }
  ig.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uTime: U.uTime, uSunDir: U.uSunDir, uCam: { value: new THREE.Vector3() },
      uR: { value: 70 }, uLen: { value: 70 }, uI: { value: 0 }, uColor: { value: new THREE.Color(0.8, 0.95, 1.0) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uCam; uniform float uR; uniform float uLen;
      attribute vec4 aOff; varying vec2 vUv; varying float vFade; varying float vSeed; varying float vY;
      void main(){
        vec2 base = (aOff.xy - 0.5) * 2.0 * uR;
        vec2 rel = mod(base - uCam.xz + uR, 2.0 * uR) - uR;
        vec3 top = vec3(uCam.x + rel.x, 0.0, uCam.z + rel.y);
        vec3 sdir = normalize(-uSunDir);
        vec3 dirDown = normalize(vec3(sdir.x * 0.6, -1.0, sdir.z * 0.6));
        float len = uLen * (0.6 + aOff.w * 0.6);
        vec3 along = dirDown * (-position.y) * len;
        vec3 toCam = uCam - top; toCam.y = 0.0;
        vec3 side = normalize(cross(dirDown, normalize(toCam + vec3(0.0001))));
        float w = aOff.z * (1.0 + (-position.y) * 0.8);
        vec3 wp = top + along + side * position.x * w;
        vUv = vec2(position.x + 0.5, -position.y);
        vSeed = aOff.w;
        vY = wp.y;
        float d = length(rel);
        vFade = smoothstep(uR, uR * 0.35, d) * smoothstep(1.5, 8.0, length(wp - uCam));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uI; uniform vec3 uColor;
      varying vec2 vUv; varying float vFade; varying float vSeed; varying float vY;
      ${GLSL_NOISE}
      void main(){
        float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        edge = pow(edge, 1.6);
        float fall = pow(1.0 - vUv.y, 1.8) * smoothstep(0.0, 0.18, vUv.y);
        float flick = 0.55 + 0.45 * sin(uTime * (0.4 + vSeed * 0.7) + vSeed * 30.0);
        float streak = 0.7 + 0.3 * vnoise(vec2(vUv.x * 5.0 + vSeed * 9.0, vUv.y * 2.0 - uTime * 0.1));
        float a = edge * fall * flick * streak * vFade * uI * step(vY, 0.0);
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(ig, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  scene.add(mesh);
  return {
    mesh,
    update(cam, intensity, color, scale) {
      mat.uniforms.uCam.value.copy(cam.position);
      mat.uniforms.uI.value += (intensity - mat.uniforms.uI.value) * 0.05;
      mat.uniforms.uColor.value.copy(color);
      mat.uniforms.uR.value = 30 + scale * 10;
      mesh.visible = mat.uniforms.uI.value > 0.003;
    },
  };
}
