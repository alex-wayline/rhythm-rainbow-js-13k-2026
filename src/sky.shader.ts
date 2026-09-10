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

// q = (ndc.x * aspect, ndc.y - HOR): screen position relative to the horizon.
function skyCol(d: Vec3, q: Vec2, k: number, beats: number, t: number, bands: number): Vec3 {
  const up = clamp(d.y * 2.5, 0, 1);
  const hz = mix(vec3(0.22, 0.17, 0.34).scale(0.5 + 0.5 / (1 + q.x * q.x * 3)), hsv2rgb(vec3(hueOf(k), 0.75, 0.42)), step(0, beats));   // the level's colour glows at the horizon
  const zn = vec3(0.025, 0.025, 0.1);
  let col = mix(hz, zn, pow(up, mix(0.3, 0.55, step(0, beats))));
  const pattern = pow(0.5 + 0.5 * sin(q.x * (8 + k * 2) + sin(q.y * 8 + t * 0.2)), 16);
  // Unlocked bands bend from ribbons into the complete title-screen arch.
  const count = mix(7, bands, step(0, beats));
  const e = vec2(q.x / mix(1.05, 0.8, step(0, beats)), q.y / mix(0.82, 0.65, step(0, beats)));
  const kb = (1 - length(e)) / mix(0.04, 0.018, step(0, beats));
  const inArc = mix(1, 0.35, step(0, beats)) * smoothstep(0 - 0.3, 0.3, kb) * (1 - smoothstep(count - 0.3, count + 0.3, kb)) * smoothstep(0, 0.06, q.y);
  const j = clamp(floor(kb), 0, count - 1);
  const rc = hsv2rgb(vec3(mix(hueOf(j), hueOf(min(j + 1, count - 1)), smoothstep(0, 1, fract(kb))), 0.7, 1));
  col = col.add(rc.scale(pattern * (0.12 + 0.18 * (1 - fract(beats))) * up * step(0, beats)));
  col = mix(col, rc, inArc * 0.8);
  col = col.add(vec3(1, 1, 1).scale(pow(max(0, sin(e.x * 4 - t * 1.5)), 32) * inArc * 0.35));
  // Stars: one candidate per grid cell, jittered, twinkling.
  const g = q.scale(24);
  const cell = vec2(floor(g.x), floor(g.y));
  const h = hash21(cell);
  const sp = g.sub(cell).sub(vec2(0.5, 0.5));
  const star = smoothstep(0.09, 0, length(sp)) * step(0.82, h) * (0.55 + 0.45 * sin(t * 3 + h * 40)) * up;
  col = col.add(vec3(1, 1, 1).scale(star));
  return col;
}

function groundCol(p: Vec3, d: Vec3, dist: number, q: Vec2, fx: Vec4, beats: number, t: number, hz: Vec3): Vec3 {
  const k = fx.y;
  const spacing = fx.w;
  // Lane units: u in [0, 4) is a lane, one unit either side is shoulder, so the
  // whole track is six bands of the level's palette.
  const u = p.x + 2;
  const onTrack = step(0 - 1, u) * step(u, 5);
  const bnd = clamp(floor(u) + 1, 0, 5);
  const isLane = step(0.5, bnd) * step(bnd, 4.5);
  let lane = hsv2rgb(vec3(palHue(bnd, k), mix(0.9, 0.8, isLane), mix(0.85, 1, isLane)));
  // Each band shades like a glossy rounded bar: bright down its middle.
  const bar = pow(1 - abs(fract(u) - 0.5) * 2, 2);
  lane = lane.scale(0.8 + 0.3 * bar);
  // Gloss: the surface mirrors the sky (arc, shapes, stars), strongest toward the horizon.
  const r = reflect(d, vec3(0, 1, 0));
  const refl = skyCol(r, vec2(q.x, 0 - q.y), k, beats, t, fx.x);
  const fres = pow(1 - clamp(0 - d.y, 0, 1), 3);
  lane = mix(lane, refl, 0.15 + 0.6 * fres);
  // Specular from a light beyond the horizon: a broad sheen plus a small hot spot.
  const rl = max(dot(r, normalize(vec3(0.25, 0.42, 0 - 1))), 0);
  lane = lane.add(vec3(1, 1, 1).scale(pow(rl, 24) * 0.18));
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
  col = col.add(vec3(1, 1, 1).scale(edge * (0.6 + 0.15 * pow(1 - fract(beats), 3)) + beatLine + rec));
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
    const sky = skyCol(d, q, k, beats, t, uFx.x);
    const below = step(d.y, 0 - 0.0005);
    const dist = (0 - uCam0.y) / min(d.y, 0 - 0.0005);
    const p = uCam0.xyz.add(d.scale(dist));
    const hz = mix(vec3(0.22, 0.17, 0.34).scale(0.5 + 0.5 / (1 + q.x * q.x * 3)), hsv2rgb(vec3(hueOf(k), 0.75, 0.42)), step(0, beats));
    const gnd = groundCol(p, d, dist, q, uFx, beats, t, hz);
    let col = mix(sky, gnd, below);
    // Light at the end of the highway.
    const vg = length(vec2(q.x, q.y * 1.6));
    col = col.add(vec3(1, 0.95, 0.98).scale(0.25 * uFx.z / (1 + 70 * vg * vg)));
    if (beats < 0 - 1) col = skyCol(vec3(0, 0.3, 0), vec2(q.x, q.y - 2), k, beats, t, uFx.x);
    return vec4(col, 1);
  },
});
