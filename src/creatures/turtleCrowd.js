// Instanced crowd of turtles: sibling hatchlings on the beach, the great school,
// and the final wave of hatchlings. One draw call per body part.
import * as THREE from 'three';
import { turtleGeos, makeTurtleMaterials, computeRig, flipperPose, newPose } from '../player/turtleModel.js';

const _m = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

export class TurtleCrowd {
  constructor(scene, max) {
    this.max = max;
    const G = turtleGeos();
    const mats = makeTurtleMaterials(true);
    this.mats = mats;
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
    this.aColA = mk(3); this.aColB = mk(3); this.aColC = mk(3); this.aPat = mk(2);
    this.aSkinA = mk(3); this.aSkinB = mk(3); this.aSkinPat = mk(2);

    const shelled = (g) => {
      const c = g.clone();
      c.setAttribute('aColA', this.aColA); c.setAttribute('aColB', this.aColB);
      c.setAttribute('aColC', this.aColC); c.setAttribute('aPat', this.aPat);
      return c;
    };
    const skinned = (g) => {
      const c = g.clone();
      c.setAttribute('aSkinA', this.aSkinA); c.setAttribute('aSkinB', this.aSkinB); c.setAttribute('aSkinPat', this.aSkinPat);
      return c;
    };
    const im = (g, mat, n) => {
      const m = new THREE.InstancedMesh(g, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
      scene.add(m);
      return m;
    };
    this.shells = {};
    for (const k of Object.keys(G.shells)) this.shells[k] = im(shelled(G.shells[k]), mats.shell, max);
    this.heads = {};
    for (const k of Object.keys(G.heads)) this.heads[k] = im(skinned(G.heads[k]), mats.skin, max);
    this.meshes = {
      ...Object.fromEntries(Object.entries(this.shells).map(([k, v]) => ['shell_' + k, v])),
      ...Object.fromEntries(Object.entries(this.heads).map(([k, v]) => ['head_' + k, v])),
      ffR: im(skinned(G.ffR), mats.skin, max),
      ffL: im(skinned(G.ffL), mats.skin, max),
      rfR: im(skinned(G.rfR), mats.skin, max),
      rfL: im(skinned(G.rfL), mats.skin, max),
      tail: im(skinned(G.tail), mats.skin, max),
      eye: im(G.eye, mats.eye, max * 2),
      hi: im(G.eye, mats.hi, max * 2),
    };
    this.agents = [];
    for (let i = 0; i < max; i++) {
      this.agents.push({
        i, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        yaw: 0, pitch: 0, roll: 0, size: 0.35, m: 0, sp: null,
        phase: Math.random(), amp: 1, glide: 0, turn: 0, mode: 'land', state: '', t: 0, data: {},
      });
    }
    this.pose = newPose();
    this.visible = true;
    this.hiddenApplied = false;
  }

  setSpecies(a, sp, m) {
    a.sp = sp; a.m = m;
    const i = a.i, c = sp.colors;
    _c.set(c.shellA); this.aColA.setXYZ(i, _c.r, _c.g, _c.b);
    _c.set(c.shellB); this.aColB.setXYZ(i, _c.r, _c.g, _c.b);
    _c.set(c.plastron); this.aColC.setXYZ(i, _c.r, _c.g, _c.b);
    this.aPat.setXY(i, sp.pattern, m);
    _c.set(c.skinA); this.aSkinA.setXYZ(i, _c.r, _c.g, _c.b);
    _c.set(c.skinB); this.aSkinB.setXYZ(i, _c.r, _c.g, _c.b);
    this.aSkinPat.setXY(i, sp.skinPattern, m);
    for (const at of [this.aColA, this.aColB, this.aColC, this.aPat, this.aSkinA, this.aSkinB, this.aSkinPat]) at.needsUpdate = true;
    a.rig = computeRig(m, sp.shape);
  }

  spawn(sp, m, pos) {
    const a = this.agents.find((x) => !x.active);
    if (!a) return null;
    a.active = true;
    a.pos.copy(pos);
    a.vel.set(0, 0, 0);
    a.state = ''; a.t = 0; a.data = {};
    a.roll = 0; a.pitch = 0; a.turn = 0; a.glide = 0; a.amp = 1;
    this.setSpecies(a, sp, m);
    return a;
  }

  clear() { for (const a of this.agents) a.active = false; }
  get activeCount() { let n = 0; for (const a of this.agents) if (a.active) n++; return n; }

  setPart(mesh, idx, body, p, rot, s) {
    _p.set(p[0], p[1], p[2]);
    if (rot) _q.setFromEuler(_e.set(rot.x, rot.y, rot.z, 'YZX')); else _q.identity();
    if (typeof s === 'number') _s.setScalar(s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p, _q, _s);
    _m.premultiply(body);
    mesh.setMatrixAt(idx, _m);
  }

  update() {
    const M = this.meshes;
    if (!this.visible) {
      if (!this.hiddenApplied) {
        for (const k in M) M[k].visible = false;
        this.hiddenApplied = true;
      }
      return;
    }
    this.hiddenApplied = false;
    const P = this.pose;
    for (const a of this.agents) {
      const i = a.i;
      for (const k in this.shells) this.shells[k].setMatrixAt(i, ZERO);
      for (const k in this.heads) this.heads[k].setMatrixAt(i, ZERO);
      if (!a.active) {
        for (const k of ['ffR', 'ffL', 'rfR', 'rfL', 'tail']) M[k].setMatrixAt(i, ZERO);
        M.eye.setMatrixAt(i * 2, ZERO); M.eye.setMatrixAt(i * 2 + 1, ZERO);
        M.hi.setMatrixAt(i * 2, ZERO); M.hi.setMatrixAt(i * 2 + 1, ZERO);
        continue;
      }
      const r = a.rig;
      _q.setFromEuler(_e.set(-a.pitch, a.yaw, a.roll, 'YXZ'));
      _b.compose(a.pos, _q, _s.setScalar(a.size));
      flipperPose(a.mode, a.phase, a.amp, a.glide, a.turn, a.sp.gaitSync, P);
      this.setPart(this.shells[a.sp.shellType || 'dome'], i, _b, r.shell.p, null, r.shell.s);
      this.setPart(this.heads[a.sp.headType || 'normal'], i, _b, r.head.p, null, r.head.s);
      this.setPart(M.tail, i, _b, r.tail.p, null, r.tail.s);
      this.setPart(M.ffR, i, _b, r.ff.p, P.fR, r.ff.s);
      _e.set(P.fL.x, -P.fL.y, -P.fL.z);
      this.setPart(M.ffL, i, _b, [-r.ff.p[0], r.ff.p[1], r.ff.p[2]], _e.clone(), r.ff.s);
      this.setPart(M.rfR, i, _b, r.rf.p, P.rR, r.rf.s);
      _e.set(P.rL.x, -P.rL.y, -P.rL.z);
      this.setPart(M.rfL, i, _b, [-r.rf.p[0], r.rf.p[1], r.rf.p[2]], _e.clone(), r.rf.s);
      const hp = r.head.p, ep = r.eye.p, hip = r.hi.p;
      this.setPart(M.eye, i * 2, _b, [hp[0] + ep[0], hp[1] + ep[1], hp[2] + ep[2]], null, r.eye.r);
      this.setPart(M.eye, i * 2 + 1, _b, [hp[0] - ep[0], hp[1] + ep[1], hp[2] + ep[2]], null, r.eye.r);
      this.setPart(M.hi, i * 2, _b, [hp[0] + hip[0], hp[1] + hip[1], hp[2] + hip[2]], null, r.hi.r);
      this.setPart(M.hi, i * 2 + 1, _b, [hp[0] - ep[0] + (hip[0] - ep[0]), hp[1] + hip[1], hp[2] + hip[2]], null, r.hi.r);
    }
    // only draw up to the highest active agent
    let hi = -1;
    for (const a of this.agents) if (a.active) hi = a.i;
    for (const k in M) {
      const n = k === 'eye' || k === 'hi' ? (hi + 1) * 2 : hi + 1;
      M[k].count = n;
      M[k].visible = n > 0;
      M[k].instanceMatrix.needsUpdate = true;
    }
  }
}
