// Postprocessing: subtle depth of field, bloom, filmic tone mapping,
// per-zone color grade with an underwater wobble, grain and vignette.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect,
  VignetteEffect, ToneMappingEffect, ToneMappingMode, Effect,
} from 'postprocessing';

const GRADE_FRAG = /* glsl */ `
uniform float uSat; uniform float uCon; uniform vec3 uGain; uniform vec3 uLift; uniform float uWobble; uniform float uT;
void mainUv(inout vec2 uv) {
  uv += vec2(sin(uv.y * 16.0 + uT * 1.3), cos(uv.x * 12.0 + uT * 1.1)) * 0.0011 * uWobble;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c = c * uGain + uLift * (1.0 - c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.2) * uCon + 0.2;
  float n = fract(sin(dot(uv * 1000.0 + uT, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * 0.014;
  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map([
        ['uSat', new THREE.Uniform(1)], ['uCon', new THREE.Uniform(1)],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uLift', new THREE.Uniform(new THREE.Vector3())],
        ['uWobble', new THREE.Uniform(0)], ['uT', new THREE.Uniform(0)],
      ]),
    });
  }
}

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 4, focusRange: 6, bokehScale: 1.2, resolutionScale: 0.5 });
  dof.target = new THREE.Vector3();
  const bloom = new BloomEffect({ intensity: 1.05, luminanceThreshold: 0.72, luminanceSmoothing: 0.28, mipmapBlur: true, radius: 0.72 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const grade = new GradeEffect();
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.58 });
  composer.addPass(new EffectPass(camera, dof));
  composer.addPass(new EffectPass(camera, bloom, tone, grade, vignette));
  const G = grade.uniforms;
  return {
    composer, dof, bloom, grade,
    update(dt, time, g, focusPos, focusRange) {
      G.get('uSat').value += (g.sat - G.get('uSat').value) * Math.min(1, dt * 2);
      G.get('uCon').value += (g.con - G.get('uCon').value) * Math.min(1, dt * 2);
      G.get('uGain').value.lerp(g.gain, Math.min(1, dt * 2));
      G.get('uLift').value.lerp(g.lift, Math.min(1, dt * 2));
      G.get('uWobble').value += (g.wobble - G.get('uWobble').value) * Math.min(1, dt * 4);
      G.get('uT').value = time;
      dof.target.copy(focusPos);
      dof.cocMaterial.focusRange = focusRange;
    },
    render(dt) { composer.render(dt); },
    setSize(w, h) { composer.setSize(w, h); },
  };
}
