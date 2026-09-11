# Size reduction plan

Current five-second power build: **14,510 bytes**, **1,198 bytes over** the
13,312-byte limit. Gameplay tests pass. No candidate cuts below have been applied.

## Preserve

Seven coloured stages and their songs, the accepted unicorn model, responsive
16:9 layout, rhythm timing and score gates, combo celebrations, visible-note
laser collection, stored full charge, and five-second power activation.

## First: optimize without removing features

- Audit the generated renderer for unused branches and general-purpose options.
  The build already strips several unused paths; further savings need measurement.
- Share repeated HUD gradient, rounded-panel, and text-drawing code where it
  actually reduces the final ZIP, rather than merely reducing source length.
- Compact repeated shader calculations and song pattern data. Verify GPU output,
  song timing, and note charts before accepting changes.
- Revisit text/data packing only after simpler changes; include decoder overhead
  and loading costs in the measurement.

No byte savings are promised for these unimplemented optimizations.

## Measured optional cuts

Each experiment was run in an isolated copy, using the same 500-iteration
compression setting. Its baseline was 14,512 bytes. Savings are individual ZIP
measurements, not additive guarantees; the normal 5,000-iteration build is 2
bytes smaller at baseline.

| Candidate | Saved bytes | Tradeoff |
| --- | ---: | --- |
| Reuse stage 1 music for the title/menu | 193 | Removes the distinct intro composition; keeps all seven stage songs. |
| Remove extra menu coloured glints and shooting star | 158 | Original starfield and polished stage cards stay; menu is less animated. |
| Reuse stage 7 music for the encore | 136 | Keeps the encore mode, loses its unique song/chart. |
| Remove activation text and expanding-ring overlay | 86 | Keeps the rainbow transition, power sounds, meter, unicorn glow and lasers. |
| Remove the meter's gloss layer | 43 | Keeps rainbow fill and outer glow, loses some depth. Not recommended for the small saving. |

Even these individual savings total only 616 bytes before compression
interactions. They are not a complete solution to the 1,198-byte overage.

## Recommendation

Start with code/data optimizations. If visible cuts are still necessary, first
consider reusing the encore song and simplifying the activation overlay. Keep
the main-stage music, unicorn, powered mechanic, and meter presentation. Present
the measured remaining gap before removing more noticeable features.

## Applied cuts

Removed the activation ring (retained its title flash), extra menu glints and
shooting star, and meter gloss. The intro now reuses the stage 8 BONUS song.
Combined result: 14,051 bytes, saving 459 bytes from the five-second baseline.
Remaining overage: 739 bytes. Runtime tests pass.

## Renderer optimization checkpoint

Shader-inferred WebGPU pipeline layouts save a further 20 bytes without visual
changes. Current ZIP: 14,031 bytes; remaining overage: 719 bytes. Gameplay tests
pass and browser rendering was checked. Most unused renderer support was already
removed; investigate song-pattern deduplication next.
