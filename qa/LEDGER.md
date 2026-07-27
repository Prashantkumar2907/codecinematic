# Animation QA ledger

Source of truth for polish progress across all 110 registered painters — **not** the
conversation, which gets summarised and lost. Update a row in the same commit that polishes its kind.

- Rubric and ship gate: `ANIMATION-QA-PROMPT.md` Part C. **Ship gate: every section >= 4.**
- Score columns are 1-5: cont = containment & safe area, typo = typography, motion = motion quality,
  clean = cleanliness, palette = palette & consistency.
- `status`: todo | in-progress | passed | blocked. `blocked` must carry the specific reason in summary.
- Typecheck baseline: **99** pre-existing errors (`qa/ledger.json` → `typecheckBaseline`).
  A polish commit may never raise it, and the file it touched must have zero errors.
- Variant-seeded painters (`variantOf(scene.id, n)`) only show one style per scene id. Reach the
  others with `npm run filmstrip -- --scene=<sceneId>` (output goes to `qa/<kind>/<sceneId>/`).
- Motion scoring needs `--entrance` (samples the first 500ms at ~33ms/cell, one real frame at 30fps).
  A plain `p=0..1` strip has 533ms-2.7s between cells and cannot show a 380ms `enterT()` entrance.
- Capture: `npm run filmstrip -- --kind=<kind>` writes `qa/<kind>/{short,long}-strip.png`,
  `-p50.png`, `-p90.png` and `console.log`. Those artifacts are gitignored; the ledger is not.

> **Systemic, see `qa/ledger.json` -> `systemic`:** the 3D layer of 29 painters was frozen at frame 0
> (`render3D` cached a closure over the first frame`s env). Fixed centrally on 2026-07-27, but only
> bigtext and bullets have been looked at since. The other 27 animate for the first time and MUST be
> re-reviewed when the wave reaches them.

| kind | wave | group | status | rounds | cont | typo | motion | clean | palette | summary | commit | date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bigtext | 1 | Text/general | passed | 5 | 4 | 4 | 4 | 4 | 4 | All 5 variants scored 4/5. Fixed: entrance clipping (1.8x stamp overflowed canvas), Shorts safe-area overrun, 350ms hard colour pop, hardcoded glitch hex, Math.random nondeterminism, icon flying through headline, v0 accent bar at full opacity at t=0, v2 letters cascading through the icon, 3D grid hardcoded hex. Harness gained --scene= and --entrance to get here. | (uncommitted) | 2026-07-27 |
| bullets | 1 | Text/general | passed | 3 | 4 | 4 | 4 | 4 | 4 | 1/2/3/1/4 -> 4/4/4/4/4. Found the systemic frozen-3D-layer bug here (29 painters). Also fixed: half the bullets under the Shorts UI band, 16:9 slicing its outer panels (spreadY exceeded the frustum), labels overflowing their panels, sheared off-axis camera, dead rowGap. | (uncommitted) | 2026-07-27 |
| quote | 1 | Text/general | passed | 1 | 4 | 4 | 4 | 4 | 4 | 2/4/4/4/3 -> 4/4/4/4/4. Glass card overhung both side edges at 9:16 (blockW half 3.0 vs frustum halfW 2.87); now clamped via the new frustumHalfExtent helper. Measured 0% edge bleed after. Hardcoded grid hex removed. | (uncommitted) | 2026-07-27 |
| stat | 1 | Text/general | passed | 2 | 4 | 4 | 4 | 4 | 4 | 1/2/2/3/2 -> 4/4/4/4/4. Fixed: isoCamera frustum overflow at 9:16 (blockW hardcoded 5.8 vs halfW 1.81), context text overlapping a 2-line label, label fading in over still-spinning odometer reels, 2 hardcoded hex. | (uncommitted) | 2026-07-27 |
| steps | 1 | Text/general | passed | 1 | 4 | 4 | 4 | 4 | 4 | 3/4/4/4/3 -> 4/4/4/4/4. List was centred in the full content box, pushing it low with a dead third under the title; now centred in the visible band above the Shorts UI. 2 hardcoded hex removed. NOTE: ~174 lines of uncommitted 3D-staircase work in this file were destroyed by an unguarded git checkout on 2026-07-27; this is the committed 2D version. | (uncommitted) | 2026-07-27 |
| vocab | 1 | Text/general | passed | 3 | 4 | 4 | 4 | 4 | 4 | 2/3/4/1/2 -> 4/4/4/4/4. The 3D slabs and the example text were unrelated layers: an off-axis camera plus a per-row Z stagger meant a slab projected as a diagonal parallelogram while the text was centred on the projected world origin, so they overlapped. Front-on camera, coplanar rows, card size from frustumHalfExtent, text box derived from the projected front face. Also killed a 26%-of-frame dead void, aligned the empty sockets with the cards that fill them, replaced an off-frame entrance slide with a scale, 4 hardcoded hex. Measured 0% edge bleed both aspects. | 5d7c82d | 2026-07-27 |
| mythfact | 1 | Text/general | passed | 2 | 4 | 4 | 4 | 4 | 4 | 1/2/3/1/2 -> 4/4/4/4/4. Card chrome (chip/text/badge/strike) was a pixel rect sized from contentW then re-centred on the projected block, so on 16:9 the chip and first line floated in black off the slab and the badge sat 120px past its edge. Front-on coplanar blocks sized from frustumHalfExtent; chrome rect derived from the projected front face. Also: bust colour ramps over 320ms instead of flipping in one frame, strike spans the measured text not the card width, emphasis variant now reaches the geometry, faces darkened for text contrast, 5 hardcoded hex. 0% edge bleed both aspects. | c4ac573 | 2026-07-27 |
| dialogue | 1 | Text/general | passed | 3 | 4 | 4 | 4 | 4 | 4 | 1/1/2/1/1 -> 4/4/4/4/4. The scene rendered ZERO message text on every frame after the first: projectedPoints was a per-paint array filled inside build()'s update() closure, which captures frame 0's array, so the live one stayed empty and every bubble was dropped. Realigned the 3D layer to the 2D layout with an axis-aligned camera (projectToRect is affine on a z=const plane, so pixel<->world round-trips exactly); removed the two-axis group wobble. Also: accentSoft/rgba() into THREE.Color dropped alpha and rendered a solid sky-blue slab; edge wireframes now fade with their face; short threads centre instead of pinning to the bottom of an empty panel; 5 hardcoded hex. console.log clean, 0% edge bleed. | edb851b | 2026-07-27 |
| terminal | 1 | Text/general | passed | 3 | 4 | 4 | 4 | 4 | 4 | 2/3/3/2/2 -> 4/4/4/4/4. Top-down camera keystoned the slab while the title bar / traffic lights / body text are axis-aligned pixel rects taken from the bounding box of two projected corners, so the bar overhung the slab's top-right corner into black. Window is now upright before an axis-aligned camera, sized from the frustum, chrome on the projected front face. Also dropped the slab scale+bob that slid under fixed-pixel chrome, sized the window to its content so it clears the Shorts UI band (was running to y=1745), raised the mono cap for phone legibility, removed 2 rgba()-into-THREE.Color calls + 9 hardcoded literals. console.log clean, 0% edge bleed. | 88af755 | 2026-07-27 |
| storyboard | 1 | Text/general | passed | 3 | 4 | 4 | 4 | 4 | 4 | 2/3/3/2/1 -> 4/4/4/4/4. Top-down camera + a 2D card rect taken from the bounding box of two projected corners: every slab keystoned while its card stayed axis-aligned, so margins differed per row, panels were unequal sizes, and the lit top faces read as silver bars. Pixel grid is now authoritative, each slab mapped onto its exact cell via an axis-aligned camera. Also clamped the grid above the Shorts UI band (bottom caption was at y=1690), removed the easeOutBack reveal scale that shrank 1.0->0.9 before growing back and the active-panel y-bob, one absolute card inset on all sides, 2 rgba()-into-THREE.Color calls + 8 hardcoded literals gone. console.log clean, 0% edge bleed. | 6963d39 | 2026-07-27 |
| question | 1 | Text/general | passed | 1 | 4 | 4 | 4 | 4 | 4 | 1/4/4/3/3 -> 4/4/4/4/4. The whole 2D layer was translated by the unclamped projection error of an off-axis camera, slicing the heading at x=0 and the CTA at the bottom edge; now clamped. CTA also moved above the Shorts UI band. Measured 0% edge bleed after. | (uncommitted) | 2026-07-27 |
| quiz | 1 | Text/general | passed | 2 | 4 | 4 | 4 | 4 | 4 | 2/2/3/1/1 -> 4/4/4/4/4. Same frozen-local-array bug as dialogue: projectedPoints filled inside build()'s update() closure, so every option's badge/label/tick was dropped from frame 1 on. 3D layer realigned to the 2D layout via an axis-aligned camera; group wobble removed; option text shrinks to fit instead of wrapText()[0] silently truncating 52-char options; edge wireframes fade with their face; 7 hardcoded hex/rgba gone including an rgba() string passed to THREE.Color. console.log clean, 0% edge bleed. NOTE: the think-time countdown HUD is unreachable in the probe (needs a gap between beat windows) and was not exercised. | bd37e1b | 2026-07-27 |
| code | 1 | Code | passed | 2 | 4 | 4 | 4 | 4 | 4 | 1/3/3/2/1 -> 4/4/4/4/4. The editor window overflowed BOTH side edges at 9:16 (traffic lights half off at x=0, JS badge and UTF-8 clipped, code cut mid-string; edge-check 1.7% left): the 3D viewport was the whole frame with a hardcoded 7.5-wide block against a ~3.49 frustum half-width, and the pixel chrome was scaled onto the block by the MEAN of its two axis scales. Viewport is now the window itself, block sized from that frustum, chrome drawn in plain pixels with no transform. edge-check 1.7% -> 0.0%. Also dropped bob + two-axis rotation + easeOutBack overshoot, clamped above the Shorts UI band, removed 11 hardcoded literals including 3 that hardcoded the default sky accent and ignored the subject palette. | c35d7a9 | 2026-07-27 |
| trace | 1 | Code | passed | 2 | 4 | 4 | 4 | 4 | 4 | 1/3/4/2/2 -> 4/4/4/4/4. Same defect as code: 3D viewport was the whole frame with a hardcoded 7-wide block against a ~3.49 frustum half-width, chrome fitted to it by the MEAN of two axis scales -> 1.5% left edge bleed at 9:16. Viewport is now the panel rect, block sized from that frustum, chrome in plain pixels. Also dropped group offset/scale/bob/rotation, clamped the array-cell band to the Shorts UI edge (it centred in a band running past it, leaving ~200px dead space under the code panel), 2 hardcoded hex. edge-check 1.5% -> 0.0%. | 708b223 | 2026-07-27 |
| memgrid | 1 | Code | passed | 2 | 4 | 4 | 4 | 4 | 4 | 1/2/2/1/1 -> 4/4/4/4/4. A uniform memory grid rendered as six different shapes with the outer columns off both frame edges: cell positions were world literals on a ground plane under a camera at (0,12,10), so every cell sat at a different depth while the 2D chrome used one fixed pixel width. Pixel grid is now authoritative, each slab mapped onto its cell via an axis-aligned camera. SEPARATELY the 3D cell colours were frozen at frame 0 (update() read the painter-local writes/frees/cur captured by the build closure) so allocation/write/free were invisible in 3D — that state now travels through render3D's context arg. Also accentSoft (an rgba string) into THREE.Color.setStyle rendered as full accent, grid now clears the Shorts UI band, ptr pin moved inside its own cell (was landing on the next row's address), 5 hardcoded literals. edge-check 0.5% -> 0.0%. | 0913570 | 2026-07-27 |
| callstack | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| bits | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| browserframe | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| threads | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| cipher | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| circuit | 1 | Code | todo | 0 | – | – | – | – | – | CAPTURE CRASHES: hex.slice is not a function (painters/circuit.ts:197 passes 4 args to a 2-arg helper) — every frame errors |  |  |
| trafficflow | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| eventbus | 1 | Code | todo | 0 | – | – | – | – | – |  |  |  |
| chart | 1 | Charts | in-progress | 1 | 4 | 4 | 3 | 4 | 4 | Containment/typography already good (own CAPTION_SAFE_Y, 0% measured bleed). Fixed 5 hardcoded hex. HELD AT 3 ON MOTION: nothing but the title is solid for the whole first 500ms - grid/labels sit at ~15% opacity and no column appears. Partly a probe artifact (probe opens beat 0 at p=0.05 = 2.4s; engine opens it at t=0), so needs that ruled out before fixing. Suggested fix: absolute-time enterT entrance for the grid + ghost column sockets, the steps.ts idiom. | (uncommitted) | 2026-07-27 |
| table | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| timeline | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| ledger | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| sankey | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| gauge | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| pictogram | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| race | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| radar | 1 | Charts | todo | 0 | – | – | – | – | – | CAPTURE CRASHES: cy is not defined — every frame errors |  |  |
| buckets | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| basket | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| probability | 1 | Charts | todo | 0 | – | – | – | – | – |  |  |  |
| diagram | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| tree | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| mindmap | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| statemachine | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| cycle | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| chain | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| lifeline | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| geomap | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| layers | 1 | Diagrams | todo | 0 | – | – | – | – | – |  |  |  |
| orbit | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| schematic | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| terrain | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| zoomladder | 1 | STEM | in-progress | 1 | – | – | – | – | – | Edge bleed is INTENTIONAL (final rung is Earth filling the frame) - do not clamp. Real defect: the scale caption renders at y~1700, inside the Shorts UI band (>1440), so the label naming the rung is hidden on 9:16. Also a hard black box seam where the 3D rect starts. See qa/zoomladder/FINDINGS.md. |  | 2026-07-27 |
| bodymap | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| constellation | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| dayclock | 1 | STEM | todo | 0 | – | – | – | – | – | CAPTURE CRASHES: reading translate of undefined (painters/dayclock.ts:135,140 read .geometry off a THREE.Group) — every frame errors |  |  |
| geometry | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| numberline | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| molecule | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| formula | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| curves | 1 | STEM | todo | 0 | – | – | – | – | – |  |  |  |
| compare | 1 | Compare | todo | 0 | – | – | – | – | – |  |  |  |
| bracket | 1 | Compare | todo | 0 | – | – | – | – | – |  |  |  |
| showdown | 1 | Compare | in-progress | 1 | – | – | – | – | – | Side labels/scores/crown clipped off both edges at 9:16. Root cause identified: 2D pixel layout mapped linearly to world (spreadX 5.5) then projected back through a camera at (0,10,7) - does not round-trip, and 9:16 frustum halfW is only ~2.23. Needs a layout rework (derive spread from the camera), NOT a clamp. See qa/showdown/FINDINGS.md. |  | 2026-07-27 |
| skyline | 1 | Compare | todo | 0 | – | – | – | – | – |  |  |  |
| iso3d | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| decision | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| pipeline | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| graphwalk | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| matrix | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| queueflow | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| calendar | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| globe3d | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| dp_table_fill | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| sysarch | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| slidingwindow | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| trendgraph | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| topology | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| scroll | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| tactical_map | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| architecture_blueprint | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| packet_delivery | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| codediff | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| parliament_arc | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| server_rack | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| jigsaw_puzzle | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| domino_cascade | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| sheet_music | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| canvas_reveal | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| scalecompare | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| fluidflow | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| ecosystem_web | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| turing_tape | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| grid_flood | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| hash_ring | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| recursion_tree | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| token_exchange | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| coin_stack | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| btree_index | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| lsm_compaction | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| vdom_diff | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| flamegraph | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| event_loop | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| dom_event_flow | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| commit_dag | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| partitioned_log | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| container_sandbox | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| control_loop | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| telemetry_trace | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| spatial_index | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| object_heap | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| vector_space | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| neural_network | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| matrix_convolution | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
| consensus_quorum | 2 | Wave 2 | todo | 0 | – | – | – | – | – |  |  |  |
