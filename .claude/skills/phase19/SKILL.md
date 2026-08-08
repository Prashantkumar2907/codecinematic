---
name: phase19
description: Drive the Phase 19 animation runbook end to end — pick the next task card, execute it, verify, commit, then continue to the next card automatically. Use when the user says "start the runbook", "/phase19", "continue phase 19", or asks to resume the animation-craft work.
---

# Phase 19 driver

You are executing `PHASE19-RUNBOOK.md` as a continuous loop. The user starts you **once**. You keep
going card by card until a stop condition fires. **Never ask "shall I move to the next one?"** — that
is the entire point of this skill. Announce what you are starting, do it, commit it, start the next.

## Loop

Repeat until a stop condition in §Stop fires:

1. **Pick.** Read `PROGRESS.md`. Take the **lowest-numbered `19.x` row with state `todo` whose deps are
   all `verified`**. If it is `19.g`, the unit of work is **one kind**, in the order fixed by
   the runbook — take the next unpolished kind from that order, not the whole card.
2. **Load.** Read `PHASE19-RUNBOOK.md` §2 (hard rules), §3 (escalation), §4 (rubric v2), and that task
   card. For `19.g` also read §6 (the per-painter loop) and that kind's row in `qa/LEDGER.md`.
   Do not read `demo.ts`, `schema.ts` or the full ledger — grep them.
3. **Model check.** `19.b`, `19.d`, `19.e` and `19.f` are **Opus 5** cards (see runbook §0). If you are
   Sonnet and the next card is one of those, say so in one line and stop so the owner can switch model.
   `19.g` and `19.a` run on Sonnet.
4. **Announce.** One line to the user: which card/kind you are starting and why it is next.
5. **Execute** exactly what the card says. No improvisation — see §Stop.
6. **Verify.** Run every command the card lists. `npx tsc --noEmit` must print 0 errors.
   Capture real output; never paraphrase a result you did not see.
7. **Close out.** Update the `PROGRESS.md` row (and `qa/LEDGER.md` for a painter) using the §7
   template, with pasted command output — not adjectives. Commit **in the same commit as the work**:
   - painter work → `polish(<kind>): <what changed>`
   - tooling/shared work → the card's own scope, e.g. `qa: per-painter motion instrument`
8. **Report** briefly to the user: what changed, the before → after numbers, anything left.
9. **Continue** to step 1 without being asked.

## Stop — hand back to the user and wait

Stop the loop, say plainly why, and do not start another card when:

- Any `PHASE19-RUNBOOK.md` §3 escalation trigger fires (schema/engine edits, an unlisted decision, a
  shared-layer change outside the card's scope, a kind where 2D-first looks wrong).
- A rubric section is still below 4 after **3 fix rounds** → mark the row `blocked` with the specific
  reason, commit that, then stop.
- `npx tsc --noEmit` is non-zero and you cannot resolve it inside the current card.
- A verification command fails in a way the runbook does not cover.
- All `19.x` rows are `verified`.

**Between cards, always leave the tree committed and typecheck-clean.** A card must never begin with
uncommitted work from the previous one — that is how this repo previously lost 174 lines of polish and
left `/probe` at HTTP 500 for every worker.

## Discipline that survives a context reset

`PROGRESS.md` and `qa/LEDGER.md` are the state, not this conversation — the conversation gets
summarised and lost. If you are resumed mid-phase with no memory, step 1 alone tells you what to do.

Two habits that matter more than they look:
- **A contact sheet spots candidates; only layout math or a pixel measurement settles anything.** Three
  of the owner's own visual readings from downsampled sheets were later measured wrong.
- **Report honestly.** If a check could not be run, say so in the row. A `verified` row with no pasted
  evidence is worse than a `todo` one.
