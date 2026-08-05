# Edge-bleed audit

Automated containment measurement — see `scripts/edge-audit.mjs`. A row means painted
content sits in the outer 3px of the frame at p=0.5 or p=0.9, i.e. it is clipped.
Threshold: 2% of a border band.

**2 of 222 kind/aspect combinations bleed off-frame.**

| kind | aspect | worst edge | edges over threshold |
|---|---|---|---|
| showdown | short | 4.3% | left 4% |
| race | long | 2.2% | right 2% |
