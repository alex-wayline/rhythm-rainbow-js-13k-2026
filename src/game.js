// ── Rhythm Rainbow — game ────────────────────────────────────────────────────
// Everything is a global: runtime (bm*), shaders (Sky, Lit, Charm), song.js,
// unicorn.js and this file are concatenated and minified as one program.
//
// Flow. 0 gate: night sky with the rainbow, the title, "press any key"
// (browsers refuse to play audio before a gesture). 4 select: the intro loop
// plays over a row of seven stages, unlocked one at a
// time by clearing the previous one. 1 playing. 2 results, then back to 4.

// Layout, from the sketch: a centred camera looking straight down a flat
// rainbow highway that vanishes at a horizon 44% from the top. Receptors sit
// at 92%, and the four lanes span 60% of the width at the bottom edge (the
// shoulders, one lane wide each, are drawn by the sky shader outside that). The
// camera is solved from those three numbers every frame, so the composition
// holds on any aspect ratio. Lane width is 1 world unit; notes travel along -z
// toward the judgment line at z = 0.
const LANES = 4, LW = 1, SCROLL = 10, FAR = -40;
const FOV = 0.87, HOR = 0.12, RECY = -0.84, TRACKW = 0.6;   // HOR is repeated in sky.shader.ts
const laneX = (i) => (i - (LANES - 1) / 2) * LW;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hsv = (h, s, v) => [5, 3, 1].map((n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); });
const css = (c) => `rgb(${c.map((v) => v * 255 | 0)})`;
const HUES = [0.07, 0.16, 0.36, 0.6];                 // bandHue 1..4 in sky.shader.ts
const LANE_COL = HUES.map((h) => hsv(h, 0.8, 1));
const UNI = [-4.3, 0, -2.4, 0.85];                    // x, y, z, scale: on the ground, bottom-left, facing the track
const TRACKS = 7, TRACK_H = [0, 0.07, 0.16, 0.36, 0.6, 0.72, 0.82];   // one track per rainbow colour
const NAMES = 'RED RUSHDOWN,AMBER BEAT,GOLDEN GROOVE,EMERALD ECHO,BLUE BOOGIE,INDIGO DREAM,VIOLET VIBES'.split(',');
// five hair colours from the colours level k has unlocked; repeats get a shade darker
const hair = (k) => TRACK_H.map((h, i) => hsv(TRACK_H[i % (k + 1)], 0.7, 1));

// Camera for an aspect ratio: [eye height, eye z, cos pitch, sin pitch]. The
// eye sits on the x = 0 line looking down -z, so the view matrix is written out
// in the frame loop instead of going through a general look-at. tan(pitch) puts
// the horizon at HOR; the lanes' half-width at the bottom edge fixes the eye
// height; the receptor row then fixes the distance.
function camera(a) {
  const asp = clamp(a, 1.25, 2.5), T = Math.tan(FOV / 2), th = Math.atan(HOR * T);
  const H = LANES / 2 * LW / (Math.cos(FOV / 2) / Math.sin(FOV / 2 + th) * T * asp * TRACKW);
  const E = H / Math.tan(th + Math.atan(-RECY * T));
  return [H, E, Math.cos(th), Math.sin(th)];
}

const cv = document.getElementById('c');
const hud = document.getElementById('h');
const hx = hud.getContext('2d');

// ── game state
let state = 0;
let ac, t0, songLen, bpm = 120, songSrc;
let sel = 0, unlocked = +localStorage.rr_u || 1, won = 0;   // rr_ prefix: js13k games share an origin
let introSrc, introT0 = 0;
let chart = [], nextNote = 0;
let target, passed;
let score = 0, combo = 0, maxCombo = 0, milestone = 0, milestoneT = -9;
let judge = '', judgeT = -9, judgeCol = '#fff', judgeK = 0;
const counts = [0, 0, 0, 0];         // perfect great good miss
const held = [0, 0, 0, 0], flashes = [-9, -9, -9, -9];
let leanX = 0, leanY = 0, hop = 0;   // unicorn pose targets
const bursts = [];
let VP = bmIdentity();   // last frame's view-projection

const KEYS = { ArrowLeft: 0, KeyA: 0, KeyJ: 0, ArrowDown: 1, KeyS: 1, KeyK: 1, ArrowUp: 2, KeyD: 2, KeyL: 2, ArrowRight: 3, KeyF: 3, Semicolon: 3 };
const JUDGE = [[0.045, 'PERFECT', '#ff7ad9', 100], [0.09, 'GREAT', '#ffd45c', 70], [0.14, 'GOOD', '#7fe3a0', 40]];

const songTime = () => (ac ? ac.currentTime - t0 : 0);

function setJudge(k) {
  counts[k]++;
  if (k < 3) {
    combo++;
    if (combo % 10 === 0) { milestone = combo / 10; milestoneT = songTime(); }
    maxCombo = Math.max(maxCombo, combo);
    score += JUDGE[k][3] * (1 + Math.min(combo, 50) / 50);
    judge = JUDGE[k][1]; judgeCol = JUDGE[k][2];
  } else { combo = 0; judge = 'MISS'; judgeCol = '#8a8a9a'; }
  judgeK = k; judgeT = songTime();
}

function press(lane) {
  const t = songTime();
  // pose: the lane vector drives the dance
  leanX = lane === 0 ? -1 : lane === 3 ? 1 : leanX * 0.3;
  leanY = lane === 2 ? 1 : lane === 1 ? -1 : leanY * 0.3;
  if (lane === 2) hop = 1;
  // earliest unhit note in this lane inside the widest window
  for (let i = nextNote; i < chart.length && chart[i].t < t + 0.16; i++) {
    const n = chart[i];
    if (n.hit || n.lane !== lane) continue;
    const dt = Math.abs(n.t - t);
    if (dt > 0.16) continue;
    n.hit = 1;
    const k = dt < JUDGE[0][0] ? 0 : dt < JUDGE[1][0] ? 1 : 2;
    setJudge(k);
    flashes[lane] = t;
    if (k < 2) for (const tone of [1, 0.4]) {
      const o = ac.createOscillator(), gain = ac.createGain(), at = ac.currentTime;
      o.type = 'triangle';
      o.frequency.setValueAtTime(440 * tone, at);
      o.frequency.exponentialRampToValueAtTime(65 * tone, at + 0.025);
      gain.gain.setValueAtTime(k ? 0.18 : 0.28, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
      o.connect(gain); gain.connect(ac.destination); o.start(at); o.stop(at + 0.12);
    }
    if (k < 2) bursts.push({ t, lane, big: k === 0 });
    if (combo % 10 === 0) for (let i = 0; i < 4; i++) i !== lane && bursts.push({ t, lane: i, big: 1 });   // every 10th: all lanes erupt
    return;
  }
}

// ── audio: each song is synthesized once and kept as an AudioBuffer
const bufs = new Map();
function play(g, loop, at) {
  if (!bufs.has(g)) {
    const [L, R, b, len] = synth(unpack(g), ac.sampleRate), buf = ac.createBuffer(2, L.length, ac.sampleRate);
    buf.copyToChannel(L, 0); buf.copyToChannel(R, 1); bufs.set(g, [buf, b, len]);
  }
  const [buf, b, len] = bufs.get(g), src = ac.createBufferSource();
  src.buffer = buf; src.loop = !!loop; src.loopEnd = len; src.connect(ac.destination); src.start(at);
  return [src, b, len];
}
// the first gesture: audio is allowed from here, so the intro loop starts now
function intro() {
  ac = ac || new AudioContext();
  [introSrc, bpm] = play(INTRO, 1, introT0 = ac.currentTime);
  bursts.length = 0; held.fill(0);
  state = 4;
}
function toSelect() { if (songSrc) songSrc.stop(); intro(); }
function start() {
  introSrc.stop();
  if (songSrc) songSrc.stop();
  const g = sel === TRACKS ? BONUS : (SONGS[sel] || SONGS[0]);   // sel 7 = the secret bonus track
  [songSrc, bpm, songLen] = play(g, 0, t0 = ac.currentTime + 2.2);
  chart = makeChart(g, bpm);
  target = Math.ceil(chart.reduce((sum, n, i) => sum + 60 * (1 + Math.min(i + 1, 50) / 50), 0));
  passed = false;
  nextNote = 0; score = 0; combo = 0; maxCombo = 0; won = 0; judge = ''; milestoneT = -9; counts.fill(0); bursts.length = 0; flashes.fill(-9);
  state = 1;
}
// anything that isn't a lane press: advance whichever screen is showing
function go(k) {
  if (state === 0) intro();
  else if (state === 4) {
    if (typeof k === 'number') sel = clamp(sel + (k < 2 ? -1 : 1), 0, unlocked - 1);
    else if (k === 'Enter' || k === ' ' || k === '') start();
  } else if (state === 2) {
    if (k === 'Escape' || k === 1) toSelect();
    else if (k === 'Enter' || k === '') { sel = won === 2 ? TRACKS : sel + (passed && sel + 1 < unlocked); start(); }
  } else if (state === 5) toSelect();
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (state === 1) {
    if (e.code in KEYS) { held[KEYS[e.code]] = 1; press(KEYS[e.code]); }
    else if (e.key === 'Escape') toSelect();
  } else go(e.code in KEYS ? KEYS[e.code] : e.key || e.code);   // lane keys navigate the stage row
});
addEventListener('keyup', (e) => { if (e.code in KEYS) held[KEYS[e.code]] = 0; });
const stageLayout = () => [Math.min(innerWidth / 8, innerHeight / 5, 150), innerHeight * 0.32];
addEventListener('pointerup', (e) => {
  if (state === 4) {
    const [g, y] = stageLayout(), i = Math.round((e.clientX - innerWidth / 2) / g + 3);
    if (i >= 0 && i < unlocked && Math.abs(e.clientX - innerWidth / 2 - (i - 3) * g) < g * 0.42 && Math.abs(e.clientY - y) < g * 0.42) { sel = i; start(); }
  } else if (state === 2) {
    if (Math.abs(e.clientX - innerWidth / 2) < 220 && e.clientY > innerHeight * 0.7 && e.clientY < innerHeight * 0.9) go(e.clientY < innerHeight * 0.81 ? 'Enter' : 1);
  } else if (state !== 1) go('');
});   // pointerup: touch activation arrives on release

// ── HUD (2D canvas overlay — text is far cheaper here than in a glyph atlas)
function drawHud(t, now) {
  const d = devicePixelRatio, W = innerWidth, H = innerHeight, w = W * d | 0, h = H * d | 0;
  if (hud.width != w || hud.height != h) { hud.width = w; hud.height = h; }
  hx.setTransform(d, 0, 0, d, 0, 0);
  hx.clearRect(0, 0, W, H);
  hx.textAlign = 'center'; hx.lineJoin = 'round';
  hx.shadowColor = '#210d38'; hx.shadowOffsetY = state ? 0 : 5;
  const font = (size) => hx.font = `${'italic 900'} ${size}px system-ui`;
  const txt = (s, x, y, size, fill, stroke) => {
    font(size);
    hx.lineWidth = size / 7; hx.strokeStyle = stroke || '#fff'; hx.strokeText(s, x, y);
    hx.fillStyle = fill; hx.fillText(s, x, y);
  };
  // a word with one rainbow colour per letter (hues cycle past seven)
  const rb = (word, y, size) => {
    font(size);
    let x = W / 2 - [...word].reduce((w, ch) => w + hx.measureText(ch).width, 0) / 2;
    hx.textAlign = 'left';
    [...word].forEach((ch, i) => { txt(ch, x, y, size, css(hsv(TRACK_H[i % 7], 0.65, 1)), state ? '#fff' : '#34104d'); x += hx.measureText(ch).width; });
    hx.textAlign = 'center';
  };
  const cx = W * 0.86;   // judgments live in the open space right of the track
  if (state === 0) {
    const big = Math.min(W / 7, 150);
    txt('RHYTHM', W / 2, H * 0.3, big * 0.38, '#ffe9ff', '#34104d');
    rb('RAINBOW', H * 0.3 + big * 0.86, big);
    hx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 3);
    txt('PRESS ANY KEY', W / 2, H * 0.85, 20, '#fff', '#34104d');   // under the unicorn, above the receptors; stroke = fill, so the pulse never shows an outline
  } else if (state === 4) {
    const f = Math.min(W / 35, 22);
    txt('SELECT A STAGE', W / 2, H * 0.14, Math.min(W / 18, 44), '#ffe9ff', '#34104d');
    txt('Press Enter to play', W / 2, H * 0.19, f, '#bba9d2', '#34104d');
    const [g, y0] = stageLayout(), s = g * 0.84;
    for (let i = 0; i < TRACKS; i++) {
      const on = i < unlocked, r = s / 2, x = W / 2 + (i - 3) * g, y = y0;
      const color = css(hsv(TRACK_H[i], 0.65, 1));
      hx.fillStyle = '#34104d'; hx.strokeStyle = color;
      hx.lineWidth = i === sel ? 5 : 2;
      hx.shadowColor = color; hx.shadowBlur = i === sel ? 24 : 0;
      hx.beginPath(); hx.roundRect(x - r, y - r, 2 * r, 2 * r, r * 0.3); hx.fill(); hx.stroke();
      hx.shadowBlur = 0;
      if (on) txt(i + 1, x, y + r * 0.23, r * 0.65, '#fff', '#34104d');
      else {
        hx.strokeStyle = '#7040a0'; hx.lineWidth = 3;
        hx.beginPath(); hx.roundRect(x - r * 0.25, y - r * 0.05, r * 0.5, r * 0.35, 3); hx.stroke();
        hx.strokeRect(x, y + r * 0.1, 0, r * 0.1);
        hx.beginPath(); hx.arc(x, y - r * 0.05, r * 0.15, 3.1416, 0); hx.stroke();
      }
    }
    txt(NAMES[sel], W / 2, y0 + s * 1.1, f * 2.2, css(hsv(TRACK_H[sel], 0.65, 1)), '#34104d');
    txt('CONTROLS', W / 2, H * 0.86, f, '#bba9d2', '#34104d');
    const keySize = Math.min(W / 24, H / 24, 44), ky = H * 0.93;
    ['←↓↑→', 'ASDF', 'JKL;'].forEach((keys, group) => {
      const center = W / 2 + (group - 1) * keySize * 6;
      [...keys].forEach((key, i) => {
        const x = center + (i - 1.5) * keySize * 1.1;
        hx.strokeStyle = '#bba9d2'; hx.lineWidth = 2;
        hx.strokeRect(x - keySize / 2, ky - keySize * 0.7, keySize, keySize);
        txt(key, x, ky, keySize * 0.6, '#fff', '#34104d');
      });
      if (group < 2) txt('OR', center + keySize * 3, ky, keySize * 0.4, '#bba9d2', '#34104d');
    });
  } else if (state === 1) {
    const cheer = clamp(1 - (t - milestoneT), 0, 1);
    if (cheer) {
      hx.save(); hx.translate(W / 2, H * 0.32);
      hx.rotate(-0.12 + Math.sin((t - milestoneT) * 45) * cheer * 0.025);
      hx.globalAlpha = cheer * 0.65;
      txt('AWESOME,AMAZING,ON FIRE,UNSTOPPABLE,LEGENDARY,EPIC'.split(',')[(milestone - 1) % 6], 0, 0, Math.min(W / 12, 110), '#ffd45c', '#34104d');
      hx.restore();
    }
    if (combo > 1) {
      // centred over the vanishing point, growing with the combo, popping on each hit
      txt(combo, W / 2, H * 0.4, 72, '#ffe9ff', '#34104d');
      txt('COMBO', W / 2, H * 0.4 + 32, 20, '#bba9d2', '#34104d');
    }
    const a = clamp(1 - (t - judgeT - 0.45) / 0.3, 0, 1);
    if (judge && a > 0) {
      // bigger and poppier the better the hit; MISS is small and grey
      hx.globalAlpha = a; txt(judge, cx, H * 0.58, [78, 54, 40, 28][judgeK], judgeCol, '#fff'); hx.globalAlpha = 1;
    }
    hx.textAlign = 'right'; txt(Math.round(score), W - 24, 52, 36, '#fff', '#c66ad0');
    if (t < 0) { hx.textAlign = 'center'; txt(NAMES[sel] || 'ENCORE', W / 2, H * 0.24, Math.min(W / 20, 60), css(hsv(TRACK_H[Math.min(sel, 6)], 0.65, 1)), '#34104d'); txt(`${target} TO CLEAR`, W / 2, H * 0.34, 32, '#fff', '#34104d'); }
  } else if (state === 5) {
    rb('RHYTHM RAINBOW', H * 0.24, Math.min(W / 9, 90));
    txt('you danced the whole rainbow', W / 2, H * 0.44, 28, '#fff', '#7040a0');
    txt('by Alex Wolfe · js13k 2026', W / 2, H * 0.53, 24, '#fff', '#7040a0');
    txt('thanks for playing', W / 2, H * 0.66, 34, '#ffd45c', '#ff7ad9');
    hx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 3);
    txt('press any key', W / 2, H * 0.82, 26, '#fff', '#fff');
  } else {
    if (won === 2) { txt('YOU UNLOCKED', W / 2, H * 0.15, 40, '#fff', '#c66ad0'); rb('THE RAINBOW', H * 0.15 + 64, 64); }
    else txt(`STAGE ${passed ? 'COMPLETE' : 'FAILED'}`, W / 2, H * 0.24, Math.min(W / 18, 60), '#ffe9ff', '#34104d');
    txt(`SCORE ${Math.round(score)} / ${target} TO CLEAR`, W / 2, H * 0.24 + 70, 40, '#fff', '#c66ad0');
    txt(`MAX COMBO  ${maxCombo}`, W / 2, H * 0.24 + 120, 32, '#fff', '#c66ad0');
    txt(won === 2 ? 'ENTER · ENCORE' : passed && sel + 1 < unlocked ? 'ENTER · NEXT STAGE' : 'ENTER · TRY AGAIN', W / 2, H * 0.77, 30, '#fff', '#34104d');
    txt('↓ · STAGE SELECT', W / 2, H * 0.87, 24, '#bba9d2', '#34104d');
  }
  hx.globalAlpha = 1;
}

// ── boot
bmInit(cv, [0, 0, 0, 1]).then(() => {
  const mk = (src, o) => bmProgram(src[0], { a: src[1], i: src[2], u: src[3], ...o });
  const pSky = mk(Sky, { zwrite: 0 });          // fullscreen; everything else draws over it
  const pUni = mk(Lit);                          // mirrored in x (winding flipped), and the runtime never culls
  const pCharm = mk(Charm, { blend: 1, zwrite: 0 });

  const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), quadIx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  bmAttr(pSky, 0, quad); bmIndex(pSky, quadIx);

  const un = buildUnicorn(3, hair(6));
  bmAttr(pUni, 0, un.pos); bmAttr(pUni, 1, un.nrm); bmAttr(pUni, 2, un.col); bmIndex(pUni, un.idx);
  let hairK = 6;   // which level's palette the hair currently wears

  // charm quad + instance buffers, allocated once and rewritten each frame
  const MAXI = 320;
  const iPos = new Float32Array(MAXI * 4), iCol = new Float32Array(MAXI * 4), iScl = new Float32Array(MAXI);
  bmAttr(pCharm, 0, quad); bmIndex(pCharm, quadIx);
  bmAttr(pCharm, 1, iPos); bmAttr(pCharm, 2, iCol); bmAttr(pCharm, 3, iScl);

  const uSky = new Float32Array(Sky[3] / 4), uLit = new Float32Array(Lit[3] / 4), uCh = new Float32Array(Charm[3] / 4);
  let ni = 0;
  const inst = (x, y, z, shape, c, a, s) => {
    if (ni >= MAXI) return;
    iPos.set([x, y, z, shape], ni * 4); iCol.set([c[0], c[1], c[2], a], ni * 4); iScl[ni++] = s;
  };
  const tile = (n, z, a) => inst(laneX(n.lane), 0.02, z, n.lane, LANE_COL[n.lane], a, 0.42);

  let last = 0, curLX = 0, curLY = 0, curHop = 0;
  bmLoop((now) => {
    const dt = Math.min(now - last, 0.05); last = now;
    const t = songTime(), playing = state === 1 || state === 2 || state === 5;

    // ── game logic
    if (state === 1) {
      while (nextNote < chart.length && chart[nextNote].t < t - 0.16) {
        if (!chart[nextNote].hit) setJudge(3);
        nextNote++;
      }
      if (t > songLen + 1.5) {
        state = 2;
        // Reaching the target score unlocks the next colour.
        passed = score >= target;
        if (passed && sel + 1 < TRACKS && unlocked === sel + 1) { won = 1; localStorage.rr_u = unlocked = sel + 2; }
        if (passed && sel === TRACKS - 1) won = 2;   // the ending: the whole rainbow is beaten
        if (passed && sel === TRACKS) { won = 2; state = 5; [songSrc, bpm] = play(INTRO, 1, ac.currentTime); }   // beat the bonus -> credits, over the title loop
      }
    }

    // ── camera
    const asp = cv.width / cv.height, [H, E, c, s] = camera(asp), T = Math.tan(FOV / 2);
    const V = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, s * E - c * H, -(s * H + c * E), 1];
    VP = bmMul(bmPersp(FOV, asp, 0.1, 100), V);

    // ── sky + highway. The world wears the selected level's palette (the
    // full rainbow on the title). The track sits dim behind the title and menu
    // and only reaches full brightness in play.
    const kk = state ? Math.min(sel + (state === 2 ? won : 0), 6) : 6;   // a win paints the world with the newly unlocked colour
    if (kk !== hairK) { hairK = kk; bmAttr(pUni, 2, buildUnicorn(3, hair(kk), TRACK_H[kk]).col); }
    const beats = (state === 1 ? Math.max(t, 0) : ac ? ac.currentTime - introT0 : now) * bpm / 60;
    const bright = playing ? 1 : 0.3;
    uSky.set([0, H, E, T * asp, 1, 0, 0, T, 0, c, -s, now, 0, -s, -c, state === 4 ? -2 : state ? beats : -1,
      unlocked, kk, bright, SCROLL * 60 / bpm]);
    bmUniforms(pSky, uSky); bmDraw(pSky);

    // ── unicorn: beat bounce + lane-driven lean, all one pose function. It faces
    // +x (toward the track), so lean is a roll about x and the nod a pitch about z.
    const ph = beats % 1, bounce = Math.sin(ph * Math.PI);
    curLX += (leanX - curLX) * (dt * 14); leanX *= Math.pow(0.02, dt);
    curLY += (leanY - curLY) * (dt * 14); leanY *= Math.pow(0.02, dt);
    curHop += (hop - curHop) * (dt * 16); hop *= Math.pow(0.005, dt);
    const sq = 1 - bounce, S = UNI[3] * (state ? 1 : 1.1), party = (won === 2 && state === 2) || state === 5;
    let M;
    if (party) {
      // ending: front and centre on the track, facing the camera, dancing side to side to the beat
      const sw = Math.sin(beats * Math.PI);
      M = bmTrans(sw * 0.5, 0.06 + bounce * 0.08, -3.6);
      M = bmMul(M, bmRotY(sw * 0.14));
      M = bmMul(M, bmRotZ(sw * -0.12));
      M = bmMul(M, bmScale(-S * 1.15, S * 1.15, S * 1.15));
    } else {
      // side view: bottom-left during play and menus; centre stage on the title
      M = bmTrans((playing ? UNI[0] : 0) + curLX * 0.2, UNI[1] + bounce * 0.08 + curHop * 0.25 - (state === 4 ? 0.25 : 0), state ? UNI[2] : -3.4);
      M = bmMul(M, bmRotX(curLX * 0.28));
      M = bmMul(M, bmRotZ(curLY * 0.22));
      M = bmMul(M, bmRotY(1.5708 + curLX * 0.2 - (playing ? 0 : 0.65)));   // title: turned toward the camera for a 3/4 view
      M = bmMul(M, bmScale(-S * (1 + sq * 0.04), S * (1 - sq * 0.08), S * (1 + sq * 0.04)));
    }
    uLit.set([...VP, ...M, 0.4, 1, 0.6, 0, ...hsv(TRACK_H[kk], 0.55, 0.42)]);   // vp, model, light dir (padded), fog colour
    bmUniforms(pUni, uLit); bmDraw(pUni);

    // ── charms: receptors, notes (far to near, for blending), particles
    ni = 0;
    for (let i = 0; i < LANES; i++) {
      const flash = clamp(1 - (t - flashes[i]) / 0.22, 0, 1);
      if (flash) {
        inst(laneX(i), 0.3 + (1 - flash) * 0.7, 0, 4, [1, 0.8, 0.3], flash, flash * 0.6);
      }
      inst(laneX(i), 0.025, 0, 5 + i + (held[i] || flash ? 0.5 : 0), [1, 1, 1], (held[i] || flash ? 1 : 0.55) * bright, 0.34 + flash * 0.1);
    }
    if (state === 1) {
      let j = nextNote;
      while (j < chart.length && -(chart[j].t - t) * SCROLL >= FAR) j++;
      for (let i = j - 1; i >= nextNote; i--) if (!chart[i].hit) tile(chart[i], -(chart[i].t - t) * SCROLL, 1);
    }
    // finale: rainbow shells burst up in the sky between the track and the arc,
    // spread across it, big and frequent. F = [x, y, z, power] burst centre.
    if ((state === 2 || state === 5) && won && bursts.length < 30 && Math.random() < (won === 2 ? 0.6 : 0.15))
      bursts.push({ t, lane: Math.random() * 4 | 0, big: 1, F: won === 2 ? [(Math.random() - 0.5) * 12, 2.4 + Math.random() * 3, -4 - Math.random() * 16, 1.4 + Math.random()] : 0, c: won === 1 ? hsv(TRACK_H[sel + 1], 0.8, 1) : 0 });
    for (let b = bursts.length - 1; b >= 0; b--) {
      const B = bursts[b], F = B.F, life = F ? 1.3 : B.big ? 0.9 : 0.55, age = t - B.t;
      if (age > life) { bursts.splice(b, 1); continue; }
      const N = F ? 46 : B.big ? 36 : 16, k = age / life, P = F ? F[3] : 1;
      for (let p = 0; p < N; p++) {
        const h = Math.sin(p * 12.9898 + B.t * 78.233) * 43758.5453, r = h - Math.floor(h);
        const ang = p / N * 6.283 + r, sp = (0.9 + r * 1.6) * (B.big ? 1.6 : 1) * P;
        const x = (F ? F[0] : laneX(B.lane)) + Math.cos(ang) * sp * age;
        const y = (F ? F[1] : 0.15) + Math.sin(ang) * sp * age * (F ? 1 : 0.7) + (F ? 0 : 2.2) * age - (F ? 2.2 : 4) * age * age;
        const z = (F ? F[2] : 0.1) + (F ? Math.cos(ang * 1.7 + r) * sp * age * 0.6 : r * 0.3);
        const c = B.c || ((B.big || F) && p % 3 ? LANE_COL[(B.lane + p) % 4] : LANE_COL[B.lane]);
        inst(x, y, z, 4, c, 1 - k, (F ? 0.16 : 0.05) * (1 - k) + 0.02);
      }
    }
    uCh.set(VP, 0);
    [iPos, iCol, iScl].forEach((a, i) => bmDevice.queue.writeBuffer(pCharm.b[i + 1], 0, a, 0, i < 2 ? ni * 4 : ni));
    bmUniforms(pCharm, uCh); if (state !== 4) bmDraw(pCharm, ni);

    drawHud(t, now);
  });
}, () => {
  hud.width = innerWidth; hud.height = innerHeight;
  hx.font = '900 28px system-ui'; hx.textAlign = 'center'; hx.fillStyle = '#fff';
  hx.fillText('THIS GAME NEEDS A WEBGPU BROWSER', innerWidth / 2, innerHeight / 2);
});
