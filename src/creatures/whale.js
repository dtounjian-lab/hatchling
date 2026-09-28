// A humpback whale gliding through the open ocean. Pure spectacle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core/shared.js';

const NI = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };

function whaleGeo() {
  const prof = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30; // 0 tail .. 1 head
    let r = 0.13 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85);
    if (t < 0.12) r = Math.max(r, 0.012);
    prof.push(new THREE.Vector2(r, t * 2 - 1));
  }
  const body = new THREE.LatheGeometry(prof, 20);
  body.rotateX(Math.PI / 2);
  body.scale(1.05, 0.9, 1);
  const parts = [NI(body)];
  // long pectoral fins
  for (const s of [-1, 1]) {
    const fin = new THREE.SphereGeometry(1, 12, 6);
    fin.scale(0.34, 0.012, 0.05);
    fin.translate(s * 0.36, 0, 0);
    fin.rotateZ(s * -0.35);
    fin.rotateY(s * -0.5);
    fin.translate(s * 0.08, -0.05, 0.35);
    parts.push(NI(fin));
  }
  // flukes
  const fl = new THREE.SphereGeometry(1, 14, 6);
  fl.scale(0.24, 0.01, 0.07);
  const fp = fl.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, fp.getZ(i) - Math.abs(fp.getX(i)) * 0.35);
  fl.translate(0, 0, -1.0);
  parts.push(NI(fl));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Whale {
  constructor(scene) {
    this.mat = std({ color: 0xffffff, roughness: 0.6 }, {
      key: 'whale', rim: 0.35, caustics: 1.0,
      vertexTransform: /* glsl */ `
        float tk = smoothstep(0.2, -1.1, position.z);
        transformed.y += sin(uTime * 0.7 - position.z * 2.2) * 0.07 * tk;
      `,
      fragDiffuse: /* glsl */ `
        float belly = smoothstep(0.02, -0.08, vObj.y);
        vec3 c = mix(vec3(0.12, 0.14, 0.17), vec3(0.78, 0.8, 0.8), belly * step(0.0, vObj.z + 0.2));
        c = mix(c, vec3(0.75, 0.78, 0.78), step(0.2, abs(vObj.x)) * 0.8);
        float grooves = step(0.5, fract(vObj.x * 60.0)) * belly * step(0.2, vObj.z) * 0.25;
        c *= 1.0 - grooves;
        float knob = step(0.8, vnoise(vObj.xz * 60.0)) * step(0.7, vObj.z) * step(0.0, vObj.y);
        c = mix(c, vec3(0.3), knob * 0.6);
        diffuseColor.rgb = c;
      `,
    });
    this.mesh = new THREE.Mesh(whaleGeo(), this.mat);
    this.mesh.scale.setScalar(15);
    scene.add(this.mesh);
    this.center = new THREE.Vector3(0, -30, -880);
    this.radius = 120;
    this.t = 0;
    this.pos = new THREE.Vector3();
  }
  update(dt) {
    this.t += dt * 0.028;
    const a = this.t;
    this.pos.set(this.center.x + Math.cos(a) * this.radius, this.center.y + Math.sin(a * 2.3) * 6, this.center.z + Math.sin(a) * this.radius * 0.8);
    const nx = -Math.sin(a) * this.radius, nz = Math.cos(a) * this.radius * 0.8;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-Math.cos(a * 2.3) * 0.08, Math.atan2(nx, nz), 0.15, 'YXZ');
  }
}
