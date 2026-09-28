// Split a large InstancedMesh into spatial chunks so whole chunks can be skipped
// when they are beyond the fog (frustum culling then also works per chunk).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _c = new THREE.Color();

export function chunkify(mesh, parent, size = 90) {
  const buckets = new Map();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _m);
    _p.setFromMatrixPosition(_m);
    const key = `${Math.floor(_p.x / size)}:${Math.floor(_p.z / size)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const col = mesh.instanceColor ? (mesh.getColorAt(i, _c), _c.clone()) : null;
    buckets.get(key).push({ m: _m.clone(), c: col, x: _p.x, z: _p.z });
  }
  const chunks = [];
  for (const list of buckets.values()) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      if (it.c) im.setColorAt(i, it.c);
      x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); z0 = Math.min(z0, it.z); z1 = Math.max(z1, it.z);
    });
    im.computeBoundingSphere();
    im.renderOrder = mesh.renderOrder;
    im.matrixAutoUpdate = false; im.updateMatrix();
    parent.add(im);
    chunks.push({ mesh: im, x0, x1, z0, z1 });
  }
  parent.remove(mesh);
  return chunks;
}

export function cullChunks(chunks, cam, range) {
  for (const ch of chunks) {
    const dx = Math.max(0, ch.x0 - cam.x, cam.x - ch.x1);
    const dz = Math.max(0, ch.z0 - cam.z, cam.z - ch.z1);
    ch.mesh.visible = dx * dx + dz * dz < range * range;
  }
}
