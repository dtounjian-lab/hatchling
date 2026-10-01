// Solid rounded obstacles (rocks, coral boulders) as squashed spheres in a spatial
// hash, so the turtle and camera slide around them instead of passing through.
const CELL = 24;
const grid = new Map();
const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

export function addCollider(x, y, z, r, squash = 1) {
  const c = { x, y, z, r, sq: squash };
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = key(i, j);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c);
  }
}

// Push point p (Vector3) out of any collider, with an extra margin. Returns the
// last push normal (or null) so callers can kill velocity into the surface.
const _n = { x: 0, y: 0, z: 0 };
export function resolve(p, margin) {
  const list = grid.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
  if (!list) return null;
  let hit = null;
  for (const c of list) {
    const dx = p.x - c.x, dy = (p.y - c.y) / c.sq, dz = p.z - c.z;
    const R = c.r + margin;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 1e-4;
    const push = R - d;
    _n.x = dx / d; _n.y = dy / d; _n.z = dz / d;
    p.x += _n.x * push; p.y += _n.y * push * c.sq; p.z += _n.z * push;
    hit = _n;
  }
  return hit;
}
