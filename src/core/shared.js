import * as THREE from 'three';

// Global uniforms shared by every custom shader in the world.
export const U = {
  uTime: { value: 0 },
  uDay: { value: 0 }, // 0 = moonlit night, 1 = full day
  uSunDir: { value: new THREE.Vector3(0.25, 0.4, -1).normalize() },
  uSunColor: { value: new THREE.Color(0.7, 0.8, 1.0) },
  uCaustic: { value: 1 },
  uRimColor: { value: new THREE.Color(0.2, 0.3, 0.45) },
  uUnderColor: { value: new THREE.Color(0.05, 0.3, 0.35) },
  uCamUnder: { value: 0 },
};

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm2(vec2 p){ float a = .5, s = 0.; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
vec2 voronoi3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); float f1 = 8., f2 = 8.;
  for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec3 g = vec3(float(x),float(y),float(z)); vec3 o = hash33(i+g); vec3 r = g + o - f; float d = dot(r,r);
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; } }
  return vec2(sqrt(f1), sqrt(f2)); }
`;

export const GLSL_CAUSTIC = /* glsl */ `
float causticPattern(vec2 p, float t){
  vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0/length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten)));
  }
  c /= 3.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.5);
}
float causticsAt(vec3 wp, vec3 n){
  if (wp.y > 0.3) return 0.0;
  float depth = max(0.0, -wp.y);
  vec2 p1 = mod(wp.xz * 0.21, 6.2831853) - 250.0;
  vec2 p2 = mod(wp.xz * 0.13 + 1.7, 6.2831853) - 250.0;
  float c = causticPattern(p1, uTime * 0.55) * 0.65 + causticPattern(p2, uTime * 0.42 + 3.0) * 0.5;
  float up = smoothstep(-0.25, 0.8, n.y);
  return c * up * exp(-depth * 0.045) * uCaustic;
}
`;

const COMMON_HEAD = /* glsl */ `
uniform float uTime; uniform float uDay; uniform float uCaustic; uniform vec3 uRimColor; uniform vec3 uSunDir; uniform vec3 uSunColor;
varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vObj;
`;

/**
 * Patch a MeshStandardMaterial with world-space varyings, caustics, rim light
 * and optional custom snippets.
 * opts: key, uniforms, vertexHead, vertexTransform (modify `transformed`),
 *       fragHead, fragDiffuse (modify diffuseColor), fragNormal, fragEmissive,
 *       caustics (strength, default 1), rim (strength, default 0)
 */
export function patchMaterial(mat, opts = {}) {
  const key = opts.key || 'm' + Math.random().toString(36).slice(2);
  const cs = opts.caustics ?? 1.0;
  const rim = opts.rim ?? 0.0;
  mat.userData.uniforms = opts.uniforms || {};
  mat.onBeforeCompile = (sh) => {
    for (const k of ['uTime', 'uDay', 'uCaustic', 'uRimColor', 'uSunDir', 'uSunColor']) sh.uniforms[k] = U[k];
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_HEAD}\n${GLSL_NOISE}\n${opts.vertexHead || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvObj = position;\n${opts.vertexTransform || ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 cwp = vec4(transformed, 1.0);
          vec3 cwn = objectNormal;
          #ifdef USE_INSTANCING
            cwp = instanceMatrix * cwp;
            cwn = mat3(instanceMatrix) * cwn;
          #endif
          cwp = modelMatrix * cwp;
          vWPos = cwp.xyz;
          vWNrm = normalize(mat3(modelMatrix) * cwn);
        }
        ${opts.vertexBody || ''}`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_HEAD}\n${GLSL_NOISE}\n${GLSL_CAUSTIC}\n${opts.fragHead || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${opts.fragDiffuse || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opts.fragNormal || ''}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 nW = normalize(vWNrm);
          ${cs > 0 ? `totalEmissiveRadiance += diffuseColor.rgb * uSunColor * causticsAt(vWPos, nW) * ${cs.toFixed(3)};` : ''}
          ${rim > 0 ? `vec3 Vw = normalize(cameraPosition - vWPos); float rimF = pow(1.0 - max(dot(nW, Vw), 0.0), 4.0); totalEmissiveRadiance += uRimColor * rimF * ${rim.toFixed(3)};` : ''}
        }
        ${opts.fragEmissive || ''}`
      );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function std(params = {}, opts = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial(params), opts);
}

// Soft round sprite shader chunk for Points.
export const POINT_FRAG_SOFT = /* glsl */ `
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(pc);
  if (d > 0.5) discard;
`;
