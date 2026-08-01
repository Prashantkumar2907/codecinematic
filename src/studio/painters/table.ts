import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  GLOW,
  STROKE,
  RADIUS,
  easeOutCubic,
  enterT,
  idle,
  lerpColor,
  shade,
  wrapText,
  roundRect,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type TableScene = Extract<Scene, { kind: "table" }>;
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GOOD = THEME.good;
/** No palette key expresses "worse than before"; `warn` is a caution yellow, not a
 *  regression red. Kept as a named constant rather than invented per call site. */
const DANGER = "#f87171";

const SLAB_DEPTH = 0.12;
const EDGE_OPACITY = 0.6;
const HEADER_TINT = 0.28;
const CURRENT_TINT = 0.22;
const HIGHLIGHT_TINT = 0.12;
const TONE_TINT = 0.3;
const IDLE_FACE_LIFT = 0.09;
const CELL_PAD_X = 0.16;
const CELL_PAD_Y = 0.14;
const ROW_MAX_UNITS = 3.2;
const PULSE_MS = 2400;

type CellState = {
  visible: boolean;
  cx: number;
  cy: number;
  w: number;
  h: number;
  scale: number;
  opacity: number;
  face: string;
  edge: string;
};

function diffTone(cell: string): "good" | "danger" | null {
  if (cell.startsWith("+")) return "good";
  if (cell.startsWith("-")) return "danger";
  return null;
}

export function paintTable(ctx: CanvasRenderingContext2D, scene: TableScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nRows = scene.rows.length;
  const nCols = scene.columns.length;
  const totalBeats = offset + nRows;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-tbl3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const availTop = contentY + band;
  const availH = Math.max(unit * 4, safeBottom - availTop - (scene.caption ? unit * 1.6 : 0));
  const rect = { x: contentX, y: availTop, w: contentW, h: availH };

  /**
   * The grid is laid out in PIXELS and the slabs are mapped onto it. World-space rows
   * spread over a fixed 9 units regardless of row count, so the blocks ended up a third
   * of their own row pitch with the text floating in the gap between them — and a bob
   * plus a per-state z-shift moved each slab after placement, which the 2D text (drawn
   * at z=0) could not follow. `qa/ledger.json` → systemic
   * `2d-layout-round-tripped-through-camera`.
   */
  const gridRows = nRows + 1; // header + body
  const rowH = Math.min(availH / gridRows, unit * ROW_MAX_UNITS);
  const gridTop = availTop + Math.max(0, (availH - rowH * gridRows) / 2);
  const colW = contentW / nCols;
  const padX = colW * CELL_PAD_X;
  const padY = rowH * CELL_PAD_Y;
  /** `r` is 0 for the header row, 1..nRows for the body. */
  const cellRect = (c: number, r: number): Rect => {
    const x = contentX + c * colW + padX / 2;
    const y = gridTop + r * rowH + padY / 2;
    const w = colW - padX;
    const h = rowH - padY;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  const frameIn = easeOutCubic(enterT(env, 380));
  const idleFace = shade(THEME.panel, IDLE_FACE_LIFT);

  const cells: { r: number; c: number; rect: Rect; state: CellState }[] = [];
  for (let c = 0; c < nCols; c++) {
    const r0 = cellRect(c, 0);
    cells.push({
      r: 0,
      c,
      rect: r0,
      state: {
        visible: frameIn > 0.01,
        cx: r0.cx,
        cy: r0.cy,
        w: r0.w,
        h: r0.h,
        scale: Math.max(0.001, frameIn),
        opacity: frameIn,
        face: lerpColor(THEME.panel, secondary, HEADER_TINT),
        edge: secondary,
      },
    });
  }
  for (let r = 0; r < nRows; r++) {
    const beatIdx = offset + r;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    const appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
    const isCurrent = active === beatIdx;
    const isHighlighted = scene.rows[r].highlight;
    for (let c = 0; c < nCols; c++) {
      const rc = cellRect(c, r + 1);
      const tone = diffTone(scene.rows[r].cells[c] ?? "");
      const face =
        tone === "good"
          ? lerpColor(THEME.panel, GOOD, TONE_TINT)
          : tone === "danger"
            ? lerpColor(THEME.panel, DANGER, TONE_TINT)
            : isCurrent
              ? lerpColor(THEME.panel, accent, CURRENT_TINT)
              : isHighlighted
                ? lerpColor(THEME.panel, accent, HIGHLIGHT_TINT)
                : idleFace;
      cells.push({
        r: r + 1,
        c,
        rect: rc,
        state: {
          visible: appear > 0.01,
          cx: rc.cx,
          cy: rc.cy,
          w: rc.w,
          h: rc.h,
          scale: Math.max(0.001, appear),
          opacity: appear,
          face,
          edge: tone === "good" ? GOOD : tone === "danger" ? DANGER : isCurrent || isHighlighted ? accent : THEME.textDim,
        },
      });
    }
  }

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  // Cell state travels through render3D's `context`: `update` used to read `active` from
  // this scope, which `build`'s closure captures on frame 0, so the current-row
  // highlight never moved for the whole scene.
  const build = (): ThreeBundle<{ cells: CellState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models = cells.map(() => {
      const g = makeBlock(1, 1, SLAB_DEPTH, THEME.panel, THEME.textDim);
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data?: { cells: CellState[] }) => {
      models.forEach((group, i) => {
        const st = data?.cells[i];
        group.visible = !!st?.visible;
        if (!st?.visible) return;
        const c = toWorld(st.cx, st.cy);
        group.position.set(c.x, c.y, 0);
        group.scale.set((st.w / m.sx) * st.scale, (st.h / m.sy) * st.scale, 1);
        group.traverse((o) => {
          if (o instanceof THREE.LineSegments) {
            const mat = o.material as THREE.LineBasicMaterial;
            mat.transparent = true;
            mat.opacity = EDGE_OPACITY * st.opacity;
            mat.color.set(st.edge);
          } else if (o instanceof THREE.Mesh) {
            const mat = o.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = st.opacity;
            mat.color.set(st.face);
            mat.emissive.set(st.face);
          }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { cells: cells.map((c) => c.state) }, env);
  const flat = !cam;

  // Text is fitted to the cell it is drawn in. It used to be fitted to
  // `contentW / nCols * 0.9`, which is wider than the cell, so long values ran past
  // their own block and off the content edge ("Object.prototype").
  const baseCellPx = unit * (vertical ? 0.85 : 0.78);
  const fitCell = (text: string, maxW: number, mono: boolean) => {
    let px = baseCellPx;
    const font = (p: number) => (mono ? `${p}px ${FONT_MONO}` : `700 ${p}px ${FONT_SANS}`);
    ctx.font = font(px);
    while (ctx.measureText(text).width > maxW && px > unit * 0.5) {
      px -= 1;
      ctx.font = font(px);
    }
    return px;
  };

  cells.forEach(({ r, c, rect: cr, state }) => {
    if (!state.visible) return;
    const isHeader = r === 0;
    const rowIdx = r - 1;
    const text = isHeader ? scene.columns[c] : (scene.rows[rowIdx].cells[c] ?? "");
    const tone = isHeader ? null : diffTone(text);
    const isCurrent = !isHeader && active === offset + rowIdx;
    const isHighlighted = !isHeader && scene.rows[rowIdx].highlight;

    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.translate(cr.cx, cr.cy);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-cr.cx, -cr.cy);

    if (flat) {
      roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * RADIUS.sm);
      ctx.fillStyle = state.face;
      ctx.fill();
    }
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * GLOW.base * (0.7 + 0.3 * idle(env, PULSE_MS));
      roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * RADIUS.sm);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * STROKE.base;
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    const px = fitCell(text, cr.w - unit * 0.5, !isHeader);
    ctx.font = isHeader ? `700 ${px}px ${FONT_SANS}` : `${px}px ${FONT_MONO}`;
    ctx.fillStyle = isHeader
      ? THEME.text
      : tone === "good"
        ? GOOD
        : tone === "danger"
          ? DANGER
          : isHighlighted || isCurrent
            ? THEME.text
            : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(text, cr.cx, cr.cy + px * 0.35);
    ctx.textAlign = "start";
    ctx.restore();
  });

  if (scene.caption) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(enterT(env, 420, 650));
    ctx.font = `500 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    const cap = wrapText(ctx, scene.caption, contentW * 0.9)[0] ?? scene.caption;
    ctx.fillText(cap, contentX + contentW / 2, gridTop + rowH * gridRows + unit * 1.1);
    ctx.restore();
  }
  ctx.textAlign = "start";
}
