import {
  shader, vec2, vec3, vec4, normalize, dot, max, min, mix, pow, clamp, smoothstep, step,
  abs, floor, fract, exp, length, reflect, sin, cos, acos, sign, mod,
  type Vec2, type Vec3, type Vec4,
} from 'brometal';
import { hsv2rgb, hash21, hash22, rotate2 } from 'brometal/shader-functions';

/**
 * Background and highway in one fullscreen pass. Each pixel casts a camera ray:
 * rays that hit the ground plane (y = 0) shade the rainbow track and the ground
 * around it; rays that miss shade the sky. The camera never moves, so the sky
 * decorations (rainbow arc, shapes, stars) are placed in aspect-corrected screen
 * space, which also makes their mirror image in the glossy track a one-line flip.
 *
 * Colour comes from the level: level k has unlocked k + 1 rainbow colours, and
 * every band, shape and lane cycles through just those. Level 0 is all red;
 * level 6 is the full rainbow.
 *
 * Uniforms are packed as vec4s so the float offsets are simply 0, 4, 8, ...:
 *   uCam0  eye.xyz,     tanFov * aspect
 *   uCam1  right.xyz,   tanFov
 *   uCam2  up.xyz,      time (s)
 *   uCam3  forward.xyz, beats elapsed (fractional)
 *   uFx    combo 0..1, level 0..6, track brightness 0..1, world z per beat
 * HOR (0.12) — the horizon's NDC y — is repeated in game.js.
 */

// Hue of rainbow colour i (0..6): red, orange, yellow, green, blue, indigo, violet.
// game.js TRACK_H mirrors this table.
function hueOf(i: number): number {
  return 0.07 * step(0.5, i) + 0.09 * step(1.5, i) + 0.2 * step(2.5, i) + 0.24 * step(3.5, i) + 0.12 * step(4.5, i) + 0.1 * step(5.5, i);
}

// Colour number j on level k: the unlocked palette cycles.
function palHue(j: number, k: number): number {
  return hueOf(mod(j, k + 1));
}

// Regular polygon, n sides, inradius r. Angle via acos and sign (no atan2 in the DSL).
function sdNgon(p: Vec2, n: number, r: number): number {
  const an = 3.14159 / n;
  const a = acos(p.x / max(length(p), 0.0001)) * sign(p.y + 0.00001);
  const b = mod(a + an + 6.28318, 2 * an) - an;
  return length(p) * cos(b) - r;
}

// q = (ndc.x * aspect, ndc.y - HOR): screen position relative to the horizon.
function skyCol(d: Vec3, q: Vec2, k: number, beats: number, combo: number, t: number): Vec3 {
  const up = clamp(d.y * 2.5, 0, 1);
  const hz = hsv2rgb(vec3(hueOf(k), 0.55, 0.42));   // the level's colour glows at the horizon
  const zn = vec3(0.05, 0.02, 0.14);
  let col = mix(hz, zn, pow(up, 0.55));
  // Background shapes: a jittered grid of polygons in the unlocked colours,
  // pulsing to the beat and turning slowly. Each level adds a side, tightens
  // the grid and rotates it, so no two stages share a pattern.
  const cs = 0.32 - 0.018 * k;
  const gp = rotate2(vec2(q.x + 0.17, q.y + 0.09), k * 0.45).scale(1 / cs);
  const cid = vec2(floor(gp.x), floor(gp.y));
  const hh = hash22(cid);
  const lp = gp.sub(cid).sub(vec2(0.5, 0.5)).sub(hh.sub(vec2(0.5, 0.5)).scale(0.5)).scale(cs);
  const pulse = pow(1 - fract(beats), 2);
  const rr = cs * (0.12 + 0.1 * hh.x) * (0.85 + 0.25 * pulse);
  const sd = sdNgon(rotate2(lp, t * (0.2 + 0.3 * hh.y) + hh.x * 6), 3 + k, rr);
  const sc = hsv2rgb(vec3(palHue(floor(hh.y * 7), k), 0.8, 1));
  col = mix(col, sc, (1 - smoothstep(0 - 0.01, 0.01, sd)) * 0.35 * up);
  // Rainbow: seven bands of an ellipse standing on the horizon, apex near the
  // top. While colours repeat, alternate bands dim a little so they still read.
  const e = vec2((q.x - 0.1) / 1.35, q.y / 0.82);
  const kb = (1 - length(e)) / 0.048;
  const inArc = step(0, kb) * step(kb, 7) * smoothstep(0, 0.06, q.y);
  const j = clamp(floor(kb), 0, 6);
  const rc = hsv2rgb(vec3(palHue(j, k), 0.75, 1 - 0.12 * mod(j, 2) * step(k, 5.5)));
  col = mix(col, rc, inArc * (0.7 + 0.2 * combo));
  // Stars: one candidate per grid cell, jittered, twinkling.
  const g = q.scale(24);
  const cell = vec2(floor(g.x), floor(g.y));
  const h = hash21(cell);
  const sp = g.sub(cell).sub(vec2(0.5, 0.5)).sub(hash22(cell).sub(vec2(0.5, 0.5)).scale(0.6));
  const star = smoothstep(0.09, 0, length(sp)) * step(0.82, h) * (0.55 + 0.45 * sin(t * 3 + h * 40)) * up;
  col = col.add(vec3(1, 1, 1).scale(star));
  return col;
}

function groundCol(p: Vec3, d: Vec3, dist: number, q: Vec2, fx: Vec4, beats: number, t: number, hz: Vec3): Vec3 {
  const combo = fx.x;
  const k = fx.y;
  const spacing = fx.w;
  // Lane units: u in [0, 4) is a lane, one unit either side is shoulder, so the
  // whole track is six bands of the level's palette.
  const u = p.x + 2;
  const onTrack = step(0 - 1, u) * step(u, 5);
  const bnd = clamp(floor(u) + 1, 0, 5);
  const isLane = step(0.5, bnd) * step(bnd, 4.5);
  let lane = hsv2rgb(vec3(palHue(bnd, k), mix(0.9, 0.8, isLane), mix(0.85, 1, isLane) - 0.1 * mod(bnd, 2) * step(k, 4.5)));
  // Each band shades like a glossy rounded bar: bright down its middle.
  const bar = pow(1 - abs(fract(u) - 0.5) * 2, 2);
  lane = lane.scale(0.8 + 0.3 * bar);
  // Gloss: the surface mirrors the sky (arc, shapes, stars), strongest toward the horizon.
  const r = reflect(d, vec3(0, 1, 0));
  const refl = skyCol(r, vec2(q.x, 0 - q.y), k, beats, combo, t);
  const fres = pow(1 - clamp(0 - d.y, 0, 1), 3);
  lane = mix(lane, refl, 0.15 + 0.6 * fres);
  // Specular from a light beyond the horizon: a broad sheen plus a small hot spot.
  const rl = max(dot(r, normalize(vec3(0.25, 0.42, 0 - 1))), 0);
  lane = lane.add(vec3(1, 1, 1).scale(pow(rl, 24) * 0.18 + pow(rl, 400) * 0.45));
  const gnd = vec3(0.14, 0.09, 0.22);
  let col = mix(mix(gnd, refl, 0.3 * fres), lane, onTrack);
  // Glowing band edges (integer u). Width grows with distance so far lines don't shimmer.
  const w = 0.025 + 0.004 * dist;
  const lineD = 0.5 - abs(fract(u) - 0.5);
  const edge = exp(0 - lineD * lineD / (w * w)) * onTrack;
  // Beat lines sweeping toward the player at note speed.
  const b = fract(beats - p.z / spacing);
  const bd = min(b, 1 - b) * spacing;
  const beatLine = exp(0 - bd * bd / (w * w * 2)) * 0.15 * onTrack;
  // The judgment line at z = 0.
  const rec = exp(0 - p.z * p.z * 30) * 0.9 * onTrack;
  col = col.add(vec3(1, 1, 1).scale(edge * 0.75 + beatLine + rec));
  col = col.scale(mix(1, fx.z, onTrack));
  return mix(col, hz, smoothstep(15, 80, dist));
}

export const Sky = shader({
  attributes: { aPos: 'vec2' },
  uniforms: { uCam0: 'vec4', uCam1: 'vec4', uCam2: 'vec4', uCam3: 'vec4', uFx: 'vec4' },
  varyings: { vUv: 'vec2', vDir: 'vec3' },

  vertex({ aPos }, { uCam0, uCam1, uCam2, uCam3 }, v) {
    v.vUv = aPos;
    v.vDir = uCam3.xyz.add(uCam1.xyz.scale(aPos.x * uCam0.w)).add(uCam2.xyz.scale(aPos.y * uCam1.w));
    // Just inside the far plane so everything else draws over it.
    return vec4(aPos.x, aPos.y, 0.9999, 1);
  },

  fragment({ uCam0, uCam1, uCam2, uCam3, uFx }, { vUv, vDir }) {
    const d = normalize(vDir);
    const asp = uCam0.w / uCam1.w;
    const q = vec2(vUv.x * asp, vUv.y - 0.12);
    const t = uCam2.w;
    const beats = uCam3.w;
    const k = uFx.y;
    const sky = skyCol(d, q, k, beats, uFx.x, t);
    const below = step(d.y, 0 - 0.0005);
    const dist = (0 - uCam0.y) / min(d.y, 0 - 0.0005);
    const p = uCam0.xyz.add(d.scale(dist));
    const hz = hsv2rgb(vec3(hueOf(k), 0.55, 0.42));
    const gnd = groundCol(p, d, dist, q, uFx, beats, t, hz);
    let col = mix(sky, gnd, below);
    // Light at the end of the highway.
    const vg = length(vec2(q.x, q.y * 1.6));
    col = col.add(vec3(1, 0.95, 0.98).scale(0.25 * uFx.z / (1 + 70 * vg * vg)));
    return vec4(col, 1);
  },
});
