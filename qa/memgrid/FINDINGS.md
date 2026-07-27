# memgrid — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log` (empty), `edge-check`.

Scores before: containment 1, typography 2, motion 2, cleanliness 1, palette 1.

1. **(clean/cont, sev 0) A "uniform" memory grid rendered as six different shapes and hung
   off both frame edges.** `short-p90.png` (before): the top row is a pair of flat wide
   slabs, the middle-left a tall box, the bottom row big squares; `0x10` is cut at x=0 and the
   right column runs past x=1080 (`edge-check` 0.5% left). Cause: cell positions were world
   literals on a ground plane (`memgrid.ts:76-83` `spreadX`/`spreadZ`) under a camera at
   `(0, 12, 10)` (`:95`), so every cell sits at a different depth — different projected size —
   and the 2D chrome used a fixed `cell2DW = unit * 8.5` for all of them (`:170`).
2. **(motion, sev 1) The 3D cell colours were frozen at frame 0.** `update()` read the
   painter-local `writes`, `frees`, `cur` and `prev` (`memgrid.ts:135-149`), which the closure
   captured on the first frame; `render3D`'s `liveEnv` argument refreshes `env` only. So the
   slabs never changed colour as steps ran — allocation, write and free were invisible in the
   3D layer. Same family as `qa/ledger.json` → `systemic` → `frozen-3d-layer`.
3. **(palette, sev 1) `mat.color.setStyle(accentSoft)` and `setStyle(secondary)`**
   (`memgrid.ts:141-145`): `accentSoft` is an `rgba()` string, so `THREE.Color` drops the alpha
   and paints full-strength accent. Plus 5 hardcoded hex/rgba (`:99`, `:115`, `:147`, `:148`,
   `:198`, `:290`).
4. **(cont, sev 2) The grid was measured to `contentH`**, putting the bottom row at y≈1690 —
   inside the Shorts UI band.
5. **(clean, sev 2) The `ptr` pin was hung below its cell** (`memgrid.ts:300`), but the row gap
   is under an eighth of a cell, so it landed on the next row's address label.
6. **(motion, sev 3) A per-cell y-bob and a 0.3-unit active lift** moved slabs under
   fixed-pixel chrome; the lift is now a shared pixel offset both layers read.
