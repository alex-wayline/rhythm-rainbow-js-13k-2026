// ── Songs, in a compact Sonant-X layout ──────────────────────────────────────
// INS holds the instruments, 29 synth params each, shared by every song (the
// title loop brought the whole set; the level tracks reuse it).
// Param order (matches the sonant-x field order):
//  0 osc1_oct 1 osc1_det 2 osc1_detune 3 osc1_xenv 4 osc1_vol 5 osc1_wave
//  6 osc2_oct 7 osc2_det 8 osc2_detune 9 osc2_xenv 10 osc2_vol 11 osc2_wave
// 12 noise 13 env_attack 14 env_sustain 15 env_release 16 env_master
// 17 fx_filter 18 fx_freq 19 fx_res 20 fx_delay_time 21 fx_delay_amt
// 22 fx_pan_freq 23 fx_pan_amt 24 lfo_osc1_freq 25 lfo_fx_freq 26 lfo_freq 27 lfo_amt 28 lfo_wave
//
// A song is { r, t, s }:
//   r  rowLen in samples at 44.1 kHz (4410 = 150 BPM; one row is one 16th)
//   t  tracks, each [instrument index, order, patterns]. The order has one char
//      per 32-row slot ("0" = silence, "1".. = pattern number). A pattern is a
//      32-char string: " " rests, any other char is note = charCode + 80, so
//      "C" is 147 = C5. Strings beat number arrays 3:1 after minification.
//   s  the step chart, [order, patterns] in the same shape, where "1".."4" are
//      lanes left, down, up, right, "5" a left+right chord, "6" down+up. Authored like a fifth track, so the ramp
//      from sparse to dense is written, not derived.
const INS = [
  [8,0,0,0,225,1,9,0,12,0,110,1,0,10,1810,2961,41,0,11025,0,6,60,5,50,0,0,0,0,0],   // 0 lead: square pluck, delay
  [7,0,0,1,255,0,7,0,0,1,255,0,0,30,250,6500,90,2,500,254,0,0,0,0,0,0,0,0,0],   // 1 sub kick
  [8,0,0,0,0,0,8,0,0,0,0,0,110,20,180,2200,80,1,8000,90,0,0,0,0,0,0,0,0,0],   // 2 hat
  [8,0,0,1,160,0,8,0,0,0,0,0,170,8,120,1800,77,3,3200,110,0,0,0,0,0,0,0,0,0],   // 3 rimshot click
  [6,0,0,0,200,2,6,0,4,0,120,2,0,100,5500,5000,205,2,900,110,0,0,0,0,0,0,0,0,0],   // 4 tresillo saw bass, two octaves down
  [8,0,0,0,110,2,8,0,9,0,110,2,0,600,7000,14000,132,2,2800,160,6,100,4,120,0,0,0,0,0],   // 5 two-voice saw stab, lowpass, delay
  [8,0,0,0,170,3,9,0,5,0,60,0,0,300,8000,16000,36,2,5000,220,6,110,5,140,0,0,0,0,0],   // 6 bell: triangle, delay
  [8,0,0,0,0,0,8,0,0,0,0,0,255,300,300,5000,110,3,1600,130,0,0,0,0,0,0,0,0,0],   // 7 clap: noise, bandpass
];

const SONGS = [
  // 0 RED — level 1, 90 BPM, G major, quarter-note chart
  { r: 7350, t: [
    [1, "11221223", ["?       ?       ?       ?       ", "?   ?   ?   ?   ?   ?   ?   ?   ", "?               ?               "]],
    [4, "02120123", [">       >     ; ;       ;     7 ", "7       7     9 9       9     > ", ">               >               "]],
    [5, "12121123", ["BEJ     BEJ     BGJ     BGJ     ", "CGJ     CGJ     @EI     @EI     ", "BEJ             BEJ             "]],
    [6, "12120123", ["Q     N Q   S   V       S   Q   ", "S     Q S   L   U   Q   L   N   ", "N   Q   V               V       "]],
  ], s: ["11231234", ["2       3       2               ", "1       1   2   4       4   3   ", "2       2   1   3       3   4   ", "2               2               "]] },
  // 1 ORANGE — level 2, 98 BPM, A major
  { r: 6750, t: [
    [1, "12221223", ["?       ?       ?       ?       ", "?   ?   ?   ?   ?   ?   ?   ?   ", "?   ?   ?   ?   ?   ?   ?       "]],
    [4, "01110112", ["@  L  @ =  I  = 9  E  9 ;  G  ; ", "@  L  @ @  L  @ @   @   @       "]],
    [5, "11111112", ["  DG  DG  @D  @D  @E  @E  ?B  ?B", "  DG  DG  DG  DGDGL DGL DGL     "]],
    [6, "11221223", ["S P S           U S Q           ", "S P S   U   P   U S Q   N P Q   ", "S P S           P   S   X       "]],
  ], s: ["51225234", ["1   2   4       1   3   4       ", "4       1       4       5       ", "1   2   3   4   4   3   2   1   ", "1   2   3   4   4   3   5       ", "1       4       1       4       "]] },
  // 2 YELLOW — level 3, 106 BPM, D Dorian deep house
  { r: 6241, t: [
    [1, "111331332", ["?   ?   ?   ?   ?   ?   ?   ?   ", "?       ?       ?       ?       ", "?   ?   ?   ?   ?   ?   ?   ? ? "]],
    [2, "112221220", ["  C   C   C   C   C   C   C   C ", " C C C C C C C C C C C C C C C C"]],
    [4, "111111112", ["9  E  9   @ 9 C >  J  >   B > @ ", "9               9               "]],
    [5, "011221223", ["   L       H  O    N       J  Q ", "L O L   H J L   N Q N   J L N   ", "L       H       G       E       "]],
  ], s: ["111231231", ["1       3       2       4       ", "1   2   3   4 4 4   3   2   1 1 ", "4   3   2   1 1 1   3   2   4 4 "]] },
  // 3 GREEN — level 4, 114 BPM, G minor funk, first eighth pairs
  { r: 5803, t: [
    [1, "1111111112", ["?   ?   ?   ?   ?   ?   ?   ?   ", "?       ?       ?       ?       "]],
    [2, "1122212220", ["  C   C   C   C   C   C   C   C ", " C C C C C C C C C C C C C C C C"]],
    [4, "1111111112", [">     >J  >   A 7     7C  7   < ", ">               >               "]],
    [0, "0112201223", ["J   M O Q   M O R   Q O J   M H ", "Q Q O M J   M O R R Q O J   M O ", "Q       M       L       J       "]],
  ], s: ["1223312334", ["1   2   3   4   4   3   2   1   ", "1   2   4   3   4   3   1   2   ", "1   3   4       4   2   1   2   ", "1       2       3       4       "]] },
  // 4 BLUE — level 5, 122 BPM, E minor, off-beat pushes
  { r: 5422, t: [
    [1, "1111111112", ["?   ?   ?   ?   ?   ?   ?   ?   ", "?   ?   ?                       "]],
    [2, "1122212220", ["  C   C   C   C   C   C   C   C ", "C C C C C C CCCCC C C C C C CCCC"]],
    [4, "1112211223", ["; ;   ;   ;   9 7 7   7   7   9 ", "; ; G ; ; ; G 9 7 7 C 7 7 7 C 9 ", ";       ;                       "]],
    [5, "0112201223", ["  G       J       J       N     ", "  G   G   J   N   J   J   G   E ", "G J N   S                       "]],
  ], s: ["1112313234", ["1 2     3       4 3     2 1     ", "5 2 3   4   2 1 1 3 2   4   3   ", "1     3 4     2 4 3   2 1       ", "1   2   5                       "]] },
  // 5 INDIGO — level 6, 130 BPM, D Dorian, 16th runs of three
  { r: 5088, t: [
    [1, "11111211113", ["9   9   9   9   9   9   9   9   ", "9                           9 99", "9       9                       "]],
    [2, "01211212330", [" C C C C C C C C C C C C C C C C", " C C C C C C C C C C C C C CCCCC", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"]],
    [4, "11111111112", ["  9   9   E   9   >   >   J   > ", "9       9                       "]],
    [0, "01122122223", ["E   E E   H   L J   J J   N   L ", "E H L J H G E CEJ L N O N L JHG ", "E H L   E                       "]],
  ], s: ["11122422223", ["1   2     4   3 2   1     3     ", "5   2   3   4   3 4 2   1   2   ", "1 2 3   4                       ", "1   2 3   4   3 2   1 2   3 4 3 "]] },
  // 6 VIOLET — level 7, 138 BPM, F# minor / A major trance, 16th bursts
  { r: 4793, t: [
    [1, "111111211113", ["@   @   @   @   @   @   @   @   ", "@                         @ @ @ ", "@       @                       "]],
    [2, "011322132220", [" C C C C C C C C C C C C C C C C", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", " C C C C C C C C C C C C C CCCCC"]],
    [4, "121212121213", ["= I = I = I = I 9 E 9 E 9 E 9 E ", "@ L @ L @ L @ L ; G ; G ; G ; G ", "@       @                       "]],
    [0, "001212121213", ["I L P L I LNP IGE ILN L E I  GIK", "L P S P L LNP KIG ILN K G K  NLK", "L P S P L                       "]],
  ], s: ["112233123334", ["1   2 3 4       1   2 3 4       ", "1 2 3 4     2   1 2 3 4     2   ", "5   2 3 4   3   2 3 4       2   ", "1 2 3 2 5                       "]] },
];
// The title-screen loop: deep minimal house in F minor, 120 BPM, drops at bar 3.
// The secret bonus track (DANCE FOREVER), unlocked by beating all seven levels:
// euphoric C major anthem, 128 BPM, the hardest-but-fair chart in the game.
const BONUS =   { r: 5168, t: [
    [1, "111110011110", ["?   ?   ?   ?   ?   ?   ?   ?   "]],
    [4, "021210121210", ["7 7 7 7 7 7 7 7 > > > > > > > > ", "@ @ @ @ @ @ @ @ < < < < < < < < "]],
    [5, "001212121200", ["CGJO    CGJO    BEJN    BEJN    ", "@CGL    @CGL    <@CH    <@CH    "]],
    [6, "121212121212", ["J   O   S   O   J   N   Q   N   ", "L   O   S   O   H   L   O   L   "]],
    [0, "000000011100", ["C G J O C G J O C G J O C G J O "]],
  ], s: ["123332344421", ["1       2       3       4       ", "1   3   2   4   1   3   2   4   ", "1234    3   1   4321    2   4   ", "5   2   1234  2 6   4   1234  2 "]] };
const INTRO = BONUS;

// Expand a compact song into the shape synth() reads.
const notes = (s) => [...s].map((c) => (c === " " ? 0 : c.charCodeAt(0) + 80));
const unpack = (g) => ({
  rowLen: g.r, endPattern: g.t[0][1].length - 1,
  songData: g.t.map(([i, p, c]) => ({ i: INS[i], p: [...p].map(Number), c: c.map(notes) })),
});
// ── Sonant-X renderer ────────────────────────────────────────────────────────
// Renders the whole song offline into two Float32Arrays. Same algorithm as the
// sonant-x player (two oscillators, ADSR, state-variable filter, feedback delay,
// pan LFO), written straight into a buffer instead of through ScriptProcessor.
function synth(song, sr) {
  const bpm = Math.round(60 * 44100 / 4 / song.rowLen);
  const rowLen = Math.round(60 * sr / 4 / bpm);
  const nRows = 32 * (song.endPattern + 1);
  const len = nRows * rowLen + sr * 2;
  const L = new Float32Array(len), R = new Float32Array(len);
  const osc = [
    (v) => Math.sin(v * 6.283185),
    (v) => (Math.sin(v * 6.283185) < 0 ? -1 : 1),
    (v) => (v % 1) - 0.5,
    (v) => { const t = (v % 1) * 4; return t < 2 ? t - 1 : 3 - t; },
  ];
  const nf = (n) => 0.00390625 * Math.pow(1.059463094, n - 128) * 44100 / sr;
  for (const ins of song.songData) {
    const q = ins.i, dl = new Float32Array(len), dr = new Float32Array(len);
    const ea = q[13] / 44100 * sr, es = q[14] / 44100 * sr, er = q[15] / 44100 * sr, dur = ea + es + er;
    const panF = Math.pow(2, q[22] - 8) / rowLen, lfoF = Math.pow(2, q[26] - 8) / rowLen, res = q[19] / 255;
    const master = 39 * q[16] / 8192;
    for (let row = 0; row < nRows; row++) {
      const pat = ins.p[row >> 5];
      const n = pat && ins.c[pat - 1][row & 31];
      if (!n) continue;
      const o1 = nf(n + (q[0] - 8) * 12 + q[1]) * (1 + 0.0008 * q[2]);
      const o2 = nf(n + (q[6] - 8) * 12 + q[7]) * (1 + 0.0008 * q[8]);
      let c1 = 0, c2 = 0, low = 0, band = 0;
      const start = row * rowLen;
      for (let j = 0; j < dur && start + j < len; j++) {
        const lfo = osc[q[28]](j * lfoF) * q[27] / 512 + 0.5;
        const e = j < ea ? j / ea : j >= ea + es ? 1 - (j - ea - es) / er : 1;
        let t = o1; if (q[24]) t += lfo; if (q[3]) t *= e * e; c1 += t;
        let s = osc[q[5]](c1) * q[4];
        t = o2; if (q[9]) t *= e * e; c2 += t;
        s += osc[q[11]](c2) * q[10];
        if (q[12]) s += (2 * Math.random() - 1) * q[12] * e;
        s *= e / 255;
        let f = q[18]; if (q[25]) f *= lfo;
        f = 1.5 * Math.sin(f * Math.PI / sr);
        low += f * band;
        const high = res * (s - band) - low;
        band += f * high;
        s = [s, high, low, band, low + high][q[17]] * master;
        const pan = Math.sin(j * panF * 6.283185) * q[23] / 512 + 0.5;
        dl[start + j] += s * (1 - pan);
        dr[start + j] += s * pan;
      }
    }
    // feedback delay: delay time is fx_delay_time half-rows
    const d = (q[20] * rowLen) >> 1, amt = q[21] / 255;
    for (let i = 0; i < len; i++) {
      if (d && i >= d) { dl[i] += dl[i - d] * amt; dr[i] += dr[i - d] * amt; }
      L[i] += dl[i]; R[i] += dr[i];
    }
  }
  return [L, R, bpm, nRows * 60 / (4 * bpm)];
}

// ── Chart from the step track ────────────────────────────────────────────────
// [{t seconds, lane 0..3, hit}], in time order.
function makeChart(g, bpm) {
  const rowSec = 60 / (4 * bpm), [order, pats] = g.s, out = [];
  [...order].forEach((p, k) => {
    if (+p) [...pats[p - 1]].forEach((c, r) => { if (c !== " ") for (const l of c < 5 ? [c - 1] : c == 5 ? [0, 3] : [1, 2]) out.push({ t: (k * 32 + r) * rowSec, lane: l, hit: 0 }); });
  });
  return out;
}
