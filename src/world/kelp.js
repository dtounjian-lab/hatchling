// The Sargassum Line: golden floating mats gathered into windrows, with fronds
// hanging beneath them. Where hatchlings spend their lost years. Instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from './terrain.js';
import { chunkify, cullChunks } from './chunks.js';
import { rand, fbm2 } from '../core/util.js';

function kelpGeo() {
  const parts = [];
  // stipe: a thin ribbon-like cylinder from 0..1 in y (scaled per instance)
  const stipe = new THREE.CylinderGeometry(0.012, 0.02, 1, 5, 40, true);
  stipe.translate(0, 0.5, 0);
  parts.push(stipe.toNonIndexed());
  // long, rippled blades along the stipe
  const n = 20;
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (i / n) * 0.88;
    const L = 0.13 + 0.05 * Math.sin(i * 1.7);
    const blade = new THREE.PlaneGeometry(0.06, L, 2, 10);
    const p = blade.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / L + 0.5; // 0..1
      const w = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, y) * 1.05))), 0.7) * (1 - y * 0.35);
      const xx = p.getX(k) / 0.03; // -1..1
      p.setX(k, xx * 0.03 * w * 1.5 + 0.035 + Math.sin(y * 3.0) * 0.012);
      p.setZ(k, Math.sin(y * 14 + xx * 2.0) * 0.006 * Math.abs(xx) + Math.sin(y * 4) * 0.01);
      p.setY(k, y * L);
    }
    blade.rotateZ(-0.55 - (i % 3) * 0.12);
    blade.rotateY(i * 2.4);
    blade.translate(0, t, 0);
    parts.push(blade.toNonIndexed());
  }
  // a float bladder and fronds at the top
  const top = new THREE.SphereGeometry(0.022, 6, 5);
  top.translate(0, 1.0, 0);
  parts.push(top.toNonIndexed());
  const g = mergeGeometries(parts.map((q) => { q.deleteAttribute('uv'); return q; }));
  g.computeVertexNormals();
  return g;
}

export function createKelp(scene) {
  const geo = kelpGeo();
  const mat = std(
    { color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide },
    {
      key: 'kelp',
      caustics: 0.9,
      rim: 0.25,
      vertexTransform: /* glsl */ `
        {
          float h = position.y;
          vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
          float ph = uTime * 0.55 + ip.x * 0.05 + ip.z * 0.07;
          float bend = h * h;
          transformed.x += (sin(ph + h * 2.5) * 0.09 + 0.05) * bend;
          transformed.z += cos(ph * 0.8 + h * 2.0) * 0.07 * bend;
        }
      `,
      fragDiffuse: /* glsl */ `
        { float cdn = length(cameraPosition - vWPos); if (cdn < 3.2 && hash12(floor(gl_FragCoord.xy)) > (cdn - 0.9) / 2.3) discard; }
        diffuseColor.rgb *= 0.65 + 0.5 * vObj.y;
        diffuseColor.rgb *= 0.85 + 0.25 * vnoise(vec2(vObj.y * 60.0, vObj.x * 20.0));
      `,
      fragEmissive: /* glsl */ `
        // light glowing through the blades
        float thru = max(dot(normalize(cameraPosition - vWPos), -normalize(uSunDir)), 0.0);
        totalEmissiveRadiance += diffuseColor.rgb * uSunColor * (0.08 + 0.35 * pow(thru, 3.0)) * uDay * exp(max(0.0, -vWPos.y) * -0.05) ;
      `,
    }
  );
  // windrows of floating mats across the sargassum zone, plus a scattering over the reef
  const spots = [];
  for (let row = 0; row < 9; row++) {
    const z0 = -440 - row * 31;
    for (let x = -200; x < 200; x += rand(3.5, 7)) {
      const z = z0 + Math.sin(x * 0.018 + row * 1.7) * 12 + rand(-3, 3);
      if (fbm2(x * 0.03 + row, z * 0.03, 2) < -0.35) continue;
      spots.push([x, z, rand(1.6, 4.5)]);
    }
  }
  for (let i = 0; i < 90; i++) spots.push([rand(-150, 150), rand(-400, -95), rand(1.2, 3.2)]);

  const N = spots.length * 2;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const col = new THREE.Color();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0;
  for (const [x, z, r] of spots) {
    const floor = groundHeight(x, z);
    const fronds = r > 2.5 ? 2 : 1;
    for (let k = 0; k < fronds && n < N; k++) {
      const len = Math.min(-floor - 1.5, rand(3, 7) * (r / 3));
      if (len < 1.2) continue;
      p.set(x + rand(-r, r) * 0.4, -0.35, z + rand(-r, r) * 0.4);
      q.setFromEuler(e.set(0, rand(0, Math.PI * 2), 0));
      const w = rand(2.2, 3.4) * (0.6 + r * 0.15);
      s.set(w, -len, w); // hang down from the mat
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      col.set(['#b8862b', '#a57822', '#c99a38', '#8f6a1e'][n % 4]).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
      mesh.setColorAt(n, col);
      n++;
    }
  }
  mesh.count = n;
  mesh.computeBoundingSphere();
  scene.add(mesh);

  // the floating mats themselves: tangles of leaves and little gas-filled floats
  const parts = [];
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    const berry = new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 4, 3);
    berry.translate(Math.cos(a) * rr, (Math.random() - 0.4) * 0.14, Math.sin(a) * rr);
    parts.push(berry.toNonIndexed());
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 1.05;
    const leaf = new THREE.PlaneGeometry(0.08, 0.3, 1, 2);
    leaf.rotateX(-Math.PI / 2 + (Math.random() - 0.5) * 0.8);
    leaf.rotateY(Math.random() * Math.PI);
    leaf.translate(Math.cos(a) * rr, (Math.random() - 0.5) * 0.12, Math.sin(a) * rr);
    parts.push(leaf.toNonIndexed());
  }
  const matGeo = mergeGeometries(parts.map((q2) => { q2.deleteAttribute('uv'); return q2; }));
  matGeo.computeVertexNormals();
  const raftMat = std({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }, {
    key: 'sargassumRaft', caustics: 0.3, rim: 0.3,
    vertexTransform: `transformed.y += sin(uTime * 0.9 + position.x * 2.0 + instanceMatrix[3].x * 0.3) * 0.04;`,
    fragEmissive: `totalEmissiveRadiance += diffuseColor.rgb * uSunColor * 0.3 * uDay;`,
  });
  const rafts = new THREE.InstancedMesh(matGeo, raftMat, spots.length);
  spots.forEach(([x, z, r], i) => {
    q.setFromEuler(e.set(0, rand(0, Math.PI * 2), 0));
    m.compose(p.set(x, -0.25, z), q, s.set(r, 1.2, r * rand(0.6, 1.1)));
    rafts.setMatrixAt(i, m);
    rafts.setColorAt(i, col.set(['#c7962f', '#b8862b', '#d8a843'][i % 3]));
  });
  rafts.computeBoundingSphere();
  scene.add(rafts);
  const chunks = [...chunkify(mesh, scene, 100), ...chunkify(rafts, scene, 100)];
  return { chunks, update(cam, range) { cullChunks(chunks, cam, range); } };

}
