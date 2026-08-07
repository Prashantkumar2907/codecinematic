# Caption-band (safe-area) audit

Automated measurement of content drawn BELOW `layout.safeBottom` — the band holding the
burned-in karaoke caption and the YouTube UI. See `scripts/safe-check.mjs`.

**This is not the same check as `qa/AUDIT.md`.** Edge-bleed samples a 3px ring at the frame
edge, so content can sit fully inside the frame and still be drawn under the caption; four
kinds did exactly that while edge-bleed read 0.0%. A row here means painted content crossed
`safeBottom` at one or more sampled progress values.

**43 of 222 kind/aspect combinations intrude into the caption band.**

| kind | aspect | lowest row | safeBottom | over by | % of band | worst p |
|---|---|---|---|---|---|---|
| stat | short | 1663 | 1321.5 | **341.5px** | 8.25% | 0.93 |
| bigtext | short | 1619 | 1321.5 | **297.5px** | 2.96% | 0.85 |
| dayclock | short | 1543 | 1321.5 | **221.5px** | 1.23% | 0.4 |
| bigtext | long | 1079 | 863.1 | **215.9px** | 1.24% | 0.06 |
| dayclock | long | 1079 | 863.1 | **215.9px** | 1.09% | 0.4 |
| stat | long | 1060 | 863.1 | **196.9px** | 3.70% | 0.93 |
| vocab | long | 1006 | 863.1 | **142.9px** | 55.42% | 0.93 |
| timeline | long | 994 | 863.1 | **130.9px** | 1.55% | 0.85 |
| domino_cascade | short | 1452 | 1321.5 | **130.5px** | 0.94% | 0.93 |
| question | short | 1444 | 1321.5 | **122.5px** | 9.22% | 0.675 |
| vocab | short | 1421 | 1321.5 | **99.5px** | 13.65% | 0.85 |
| quote | short | 1417 | 1321.5 | **95.5px** | 14.76% | 0.93 |
| iso3d | long | 944 | 863.1 | **80.9px** | 0.94% | 0.93 |
| fluidflow | short | 1391 | 1321.5 | **69.5px** | 0.01% | 0.75 |
| fluidflow | long | 926 | 863.1 | **62.9px** | 0.04% | 0.75 |
| cipher | long | 925 | 863.1 | **61.9px** | 0.49% | 0.85 |
| vdom_diff | long | 909 | 863.1 | **45.9px** | 0.51% | 0.5 |
| question | long | 905 | 863.1 | **41.9px** | 6.29% | 0.675 |
| vector_space | long | 904 | 863.1 | **40.9px** | 0.39% | 0.02 |
| probability | short | 1359 | 1321.5 | **37.5px** | 0.96% | 0.75 |
| matrix | long | 884 | 863.1 | **20.9px** | 0.15% | 0.75 |
| dp_table_fill | long | 883 | 863.1 | **19.9px** | 0.19% | 0.85 |
| vector_space | short | 1338 | 1321.5 | **16.5px** | 0.19% | 0.4 |
| object_heap | short | 1336 | 1321.5 | **14.5px** | 0.46% | 0.93 |
| scalecompare | long | 874 | 863.1 | **10.9px** | 0.46% | 0.85 |
| statemachine | short | 1332 | 1321.5 | **10.5px** | 0.06% | 0.6 |
| object_heap | long | 873 | 863.1 | **9.9px** | 0.37% | 0.93 |
| threads | long | 871 | 863.1 | **7.9px** | 0.52% | 0.4 |
| btree_index | long | 871 | 863.1 | **7.9px** | 0.80% | 1 |
| btree_index | short | 1329 | 1321.5 | **7.5px** | 0.52% | 1 |
| basket | long | 869 | 863.1 | **5.9px** | 0.08% | 0.6 |
| vdom_diff | short | 1327 | 1321.5 | **5.5px** | 0.18% | 0.5 |
| consensus_quorum | short | 1327 | 1321.5 | **5.5px** | 0.04% | 0.4 |
| consensus_quorum | long | 868 | 863.1 | **4.9px** | 0.02% | 0.4 |
| cycle | long | 866 | 863.1 | **2.9px** | 0.02% | 0.6 |
| architecture_blueprint | short | 1324 | 1321.5 | **2.5px** | 0.37% | 0.5 |
| architecture_blueprint | long | 865 | 863.1 | **1.9px** | 0.72% | 0.5 |
| recursion_tree | long | 865 | 863.1 | **1.9px** | 0.41% | 0.75 |
| telemetry_trace | short | 1323 | 1321.5 | **1.5px** | 0.44% | 1 |
| grid_flood | long | 864 | 863.1 | **0.9px** | 0.05% | 0.93 |
| telemetry_trace | long | 864 | 863.1 | **0.9px** | 0.85% | 0.93 |
| spatial_index | long | 864 | 863.1 | **0.9px** | 0.27% | 0.3 |
| pipeline | short | 1322 | 1321.5 | **0.5px** | 0.00% | 0.02 |

## Clear, but by less than 12px

| kind | aspect | clearance |
|---|---|---|
| trace | long | 0.1px |
| iso3d | short | 0.5px |
| zoomladder | short | 0.5px |
| matrix | short | 0.5px |
| bodymap | short | 0.5px |
