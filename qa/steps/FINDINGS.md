# steps — findings

> **Note on history:** on 2026-07-27 I destroyed ~174 lines of uncommitted work in this file with an
> unguarded `git checkout --`. That work was a 3D staircase upgrade (isoCamera + per-step panels).
> This pass QAs the committed 2D version, which is what now exists.

Captured `--kind=steps` both aspects + wide strip. `console.log` empty. Edge audit: **0 % all edges,
both aspects** — the 4.2 % right-edge bleed the audit reported earlier came from the lost 3D version,
so reverting removed that containment failure as a side effect.

## St1 — the list was centred in the full content box, not the visible band (severity: medium) — FIXED
On 9:16 `availH = contentH - band` spans down to y ≈ 1710, but the Shorts caption strip covers
everything below 1440. Centring in that box pushed the list low: a dead third under the title, and
the slack below the list sitting in the covered region where it does nothing.

Now bounded by `h * SHORTS_SAFE_BOTTOM` when vertical, which lifts the whole list ~170 px into the
visible area. Content spans y ≈ 530–1200; the empty space is now entirely inside the covered band,
which is where you want it.

## St2 — hardcoded colours (severity: low) — FIXED
`"#0e2433"` (inactive circle fill) and `"#06121a"` (active numeral) → `shade(accent, -0.82)` /
`shade(accent, -0.9)`. The scene now recolours correctly for non-Coding subjects.

## Scores

| section | before | after | evidence |
|---|---|---|---|
| 1. Containment & safe area | 3 | **4** | measured 0 % edge bleed; all content above the 1440 band |
| 2. Typography | 4 | **4** | size from `unit`, 2-line cap with an ellipsised detail line, three tiers |
| 3. Motion quality | 4 | **4** | `short-strip.png`: dashed ghost numerals show the full spine from p≈0.07 so the lower half is never empty; steps fill one per beat; spine draws progressively; active step glows |
| 4. Cleanliness | 4 | **4** | connector terminates at the circle edge, no overshoot |
| 5. Palette & consistency | 3 | **4** | all colour from `palette` |

**Status: passed.** The ghost-numeral trick already in this painter is the best answer to the
"dead lower half" problem I have seen in the codebase — worth copying into other list painters.
