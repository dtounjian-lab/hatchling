// Dense, colorful coral reef: branching, brain, fan, tube and plate corals,
// swaying anemones and sea whips, plus rocks across every zone. All instanced.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from './terrain.js';
import { rand, pick, fbm2, mulberry32 } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function orientedCylinder(start, dir, len, r0, r1, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, dir);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q));
  g.translate(start.x, start.y, start.z);
  return g;
}

function branchingGeo(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const grow = (start, dir, len, rad, depth) => {
    parts.push(orientedCylinder(start, dir, len, rad, rad * 0.72));
    const end = start.clone().addScaledVector(dir, len);
    if (depth === 0) {
      const tip = new THREE.SphereGeometry(rad * 0.9, 7, 5);
      tip.translate(end.x, end.y, end.z);
      parts.push(tip);
      return;
    }
    const n = 2 + (r() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const tilt = 0.35 + r() * 0.5;
      const nd = dir.clone().add(new THREE.Vector3(Math.cos(a) * tilt, 0.25, Math.sin(a) * tilt)).normalize();
      grow(end, nd, len * (0.7 + r() * 0.2), rad * 0.72, depth - 1);
    }
  };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + r();
    grow(new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), 0.4, 0.055, 3);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  return g;
}

function tubeGeo(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.5 + r() * 0.9;
    const rad = 0.08 + r() * 0.06;
    const g = new THREE.CylinderGeometry(rad * 1.15, rad * 0.8, h, 10, 3, true);
    g.translate(0, h / 2, 0);
    const a = r() * Math.PI * 2, d = r() * 0.22;
    g.rotateZ((r() - 0.5) * 0.4);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function anemoneGeo() {
  const parts = [];
  const col = new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12, 1);
  col.translate(0, 0.09, 0);
  parts.push(col.toNonIndexed());
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 3.1;
    const rr = 0.04 + (i / n) * 0.12;
    const t = new THREE.CylinderGeometry(0.008, 0.024, 0.42, 5, 4);
    t.translate(0, 0.21, 0);
    t.rotateX(0.35 + (i / n) * 0.5);
    t.rotateY(a);
    t.translate(Math.cos(a) * rr, 0.16, -Math.sin(a) * rr);
    parts.push(t.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function plateGeo() {
  const top = new THREE.CylinderGeometry(0.9, 0.55, 0.12, 20, 1);
  top.translate(0, 0.45, 0);
  const stalk = new THREE.CylinderGeometry(0.12, 0.18, 0.45, 8);
  stalk.translate(0, 0.22, 0);
  const g = mergeGeometries([top.toNonIndexed(), stalk.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}

function rockGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const o = seed * 7.3;
  for (let i = 0; i < p.count; i++) {
    _p.fromBufferAttribute(p, i);
    const n = fbm2(_p.x * 1.3 + o, _p.z * 1.3 + _p.y * 0.7 - o, 3);
    _p.multiplyScalar(1 + n * 0.45);
    _p.y *= 0.6;
    p.setXYZ(i, _p.x, _p.y, _p.z);
  }
  g.computeVertexNormals();
  return g;
}

const SWAY = (amt) => /* glsl */ `
  {
    float hh = max(position.y, 0.0);
    vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
    float ph = uTime * 0.9 + ip.x * 0.13 + ip.z * 0.11;
    transformed.x += sin(ph) * hh * hh * ${amt};
    transformed.z += cos(ph * 0.8) * hh * hh * ${amt * 0.6};
  }
`;

function scatter(mesh, count, sampler, colors, cfg = {}) {
  let n = 0;
  const col = new THREE.Color();
  let guard = 0;
  while (n < count && guard++ < count * 40) {
    const s = sampler();
    if (!s) continue;
    const [x, z, sc] = s;
    const y = groundHeight(x, z) - (cfg.sink ?? 0.05) * sc;
    _p.set(x, y, z);
    _e.set((Math.random() - 0.5) * (cfg.tilt ?? 0.2), Math.random() * Math.PI * 2, (Math.random() - 0.5) * (cfg.tilt ?? 0.2));
    _q.setFromEuler(_e);
    const sy = sc * (cfg.stretch ? rand(0.8, 1.4) : 1);
    _s.set(sc, sy, sc);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(n, _m);
    col.set(pick(colors));
    col.offsetHSL(rand(-0.03, 0.03), rand(-0.1, 0.05), rand(-0.08, 0.06));
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return n;
}

// Reef density: coral clusters (bommies) with sand channels between, densest at the reef entrance.
const CLUSTERS = [];
{
  let n = 0;
  while (CLUSTERS.length < 150 && n++ < 5000) {
    const z = rand(-412, -86);
    const x = rand(-180, 180) * (z > -150 ? 0.45 : 1);
    if (fbm2(x * 0.018, z * 0.018, 3) < -0.1 && Math.random() < 0.7) continue;
    CLUSTERS.push([x, z, rand(5, 13) * (z > -150 ? 1.2 : 1)]);
  }
  // a showcase garden right where she first sees the reef
  for (let i = 0; i < 14; i++) CLUSTERS.push([rand(-30, 30), rand(-120, -92), rand(6, 11)]);
}
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function reefSampler(scaleMin, scaleMax) {
  return () => {
    if (Math.random() < 0.85) {
      const c = CLUSTERS[Math.floor(Math.random() * CLUSTERS.length)];
      const x = c[0] + gauss() * c[2], z = c[1] + gauss() * c[2];
      if (z > -84 || z < -416) return null;
      const edge = Math.abs(gauss());
      return [x, z, rand(scaleMin, scaleMax) * (1.15 - edge * 0.4)];
    }
    const z = rand(-415, -86), x = rand(-185, 185);
    return [x, z, rand(scaleMin, scaleMax) * 0.8];
  };
}

export function createReef(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = [];
  const add = (geo, mat, max) => {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    group.add(m);
    meshes.push(m);
    return m;
  };

  const coralMat = std({ roughness: 0.7, color: 0xffffff }, {
    key: 'coral', caustics: 1.1, rim: 0.2,
    fragDiffuse: 'diffuseColor.rgb *= mix(0.62, 1.3, smoothstep(0.05, 1.3, vObj.y)); diffuseColor.rgb += vec3(0.08) * smoothstep(1.0, 1.5, vObj.y);',
    fragEmissive: 'totalEmissiveRadiance += diffuseColor.rgb * 0.06;',
  });
  const brainMat = std({ roughness: 0.8, color: 0xffffff }, {
    key: 'brain', caustics: 1.1,
    fragDiffuse: /* glsl */ `
      float mz = abs(sin(fbm2(vObj.xz * 4.0 + vObj.y * 2.0) * 26.0));
      diffuseColor.rgb *= mix(0.55, 1.08, smoothstep(0.1, 0.5, mz));
    `,
  });
  const fanMat = std({ roughness: 0.8, color: 0xffffff, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }, {
    key: 'fan', caustics: 0.8,
    vertexTransform: SWAY(0.12),
    fragDiffuse: /* glsl */ `
      { float cdn = length(cameraPosition - vWPos); if (cdn < 3.2 && hash12(floor(gl_FragCoord.xy)) > (cdn - 0.9) / 2.3) discard; }
      {
        vec2 q = vObj.xy - vec2(0.0, -0.02);
        float r = length(q);
        float ang = atan(q.x, q.y);
        float n = vnoise(q * 7.0);
        float veins = 1.0 - smoothstep(0.0, 0.045, abs(fract(ang * 5.5 + n * 0.35 + r * 0.6) - 0.5) * (0.4 + r * 1.4));
        vec2 vr = voronoi3(vec3(vObj.xy * 16.0, 0.5));
        float web = 1.0 - smoothstep(0.015, 0.045, vr.y - vr.x);
        float stem = 1.0 - smoothstep(0.015, 0.04, abs(vObj.x + sin(vObj.y * 6.0) * 0.03));
        float shape = 1.0 - smoothstep(0.6, 0.66, length((vObj.xy - vec2(0.0, 0.62)) * vec2(1.0, 1.15)) + n * 0.08);
        float a = max(max(veins, web * 0.9), stem * step(vObj.y, 0.35)) * shape;
        if (a < 0.5) discard;
        diffuseColor.rgb *= 0.8 + 0.4 * r;
      }
    `,
  });
  const tubeMat = std({ roughness: 0.6, color: 0xffffff, side: THREE.DoubleSide }, {
    key: 'tube', caustics: 1.0,
    fragDiffuse: /* glsl */ `diffuseColor.rgb *= 0.75 + 0.45 * smoothstep(0.2, 1.3, vObj.y);`,
  });
  const anemMat = std({ roughness: 0.5, color: 0xffffff }, {
    key: 'anem', caustics: 0.8, rim: 0.3,
    vertexTransform: SWAY(1.1),
    fragDiffuse: /* glsl */ `diffuseColor.rgb = mix(diffuseColor.rgb * 0.6, diffuseColor.rgb * 1.3 + 0.12, smoothstep(0.15, 0.55, vObj.y));`,
    fragEmissive: /* glsl */ `totalEmissiveRadiance += diffuseColor.rgb * smoothstep(0.5, 0.62, vObj.y) * 0.5;`,
  });
  const whipMat = std({ roughness: 0.6, color: 0xffffff }, { key: 'whip', caustics: 0.8, vertexTransform: SWAY(0.08), fragDiffuse: '{ float cdn = length(cameraPosition - vWPos); if (cdn < 3.2 && hash12(floor(gl_FragCoord.xy)) > (cdn - 0.9) / 2.3) discard; }' });
  const rockMat = std({ roughness: 0.95, color: 0xffffff }, {
    key: 'rock', caustics: 1.2,
    fragDiffuse: /* glsl */ `
      float rn = fbm2(vWPos.xz * 0.5 + vWPos.y * 0.3);
      diffuseColor.rgb *= 0.7 + 0.5 * rn;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.42, 0.48), smoothstep(0.6, 0.72, vnoise(vWPos.xz * 1.3)) * step(-420.0, vWPos.z) * step(vWPos.z, -80.0) * 0.6);
    `,
  });

  const branch = [branchingGeo(3), branchingGeo(11)];
  const bColors = ['#ff6f86', '#ffae57', '#c07bff', '#ffd166', '#5fe0d0', '#ff9ecd', '#8bd46a'];
  scatter(add(branch[0], coralMat, 800), 800, reefSampler(0.8, 2.8), bColors, { tilt: 0.25 });
  scatter(add(branch[1], coralMat, 800), 800, reefSampler(0.8, 2.8), bColors, { tilt: 0.25 });

  const brainGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  brainGeo.scale(1, 0.7, 1);
  scatter(add(brainGeo, brainMat, 520), 520, reefSampler(0.5, 1.8), ['#d9a441', '#b5c95a', '#e58f65', '#9bc7a4', '#c7a0d8'], { sink: 0.15 });

  const fanGeo = new THREE.PlaneGeometry(1.4, 1.3, 6, 8);
  fanGeo.translate(0, 0.62, 0);
  scatter(add(fanGeo, fanMat, 420), 420, reefSampler(1.0, 2.6), ['#c2327a', '#7b3fb0', '#e0533f', '#f08a4b', '#ffcf5a'], { tilt: 0.1, sink: 0.0 });

  const tube = [tubeGeo(5), tubeGeo(9)];
  const tColors = ['#ff9a3c', '#9d6bff', '#ffcf3c', '#3cc7ff', '#ff5f7e'];
  scatter(add(tube[0], tubeMat, 320), 320, reefSampler(0.7, 1.8), tColors, { stretch: true });
  scatter(add(tube[1], tubeMat, 320), 320, reefSampler(0.7, 1.8), tColors, { stretch: true });

  scatter(add(plateGeo(), coralMat, 260), 260, reefSampler(0.5, 1.3), ['#6f9a7a', '#a88a60', '#7f94b0', '#b8935a'], { tilt: 0.12 });

  scatter(add(anemoneGeo(), anemMat, 480), 480, reefSampler(1.0, 2.2), ['#ff8fc7', '#9effc9', '#ffd27a', '#b8a4ff', '#ff7a5c'], { tilt: 0.15 });

  const whip = new THREE.CylinderGeometry(0.02, 0.05, 2.4, 5, 8);
  whip.translate(0, 1.2, 0);
  scatter(add(whip, whipMat, 480), 480, reefSampler(0.8, 2.0), ['#ffb347', '#ff5e5b', '#f7e36b', '#d56bff'], { tilt: 0.3 });

  // Rocks in every zone
  const rocks = [rockGeo(1), rockGeo(2)];
  const rockZones = [
    { n: 260, z: [-420, -84], x: 190, s: [0.8, 3.5], c: ['#8a7a70', '#7c6d66', '#9a8a7e'] },
    { n: 300, z: [-715, -425], x: 200, s: [1.5, 6.0], c: ['#4f5448', '#5c5f52', '#474a40'] },
    { n: 120, z: [-1040, -730], x: 200, s: [3.0, 10.0], c: ['#3d4148', '#454a52'] },
    { n: 200, z: [-1370, -1055], x: 200, s: [3.0, 12.0], c: ['#23252c', '#2c2e36', '#1d1f25'] },
  ];
  for (const [i, rz] of rockZones.entries()) {
    scatter(add(rocks[i % 2], rockMat, rz.n), rz.n, () => [rand(-rz.x, rz.x), rand(rz.z[0], rz.z[1]), rand(rz.s[0], rz.s[1])], rz.c, { sink: 0.35, tilt: 0.5 });
  }

  for (const m of meshes) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  return { group, meshes };
}
