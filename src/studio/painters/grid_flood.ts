import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  clamp01,
  enterT,
  departT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  glowRing,
  smoothPulse,
  strokePolylineProgress,
  rgba,
  type Palette,
} from "./common";
import type { PaintEnv } from "./index";

type GridFloodScene = Extract<Scene, { kind: "grid_flood" }>;
type Visit = GridFloodScene["steps"][number]["visit"][number];

const GAP_UNIT = 0.22;
const MAX_CELL_UNIT = 3.0;

/** How long a cell has been discovered before it settles from "just arrived" to "steady". */
const APPEAR_WINDOW = 0.5;

/** Which group discovered a cell, and whether a second group later reached it too
 *  (the "confluence" cell — both Pacific and Atlantic drained here, or two BFS
 *  fronts met). `firstStep` is -1 for a pre-seeded `starts` cell so it renders
 *  immediately instead of waiting for a beat. */
type CellState = {
  groups: Set<number>;
  firstStep: number;
  idxInStep: number;
  countInStep: number;
};

/** Cycle the 4-colour family so up to 4 simultaneous traversal groups (islands,
 *  oceans, BFS fronts) stay visually distinct without a bespoke palette per scene. */
function groupColor(group: number, palette: Palette): string {
  switch (((group % 4) + 4) % 4) {
    case 1:
      return palette.secondary;
    case 2:
      return THEME.good;
    case 3:
      return THEME.warn;
    default:
      return palette.accent;
  }
}

/**
 * A grid-as-graph traversal: BFS ripples outward in simultaneous layers (flood
 * fill, Number of Islands) or DFS snakes a single path with a visible parent
 * chain (Pacific Atlantic's dual ocean crawl). `walls` are cells the traversal
 * can never enter; `starts` seed one or more fronts, each tagged with a `group`
 * so multiple simultaneous floods (separate islands, two oceans) read in their
 * own colour. A cell reached by two different groups is called out in gold —
 * the "both oceans touch this cell" moment. Works in 9:16 and 16:9 (grid fits
 * the content box, same technique as matrix.ts / dp_table_fill.ts).
 */
export function paintGridFlood(ctx: CanvasRenderingContext2D, scene: GridFloodScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, safeBottom } = layout;
  const { accent } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const introIn = easeOutCubic(enterT(env, 380)) * leave;
  const isDfs = scene.mode === "dfs";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  // Legend chips naming each traversal group (islands / oceans / fronts).
  let legendH = 0;
  let legendFont = unit * 0.55;
  if (scene.groups.length > 0) {
    legendH = unit * 1.3;
    for (; legendFont > unit * 0.32; legendFont -= unit * 0.05) {
      ctx.font = `700 ${legendFont}px ${FONT_SANS}`;
      const w =
        scene.groups.reduce((s, g) => s + ctx.measureText(g.label).width + unit * 1.5, 0) +
        (scene.groups.length - 1) * unit * 0.4;
      if (w <= contentW) break;
    }
  }

  const { rows, cols } = scene;
  const gap = unit * GAP_UNIT;
  const bottom = Math.min(contentY + contentH, safeBottom) - unit * 0.3;
  const availH = bottom - contentY - band - legendH;
  const cell = Math.max(
    unit * 0.7,
    Math.min((contentW - gap * (cols - 1)) / cols, (availH - gap * (rows - 1)) / rows, unit * MAX_CELL_UNIT)
  );
  const gridW = cols * cell + gap * (cols - 1);
  const gridH = rows * cell + gap * (rows - 1);
  const gridX = contentX + Math.max(0, (contentW - gridW) / 2);
  const gridY = contentY + band + legendH + Math.max(0, (availH - gridH) / 2);
  const cellX = (c: number) => gridX + c * (cell + gap);
  const cellY = (r: number) => gridY + r * (cell + gap);
  const centre = (r: number, c: number) => ({ x: cellX(c) + cell / 2, y: cellY(r) + cell / 2 });
  const radius = cell * 0.18;
  const inBounds = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;

  if (scene.groups.length > 0) {
    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.font = `700 ${legendFont}px ${FONT_SANS}`;
    const chipH = unit * 0.9;
    const chipY = contentY + band + (legendH - chipH) / 2;
    const chips = scene.groups.map((g, i) => ({ label: g.label, w: ctx.measureText(g.label).width + unit * 1.5, col: groupColor(i, env.palette) }));
    const totalW = chips.reduce((s, c) => s + c.w, 0) + (chips.length - 1) * unit * 0.4;
    let cx0 = contentX + Math.max(0, (contentW - totalW) / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    chips.forEach((c) => {
      roundRect(ctx, cx0, chipY, c.w, chipH, chipH / 2);
      ctx.fillStyle = rgba(c.col, 0.16);
      ctx.fill();
      ctx.strokeStyle = c.col;
      ctx.lineWidth = unit * 0.05;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.fillText(c.label, cx0 + c.w / 2, chipY + chipH / 2 + unit * 0.02);
      cx0 += c.w + unit * 0.4;
    });
    ctx.restore();
  }

  // Walls are impassable, so a malformed scene (a start/visit landing on one) must
  // never register as visited — guarded below wherever state is written.
  const wallSet = new Set(scene.walls.map((w) => `${w.r},${w.c}`));
  const valueMap = new Map<string, string>(scene.cells.map((c) => [`${c.r},${c.c}`, c.value]));

  const state = new Map<string, CellState>();
  scene.starts.forEach((s) => {
    if (!inBounds(s.r, s.c) || wallSet.has(`${s.r},${s.c}`)) return;
    const key = `${s.r},${s.c}`;
    if (!state.has(key)) state.set(key, { groups: new Set([s.group]), firstStep: -1, idxInStep: 0, countInStep: 1 });
  });
  for (let k = 0; k <= activeStep; k++) {
    const visits = scene.steps[k].visit;
    visits.forEach((v, i) => {
      if (!inBounds(v.r, v.c) || wallSet.has(`${v.r},${v.c}`)) return;
      const key = `${v.r},${v.c}`;
      const ex = state.get(key);
      if (!ex) state.set(key, { groups: new Set([v.group]), firstStep: k, idxInStep: i, countInStep: Math.max(visits.length, 1) });
      else ex.groups.add(v.group);
    });
  }

  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Static walls (blocked cells), inked once near scene start.
  scene.walls.forEach((w) => {
    if (!inBounds(w.r, w.c)) return;
    const wallIn = enterT(env, 260, 60 + (w.r + w.c) * 18);
    if (wallIn <= 0) return;
    const x = cellX(w.c);
    const y = cellY(w.r);
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(wallIn);
    roundRect(ctx, x, y, cell, cell, radius);
    ctx.fillStyle = "rgba(30,38,48,0.92)";
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, cell, cell, radius);
    ctx.clip();
    ctx.strokeStyle = rgba(THEME.textDim, 0.16);
    ctx.lineWidth = unit * 0.05;
    for (let d = -cell; d < cell * 2; d += cell * 0.3) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + cell, y + cell);
      ctx.stroke();
    }
    ctx.restore();
    roundRect(ctx, x, y, cell, cell, radius);
    ctx.strokeStyle = "rgba(100,112,128,0.55)";
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.restore();
  });

  // Open floor not yet reached: dashed ghost outline (whole grid shape reads at once).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (wallSet.has(key) || state.has(key)) continue;
      const ghostIn = enterT(env, 260, 80 + (r + c) * 22);
      if (ghostIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.14 * introIn * easeOutCubic(ghostIn);
      ctx.strokeStyle = rgba(THEME.textDim, 0.9);
      ctx.lineWidth = unit * 0.045;
      ctx.setLineDash([unit * 0.22, unit * 0.2]);
      roundRect(ctx, cellX(c), cellY(r), cell, cell, radius);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const val = valueMap.get(key);
      if (val) {
        ctx.save();
        ctx.globalAlpha = 0.26 * introIn * easeOutCubic(ghostIn);
        ctx.font = `700 ${Math.min(unit * 0.6, cell * 0.4)}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val, cellX(c) + cell / 2, cellY(r) + cell / 2);
        ctx.restore();
      }
    }
  }

  // DFS trail: earlier edges of the path, drawn faint underneath the cells.
  if (isDfs) {
    ctx.save();
    ctx.lineCap = "round";
    for (let k = 0; k < activeStep; k++) {
      scene.steps[k].visit.forEach((v) => {
        if (!v.from || !inBounds(v.r, v.c) || !inBounds(v.from.r, v.from.c)) return;
        const a = centre(v.from.r, v.from.c);
        const b = centre(v.r, v.c);
        ctx.globalAlpha = 0.32 * introIn;
        ctx.strokeStyle = groupColor(v.group, env.palette);
        ctx.lineWidth = unit * 0.05;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // Visited / just-flooded cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      const st = state.get(key);
      if (!st) continue;
      const isActiveWrite = st.firstStep === activeStep;
      const startAt = (st.idxInStep / st.countInStep) * APPEAR_WINDOW;
      const local = isActiveWrite ? clamp01((stepT - startAt) / APPEAR_WINDOW) : 1;
      if (local <= 0) continue;

      const confluence = st.groups.size > 1;
      const col = confluence ? THEME.warn : groupColor([...st.groups][0], env.palette);
      const appear = easeOutBack(local);
      const x = cellX(c);
      const y = cellY(r);
      const { x: cx, y: cy } = centre(r, c);
      const breathe = confluence
        ? 0.7 + 0.3 * idle(env, 1400 + (r * 13 + c) * 7)
        : isActiveWrite && local >= 1
          ? 0.75 + 0.25 * idle(env, 1500 + (r * 7 + c) * 11)
          : 1;

      ctx.save();
      ctx.globalAlpha = appear * introIn;
      if (isActiveWrite && local < 1) {
        ctx.shadowColor = rgba(col, 0.6);
        ctx.shadowBlur = unit * 0.8;
      }
      roundRect(ctx, x, y, cell, cell, radius);
      ctx.fillStyle = rgba(col, confluence ? 0.3 : 0.16);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isActiveWrite && local < 1) {
        roundRect(ctx, x, y, cell, cell, radius);
        ctx.globalAlpha = appear * introIn * (1 - local);
        ctx.fillStyle = rgba(col, 0.42);
        ctx.fill();
        ctx.globalAlpha = appear * introIn;
      }
      roundRect(ctx, x, y, cell, cell, radius);
      ctx.strokeStyle = col;
      ctx.globalAlpha = appear * introIn * breathe;
      ctx.lineWidth = unit * (confluence ? 0.12 : 0.08);
      ctx.stroke();

      const val = valueMap.get(key);
      if (val) {
        const pop = isActiveWrite ? easeOutBack(local) : 1;
        const fontPx = fitFontSize(ctx, val, {
          maxW: cell * 0.8,
          startPx: cell * 0.48,
          minPx: Math.min(unit * 0.65, cell * 0.4),
          weight: 800,
          family: FONT_MONO,
        });
        ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text;
        ctx.globalAlpha = appear * introIn;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val, cx, cy);
      }
      ctx.restore();

      // BFS ripple: a ring expanding out of a cell on the beat it was discovered.
      if (isActiveWrite && local < 1) {
        ctx.save();
        ctx.globalAlpha = introIn * (1 - local) * 0.85;
        ctx.strokeStyle = col;
        ctx.lineWidth = unit * 0.06;
        const ringSize = cell * (0.6 + local * 1.1);
        roundRect(ctx, cx - ringSize / 2, cy - ringSize / 2, ringSize, ringSize, radius);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // DFS: draw-on connecting line for the active step (the snake reaching its next cell).
  if (isDfs && activeStep >= 0) {
    const visits = scene.steps[activeStep].visit;
    const drawT = easeOutCubic(clamp01((stepT - 0.1) / 0.7));
    let head: Visit | undefined;
    visits.forEach((v, i) => {
      if (inBounds(v.r, v.c)) head = v;
      if (!v.from || !inBounds(v.r, v.c) || !inBounds(v.from.r, v.from.c)) return;
      const a = centre(v.from.r, v.from.c);
      const b = centre(v.r, v.c);
      const local = clamp01(drawT - i * 0.15);
      if (local <= 0) return;
      ctx.save();
      ctx.globalAlpha = introIn * (0.5 + 0.5 * local);
      ctx.strokeStyle = groupColor(v.group, env.palette);
      ctx.lineWidth = unit * 0.09;
      ctx.lineCap = "round";
      strokePolylineProgress(ctx, [a, b], local);
      ctx.restore();
    });
    // Current-position cursor: the tip of the DFS stack right now.
    if (head) {
      const { x, y } = centre(head.r, head.c);
      const pulse = smoothPulse(env, 900, 1.15);
      ctx.save();
      ctx.globalAlpha = introIn * 0.85;
      ctx.strokeStyle = groupColor(head.group, env.palette);
      ctx.lineWidth = unit * 0.07;
      roundRect(ctx, x - (cell * pulse) / 2, y - (cell * pulse) / 2, cell * pulse, cell * pulse, radius);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Seed markers for every front (shown from scene entrance, independent of beats).
  scene.starts.forEach((s) => {
    if (!inBounds(s.r, s.c)) return;
    const col = groupColor(s.group, env.palette);
    const { x, y } = centre(s.r, s.c);
    ctx.save();
    ctx.globalAlpha = introIn;
    glowRing(ctx, x, y, cell * 0.3, col, env, 1700 + s.group * 130);
    if (s.label) {
      ctx.font = `800 ${Math.min(unit * 0.55, cell * 0.34)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.label, x, y);
    }
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
