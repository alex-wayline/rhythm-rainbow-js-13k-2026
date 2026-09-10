import { shader, vec3, vec4, normalize, dot, max, mix, smoothstep, pow, step, abs } from 'brometal';

/**
 * Soft matte "vinyl toy" lighting with per-vertex colour, plus distance fog
 * toward the sky colour so the rainbow track fades into the horizon.
 * Used for both the unicorn and the track.
 */
export const Lit = shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  uniforms: { uVp: 'mat4', uModel: 'mat4', uLight: 'vec4', uSky: 'vec3' },
  varyings: { vN: 'vec3', vC: 'vec3', vD: 'float' },

  vertex({ aPosition, aNormal, aColor }, { uVp, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vN = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vC = aColor;
    const clip = uVp.mul(world);
    v.vD = clip.w;
    return clip;
  },

  fragment({ uLight, uSky }, { vN, vC, vD }) {
    const n = normalize(vN);
    const L = normalize(uLight.xyz);
    const d = max(dot(n, L), 0);
    const fill = max(dot(n, vec3(0 - L.x, 0 - 0.2, 0 - L.z)), 0) * 0.16;   // soft back fill so no side goes dark
    const top = smoothstep(0.2, 1, n.y) * 0.14;                            // soft studio toplight sheen
    const H = normalize(L.add(vec3(0, 0.35, 1)));                           // half vector for the fixed front camera
    const spec = pow(max(dot(n, H), 0), 40) * step(1.2, vC.x);              // glossy highlight, only on the gold horn (r > 1)
    const lit = vC.scale(0.62 + d * 0.4 + fill + top).add(vec3(spec, spec, spec * 0.8));
    const aura = vec3(0.2, 0.65, 1).scale(uLight.w * (0.08 + pow(1 - abs(n.z), 2) * 0.5));
    const fog = smoothstep(9, 34, vD);
    return vec4(mix(lit.add(aura), uSky, fog), 1);
  },
});
