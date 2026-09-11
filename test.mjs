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
  createRenderPipeline: (d) => { if (!d.vertex.buffers.every((b) => /^float32(x[234])?$/.test(b.attributes[0].format))) errors.push('bad vertex format'); return {getBindGroupLayout: () => ({})}; },
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
const voices = [];
const effects = [];
const ctx2d = proxy('ctx2d');
const canvas = (id) => ({ id, clientWidth: 1280, clientHeight: 720, width: 0, height: 0,
  getBoundingClientRect: () => ({left: (sandbox.innerWidth - 1280) / 2, top: (sandbox.innerHeight - 720) / 2, width: 1280, height: 720}),
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
    createBuffer(ch, len, sr) { stats.audioLen = len / sr; return { copyToChannel: (d) => { if (d.some((v) => v !== v)) errors.push('NaN in audio'); if (ch === 1) effects.push(d); } }; }
    createOscillator() { const voice = {}; voices.push(voice); return {frequency: {setValueAtTime: noop, exponentialRampToValueAtTime: (f) => voice.pitch = f}, connect: noop, start: t => voice.start = t, stop: t => voice.stop = t}; }
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
const key = (code, type = 'keydown') => (listeners[type] || []).forEach((f) => f({ code, key: code, preventDefault: noop, repeat: false }));

// gate → attract → select → play
for (let i = 0; i < 5; i++) frame(16);
key('Digit2'); for (let i = 0; i < 20; i++) frame(16);
if (!MIN) {
  const check = (ok, msg) => { if (!ok) errors.push(msg); };
  for (const layout of [lanes, ['KeyA', 'KeyS', 'KeyD', 'KeyF'], ['KeyJ', 'KeyK', 'KeyL', 'Semicolon']])
    layout.forEach((code, lane) => check(g('KEYS')[code] === lane, `wrong lane: ${code}`));
  const pointer = (x, y) => listeners.pointerup.forEach(f => f({clientX:x, clientY:y}));
  pointer(640, 10); check(g('state') === 4, 'background click started game');
  sandbox.innerHeight = 900;
  pointer(640, 20); check(g('state') === 4, 'letterbox click started game');
  pointer(640 - 3 * g('stageLayout()[0]'), g('stageLayout()[1]') + 90);
  check(g('state') === 1 && g('sel') === 0, 'letterboxed stage click missed');
  key('Escape'); sandbox.innerHeight = 720;
  const [gap, y] = g('stageLayout()');
  pointer(640 - 2 * gap, y); check(g('state') === 4, 'locked stage started');
  vm.runInContext('unlocked = 7', sandbox);
  key('ArrowRight'); check(g('sel') === 1, 'right navigation failed');
  key('ArrowLeft'); check(g('sel') === 0, 'left navigation failed');
  vm.runInContext('flashes.fill(1000)', sandbox);
  pointer(640 - 2 * gap, y); check(g('flashes.every(t => t === -9)'), 'previous song hit flashes leaked into new song'); check(g('state') === 1 && g('sel') === 1, 'stage click did not start selected song');
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2; sel = 0; unlocked = 2; won = 1; passed = true', sandbox);
  key('Enter'); check(g('state') === 1 && g('sel') === 1, 'Enter failed to advance');
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2', sandbox); key('Escape'); check(g('state') === 4, 'Escape failed to open selection');
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2; sel = 0; passed = true', sandbox); pointer(640, 720 * 0.77);
  check(g('state') === 1 && g('sel') === 1, 'Next click failed');
  vm.runInContext('state = 2; sel = 0; passed = true; t0 = ac.currentTime - songLen - 1.6', sandbox);
  key('ArrowDown'); check(g('state') === 2, 'results guard failed');
  audioTime += 0.5; key('ArrowDown');
  check(g('state') === 1 && g('sel') === 1, 'Down should continue instead of selecting');
  vm.runInContext('state = 2; t0 = ac.currentTime - songLen - 3', sandbox);
  pointer(640, 720 * 0.86); check(g('state') === 4, 'Stage Select click failed');
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2; sel = 0; unlocked = 1; won = 0; passed = false', sandbox);
  key('Enter'); check(g('state') === 1 && g('sel') === 0, 'retry opened locked stage');
  for (const delta of [-1, 0]) {
    vm.runInContext('sel = 0; unlocked = 1; start()', sandbox);
    const required = g('target');
    check(required === Math.ceil(g('chart').reduce((s, n, i) => s + 60 * (1 + Math.min(i + 1, 50) / 50), 0)), 'incorrect target');
    vm.runInContext(`score = target + ${delta}`, sandbox);
    audioTime = g('t0 + songLen + 2'); frame(16);
    check(g('passed') === (delta === 0), 'clear threshold boundary failed');
    check(g('unlocked') === (delta === 0 ? 2 : 1), 'unlock threshold failed');
  }
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2; passed = false; sel = 0; unlocked = 7; won = 0', sandbox);
  key('Enter'); check(g('sel') === 0, 'failed replay advanced to next stage');
  vm.runInContext('t0 = ac.currentTime - songLen - 3; state = 2; passed = false; sel = 7; won = 0', sandbox);
  key('Enter'); check(g('sel') === 7, 'failed encore did not retry encore');
  for (const comboBefore of [8, 9, 19, 29]) {
    vm.runInContext('sel = 0; start()', sandbox);
    vm.runInContext(`combo = ${comboBefore}`, sandbox);
    audioTime = g('t0 + chart[0].t + 0.1');
    const before = voices.length, effectsBefore = effects.length;
    vm.runInContext('press(chart[0].lane)', sandbox);
    check(voices.length === before && effects.length === effectsBefore, 'unexpected combo celebration sound');
    if (comboBefore !== 8) check(g('milestoneT') === g('songTime()'), 'visual combo celebration missing');
  }
  vm.runInContext('sel = 0; start(); combo = 5; energy = 5', sandbox);
  audioTime = g('t0 - 0.5'); key('KeyA');
  check(g('combo') === 5, 'countdown press penalized');
  audioTime = g('t0 + chart[0].t');
  const wrongLane = (g('chart[0].lane') + 1) % 4;
  key(['KeyA', 'KeyS', 'KeyD', 'KeyF'][wrongLane]);
  check(g('combo') === 0 && g('energy') === 0 && g('judge') === 'MISS', 'empty press did not break combo');
  vm.runInContext('sel = 0; start(); energy = 29', sandbox);
  key('Space'); check(!g('powered()'), 'undercharged power activated');
  vm.runInContext('setJudge(3)', sandbox);
  check(g('energy') === 0, 'miss did not reset partial charge');
  vm.runInContext('energy = 30; setJudge(3); setJudge(3)', sandbox);
  check(g('energy') === 30, 'miss erased stored full charge');
  audioTime = g('t0 + chart[0].t');
  key('Space');
  const end = g('powerEnd');
  check(g('powered()') && g('energy') === 0, 'activation did not consume charge');
  const lane = g('chart[0].lane');
  const visibleEnd = g('songTime() - FAR / SCROLL');
  const collected = g('chart').filter(n => n.lane === lane && n.t <= visibleEnd).length;
  vm.runInContext(`press(${lane})`, sandbox);
  check(g('chart').filter(n => n.lane === lane && n.t <= visibleEnd).every(n => n.hit), 'beam missed visible lane notes');
  check(g('chart').filter(n => n.lane === lane && n.t > visibleEnd).every(n => !n.hit), 'beam collected offscreen notes');
  check(Math.abs(g('score') - (100 * collected + collected * (collected + 1))) < 0.001, 'beam score incorrect');
  check(g('combo') === collected && g('maxCombo') === collected && g('energy') === 0, 'beam did not build combo without charging power');
  const beamScore = g('score');
  vm.runInContext(`press(${lane})`, sandbox);
  check(g('score') === beamScore && g('combo') === collected, 'empty beam awarded score or combo');
  audioTime += 0.2;
  vm.runInContext(`chart.push({t: songTime() + 3, lane: ${lane}, hit: 0}); press(${lane})`, sandbox);
  check(g('chart[chart.length - 1].hit') === 1 && g('score') > beamScore, 'repeat beam did not collect new visible note');
  check(g(`beams[${lane}]`) === g('songTime()') && g('combo') === collected + 1, 'repeat beam failed to build combo');
  audioTime += 2.3;
  check(Math.abs(g('powerFill()') - 0.5) < 0.001, 'meter did not drain');
  key('Space'); check(g('powerEnd') === end, 'activation extended power');
  vm.runInContext('setJudge(3)', sandbox);
  check(g('powered()') && g('combo') === collected + 1 && g('energy') === 0, 'powered miss broke combo or charged meter');
  audioTime = end + g('t0') + 0.001;
  check(!g('powered()') && g('powerFill()') === 0, 'power failed to expire');
  check(g('combo') === collected + 1, 'expiration erased combo');
  vm.runInContext('setJudge(0)', sandbox);
  check(g('energy') === 1 && g('combo') === collected + 2, 'fresh charge did not preserve combo');
  vm.runInContext('for (let i = 0; i < 28; i++) setJudge(0)', sandbox);
  key('Space'); check(!g('powered()') && g('energy') === 29, 'recharged before 30 new hits');
  vm.runInContext('setJudge(0)', sandbox);
  key('Space'); check(g('powered()') && g('energy') === 0, '30 fresh hits did not recharge');
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
