// Tall swaying kelp forest with translucent, sun-dappled blades. Instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';
import { groundHeight } from './terrain.js';
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
  const N = 1150;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const col = new THREE.Color();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0, guard = 0;
  while (n < N && guard++ < N * 30) {
    const z = rand(-712, -428);
    const x = rand(-195, 195);
    const d = fbm2(x * 0.02 + 3, z * 0.02, 3);
    if (d < -0.05 && Math.random() < 0.8) continue;
    const y = groundHeight(x, z);
    const height = Math.max(6, -y - rand(0.5, 5));
    p.set(x, y - 0.2, z);
    q.setFromEuler(e.set(0, rand(0, Math.PI * 2), 0));
    const w = rand(8, 12);
    s.set(w, height, w);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    col.set(['#8a7a2a', '#6f7a28', '#9a8233', '#5f6b25'][n % 4]).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return { mesh };
}
