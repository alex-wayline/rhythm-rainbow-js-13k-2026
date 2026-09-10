// Render a song to a 16-bit stereo WAV with the game's own synth, for auditioning.
//
//   node tools/render.mjs out.wav                 # SONGS[0] from src/song.js
//   node tools/render.mjs out.wav 2               # SONGS[2]
//   node tools/render.mjs out.wav candidate.mjs   # a song module (see below)
//
// A candidate module `export default { ins, song }`: `ins` is an optional array
// of extra 29-param instruments appended to INS (refer to them from the song's
// tracks as index INS.length, INS.length + 1, ...), and `song` is a compact
// { r, t, s } song exactly as in src/song.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const src = readFileSync(new URL('../src/song.js', import.meta.url), 'utf8');
const lib = new Function(src + '; return { INS, SONGS, unpack, synth, makeChart };')();
const [out, arg] = process.argv.slice(2);
if (!out) { console.error('usage: node tools/render.mjs out.wav [songIndex | candidate.mjs]'); process.exit(1); }
let song = lib.SONGS[+arg || 0];
if (arg && !/^\d+$/.test(arg)) {
  const m = (await import(pathToFileURL(resolve(arg)).href)).default;
  if (m.ins) lib.INS.push(...m.ins);
  song = m.song;
}
const [L, R, bpm, len] = lib.synth(lib.unpack(song), 44100);
let peak = 0, clip = 0;
for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 1) clip++; }
const chart = lib.makeChart(song, bpm);
const n = L.length, buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(44100, 24); buf.writeUInt32LE(44100 * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
const s16 = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
for (let i = 0; i < n; i++) { buf.writeInt16LE(s16(L[i]), 44 + i * 4); buf.writeInt16LE(s16(R[i]), 46 + i * 4); }
writeFileSync(out, buf);
console.log(`${out}: ${bpm} BPM, ${len.toFixed(1)} s loop + 2 s tail, peak ${peak.toFixed(2)}${clip ? ` (${clip} clipped samples!)` : ''}, ${chart.length} steps, ${song.t.length} tracks`);
