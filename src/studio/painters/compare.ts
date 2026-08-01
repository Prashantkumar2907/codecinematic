import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  GLOW,
  STROKE,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  lerpColor,
  shade,
  wrapText,
  roundRect,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
  variantOf,
} from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type CompareScene = Extract<Scene, { kind: "compare" }>;

const DIM_ALPHA = 0.85;

/**
 * The camera is on-axis, so `projectToRect` is affine on a z=const plane and the
 * slabs can be sized and placed FROM the panel rects. They used to be sized from
 * world literals (`spreadX * 1.5`) against panels laid out in pixels, which put
 * the 2D chrome ~85 px off the slab it belongs to — `qa/ledger.json` → systemic
 * `2d-layout-round-tripped-through-camera`. Nothing may move a slab after
 * placement; the pixel chrome cannot follow it.
 */
const SLAB_DEPTH = 0.12;
const EDGE_OPACITY = 0.6;
const FACE_TINT = 0.2;
/** `THEME.panel` is within 4 RGB steps of the background; lift an idle panel off it. */
const IDLE_FACE_LIFT = 0.09;

const PANEL_RADIUS_UNITS = 0.7;
const BAR_H_UNITS = 0.34;
const PULSE_MS = 1600;
const ITEM_LINE_UNITS = 1.35;
const ITEM_GAP_UNITS = 0.7;
/**
 * Header zone: the icon and the side title share one line, both fixed-size, so this
 * never scales. 3.4 reserved half a line more than the title occupies, which is the
 * difference between fitting four items in a 9:16 panel and dropping one.
 */
const ITEMS_TOP_UNITS = 2.8;
const ITEM_TAIL_UNITS = 0.4;
const ITEM_FONT_UNITS = 0.95;
const ITEM_MAX_LINES = 2;
/**
 * Floor on the item-block squeeze. 9:16 reserves 30% of the frame for the caption and
 * the YouTube UI, so the schema's maximum of four items per side does not fit two
 * stacked panels at full size — they have to shrink. Dropping one instead is worse:
 * the narration still says it. 0.72 keeps the item font at ~31 px on a 1080-wide
 * frame, which is the smallest that stays legible at phone size.
 */
const ITEM_FIT_MIN = 0.72;

type PanelState = {
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

export function paintCompare(ctx: CanvasRenderingContext2D, scene: CompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + 2 + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const verdictBeat = scene.sayVerdict ? offset + 2 : -1;
  /**
   * Two layouts, not three. The third was "stacked at 16:9", which gives each panel
   * ~180 px of height — less than the 153 px header needs before a single item is
   * drawn, so every item was silently dropped. It had never been rendered, because
   * both compare fixtures hashed to variant 0. A wide stacked panel would need its
   * own layout (title left, items in a row); until that exists, 16:9 always compares
   * side by side and `divider` is the variety.
   */
  const variant = variantOf(scene.id, 2);
  const divider = !vertical && variant === 1;
  const key = scene.id + "-comp3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true });
  const panelsTop = contentY + band + unit * 0.3;
  // 4.0 clears a two-line verdict box exactly (baseline at safeBottom - 1.1u, box top
  // at baseline - 3.84u). 16:9 reserved 3.2 and would have clipped the second line.
  const verdictBand = scene.verdict ? unit * 4.0 : unit * 0.5;
  const gap = unit * (vertical ? 1.6 : 2.2);

  const stacked = vertical;
  const pw = stacked ? contentW : (contentW - gap) / 2;
  // The band ends at safeBottom, never at contentH: the verdict was landing at 86%
  // of frame height in 9:16 and 90% in 16:9, i.e. under the burned-in caption.
  const availH = Math.max(unit * 4, safeBottom - panelsTop - verdictBand);

  /** Height of the item block alone, at full size — the part that can be squeezed. */
  const itemsH = (items: string[]): number => {
    ctx.font = `500 ${unit * ITEM_FONT_UNITS}px ${FONT_SANS}`;
    let h = 0;
    for (const item of items) {
      const lines = Math.min(wrapText(ctx, item, pw - unit * 2.8).length, ITEM_MAX_LINES);
      h += unit * ITEM_LINE_UNITS * lines + unit * ITEM_GAP_UNITS;
    }
    return h + unit * ITEM_TAIL_UNITS;
  };

  // Height comes from the content in BOTH layouts. Side-by-side used to take the
  // whole band whatever it held, leaving ~40% of each panel empty.
  const items = Math.max(itemsH(scene.left.items), itemsH(scene.right.items));
  const need = unit * ITEMS_TOP_UNITS + items;
  const ph = stacked ? Math.min(need, (availH - gap) / 2) : Math.min(need, availH);
  const blockH = stacked ? ph * 2 + gap : ph;
  const blockTop = panelsTop + Math.max(0, (availH - blockH) / 2);
  const fit = Math.max(ITEM_FIT_MIN, Math.min(1, (ph - unit * ITEMS_TOP_UNITS) / items));

  const rect = { x: contentX, y: blockTop, w: contentW, h: blockH };

  const panels = [
    { side: scene.left, x: contentX, y: blockTop, dir: -1, color: accent, glow: accentGlow, beatIdx: offset },
    {
      side: scene.right,
      x: stacked ? contentX : contentX + pw + gap,
      // Both sides read from blockTop. The right panel used to read panelsTop, which
      // only agreed with the left while the pair was not centred in the band.
      y: stacked ? blockTop + ph + gap : blockTop,
      dir: 1,
      color: secondary,
      glow: secondaryGlow,
      beatIdx: offset + 1,
    },
  ];

  // One derivation of every per-frame value, shared by the slab and its chrome, so
  // the two cannot drift apart the way the world literals did.
  const states = panels.map(({ x, y, dir, color, beatIdx }) => {
    const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
    const appear = easeOutCubic(Math.min(1, bt * 2.5));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent || (active >= verdictBeat && verdictBeat > 0) ? 1 : active > beatIdx ? DIM_ALPHA : 1;
    const scale = 0.95 + 0.05 * easeOutBack(Math.min(1, bt * 2.5));
    const slidePx = dir * (1 - appear) * unit * 1.6;
    return {
      bt,
      appear,
      isCurrent,
      alpha,
      scale,
      slidePx,
      visible: bt > 0,
      cx: x + pw / 2 + slidePx * scale,
      cy: y + ph / 2,
      w: pw,
      h: ph,
      opacity: appear * alpha,
      face: isCurrent ? lerpColor(THEME.panel, color, FACE_TINT) : shade(THEME.panel, IDLE_FACE_LIFT),
      edge: color,
    };
  });

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  // Per-panel state travels through render3D's `context`: `build` runs once per key,
  // so `update` reading `active` from this scope froze the dim/highlight state at
  // frame 0 (`qa/ledger.json` → systemic `frozen-painter-local-output-array`).
  const build = (): ThreeBundle<{ panels: PanelState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 14 : 11);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    // Unit slabs scaled per frame from the panel rect, so a layout change needs no
    // rebuild and the slab is always exactly the panel.
    const models = [0, 1].map(() => {
      const g = makeBlock(1, 1, SLAB_DEPTH, THEME.panel, THEME.textDim);
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data?: { panels: PanelState[] }) => {
      const gIn = easeOutCubic(enterT(env, 600));
      models.forEach((group, i) => {
        const st = data?.panels[i];
        group.visible = !!st?.visible && gIn > 0;
        if (!st?.visible) return;
        const c = toWorld(st.cx, st.cy);
        group.position.set(c.x, c.y, 0);
        group.scale.set((st.w / m.sx) * st.scale, (st.h / m.sy) * st.scale, 1);
        group.traverse((o) => {
          if (o instanceof THREE.LineSegments) {
            const mat = o.material as THREE.LineBasicMaterial;
            mat.transparent = true;
            mat.opacity = EDGE_OPACITY * st.opacity * gIn;
            mat.color.set(st.edge);
          } else if (o instanceof THREE.Mesh) {
            const mat = o.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = st.opacity * gIn;
            mat.color.set(st.face);
            mat.emissive.set(st.face);
          }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { panels: states }, env);
  // Without WebGL the slabs never composite. The panel rects are pixel-space either
  // way, so fill the body in 2D rather than returning an empty scene.
  const flat = !cam;

  panels.forEach(({ side, x, y, dir, color, glow }, idx) => {
    const st = states[idx];
    if (!st.visible) {
      const ghostIn = easeOutCubic(enterT(env, 400));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18 * ghostIn;
        if (!divider) {
          roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
          ctx.strokeStyle = color;
          ctx.lineWidth = unit * STROKE.thin;
          ctx.setLineDash([unit * 0.35, unit * 0.3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
        ctx.fillStyle = color;
        ctx.fillText(side.title, x + unit, y + unit * 1.5);
        ctx.restore();
      }
      return;
    }

    ctx.save();
    ctx.globalAlpha = st.opacity;
    // Identical to the transform fed to the slab: scale about the panel centre, then
    // the entrance slide, so the two stay locked together frame for frame.
    ctx.translate(x + pw / 2 + st.slidePx * st.scale, y + ph / 2);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-(x + pw / 2), -(y + ph / 2));

    if (flat) {
      roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
      ctx.fillStyle = st.face;
      ctx.fill();
    }

    ctx.fillStyle = color;
    if (divider) {
      roundRect(ctx, x, y, unit * 3, unit * 0.26, unit * 0.13);
      ctx.fill();
    } else {
      // The active side gets a real highlight. The glow used to be set and then
      // zeroed on the next line, so `isCurrent` had no visual effect at all.
      if (st.isCurrent) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = unit * GLOW.base * (0.8 + 0.3 * idle(env, PULSE_MS));
      }
      roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
      ctx.strokeStyle = rgba(color, st.isCurrent ? 0.9 : 0.35);
      ctx.lineWidth = unit * (st.isCurrent ? STROKE.base : STROKE.thin);
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.save();
      roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, pw, unit * BAR_H_UNITS);
      ctx.restore();
    }

    let titleX = x + unit * 1.0;
    if (side.icon) {
      const iconPop = easeOutBack(clamp01((st.bt - 0.1) * 3));
      const popS = Math.max(0, iconPop);

      if (isVectorIcon(side.icon)) {
        const iconS = unit * 1.5;
        ctx.save();
        ctx.translate(titleX + iconS / 2, y + unit * 1.1);
        ctx.scale(popS, popS);
        drawIcon(ctx, side.icon, 0, 0, iconS, env, color);
        ctx.restore();
        titleX += iconS + unit * 0.4;
      } else {
        ctx.font = `${unit * 1.3}px ${FONT_SANS}`;
        const tW = ctx.measureText(side.icon).width;
        ctx.save();
        ctx.translate(titleX + tW / 2, y + unit * 1.15);
        ctx.scale(popS, popS);
        ctx.fillText(side.icon, -tW / 2, unit * 0.45);
        ctx.restore();
        titleX += tW + unit * 0.45;
      }
    }
    ctx.font = `800 ${unit * 1.15}px ${FONT_SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(side.title, titleX, y + unit * 1.6);

    const itemFont = unit * ITEM_FONT_UNITS * fit;
    const itemLineH = unit * ITEM_LINE_UNITS * fit;
    ctx.font = `500 ${itemFont}px ${FONT_SANS}`;
    let iy = y + unit * ITEMS_TOP_UNITS;
    const itemsBottom = y + ph - unit * 0.5;
    side.items.forEach((item, i) => {
      const it = clamp01(st.bt * side.items.length - i * 0.5);
      if (it <= 0) return;
      const lines = wrapText(ctx, item, pw - unit * 2.8).slice(0, ITEM_MAX_LINES);
      // Last resort only: `fit` is floored, so an extreme list can still outrun the
      // panel. Stopping at the edge beats spilling past it.
      if (iy + itemLineH * (lines.length - 1) > itemsBottom) return;
      const ease = easeOutCubic(it);
      const slide = (1 - ease) * unit * 1.4 * dir;
      const pop = easeOutBack(clamp01(it * 1.6));
      const lift = (1 - pop) * unit * 0.8;

      ctx.save();
      ctx.translate(slide, lift);
      ctx.globalAlpha = st.opacity * ease;
      const popSize = Math.max(0.01, pop);
      const bx = x + unit * 1.2;
      const by = iy - unit * 0.32;

      ctx.fillStyle = rgba(color, 0.25);
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.26 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.14 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.text;
      lines.forEach((line, li) => ctx.fillText(line, x + unit * 1.9, iy + li * itemLineH));
      ctx.restore();
      iy += itemLineH * lines.length + unit * ITEM_GAP_UNITS * fit;
    });
    ctx.restore();
  });

  if (divider) {
    const dx = contentX + pw + gap / 2;
    const dIn = easeOutCubic(enterT(env, 500));
    ctx.save();

    const spineGrad = ctx.createLinearGradient(dx, blockTop, dx, blockTop + ph);
    spineGrad.addColorStop(0, rgba(accent, 0.8));
    spineGrad.addColorStop(0.5, rgba(secondary, 0.8));
    spineGrad.addColorStop(1, rgba(accent, 0.1));

    ctx.strokeStyle = spineGrad;
    ctx.lineWidth = unit * 0.12;
    ctx.setLineDash([unit * 0.5, unit * 0.4]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(dx, blockTop);
    ctx.lineTo(dx, blockTop + ph * dIn);
    ctx.stroke();
    ctx.restore();
  }

  const rightWin = beatWindow(env.beats, offset + 1, totalBeats);
  const vsIn = easeOutBack(sub(env.p, rightWin.start, 0.1));
  if (vsIn > 0) {
    const vx = stacked ? contentX + contentW / 2 : contentX + pw + gap / 2;
    const vy = stacked ? blockTop + ph + gap / 2 : blockTop + ph / 2;
    const vsPulse = 1 + 0.05 * Math.sin(idle(env, 1900) * Math.PI * 2);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vsIn * vsPulse, vsIn * vsPulse);

    const badgeGrad = ctx.createLinearGradient(0, -unit * 1.05, 0, unit * 1.05);
    badgeGrad.addColorStop(0, rgba(accent, 0.25));
    badgeGrad.addColorStop(1, shade(THEME.panel, -0.4));

    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.8 + 0.4 * Math.sin(idle(env, 2100) * Math.PI));
    ctx.beginPath();
    ctx.arc(0, 0, unit * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();

    ctx.font = `900 italic ${unit * 0.75}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, unit * 0.26);
    ctx.restore();
  }

  if (scene.verdict) {
    const t = scene.sayVerdict
      ? easeOutCubic(Math.min(1, beatT(env.beats, verdictBeat, totalBeats, env.p) * 3))
      : easeOutCubic(sub(env.p, 0.78, 0.15));
    if (t > 0) {
      const vPop = easeOutBack(t);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;

      // Last baseline sits a chip-height above safeBottom, so the box clears the
      // caption band it used to be drawn inside.
      const ty = safeBottom - unit * 1.1;
      const lines = wrapText(ctx, scene.verdict, contentW * 0.9);
      const lineH = unit * 1.3;
      const totalH = lines.length * lineH;
      const startY = ty - (lines.length - 1) * lineH;

      ctx.translate(w / 2, startY + totalH / 2 - lineH * 0.4);
      ctx.scale(0.85 + 0.15 * vPop, 0.85 + 0.15 * vPop);
      ctx.translate(-w / 2, -(startY + totalH / 2 - lineH * 0.4));

      // The tick belongs to the verdict, not to each line of it: prefixing every line
      // put a second ✓ in front of the wrapped remainder and widened the box to match.
      const label = (line: string, i: number) => (i === 0 ? `✓ ${line}` : line);
      const maxW = Math.max(...lines.map((l, i) => ctx.measureText(label(l, i)).width));
      const padX = unit * 1.5;
      const padY = unit * 0.8;

      ctx.fillStyle = rgba(THEME.good, 0.1);
      ctx.strokeStyle = rgba(THEME.good, 0.3);
      ctx.lineWidth = unit * STROKE.thin;
      roundRect(ctx, w / 2 - maxW / 2 - padX, startY - lineH * 0.8 - padY / 2, maxW + padX * 2, totalH + padY * 1.5, unit * 0.8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = THEME.good;
      ctx.shadowColor = rgba(THEME.good, 0.5);
      ctx.shadowBlur = unit * (0.2 + 0.4 * idle(env, 2400));
      lines.forEach((line, i) => ctx.fillText(label(line, i), w / 2, startY + i * lineH));
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
