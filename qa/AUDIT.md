# Edge-bleed audit

Automated containment measurement — see `scripts/edge-audit.mjs`. A row means painted
content sits in the outer 3px of the frame at p=0.5 or p=0.9, i.e. it is clipped.
Threshold: 2% of a border band.

**7 of 220 kind/aspect combinations bleed off-frame.**

| kind | aspect | worst edge | edges over threshold |
|---|---|---|---|
| zoomladder | short | 43.5% | bottom 43%, left 30%, right 14% |
| zoomladder | long | 12.1% | bottom 12% |
| showdown | short | 4.3% | left 4% |
| steps | short | 4.2% | right 4% |
| quiz | long | 3.3% | left 3% |
| quiz | short | 2.4% | left 2% |
| race | long | 2.2% | right 2% |
