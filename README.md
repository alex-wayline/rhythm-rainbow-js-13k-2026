# Rhythm Rainbow

A WebGPU rhythm game for [js13kGames 2026](https://js13kgames.com/2026/) (theme: **Unicorns and Rainbows**).
The whole game — 3D unicorn, glossy rainbow highway, seven original songs and a synthesizer to
play them — is one HTML file under 13 KB, zipped.

Ride the rainbow: notes flow down four lanes to the beat, you hit the matching arrow keys, and each
of the seven rainbow colours you clear paints more of the world in until the full spectrum is yours.

## Play

- **Arrow keys** or **WASD** hit the four lanes (left, down, up, right).
- On the track-select pyramid, **arrows** move and climb, **Enter** starts the highlighted track.
- **Esc** abandons a song. Clear a track (hit at least half its notes) to unlock the next colour.
- Beat all seven to unlock the secret bonus track — dance forever.

Needs a browser with **WebGPU** (current Chrome, Edge, or Firefox).

## Build

```
npm install
npm run build      # writes dist/index.html and dist/game.zip
npm test           # headless checks: no runtime errors, buffers in bounds, camera framing
npm run dev        # rebuild on change; serve dist/ over http to run (WebGPU needs http, not file://)
```

## How it's made

- **Rendering:** [BroMetal](https://brometal.dev), a tiny WebGPU runtime; shaders are authored in
  TypeScript (`src/*.shader.ts`) and compiled to WGSL at build time. The background, rainbow arc,
  per-stage shapes and the glossy reflective highway are one fullscreen ray-marched pass
  (`src/sky.shader.ts`); note tiles, receptors and particles are one instanced SDF pass
  (`src/charm.shader.ts`); the unicorn is lit geometry (`src/lit.shader.ts`).
- **Unicorn:** procedural geometry built from superellipsoids, ribbons and a twisted horn
  (`src/unicorn.js`).
- **Music:** a Sonant-X style softsynth renders every song from tiny pattern data (`src/song.js`);
  the seven levels and the intro loop are hand-authored in a compact string format, and the step
  charts are authored alongside so difficulty ramps by design.
- **Build:** `build.mjs` compiles the shaders, trims the runtime to what the game uses, minifies the
  WGSL and the whole program together with terser, inlines it into one HTML file, and packs it with
  a zopfli deflate.

## Licence

MIT.
