# Project to-do list

In priority order:

1. [ ] **Combo power meter.** Charge it through sustained combos, considering a milestone at 20 or 30 notes. Decide what spending the charge does before implementing the ability.
2. [x] **Unicorn streak celebrations — first pass, awaiting visual feedback.** A hop at 10, a higher jump and eased full twirl at 20, and a bigger jump at 30 and above. Each lasts 1.1 seconds and remains silent. Jumps are more pronounced, with two twirls from 30 onward.
3. [x] **Stage selection polish — first pass, awaiting visual feedback.** Stage cards have shaded colour finishes and a brighter selected card; existing layout and controls remain.

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

## Combo aura — visual prototype

An icy-blue glow ring sits beneath the unicorn during a streak, building to
full intensity at 30 consecutive hits with a slow breathing pulse and a matching subtle blue glow on the unicorn. A miss removes
it immediately. This indicates streak progress only; stored charge, Space
activation, and the powered ability are not implemented yet.

### Unicorn participation in the power ability — new idea

Alex suggested that the unicorn itself helps out when the charged power fires.
A possible interpretation is a horn-powered beam or a deliberate attack pose
synchronized with the lane laser. The particular action remains undecided.

## Current visual checkpoint

Stage selection now includes a larger heading, subtle coloured star glints, and
an occasional shooting star. Runtime tests pass. The packed prototype is
13,697 bytes, 385 bytes above the 13,312-byte submission limit. Optimize size
before submission while preserving the approved visuals.

## Rainbow power meter — visual prototype

On the right, opposite the unicorn and below the hit-feedback text: a dark rounded housing with a continuous glossy
rainbow gradient, faint empty fill, an uninterrupted gradient without tick marks, and a blue
full-charge glow. Fills from combo / 30 and resets on a miss. Full charge shows a gently blinking “Press Space to activate” prompt underneath.
The prompt is visual only for now; activation is not implemented.

References: Guitar Hero Star Power meter and Street Fighter 6 Drive Gauge.
Current packed prototype: 14,002 bytes (690 bytes above submission limit).

## Rainbow Rush — implemented prototype

Thirty manually timed hits without a miss charge the meter. Space spends a full
charge for five seconds of rainbow scenery. The meter drains continuously; hits
and misses cannot refill or extend the active window. After expiry, charging
restarts from zero. Every successful powered hit triggers a unicorn jump/twirl
and collects only currently visible future notes in that lane, awarding 100 points per collected
note with the current combo multiplier. Collected notes do not increase combo
or charge, and cannot score twice or become misses.

This supersedes the earlier undecided lane-laser proposal. Size optimization
is still required before submission.

### Stored full charge

Once the meter reaches full charge, misses do not remove it. It stays ready
until activated or the stage ends. A miss still resets partial charge. Starting
a stage resets charge; active power still drains for five seconds.

### Power feedback refinement

Activation has a rising sound, expanding blue light ring, brief Rainbow Rush
text, and a 0.35-second transition into rainbow scenery. Powered hits use a
longer laser pitch sweep. Lane collection is limited to the visible track
(up to four seconds ahead at the current scroll speed); offscreen notes remain.

See SIZE-PLAN.md for measured optional cuts and a preservation-first size plan.

## Approved size cuts

Stage 8 encore music now plays during the intro/menu. Extra menu coloured stars
and shooting star, activation expanding ring, and meter gloss have been removed.
The original starfield, rainbow gradient, activation sound/text, and all eight
stage songs remain. Packed size: 14,051 bytes; 739 bytes remain to save.

## Simplified ending checkpoint

Custom sky-firework trajectories were replaced with lighter confetti using the
existing hit-particle system. The full rainbow, dancing unicorn, completion
message, credits and encore remain. This saves 129 compressed bytes: the ZIP
is now 13,902 bytes, 590 bytes over the submission limit.
