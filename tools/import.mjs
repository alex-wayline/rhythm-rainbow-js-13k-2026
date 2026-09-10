// Print a candidate song module as src/song.js source: its new instruments as
// INS entries and its song with instrument indexes remapped onto INS.
//   node tools/import.mjs candidate.mjs [label]
// Paste the output into src/song.js (instruments at the end of INS, the song
// into SONGS or as INTRO). Nothing is written.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [cand, label = 'song'] = process.argv.slice(2);
const src = readFileSync(new URL('../src/song.js', import.meta.url), 'utf8');
const { INS } = new Function(src + '; return { INS };')();
const m = (await import(pathToFileURL(resolve(cand)).href)).default;
const base = INS.length, extra = m.ins || [];
// A candidate with its own `ins` numbers them from 4 (after the original four);
// one without `ins` already refers to the shared INS and is left alone.
const remap = (i) => (extra.length && i >= 4 ? base + i - 4 : i);
const q = (s) => JSON.stringify(s);
console.log(`// ── instruments for ${label}: append to INS (indexes ${base}..${base + extra.length - 1})`);
extra.forEach((a, i) => console.log(`  [${a.join(',')}],   // ${base + i}`));
console.log(`\n// ── ${label}: ${Math.round(60 * 44100 / 4 / m.song.r)} BPM, ${m.song.t[0][1].length} slots`);
console.log(`  { r: ${m.song.r}, t: [`);
for (const [i, o, c] of m.song.t) console.log(`    [${remap(i)}, ${q(o)}, [${c.map(q).join(', ')}]],`);
console.log(`  ], s: [${q(m.song.s[0])}, [${m.song.s[1].map(q).join(', ')}]] },`);
