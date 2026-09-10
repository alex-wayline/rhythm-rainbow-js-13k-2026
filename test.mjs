// Headless smoke test. No GPU here, so: stub the platform, run the real
// program, and check the things a stub *can* check — no exceptions, every
// buffer write in bounds, draw counts sane, and the camera framing.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const errors = [];
const noop = () => {};
const proxy = (name) => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : typeof k === 'string' ? (...a) => proxy(`${name}.${k}()`) : noop) });

let bufferId = 0;
const buffers = new Map();
const device = {
  createShaderModule: ({ code }) => {
    if (!/fn vs_main/.test(code) || !/fn fs_main/.test(code)) errors.push('shader missing entry');
    // a '.' that is neither a member access nor part of a number is a broken float literal
    if (/(^|[^\w)\]])\.(?!\d)/.test(code)) errors.push('malformed float literal in WGSL');
    return {};
  },
  createBindGroupLayout: () => ({}),
  createPipelineLayout: () => ({}),
  createRenderPipeline: (d) => { if (!d.vertex.buffers.every((b) => /^float32(x[234])?$/.test(b.attributes[0].format))) errors.push('bad vertex format'); return {}; },
  createBindGroup: () => ({}),
  createBuffer: ({ size, usage }) => { const b = { id: bufferId++, size, usage }; buffers.set(b.id, b); return b; },
  createTexture: () => ({ createView: () => ({}), destroy: noop }),
  createSampler: () => ({}),
  createCommandEncoder: () => ({
    beginRenderPass: () => ({ setPipeline: noop, setBindGroup: noop, setVertexBuffer: noop, setIndexBuffer: noop, end: noop,
      drawIndexed: (n, inst) => { stats.draws++; stats.tris += (n / 3) * (inst || 1); if (!n) errors.push('drawIndexed with 0 indices'); } }),
    finish: () => ({}),
  }),
  queue: {
    writeBuffer: (buf, off, data, dOff = 0, size) => {
      const bytes = size !== undefined ? size * data.BYTES_PER_ELEMENT : data.byteLength - dOff * (data.BYTES_PER_ELEMENT || 1);
      if (off + bytes > buf.size) errors.push(`writeBuffer overflow: ${off + bytes} > ${buf.size}`);
      if (bytes % 4) errors.push(`writeBuffer unaligned ${bytes}`);
      stats.writes++;
    },
    submit: noop,
  },
};
const stats = { draws: 0, tris: 0, writes: 0, frames: 0 };

let raf = [];
const listeners = {};
let audioTime = 0;
const ctx2d = proxy('ctx2d');
const canvas = (id) => ({ id, clientWidth: 1280, clientHeight: 720, width: 0, height: 0,
  getContext: (k) => (k === 'webgpu' ? { configure: noop, getCurrentTexture: () => ({ createView: () => ({}) }) } : ctx2d) });

const sandbox = {
  console, Math, Set, Float32Array, Uint16Array, Uint32Array, Uint8Array, Array, Object, Promise, Error, Number, String, JSON, Symbol, Proxy, Reflect,
  setTimeout: (f) => f(), clearTimeout: noop,
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  document: { getElementById: canvas },
  navigator: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }), getPreferredCanvasFormat: () => 'bgra8unorm' } },
  requestAnimationFrame: (f) => raf.push(f),
  localStorage: {}, performance: { now: () => stats.frames * 16 },
  addEventListener: (k, f) => (listeners[k] = listeners[k] || []).push(f),
  AudioContext: class { constructor() { this.sampleRate = 48000; this.destination = {}; } get currentTime() { return audioTime; }
    createBuffer(ch, len, sr) { stats.audioLen = len / sr; return { copyToChannel: (d) => { if (d.some((v) => v !== v)) errors.push('NaN in audio'); } }; }
    createOscillator() { return {frequency: {setValueAtTime: noop, exponentialRampToValueAtTime: noop}, connect: noop, start: noop, stop: noop}; }
    createGain() { return {gain: {setValueAtTime: noop, exponentialRampToValueAtTime: noop}, connect: noop}; }
    createBufferSource() { return { connect: noop, stop: noop, start: (t) => { stats.audioStart = t; } }; } },
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);

const src = readFileSync(process.argv[2] || 'dist/raw.js', 'utf8');
const MIN = /g\.js$/.test(process.argv[2] || '');
vm.runInContext(src, sandbox, { filename: 'raw.js' });
await new Promise((r) => setTimeout(r, 20));           // let bmInit resolve
// top-level let/const are not global properties; read them by name
const g = (name) => vm.runInContext(name, sandbox);

const lanes = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const frame = (dtMs) => { stats.frames++; audioTime += dtMs / 1000; const fs = raf; raf = []; fs.forEach((f) => f(stats.frames * dtMs)); };
const key = (code, type = 'keydown') => (listeners[type] || []).forEach((f) => f({ code, repeat: false }));

// gate → attract → select → play
for (let i = 0; i < 5; i++) frame(16);
key('Digit2'); for (let i = 0; i < 20; i++) frame(16);
if (!MIN) {
  const check = (ok, msg) => { if (!ok) errors.push(msg); };
  for (const layout of [lanes, ['KeyA', 'KeyS', 'KeyD', 'KeyF'], ['KeyJ', 'KeyK', 'KeyL', 'Semicolon']])
    layout.forEach((code, lane) => check(g('KEYS')[code] === lane, `wrong lane: ${code}`));
  const pointer = (x, y) => listeners.pointerup.forEach(f => f({clientX:x, clientY:y}));
  pointer(640, 10); check(g('state') === 4, 'background click started game');
  const [gap, y] = g('stageLayout()');
  pointer(640 - 2 * gap, y); check(g('state') === 4, 'locked stage started');
  vm.runInContext('unlocked = 7', sandbox);
  key('ArrowRight'); check(g('sel') === 1, 'right navigation failed');
  key('ArrowLeft'); check(g('sel') === 0, 'left navigation failed');
  vm.runInContext('flashes.fill(1000)', sandbox);
  pointer(640 - 2 * gap, y); check(g('flashes.every(t => t === -9)'), 'previous song hit flashes leaked into new song'); check(g('state') === 1 && g('sel') === 1, 'stage click did not start selected song');
  vm.runInContext('state = 2; sel = 0; unlocked = 2; won = 1', sandbox);
  key('Enter'); check(g('state') === 1 && g('sel') === 1, 'Enter failed to advance');
  vm.runInContext('state = 2', sandbox); key('ArrowDown'); check(g('state') === 4, 'Down failed to open selection');
  vm.runInContext('state = 2; sel = 0', sandbox); pointer(640, 720 * 0.77);
  check(g('state') === 1 && g('sel') === 1, 'Next click failed');
  vm.runInContext('state = 2; sel = 0; unlocked = 1; won = 0', sandbox);
  key('Enter'); check(g('state') === 1 && g('sel') === 0, 'retry opened locked stage');
  vm.runInContext('toSelect(); sel = 0; unlocked = 1', sandbox);
}
key('Space'); key('Enter');
if (MIN) {
  for (let i = 0; i < 3300; i++) { frame(16.667); if (i % 7 === 0) { const k = lanes[i % 4]; key(k); key(k, 'keyup'); } }
  console.log(`minified: ${stats.frames} frames, ${(stats.draws / stats.frames).toFixed(1)} draws/frame, ${stats.writes} buffer writes`);
  console.log(errors.length ? `\n✗ ${[...new Set(errors)].join('\n  ')}` : '\n✓ minified build: no runtime errors');
  process.exit(errors.length ? 1 : 0);
}
if (!g('chart') || !g('chart').length) errors.push('no chart after start');
console.log(`chart: ${g('chart').length} notes, audio ${stats.audioLen?.toFixed(1)}s, starts at +${(stats.audioStart - (audioTime)).toFixed(2)}s`);

// play the whole song: hit ~70% of notes with a little timing noise, miss the rest
const chart = g('chart'), t0 = g('t0');
let hitIdx = 0;
while (g('state') === 1 && stats.frames < 6000) {
  frame(16.667);
  const t = audioTime - t0;
  while (hitIdx < chart.length && chart[hitIdx].t <= t) {
    const n = chart[hitIdx++];
    if (Math.random() < 0.7) { key(lanes[n.lane]); key(lanes[n.lane], 'keyup'); }
  }
}
console.log(`state ${g('state')}  frames ${stats.frames}  draws/frame ${(stats.draws / stats.frames).toFixed(1)}  tris/frame ${(stats.tris / stats.frames).toFixed(0)}`);
console.log(`judgments P/G/G/M = ${g('counts').join('/')}  score ${Math.round(g('score'))}  maxCombo ${g('maxCombo')}`);
if (g('counts')[0] + g('counts')[1] + g('counts')[2] + g('counts')[3] !== chart.length) errors.push('judgment count != note count');
if (g('state') !== 2) errors.push('song did not reach results');

// camera framing: project key points with the game's own matrices and report
// them as screen percentages (x from left, y from top). Targets from the
// layout sketch: horizon 44%, receptors 92%, the four lanes TRACKW wide at the bottom.
const [H, E, cc, ss] = g('camera')(1280 / 720), cam = [[0, H, E], [0, H - ss / cc * 10, E - 10]], FOV = g('FOV'), UNI = g('UNI'), lx = g('laneX'), LANES = g('LANES');
const vp = g('bmMul')(g('bmPersp')(FOV, 1280 / 720, 0.1, 100), g('bmLook')(cam[0], cam[1], [0, 1, 0]));
const proj = (p) => { const m = vp, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [((x / w) * 0.5 + 0.5) * 100, (0.5 - (y / w) * 0.5) * 100]; };
const pct = (p) => proj(p).map((v) => v.toFixed(0) + '%').join(',');
const halfW = LANES / 2, want = g('TRACKW') * 100;
console.log('screen: horizon', pct([0, 0, -1e5]), ' receptor row', pct([0, 0, 0]),
  ' track L/R at z=0', pct([-halfW, 0, 0]), pct([halfW, 0, 0]), ' at bottom (z=0.7)', pct([-halfW, 0, 0.7]), pct([halfW, 0, 0.7]));
console.log('        lane0', pct([lx(0), 0, 0]), ' lane3', pct([lx(3), 0, 0]), ' spawn (z=-40)', pct([lx(0), 0, -40]),
  ' unicorn feet', pct([UNI[0], 0, UNI[2]]), ' horn', pct([UNI[0], 2.4 * UNI[3], UNI[2]]));
const hy = proj([0, 0, -1e5])[1], ry = proj([0, 0, 0])[1], tw = proj([halfW, 0, 0.7])[0] - proj([-halfW, 0, 0.7])[0];
if (Math.abs(hy - 44) > 2) errors.push(`horizon at ${hy.toFixed(1)}%, want 44%`);
if (Math.abs(ry - 92) > 2) errors.push(`receptors at ${ry.toFixed(1)}%, want 92%`);
if (Math.abs(tw - want) > 4) errors.push(`lanes ${tw.toFixed(1)}% wide at bottom, want ${want}%`);

console.log(errors.length ? `\n✗ ${errors.length} problems:\n  ${[...new Set(errors)].join('\n  ')}` : '\n✓ no runtime errors, all buffer writes in bounds');
process.exit(errors.length ? 1 : 0);
