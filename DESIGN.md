# Project to-do list

In priority order:

1. [ ] **Combo power meter.** Charge it through sustained combos, considering a milestone at 20 or 30 notes. Decide what spending the charge does before implementing the ability.
2. [ ] **Unicorn streak celebrations.** Add a celebratory emote or action every 10 consecutive hits, synchronized with the existing celebration word. Keep it brief and readable during play; no combo celebration sound.
3. [ ] **Stage selection polish.** Give the existing screen a small visual upgrade, focusing on card presentation, spacing, and the selected-stage highlight. Preserve its clear controls and stage selection flow.

# Design notes

## Combo power meter — proposed, not implemented

Alex wants a distinctive mechanic: sustained combos charge a visible power meter.
Consider a meaningful charge milestone at 20 or 30 consecutive notes. The action
that spends power is still undecided; do not treat a particular ability as approved.

### Candidate: powered lane lasers (Alex's idea)

- Build charge through combos, then press **Space** to activate it.
- Give the lane arrows/receptors a flaming or energized appearance so the active
  power is clearly visible.
- While powered up, a successful hit fires a laser up that lane, destroying
  incoming notes in the same lane. Perfect hits should be especially rewarding.
- This is a proposed mechanic, not yet approved for implementation.

Decisions for a prototype: charge threshold, active duration, whether only Perfect
hits fire a beam or Perfect hits strengthen it, beam range, and how destroyed
notes contribute to score and combo.

Suggested balance: destroyed notes grant bonus points but do not recharge the
meter or count as timed Perfect hits. Keep the effect bounded so it does not clear
an entire song or sustain itself indefinitely. This is a suggestion, not a settled rule.

Earlier alternative: Rainbow Remix, a temporary harder bonus pattern for extra
points. Keep it as an alternative rather than combining both abilities by default.

## Combo celebrations

Every ten consecutive hits triggers the large celebration word and visual effects.
Alex rejected both the pitched chord and the noise-burst celebration sounds.
Keep combo milestones silent; retain the regular note-hit sounds.
