// ── Procedural chibi unicorn (see chibi2.mjs for the annotated version) ──────
// Chibi unicorn v2. Shape grammar taken from the reference:
//   - rounded boxes (superellipsoids) for head, muzzle, body, legs, hooves
//   - rounded, tapered locks for the tail, mane and forelock
//   - a glossy gold cone for the horn
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
//    hint is the THICKNESS direction (e.g. the surface normal it lies on).
function ribbon(m, curve, R, color, hint) {
  const base = m.pos.length / 3;
  const rings = curve.map((p, i) => {
    const T = norm(sub(curve[Math.min(i + 1, curve.length - 1)], curve[Math.max(i - 1, 0)]));
    const U = norm(sub(hint, scl(T, dot(hint, T))));
    return [p, cross(U, T), U, p[3], p[4], T];
  });
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
  // flat end caps
  for (const [ri, flip] of [[0, 1], [rings.length - 1, 0]]) {
    const [c, , , , , T] = rings[ri], ci = m.pos.length / 3;
    m.pos.push(c[0], c[1], c[2]); m.nrm.push(...scl(T, flip ? -1 : 1)); m.col.push(...color);
    for (let j = 0; j < R; j++) {
      const a = base + ri * R + j, b = base + ri * R + (j + 1) % R;
      m.idx.push(ci, flip ? b : a, flip ? a : b);
    }
  }
}

// ── straight cone from a to b: radius r at the base, closing to a point at b.
//    Built as stacked frustums so every band gets its own flat colour: `lines`
//    thin rings in the darker colour cols[1], evenly spaced along the length.
function cone(m, a, b, r, R, cols, lines) {
  const T = norm(sub(b, a)), S = norm(cross([1, 0, 0], T)), U = cross(T, S), ts = [0];
  for (let k = 1; k <= lines; k++) ts.push(k / (lines + 1) - 0.015, k / (lines + 1) + 0.015);
  ts.push(1);
  for (let s = 0; s + 1 < ts.length; s++) {
    const base = m.pos.length / 3;
    for (let i = 0; i < 2; i++) for (let j = 0; j < R; j++) {
      const t = ts[s + i], th = (j / R) * Math.PI * 2, n = norm(add(scl(S, Math.cos(th)), scl(U, Math.sin(th))));
      const c = add(a, scl(sub(b, a), t)), rr = Math.max(r * (1 - t), 0.003);
      m.pos.push(c[0] + n[0] * rr, c[1] + n[1] * rr, c[2] + n[2] * rr);
      m.nrm.push(...norm(add(n, scl(T, 0.18))));   // cone normals lean toward the tip
      m.col.push(...cols[s & 1]);
    }
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R;
      m.idx.push(base + j, base + R + j, base + j2, base + j2, base + R + j, base + R + j2);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
const WHITE  = [0.99, 0.985, 1.0];
const MUZZLE = [0.98, 0.74, 0.86], SNOUT = [1, 0.91, 0.95];
const HOOF   = [0.97, 0.62, 0.83];
const IRIS   = [0.58, 0.40, 0.72];
const DARK   = [0.10, 0.06, 0.14];

// Head and body centres
const HEAD = [0, 1.40, 0.30];
const BODY = [0, 0.6, -0.2], BR = [0.46, 0.44, 0.56];

// pal: seven hair colours (mane, forelock, tail) — the level's palette.
function buildUnicorn(Q, pal) {
  const [RED, ORANGE, YELLOW, GREEN, BLUE, INDIGO, VIOLET] = pal.map(c => c.map(v => 0.24 + v * 0.76));   // level hues (all red on level 1)
  const m = { pos: [], nrm: [], col: [], idx: [] };
  const R = 8 + Q * 4, S = 3 + Q, LAT = 8 + Q * 5, LON = 12 + Q * 7;
  const E = 0.9;                             // roundness of all the loaves (higher = rounder, cuter)
  // Tilt the whole head forward so its long (egg) axis lines up with the
  // muzzle. til() rotates a point about the head centre by TH around x;
  // HF is the matching frame for the loaves that make up the head.
  const TH = 0.17, ct = Math.cos(TH), st = Math.sin(TH);
  const til = (p) => [HEAD[0] + (p[0] - HEAD[0]), HEAD[1] + ct * (p[1] - HEAD[1]) - st * (p[2] - HEAD[2]), HEAD[2] + st * (p[1] - HEAD[1]) + ct * (p[2] - HEAD[2]), ...p.slice(3)];
  const HF = [[1, 0, 0], [0, ct, st], [0, -st, ct]];

  // ── masses
  loaf(m, HEAD, [0.54, 0.52, 0.5], E, WHITE, LAT, LON, HF); // original slightly oval head proportions
  // Blush is painted into the head vertices, so it follows the cheek exactly.
  for (let i = 0; i < m.pos.length; i += 3) {
    const a = Math.max(0, 1 - Math.hypot((Math.abs(m.pos[i]) - 0.46) / 0.15, (m.pos[i + 1] - 1.23) / 0.12, (m.pos[i + 2] - 0.5) / 0.16));
    for (let j = 0; j < 3; j++) m.col[i + j] = WHITE[j] * (1 - a) + MUZZLE[j] * a;
  }
  loaf(m, til([0, 1.19, 0.6]), [0.29, 0.22, 0.28], 0.85, SNOUT, LAT, LON, HF);   // rounded muzzle, tilted with the head
  // Small oval nostrils lie directly on the curved muzzle surface.
  for (const sx of [-1, 1]) {
    const base = m.pos.length / 3;
    for (let j = 0; j <= 17; j++) {
      const a = (j - 1) / 16 * 6.2832;
      const x = sx * 0.088 + (j ? 0.018 * Math.cos(a) : 0);
      const y = 0.01 + (j ? 0.025 * Math.sin(a) : 0);
      const z = 0.6 + 0.28 * Math.pow(1 - Math.pow(Math.abs(x / 0.29), 2 / 0.85) - Math.pow(Math.abs(y / 0.22), 2 / 0.85), 0.85 / 2);
      m.pos.push(...til([x, 1.19 + y, z + 0.001]));
      m.nrm.push(...HF[2]); m.col.push(0.88, 0.69, 0.76);
      if (j > 1) m.idx.push(base, base + j - 1, base + j);
    }
  }
  loaf(m, BODY, BR, E, WHITE, LAT, LON);
  for (const [x, z] of [[0.22, 0.12], [-0.22, 0.12], [0.22, -0.46], [-0.22, -0.46]]) {
    loaf(m, [x, 0.44, z], [0.17, 0.4, 0.18], 0.82, WHITE, LAT, LON);              // rounded leg, top buried in the body
    ribbon(m, spline([[x, 0, z, 0.085, 0.085], [x, 0.045, z, 0.14, 0.14], [x, 0.15, z, 0.14, 0.14]], 4), 16, HOOF, [1, 0, 0]);   // hoof: short cylinder, softly rounded bottom edge
  }

  // ── eyes: big glossy anime eye. Layered discs — thin dark outline, white,
  // a purple iris that fills most of it, a big pupil, two highlights — each
  // layer strictly in front of the last so nothing buries or z-fights.
  for (const sx of [-1, 1]) {
    const Z = norm([sx * 0.78, 0.05, 0.56]), X = norm(cross([0, 1, 0], Z)), Y = cross(Z, X), F = [X, Y, Z];
    const C = til([sx * 0.44, 1.48, 0.5]);
    const at = (d, r, col, ll) => loaf(m, add(C, scl(Z, d)), r, 1, col, ll || 10, ll ? ll + 4 : 16, F);
    at(0.00, [0.202, 0.227, 0.05], DARK);     // thin outline
    at(0.025, [0.19, 0.215, 0.05], WHITE);
    at(0.05, [0.165, 0.19, 0.045], IRIS);
    at(0.07, [0.135, 0.155, 0.04], DARK);
    loaf(m, add(add(C, scl(Z, 0.1)), add(scl(X, -sx * 0.05), scl(Y, 0.06))), [0.05, 0.05, 0.02], 1, WHITE, 6, 8, F);
    loaf(m, add(add(C, scl(Z, 0.105)), add(scl(X, sx * 0.05), scl(Y, -0.06))), [0.022, 0.022, 0.012], 1, WHITE, 6, 8, F);
    // lashes: three thin even-width lines on the upper-BACK arc of the outline
    // (sx*X is the toward-the-ear direction), all sweeping up-and-back to the ear
    for (let k = 0; k < 3; k++) {
      const a = 0.55 + k * 0.28;
      const root = add(C, add(scl(Z, 0.02), add(scl(X, sx * 0.2 * Math.cos(a)), scl(Y, 0.225 * Math.sin(a)))));
      const dX = scl(X, sx * 0.05), dY = scl(Y, 0.09);
      ribbon(m, spline([[...root, 0.006, 0.006], [...add(root, add(scl(dX, 0.6), scl(dY, 0.4))), 0.006, 0.006], [...add(root, add(dX, dY)), 0.006, 0.006]], 3), 6, DARK, Z);
    }
  }

  // ── ears: simple flat oval discs (flattened ellipsoids) standing on the
  // top-sides of the head, facing forward; a smaller pink oval sits proud of
  // the front face so a white rim shows on the sides and top.
  for (const sx of [-1, 1]) {
    const L = norm([sx * 0.35, 1, -0.2]);                                  // length axis: up, out, a touch back
    const N = norm(sub([sx * 0.3, 0.1, 1], scl(L, dot([sx * 0.3, 0.1, 1], L))));   // thin axis faces forward
    const rot = (v) => [v[0], ct * v[1] - st * v[2], st * v[1] + ct * v[2]];  // same tilt as til(), for vectors
    const F = [rot(cross(L, N)), rot(L), rot(N)];
    const C = add([sx * 0.32, 1.72, 0.17], scl(L, 0.1));                    // root buried in the head
    loaf(m, til(C), [0.11, 0.22, 0.045], 1, WHITE, 14, 20, F);
    loaf(m, til(add(add(C, scl(L, -0.01)), scl(N, 0.015))), [0.08, 0.175, 0.04], 1, MUZZLE, 14, 20, F);
  }

  // ── horn: a plain straight gold cone rooted at the forehead, pointing
  // up-and-forward. It never follows the level palette; only the hair does.
  // Both golds have red > 1, which is what the Lit shader keys the gloss on.
  cone(m, [0, 1.84, 0.53], [0, 2.35, 0.84], 0.13, R, [[1.35, 1.05, 0.4], [1.22, 0.86, 0.28]], 5);   // gold with darker gold rings

  // One uninterrupted fin follows the crown; stripes only change its colour.
  const crest = spline([
    [0, 1.98, 0.22, 0.16, 0.065],
    [0, 1.99, 0.08, 0.26, 0.085],
    [0, 1.93, -0.08, 0.28, 0.09],
    [0, 1.8, -0.2, 0.27, 0.085],
    [0, 1.53, -0.36, 0.2, 0.07],
    [0, 1.34, -0.32, 0.13, 0.055],
    [0, 1.18, -0.2, 0.065, 0.035],
    [0, 1.08, -0.08, 0.008, 0.008]
  ].map(til), S + 5);
  const start = m.col.length, colors = [RED, ORANGE, YELLOW, GREEN, BLUE, INDIGO, VIOLET];
  ribbon(m, crest, R, RED, [1, 0, 0]);
  for (let i = start; i < m.col.length; i += 3) {
    const c = colors[Math.min(6, Math.floor((i - start) / (3 * R * crest.length) * 7))];
    for (let j = 0; j < 3; j++) m.col[i + j] = c[j];
  }
  // Keep the full, curled tail.
  [INDIGO, ORANGE, VIOLET].forEach((col, k) => {
    const d = k * 0.13;
    ribbon(m, spline([
      [d - 0.13, 0.88, -0.63, 0.035, 0.04],
      [d - 0.13, 1.02, -0.9, 0.12, 0.1],
      [d - 0.13, 0.85, -1.15, 0.135, 0.11],
      [d - 0.13, 0.47, -1.2, 0.12, 0.1],
      [d - 0.13, 0.35, -1.37, 0.075, 0.07],
      [d - 0.13, 0.48, -1.44, 0.008, 0.009]
    ], S + 3), R, col, [1, 0, 0]);
  });

  return pack(m);
}
const pack = (m) => ({ pos: new Float32Array(m.pos), nrm: new Float32Array(m.nrm), col: new Float32Array(m.col), idx: new Uint16Array(m.idx) });
