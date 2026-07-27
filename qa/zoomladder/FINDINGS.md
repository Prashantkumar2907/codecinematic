# zoomladder — ROUND 1 (diagnosis; fix NOT applied)

Top of `qa/AUDIT.md` at 43.5 % (short) / 12.1 % (long).

## Z0 — the edge bleed is INTENTIONAL, do not "fix" it
`short-p90.png`: the final rung is Earth, deliberately filling and overflowing the frame — that is
the point of a zoom ladder. The audit measures clipping and cannot tell intent apart from error.
**Do not clamp this one to the frustum.** It should be recorded as an accepted exception so it stops
heading the audit queue.

## Z1 — the scale caption sits inside the Shorts UI band (severity: high) — REAL, not fixed
The "10⁷ m / Earth" caption renders at roughly y ≈ 1700 on a 1920-tall frame. The YouTube Shorts
caption strip covers everything below **1440**, so the label that names the current rung — the one
piece of text the scene exists to deliver — is hidden on the platform it is mainly made for.
This is invisible to the edge audit because it is well inside the frame; only the safe-area rule
catches it.

## Z2 — the 3D viewport reads as a hard black box (severity: medium) — not fixed
There is a sharp horizontal seam at y ≈ 480 and vertical seams at the content margins where the
3D rect begins, sitting as an opaque black rectangle over the background gradient. The globe then
overflows the bottom of that box, so the box edge reads as an accident rather than a frame.

## Next action
Move the caption above `h * 0.75` on 9:16, then re-check Z2 — and add an accepted-exceptions list to
`scripts/edge-audit.mjs` so intentional full-bleed kinds (this one) do not dominate the queue.
