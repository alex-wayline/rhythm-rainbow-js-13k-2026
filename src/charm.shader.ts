import {
  shader, vec2, vec3, vec4, length, abs, max, min, mix, step, smoothstep, acos, sign, cos, pow,
  floor, fract, exp, dot, normalize,
  type Vec2,
} from 'brometal';
import { sdRoundedBox2, rotate2 } from 'brometal/shader-functions';

/**
 * One instanced quad shader for everything on the track: note tiles, the arrow
 * receptors at the judgment line, and hit particles.
 *
 *   iPos.xyz  world position    iPos.w  shape (see below)
 *   iCol.rgb  colour            iCol.w  alpha
 *   iScale    half-size in world units
 *
 * Shapes, in the integer part of iPos.w:
 *   0..3  note tile carrying the lane's charm: horseshoe, star, clover, moon
 *   4     plain dot, for particles
 *   5..8  receptor triangle for lane 0..3 (left, down, up, right); fractional
 *         part >= .5 means pressed, which adds a glow
 *
 * Everything is a signed-distance field in quad space [-1, 1].
 */

// Arrowhead pointing up, centred on its bounding box (apex y 0.6, base y -0.6)
// so the rotated copies all sit in the middle of their lane.
function sdTri(p: Vec2): number {
  const q = vec2(abs(p.x), p.y);
  return max(dot(q.sub(vec2(0, 0.6)), normalize(vec2(1.2, 0.75))), 0 - 0.6 - p.y) - 0.06;
}

export const Charm = shader({
  attributes: { aPos: 'vec2' },
  instanceAttributes: { iPos: 'vec4', iCol: 'vec4', iScale: 'float' },
  uniforms: { uVp: 'mat4' },
  varyings: { vUv: 'vec2', vCol: 'vec4', vShape: 'float' },

  vertex({ aPos, iPos, iCol, iScale }, { uVp }, v) {
    v.vUv = aPos;
    v.vCol = iCol;
    v.vShape = iPos.w;
    // Note tiles lean back about 50 degrees so they read as tiles without the
    // foreshortening a flat decal would get. Receptors (shape >= 5) lie flat in
    // the lane plane, stretched along the track to undo the foreshortening, so
    // perspective lines them up with the lane edges.
    const flat = step(4.5, iPos.w);
    const p = vec3(iPos.x + aPos.x * iScale, iPos.y + 0.06 * flat + (aPos.y + 1) * iScale * 0.77 * (1 - flat), iPos.z + aPos.y * iScale * mix(0.64, 0 - 2.3 + min(iPos.z, 0) * 0.2, flat));   // flat: quad up = away from the camera = up on screen
    return uVp.mul(vec4(p, 1));
  },

  fragment(_u, { vUv, vCol, vShape }) {
    const p = vUv;
    const shape = floor(vShape + 0.001);
    const pressed = step(0.25, fract(vShape + 0.001));
    const col = vCol.xyz;
    const soft = 0.035;

    const lane = shape - 5 * step(4.5, shape);
    let rot = 4.7124;
    rot = mix(rot, 3.1416, step(0.5, lane));
    rot = mix(rot, 0, step(1.5, lane));
    rot = mix(rot, 1.5708, step(2.5, lane));
    const iconScale = mix(2.4, 1.7, step(4.5, shape));
    const dIcon = sdTri(rotate2(p.scale(iconScale), rot)) / iconScale;

    // ── tile behind the icon: glossy, lane-coloured, white rim, soft halo
    const dTile = sdRoundedBox2(p, vec2(0.76, 0.76), 0.22);
    const tileFill = 1 - smoothstep(0 - soft, soft, dTile);
    const shade = mix(col.scale(0.45), col.scale(1.05), (p.y + 1) * 0.5);
    const sheen = exp(0 - dot(p.sub(vec2(0 - 0.25, 0.5)), p.sub(vec2(0 - 0.25, 0.5))) * 5) * 0.22;
    const rim = smoothstep(0 - 0.06, 0, dTile);
    let tileCol = mix(shade, mix(col.scale(0.3), vec3(0.8, 0.9, 1), smoothstep(0 - 0.5, 0.8, p.y)), rim * 0.6);
    tileCol = tileCol.add(vec3(sheen, sheen, sheen));
    const iconFill = 1 - smoothstep(0 - soft, soft, dIcon);
    tileCol = mix(tileCol, vec3(1, 1, 1), iconFill);
    const aTile = tileFill * max(0.9, iconFill);

    // ── particle dot
    const aDot = 1 - smoothstep(0, 0.9, length(p));

    // ── receptor triangle, rotated per lane; glows when pressed
    const dArrow = dIcon;
    const fillA = 1 - smoothstep(0 - soft, soft, dArrow);
    const aArrow = max(fillA, exp(0 - max(dArrow, 0) * 4) * 0.6 * pressed);

    const isDot = step(3.5, shape) * step(shape, 4.5);
    const isArrow = step(4.5, shape);
    const rgb = mix(tileCol, col, max(isDot, isArrow));
    const a = mix(mix(aTile, aDot, isDot), aArrow, isArrow);
    return vec4(rgb, a * vCol.w);
  },
});
