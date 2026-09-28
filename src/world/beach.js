// Beach dressing: dune grass, driftwood (solid obstacles), decorative seagrass
// meadows in the shallows, the nest pit decal and the magnetic "home" shimmer.
import * as THREE from 'three';
import { std, U } from '../core/shared.js';
import { groundHeight, WORLD } from './terrain.js';
import { rand, fbm2 } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

function tuftGeo(blades, h, w) {
  const pos = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + Math.random();
    const lean = 0.15 + Math.random() * 0.35;
    const hh = h * (0.6 + Math.random() * 0.5);
    const ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
    const tx = ox + Math.cos(a) * lean * hh, tz = oz + Math.sin(a) * lean * hh;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    // two tris: a tapered blade
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hh, tz);
    pos.push(ox + px, 0, oz + pz, ox - px, 0, oz - pz, tx, hh, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function createBeach(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const sway = (amt, sp) => /* glsl */ `
    { float hh = max(position.y, 0.0); vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
      float ph = uTime * ${sp} + ip.x * 0.3 + ip.z * 0.2;
      transformed.x += sin(ph) * hh * ${amt}; transformed.z += cos(ph * 1.3) * hh * ${amt * 0.5}; }`;

  // Dune grass (sea oats)
  const grassMat = std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }, { key: 'dunegrass', caustics: 0, vertexTransform: sway(0.12, 1.1) });
  const grass = new THREE.InstancedMesh(tuftGeo(9, 1.6, 0.05), grassMat, 420);
  const c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < 2000 && n < 420; i++) {
    const x = rand(-150, 150), z = rand(84, 150);
    if (fbm2(x * 0.05, z * 0.05) < -0.1) continue;
    _p.set(x, groundHeight(x, z) - 0.05, z);
    _q.setFromEuler(_e.set(0, rand(0, 6.28), 0));
    const sc = rand(0.8, 2.2);
    _m.compose(_p, _q, _s.set(sc, sc * rand(0.8, 1.5), sc));
    grass.setMatrixAt(n, _m);
    grass.setColorAt(n, c.set(['#6f7a4a', '#8a8a55', '#5b6a45'][n % 3]));
    n++;
  }
  grass.count = n;
  grass.computeBoundingSphere();
  group.add(grass);

  // Driftwood: obstacles on the run
  const woodMat = std({ color: 0x8a7a66, roughness: 0.9 }, {
    key: 'wood', caustics: 0,
    fragDiffuse: 'diffuseColor.rgb *= 0.75 + 0.35 * vnoise(vec2(vObj.y * 30.0, atan(vObj.x, vObj.z) * 3.0));',
  });
  const logGeo = new THREE.CylinderGeometry(0.3, 0.34, 1, 12, 12);
  {
    const p = logGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.12 * Math.sin(y * 9 + Math.atan2(z, x) * 3) + 0.08 * Math.sin(y * 23);
      const taper = 1 - Math.pow(Math.abs(y) * 2, 4) * 0.35;
      p.setXYZ(i, x * n * taper + Math.sin(y * 3) * 0.04, y, z * n * taper * 0.85 + Math.cos(y * 2.5) * 0.05);
    }
    logGeo.computeVertexNormals();
  }
  logGeo.rotateZ(Math.PI / 2);
  const logs = [
    [-3.5, 44, 6.5, 0.4], [4.8, 31, 5.0, -0.5], [-6, 20, 7, 0.2], [2.4, 12, 4.2, 1.2], [9, 52, 8, -0.2], [-10, 36, 5.5, 0.9],
  ];
  const obstacles = [];
  const logMesh = new THREE.InstancedMesh(logGeo, woodMat, logs.length);
  logs.forEach(([x, z, len, rot], i) => {
    _p.set(x, groundHeight(x, z) + 0.05, z);
    _q.setFromEuler(_e.set(0, rot, 0.05));
    _m.compose(_p, _q, _s.set(len, 1, 1));
    logMesh.setMatrixAt(i, _m);
    // collision: a few circles along the log
    const dx = Math.cos(rot), dz = -Math.sin(rot);
    for (let k = -2; k <= 2; k++) obstacles.push({ x: x + dx * (k / 4) * len, z: z + dz * (k / 4) * len, r: 0.5 });
  });
  logMesh.computeBoundingSphere();
  group.add(logMesh);

  // Decorative seagrass meadows in the shallows and reef sand
  const sgMat = std({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }, { key: 'seagrassDecor', caustics: 0.9, vertexTransform: sway(0.35, 1.4) });
  const sg = new THREE.InstancedMesh(tuftGeo(7, 0.7, 0.025), sgMat, 1600);
  n = 0;
  for (let i = 0; i < 12000 && n < 1600; i++) {
    const z = rand(-260, -18), x = rand(-120, 120);
    if (fbm2(x * 0.03 + 11, z * 0.03) < 0.12) continue;
    _p.set(x, groundHeight(x, z) - 0.05, z);
    _q.setFromEuler(_e.set(0, rand(0, 6.28), 0));
    const sc = rand(0.8, 2.0);
    _m.compose(_p, _q, _s.set(sc, sc, sc));
    sg.setMatrixAt(n, _m);
    sg.setColorAt(n, c.set(['#4f9a4a', '#6aa84f', '#3f8a55'][n % 3]).offsetHSL(0, 0, rand(-0.05, 0.05)));
    n++;
  }
  sg.count = n;
  sg.computeBoundingSphere();
  group.add(sg);

  // Nest pit decal (used when digging) and the home shimmer column
  const pitMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, d) * uA; gl_FragColor = vec4(vec3(0.06,0.05,0.04), a * 0.8); }',
  });
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pitMat);
  pit.rotation.x = -Math.PI / 2;
  pit.renderOrder = 3;
  pit.visible = false;
  group.add(pit);

  const shimmerMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uA; varying vec2 vUv;
      void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = (1.0 - x) * (1.0 - x) * pow(1.0 - vUv.y, 1.5);
        a *= 0.6 + 0.4 * sin(vUv.y * 30.0 - uTime * 3.0 + vUv.x * 6.0);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * uA * 1.6, a * uA); }`,
  });
  const shimmer = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), shimmerMat);
    pl.position.y = 4.5;
    pl.rotation.y = (i / 3) * Math.PI;
    shimmer.add(pl);
  }
  shimmer.position.set(WORLD.nest.x, groundHeight(WORLD.nest.x, WORLD.nest.z), WORLD.nest.z);
  shimmer.visible = false;
  group.add(shimmer);

  return { group, obstacles, pit, pitMat, shimmer, shimmerMat };
}
