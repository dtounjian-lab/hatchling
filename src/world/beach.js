// Beach dressing: dune grass, driftwood (solid obstacles), decorative seagrass
// meadows in the shallows, the nest pit decal and the magnetic "home" shimmer.
import * as THREE from 'three';
import { std, U } from '../core/shared.js';
import { groundHeight, WORLD } from './terrain.js';
import { rand, fbm2 } from '../core/util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

  // ---------------------------------------------------------------- Casey Key homes on stilts
  const houseParts = [];
  const body = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  body.translate(0, 0.5, 0);
  houseParts.push(body.toNonIndexed());
  for (const [sx, sz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const st = new THREE.BoxGeometry(0.05, 0.4, 0.05);
    st.translate(sx, -0.2, sz);
    houseParts.push(st.toNonIndexed());
  }
  const houseGeo = mergeGeometries(houseParts.map((g) => { g.deleteAttribute('uv'); return g; }));
  houseGeo.computeVertexNormals();
  const houseMat = std({ color: 0xffffff, roughness: 0.85 }, {
    key: 'house', caustics: 0,
    vertexHead: 'varying vec2 vSeed;',
    vertexTransform: 'vSeed = instanceMatrix[3].xz;',
    fragHead: 'varying vec2 vSeed;',
    fragEmissive: /* glsl */ `
      {
        // windows on the Gulf-facing and side walls, some lit
        vec3 n = normalize(vWNrm);
        float front = step(0.5, abs(n.z)) + step(0.5, abs(n.x));
        vec2 w = abs(n.z) > 0.5 ? vec2(vObj.x, vObj.y) : vec2(vObj.z, vObj.y);
        vec2 cell = floor(w * vec2(5.0, 3.0));
        vec2 f = fract(w * vec2(5.0, 3.0));
        float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.25, f.y) * step(f.y, 0.8) * step(0.08, vObj.y) * step(vObj.y, 0.92);
        float lit = step(0.72, hash12(cell + vSeed * 0.37));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.1, 0.14), win * front * (1.0 - lit));
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * win * front * lit * 1.1 * (1.0 - uDay * 0.9);
      }`,
  });
  const roofGeo = new THREE.ConeGeometry(0.78, 0.45, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 1.22, 0);
  const roofMat = std({ color: 0x5a4a44, roughness: 0.9 }, { key: 'roof', caustics: 0 });
  const homes = [];
  for (let x = -160; x < 170; x += rand(22, 30)) homes.push([x + rand(-4, 4), rand(128, 142)]);
  const houses = new THREE.InstancedMesh(houseGeo, houseMat, homes.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, homes.length);
  homes.forEach(([x, z], i) => {
    const w = rand(12, 18), h = rand(7, 10), d = rand(10, 13);
    _q.setFromEuler(_e.set(0, rand(-0.08, 0.08), 0));
    _m.compose(_p.set(x, groundHeight(x, z) + 3.2, z), _q, _s.set(w, h, d));
    houses.setMatrixAt(i, _m);
    houses.setColorAt(i, c.set(['#f3efe4', '#f6e7c8', '#cfe8e0', '#f2d2c4', '#dde7f2'][i % 5]));
    roofs.setMatrixAt(i, _m);
  });
  houses.computeBoundingSphere(); roofs.computeBoundingSphere();
  group.add(houses, roofs);

  // porch lights: the artificial glow that pulls hatchlings the wrong way
  const lureSpots = [[-18, 126], [22, 131], [58, 128]];
  const lures = lureSpots.map(([x, z]) => {
    const y = groundHeight(x, z) + 3.4;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.2) }));
    bulb.position.set(x, y, z - 6.3);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 3.0) * uA; gl_FragColor = vec4(vec3(1.0, 0.7, 0.35) * a, a); }',
    }));
    halo.position.copy(bulb.position);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * 0.22 * uA; gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a, a); }',
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, groundHeight(x, z - 16) + 0.08, z - 16);
    group.add(bulb, halo, pool);
    return { pos: new THREE.Vector3(x, y, z - 6), on: true, bulb, halo, pool };
  });
  const setLure = (l, on) => {
    l.on = on;
    l.bulb.visible = l.halo.visible = l.pool.visible = on;
  };

  // sea grape shrubs along the dunes
  const leaves = [];
  for (let i = 0; i < 26; i++) {
    const leaf = new THREE.CircleGeometry(0.32, 7);
    leaf.rotateX(-Math.PI / 2 + rand(-1.2, 1.2));
    leaf.rotateY(rand(0, 6.28));
    const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 1.1;
    leaf.translate(Math.cos(a) * r, rand(0.3, 1.5) * (1.2 - r * 0.5), Math.sin(a) * r);
    leaves.push(leaf.toNonIndexed());
  }
  const grapeGeo = mergeGeometries(leaves.map((g) => { g.deleteAttribute('uv'); return g; }));
  grapeGeo.computeVertexNormals();
  const grapeMat = std({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }, { key: 'seagrape', caustics: 0, vertexTransform: sway(0.05, 1.3), fragDiffuse: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.16, 0.12), smoothstep(0.75, 0.9, vnoise(vObj.xz * 3.0)) * 0.6);' });
  const grapes = new THREE.InstancedMesh(grapeGeo, grapeMat, 150);
  n = 0;
  for (let i = 0; i < 2000 && n < 150; i++) {
    const x = rand(-160, 160), z = rand(92, 128);
    if (fbm2(x * 0.04 + 7, z * 0.04) < 0.0) continue;
    _p.set(x, groundHeight(x, z) - 0.1, z);
    _q.setFromEuler(_e.set(0, rand(0, 6.28), 0));
    const sc = rand(1.2, 2.6);
    _m.compose(_p, _q, _s.set(sc, sc * rand(0.8, 1.2), sc));
    grapes.setMatrixAt(n, _m);
    grapes.setColorAt(n, c.set(['#3f6a34', '#4d7a3a', '#35592d'][n % 3]));
    n++;
  }
  grapes.count = n;
  grapes.computeBoundingSphere();
  group.add(grapes);

  // the North Jetty at Venice Inlet, marking the south end of Casey Key
  let jg = new THREE.IcosahedronGeometry(1, 1);
  jg.deleteAttribute('normal'); jg.deleteAttribute('uv');
  const jp = jg.attributes.position;
  for (let i = 0; i < jp.count; i++) jp.setXYZ(i, jp.getX(i) * rand(0.8, 1.2), jp.getY(i) * rand(0.7, 1.0), jp.getZ(i) * rand(0.8, 1.2));
  jg.computeVertexNormals();
  const jettyMat = std({ color: 0x6d6a66, roughness: 0.95 }, { key: 'jetty', caustics: 1.0, fragDiffuse: 'diffuseColor.rgb *= 0.7 + 0.45 * vnoise(vWPos.xz * 0.8 + vWPos.y);' });
  const jetty = new THREE.InstancedMesh(jg, jettyMat, 220);
  n = 0;
  for (let z = 26; z > -78 && n < 216; z -= 1.6) {
    for (let k = 0; k < 2; k++) {
      const x = -122 + rand(-3.5, 3.5);
      const floor = groundHeight(x, z);
      const top = Math.max(floor + 1, 1.4);
      const y = k === 0 ? Math.min(top - 1.2, floor + 1.2) : top - rand(0.2, 0.8);
      _q.setFromEuler(_e.set(rand(0, 3), rand(0, 3), rand(0, 3)));
      const sc = rand(1.6, 2.6);
      _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc * 0.8, sc));
      jetty.setMatrixAt(n++, _m);
    }
  }
  jetty.count = n;
  jetty.computeBoundingSphere();
  group.add(jetty);

  // Nokomis Beach pavilion: angled shade roofs on the dune
  const pav = new THREE.Group();
  const pavMat = std({ color: 0xe8e2d6, roughness: 0.7 }, { key: 'pavilion', caustics: 0 });
  for (let i = 0; i < 3; i++) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 6), pavMat);
    roof.position.set(i * 10 - 10, 6.5 + (i % 2) * 1.2, 0);
    roof.rotation.z = (i % 2 ? -1 : 1) * 0.22;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6.5, 8), pavMat);
    post.position.set(i * 10 - 10, 3.2, 0);
    pav.add(roof, post);
  }
  pav.position.set(96, groundHeight(96, 110), 110);
  group.add(pav);

  return { group, obstacles, pit, pitMat, shimmer, shimmerMat, lures, setLure };
}
