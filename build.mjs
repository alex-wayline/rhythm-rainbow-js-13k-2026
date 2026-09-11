// Build: compile shaders, trim the runtime to the paths this game takes, minify
// the WGSL text, concatenate runtime + shaders + game, minify once, inline into
// the page, zopfli-zip, and refuse to finish over 13,312 bytes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateAsync } from '@gfx/zopfli';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const LIMIT = 13312;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'pipe', ...opts });
// Replace exactly one occurrence or fail loudly. The anchors below are text in
// files brometal regenerates, so a new brometal version must break the build
// here rather than ship a blank canvas.
const patch = (s, from, to, tag) => {
  if (s.split(from).length !== 2) throw new Error(`patch "${tag}": anchor not found exactly once`);
  return s.replace(from, to);
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
run('npx', ['brometal', 'prod', '--js13k', root]);

// ── runtime: this game never binds textures or storage buffers, never draws
// into an HDR target and never culls, but bmProgram reads opts.* dynamically so
// terser cannot prove those branches dead. Cut them here (about 260 zipped bytes).
let runtime = readFileSync(join(dist, 'brometal.js'), 'utf8');
runtime = patch(runtime, `    const entries = u ? [{ binding: 0, visibility: vis, buffer: {} }] : [];
    for (const [tex, samp] of texes) {
        entries.push({ binding: tex, visibility: vis, texture: {} });
        entries.push({ binding: samp, visibility: vis, sampler: {} });
    }
    for (const [binding, written] of stores) {
        entries.push({
            binding,
            visibility: written ? VIS_STORAGE_RW : VIS_STORAGE_RO,
            buffer: { type: written ? 'storage' : 'read-only-storage' },
        });
    }
    return bmDevice.createBindGroupLayout({ entries });`,
  `    return bmDevice.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, buffer: {} }] });`, 'layout');
runtime = patch(runtime, `        ub: opts.u ? bmDevice.createBuffer({ size: opts.u, usage: BUF_UNIFORM }) : null,
        t: opts.t || [],
        st: opts.s || [],
        b: [],
        ix: null,
        n: 0,
        bg: null,
        tx: [],
        sb: [],`,
  `        ub: bmDevice.createBuffer({ size: opts.u, usage: BUF_UNIFORM }),
        b: [],
        ix: null,
        n: 0,
        bg: null,`, 'shell');
runtime = patch(runtime, `        const entries = prog.ub
            ? [{ binding: 0, resource: { buffer: prog.ub } }]
            : [];
        prog.t.forEach(([tex, samp], i) => {
            entries.push({ binding: tex, resource: prog.tx[i].v });
            entries.push({ binding: samp, resource: prog.tx[i].s });
        });
        prog.st.forEach(([binding], i) => {
            entries.push({ binding, resource: { buffer: prog.sb[i] } });
        });
        prog.bg = bmDevice.createBindGroup({ layout: prog.l, entries });`,
  `        prog.bg = bmDevice.createBindGroup({ layout: prog.l, entries: [{ binding: 0, resource: { buffer: prog.ub } }] });`, 'bind');
runtime = patch(runtime, `format: opts.fmt ? TEX_HDR : bmFormat,`, `format: bmFormat,`, 'fmt');
runtime = patch(runtime, `        primitive: { topology: 'triangle-list', cullMode: opts.cull ? 'back' : 'none' },\n`, ``, 'cull');

// All three render pipelines use shader-inferred uniform layouts. No textures
// or storage buffers are bound, so the explicit generic layout path is unused.
runtime = patch(runtime, "    const bindLayout = bmLayout(VIS_RENDER, opts.u || 0, opts.t || [], opts.s || []);", "", 'render-layout');
const renderStart = runtime.indexOf('function bmProgram('), renderEnd = runtime.indexOf('function bmCompute(');
let render = runtime.slice(renderStart, renderEnd);
render = patch(render, "layout: bmDevice.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),", "layout: 'auto',", 'automatic-render-layout');
render = patch(render, "return bmShell(pipeline, bindLayout, opts);", "return bmShell(pipeline, pipeline.getBindGroupLayout(0), opts);", 'inferred-render-bindings');
runtime = runtime.slice(0, renderStart) + render + runtime.slice(renderEnd);

// ── WGSL: brometal renames shader locals but deliberately keeps whitespace,
// the generated bm_* names, member names and 1.0-style literals, and terser
// cannot see inside the strings. Compact all of that (about 430 zipped bytes).
// Renames stay consistent within one shader. The runtime relies only on the
// entry points vs_main/fs_main, @group/@binding numbers and @location indices,
// none of which are touched.
const minWgsl = (s) => {
  let t = s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .replace(/\s*([{}();,:=+\-*\/<>@.])\s*/g, '$1').replace(/\n/g, ' ');
  // shortest decimal literal that is the same f32; always keep a '.' so it stays a float
  t = t.replace(/\b\d+\.\d+\b/g, (m) => {
    const f = Math.fround(+m);
    for (let p = 1; p < 10; p++) {
      const c = String(+(+m).toPrecision(p));
      if (Math.fround(+c) === f) return c.includes('e') ? m : (c.includes('.') ? c : c + '.').replace(/^0\.(\d)/, '.$1');
    }
    return m;
  });
  t = t.replace(/([(,=])0\.-/g, '$1-');   // "0.0 - x" (the DSL's unary minus) -> "-x"
  t = t.replace(/vec([234])f\(([^(),]+)((?:,\2)+)\)/g, (m, n, v, rest) => (rest.split(',').length - 1 == n - 1 ? `vec${n}f(${v})` : m));
  const map = { bm_in: 'I', bm_out: 'O', bm_u: 'U', bm_position: 'P', BmUniforms: 'S', BmVSIn: 'V', BmVSOut: 'W' };
  [...new Set(t.match(/\b[uaiv][A-Z]\w*\b/g) || [])].forEach((m, i) => { map[m] = 'ABCDEFGHJKLMNQRTXYZ'[i]; });
  return t.replace(/\b(bm_in|bm_out|bm_u|bm_position|BmUniforms|BmVSIn|BmVSOut|[uaiv][A-Z]\w*)\b/g, (m) => map[m] ?? m);
};
let count = 0;
const shaders = readFileSync(join(dist, 'shaders.js'), 'utf8').replace(/const (\w+) = \["((?:[^"\\]|\\.)*)"/g, (m, name, body) => {
  count++;
  const w = minWgsl(JSON.parse(`"${body}"`));
  if (!/fn vs_main/.test(w) || !/fn fs_main/.test(w)) throw new Error(`shader ${name} lost an entry point`);
  return `const ${name} = [${JSON.stringify(w)}`;
});
if (count !== 3) throw new Error(`expected 3 shaders in dist/shaders.js, found ${count}`);

// Order matters only for readability; everything is hoisted globals.
const parts = [runtime, shaders, ...['src/song.js', 'src/unicorn.js', 'src/game.js'].map((f) => readFileSync(join(root, f), 'utf8'))];
writeFileSync(join(dist, 'raw.js'), parts.join('\n'));

// Property mangling is opt-in by name: only keys that exist solely in this
// program's own object literals. Never add a DOM, WebGPU or AudioContext key
// (blend, format, size, usage, buffer, code, key, currentTime, ...).
run('npx', ['terser', join(dist, 'raw.js'), '--compress', 'passes=3,unsafe=true,unsafe_arrows=true,unsafe_math=true,unsafe_comps=true,unsafe_methods=true,unsafe_proto=true,unsafe_undefined=true,pure_getters=true,booleans_as_integers=true,hoist_props=true,hoist_funs=true',
  '--mangle', '--toplevel', '--mangle-props', 'regex=/^(rowLen|endPattern|songData|order|pats|big|lane|hit|pos|nrm|col|idx|zwrite|ub|ix|bg)$/',
  '--ecma', '2020', '--format', 'comments=false,ascii_only=false', '-o', join(dist, 'g.js')]);

const page = readFileSync(join(root, 'src/index.html'), 'utf8').replace(
  /<script src=g\.js><\/script>/,
  () => `<script>${readFileSync(join(dist, 'g.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`,
);
writeFileSync(join(dist, 'index.html'), page);

// ── zip: zopfli's deflate beats Info-ZIP's by a few hundred bytes, and writing
// the container by hand skips the timestamp extra fields zip(1) adds.
const html = Buffer.from(page);
// Use submission-strength compression by default; ZOPFLI overrides the iteration count.
const comp = Buffer.from(await deflateAsync(html, { numiterations: +process.env.ZOPFLI || 5000, blocksplitting: true, blocksplittingmax: 0 }));
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
let crc = -1;
for (const x of html) crc = crcT[(crc ^ x) & 255] ^ (crc >>> 8);
crc = (crc ^ -1) >>> 0;
const name = Buffer.from('index.html');
const hdr = (sig, len) => { const b = Buffer.alloc(len); b.writeUInt32LE(sig, 0); return b; };
const lh = hdr(0x04034b50, 30), cd = hdr(0x02014b50, 46), eo = hdr(0x06054b50, 22);
for (const [b, o] of [[lh, 4], [cd, 6]]) { b.writeUInt16LE(20, o); b.writeUInt16LE(8, o + 4); b.writeUInt16LE(0x5c21, o + 8); b.writeUInt32LE(crc, o + 10); b.writeUInt32LE(comp.length, o + 14); b.writeUInt32LE(html.length, o + 18); b.writeUInt16LE(name.length, o + 22); }
cd.writeUInt16LE(20, 4);
eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(46 + name.length, 12); eo.writeUInt32LE(30 + name.length + comp.length, 16);
writeFileSync(join(dist, 'game.zip'), Buffer.concat([lh, name, comp, cd, name, eo]));
run('unzip', ['-tq', join(dist, 'game.zip')]);   // a corrupt archive fails the build

const js = statSync(join(dist, 'g.js')).size, zip = statSync(join(dist, 'game.zip')).size;
console.log(`  g.js (minified)  ${js} bytes`);
console.log(`  game.zip         ${zip} bytes   (${((zip / LIMIT) * 100).toFixed(1)}% of ${LIMIT})`);
if (zip > LIMIT) { console.error(`\n✗ over budget by ${zip - LIMIT} bytes`); process.exit(1); }
console.log(`\n✓ ${LIMIT - zip} bytes remaining`);
