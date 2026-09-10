// Chibi unicorn v2. Shape grammar taken from the reference:
//   - rounded boxes (superellipsoids) for head, muzzle, body, legs, hooves
//   - wide FLAT ribbons for mane, forelock, tail, ears
//   - a twisted three-colour cone for the horn
// Everything below is one of those three primitives.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sp = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);   // signed power

function spline(pts, steps) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 0; i + 3 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t, v = [];
      for (let k = 0; k < p0.length; k++) {
        v[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      out.push(v);
    }
  }
  out.push(P[P.length - 2]);
  return out;
}

// ── rounded box. e=1 is an ellipsoid, e→0 is a box. F is an optional frame.
function loaf(m, c, r, e, color, LAT, LON, F) {
  const [X, Y, Z] = F || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const base = m.pos.length / 3;
  for (let i = 0; i <= LAT; i++) {
    const v = Math.PI / 2 - (i / LAT) * Math.PI, cv = Math.cos(v), sv = Math.sin(v);
    for (let j = 0; j <= LON; j++) {
      const u = (j / LON) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      const px = sp(cv, e) * sp(cu, e), py = sp(sv, e), pz = sp(cv, e) * sp(su, e);
      const nx = sp(cv, 2 - e) * sp(cu, 2 - e) / r[0], ny = sp(sv, 2 - e) / r[1], nz = sp(cv, 2 - e) * sp(su, 2 - e) / r[2];
      const p = add(add(scl(X, px * r[0]), scl(Y, py * r[1])), scl(Z, pz * r[2]));
      m.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]);
      m.nrm.push(...norm(add(add(scl(X, nx), scl(Y, ny)), scl(Z, nz))));
      m.col.push(...color);
    }
  }
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    const a = base + i * (LON + 1) + j, b = a + 1, c2 = a + LON + 1, d = c2 + 1;
    m.idx.push(a, b, c2, b, d, c2);
  }
}

// ── flat ribbon along a curve. curve = [[x,y,z,w,t]...] (half-width, half-thickness).
//    hint(p) returns the THICKNESS direction (e.g. the surface normal it lies on);
//    if wideHint is true, hint is the WIDTH direction instead. `shift` moves the
//    ring centre along the thickness axis, used to stack tail strands.
function ribbon(m, curve, R, color, hint, wideHint, shift = 0) {
  const base = m.pos.length / 3;
  const rings = [];
  for (let i = 0; i < curve.length; i++) {
    const a = curve[Math.max(i - 1, 0)], b = curve[Math.min(i + 1, curve.length - 1)];
    const T = norm(sub(b, a));
    let H = typeof hint === 'function' ? hint(curve[i]) : hint;
    H = norm(sub(H, scl(T, dot(H, T))));
    let S, U;
    if (wideHint) { S = H; U = cross(T, S); } else { U = H; S = cross(U, T); }
    const c = add(curve[i].slice(0, 3), scl(U, shift));
    rings.push([c, S, U, curve[i][3], curve[i][4]]);
  }
  for (const [c, S, U, w, t] of rings) {
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const p = add(scl(S, ca * w), scl(U, sa * t));
      m.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]);
      m.nrm.push(...norm(add(scl(S, ca / w), scl(U, sa / t))));
      m.col.push(...color);
    }
  }
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < R; j++) {
    const j2 = (j + 1) % R;
    const a = base + i * R + j, b = base + i * R + j2, c = base + (i + 1) * R + j, d = base + (i + 1) * R + j2;
    m.idx.push(a, c, b, b, c, d);
  }
  for (const [ri, flip] of [[0, 1], [rings.length - 1, 0]]) {
    const [c] = rings[ri], ci = m.pos.length / 3;
    const T = norm(sub(rings[Math.min(ri + 1, rings.length - 1)][0], rings[Math.max(ri - 1, 0)][0]));
    m.pos.push(...c); m.nrm.push(...(flip ? scl(T, -1) : T)); m.col.push(...color);
    for (let j = 0; j < R; j++) {
      const a = base + ri * R + j, b = base + ri * R + (j + 1) % R;
      m.idx.push(ci, flip ? b : a, flip ? a : b);
    }
  }
}

// ── twisted three-colour cone
function spiralHorn(m, curve, R, colors, lobes, twist) {
  const base = m.pos.length / 3, N = curve.length;
  let up = [1, 0, 0];
  for (let i = 0; i < N; i++) {
    const a = curve[Math.max(i - 1, 0)], b = curve[Math.min(i + 1, N - 1)];
    const T = norm(sub(b, a)), S = norm(cross(up, T)), U = cross(T, S); up = U;
    const [c, , , r] = [curve[i], 0, 0, curve[i][3]];
    for (let j = 0; j < R; j++) {
      const th = (j / R) * Math.PI * 2, ph = lobes * th + twist * i;
      const rr = r * (1 + 0.24 * Math.cos(ph));
      const n = norm(add(scl(S, Math.cos(th)), scl(U, Math.sin(th))));
      m.pos.push(c[0] + n[0] * rr, c[1] + n[1] * rr, c[2] + n[2] * rr);
      m.nrm.push(...norm(add(n, scl(T, -0.35))));
      m.col.push(...colors[(Math.round(ph / (Math.PI * 2)) % lobes + lobes) % lobes]);
    }
  }
  for (let i = 0; i + 1 < N; i++) for (let j = 0; j < R; j++) {
    const j2 = (j + 1) % R, a = base + i * R + j, b = base + i * R + j2, c = base + (i + 1) * R + j, d = base + (i + 1) * R + j2;
    m.idx.push(a, c, b, b, c, d);
  }
}

// ────────────────────────────────────────────────────────────────────────────
const WHITE  = [0.99, 0.985, 1.0];
const MUZZLE = [0.98, 0.74, 0.86];
const HOOF   = [0.86, 0.50, 0.76];
const PINK   = [0.99, 0.66, 0.82];
const LILAC  = [0.79, 0.70, 0.95];
const SKY    = [0.66, 0.80, 0.95];
const BUTTER = [0.99, 0.84, 0.48];
const MINT   = [0.72, 0.91, 0.82];
const IRIS   = [0.58, 0.40, 0.72];
const DARK   = [0.10, 0.06, 0.14];

// Head and body centres — hair is draped relative to these
const HEAD = [0, 1.40, 0.30], HR = [0.49, 0.47, 0.57];
const BODY = [0, 0.64, -0.20], BR = [0.42, 0.40, 0.52];

// Snap p onto the head surface along the ray from the head centre, then lift it
// outward by `lift`. Implicit form of the loaf is |x/rx|^(2/e)+|y/ry|^(2/e)+|z/rz|^(2/e)=1.
function onHead(p, lift, e) {
  const d = sub(p, HEAD);
  const F = Math.pow(Math.abs(d[0] / HR[0]), 2 / e) + Math.pow(Math.abs(d[1] / HR[1]), 2 / e) + Math.pow(Math.abs(d[2] / HR[2]), 2 / e);
  const s = Math.pow(F, -e / 2);
  const q = add(HEAD, scl(d, s));
  return [...add(q, scl(norm(d), lift)), p[3], p[4]];
}

export function buildUnicorn(Q = 3) {
  const m = { pos: [], nrm: [], col: [], idx: [] };
  const R = 8 + Q * 4, S = 3 + Q, LAT = 8 + Q * 5, LON = 12 + Q * 7;
  const E = 0.62;                            // roundness of all the loaves

  // ── masses
  loaf(m, HEAD, HR, E, WHITE, LAT, LON);
  loaf(m, [0, 1.22, 0.62], [0.40, 0.26, 0.30], 0.58, MUZZLE, LAT, LON);          // pink muzzle block
  for (const sx of [-1, 1]) loaf(m, [sx * 0.14, 1.19, 0.91], [0.035, 0.045, 0.02], 1, HOOF, 6, 8); // nostrils
  loaf(m, BODY, BR, E, WHITE, LAT, LON);
  for (const [x, z] of [[0.25, 0.14], [-0.25, 0.14], [0.25, -0.50], [-0.25, -0.50]]) {
    loaf(m, [x, 0.36, z], [0.165, 0.30, 0.175], 0.55, WHITE, LAT, LON);          // leg slab
    loaf(m, [x, 0.075, z], [0.18, 0.075, 0.19], 0.5, HOOF, 8, 12);                 // hoof band
  }

  // ── eyes, on the SIDE of the head, facing sideways-forward
  for (const sx of [-1, 1]) {
    const Z = norm([sx * 0.94, 0.06, 0.34]), X = norm(cross([0, 1, 0], Z)), Y = cross(Z, X), F = [X, Y, Z];
    const C = [sx * 0.46, 1.42, 0.52];
    const at = (d, r, col, ll) => loaf(m, add(C, scl(Z, d)), r, 1, col, ll || 10, ll ? ll + 4 : 16, F);
    at(0.00, [0.19, 0.215, 0.06], WHITE);
    at(0.03, [0.15, 0.170, 0.05], IRIS);
    at(0.06, [0.088, 0.096, 0.04], DARK);
    loaf(m, add(add(C, scl(Z, 0.09)), add(scl(X, -sx * 0.045), scl(Y, 0.07))), [0.05, 0.05, 0.02], 1, WHITE, 6, 8, F);
    loaf(m, add(add(C, scl(Z, 0.10)), add(scl(X, sx * 0.045), scl(Y, -0.05))), [0.02, 0.02, 0.012], 1, WHITE, 6, 8, F);
    // lashes: three dark flicks off the top-back corner
    for (let k = 0; k < 3; k++) {
      const a = 0.35 + k * 0.5, root = add(C, add(scl(Z, 0.04), add(scl(X, -sx * 0.13 * Math.cos(a)), scl(Y, 0.19 * Math.sin(a)))));
      ribbon(m, spline([[...root, 0.012, 0.012], [...add(root, add(scl(X, -sx * 0.06), scl(Y, 0.06))), 0.008, 0.008], [...add(root, add(scl(X, -sx * 0.10), scl(Y, 0.095))), 0.002, 0.002]], 3), 6, DARK, Z, 0);
    }
    // heart on the cheek
    const hc = [sx * 0.47, 1.16, 0.54];
    loaf(m, add(hc, [0, 0.02, 0.03]), [0.02, 0.033, 0.033], 1, PINK, 6, 8);
    loaf(m, add(hc, [0, 0.02, -0.03]), [0.02, 0.033, 0.033], 1, PINK, 6, 8);
    loaf(m, add(hc, [0, -0.025, 0]), [0.02, 0.05, 0.05], 0.7, PINK, 6, 8);
  }

  // ── ears: flat, pointing up and back, pink inner face
  for (const sx of [-1, 1]) {
    const ear = [[sx * 0.30, 1.78, 0.02, 0.11, 0.05], [sx * 0.36, 1.98, -0.06, 0.10, 0.045], [sx * 0.40, 2.14, -0.13, 0.055, 0.03], [sx * 0.42, 2.20, -0.16, 0.005, 0.005]];
    ribbon(m, spline(ear, S), R, WHITE, [sx, 0.3, 0.6], 0);
    ribbon(m, spline(ear.map((p) => [p[0], p[1], p[2], p[3] * 0.65, p[4] * 0.5]), S), R, MUZZLE, [sx, 0.3, 0.6], 0, sx * 0.02);
  }

  // ── horn: twisted, three colours
  spiralHorn(m, spline([[0, 1.80, 0.36, 0.13], [0, 2.02, 0.40, 0.095], [0, 2.24, 0.45, 0.055], [0, 2.42, 0.49, 0.01]], S), R, [SKY, BUTTER, LILAC], 3, 0.42);

  // ── hair: everything drapes against the head, so thickness = radial from HEAD
  const radial = (p) => norm(sub(p, HEAD));

  // big butter forelock across the brow, above the eye, gentle upturn at the tip
  // snap the SAMPLED curve, not just the control points, so nothing dips under the skin
  const skin = (pts) => spline(pts, S).map((p) => onHead(p, p[4] + 0.03, E));
  const brow = norm([0.35, 0.72, 0.6]);
  ribbon(m, skin([
    [-0.02, 1.90, 0.26, 0.05, 0.03], [0.18, 1.90, 0.52, 0.14, 0.065], [0.42, 1.78, 0.68, 0.13, 0.06], [0.58, 1.66, 0.64, 0.09, 0.045], [0.66, 1.62, 0.52, 0.04, 0.025], [0.66, 1.66, 0.46, 0.005, 0.005],
  ]), R, BUTTER, radial, 0);
  // sky lock under it, falling the other way
  ribbon(m, skin([
    [-0.04, 1.86, 0.34, 0.05, 0.03], [-0.22, 1.84, 0.58, 0.12, 0.055], [-0.44, 1.72, 0.68, 0.11, 0.05], [-0.58, 1.62, 0.58, 0.06, 0.03], [-0.60, 1.62, 0.50, 0.005, 0.005],
  ]), R, SKY, radial, 0);
  // lilac and pink locks over the top, flowing back
  ribbon(m, skin([
    [0.04, 1.90, 0.20, 0.06, 0.03], [-0.16, 1.94, 0.00, 0.13, 0.06], [-0.36, 1.84, -0.20, 0.12, 0.055], [-0.50, 1.66, -0.34, 0.08, 0.04], [-0.54, 1.56, -0.36, 0.01, 0.01],
  ]), R, LILAC, radial, 0);
  ribbon(m, skin([
    [0.10, 1.92, 0.12, 0.06, 0.03], [0.24, 1.92, -0.10, 0.14, 0.06], [0.38, 1.80, -0.30, 0.13, 0.055], [0.50, 1.62, -0.42, 0.08, 0.04], [0.54, 1.52, -0.44, 0.01, 0.01],
  ]), R, PINK, radial, 0);

  // mane: three wide ribbons down the right side of head and neck to the shoulder
  const side = (p) => norm([1, 0.15, -0.1]);
  [[PINK, 0.00, 1.0], [LILAC, 0.16, 0.9], [SKY, 0.30, 0.8]].forEach(([col, b, w]) => {
    ribbon(m, spline([
      [0.22, 1.86, -0.02 - b, 0.06, 0.03],
      [0.50, 1.66, -0.16 - b, 0.15 * w, 0.06],
      [0.60, 1.30, -0.28 - b, 0.15 * w, 0.06],
      [0.60, 0.98, -0.30 - b, 0.14 * w, 0.055],
      [0.54, 0.74, -0.18 - b * 0.7, 0.11 * w, 0.05],
      [0.50, 0.62, -0.04 - b * 0.5, 0.06 * w, 0.035],
      [0.52, 0.66, 0.04 - b * 0.5, 0.01, 0.01],
    ], S), R, col, side, 0);
  });
  // two ribbons on the far side so the back isn't bald
  [[LILAC, 0.00], [PINK, 0.15]].forEach(([col, b]) => {
    ribbon(m, spline([
      [-0.22, 1.86, -0.02 - b, 0.06, 0.03], [-0.50, 1.64, -0.16 - b, 0.13, 0.055], [-0.58, 1.26, -0.30 - b, 0.13, 0.055], [-0.56, 0.96, -0.30 - b, 0.11, 0.05], [-0.50, 0.78, -0.20 - b, 0.05, 0.03], [-0.48, 0.74, -0.16 - b, 0.01, 0.01],
    ], S), R, col, (p) => norm([-1, 0.15, -0.1]), 0);
  });

  // tail: five ribbons stacked into one flat rainbow band that arches up and curls down
  const tail = spline([
    [0, 0.84, -0.64, 0.10, 0.045], [0, 1.08, -0.86, 0.12, 0.048], [0, 1.08, -1.08, 0.12, 0.048], [0, 0.86, -1.18, 0.11, 0.046], [0, 0.56, -1.14, 0.10, 0.044], [0, 0.34, -1.00, 0.08, 0.04], [0, 0.28, -0.90, 0.02, 0.015],
  ], S);
  [PINK, BUTTER, SKY, LILAC, MINT].forEach((col, k) => ribbon(m, tail, R, col, [1, 0, 0], 1, (2 - k) * 0.088));

  return pack(m);
}
const pack = (m) => ({ pos: new Float32Array(m.pos), nrm: new Float32Array(m.nrm), col: new Float32Array(m.col), idx: new Uint32Array(m.idx) });
