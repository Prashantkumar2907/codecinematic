import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  shade,
  lerpColor,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BasketScene = Extract<Scene, { kind: "basket" }>;
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Ctx = { gIn: number; flash: number[] };

const RISE = 0.6;
/** Card thickness — a fixed, shallow WORLD depth for the bevel, same lesson as
 *  `circuit.ts`: never derive it from the pixel-mapping scale, or an off-centre
 *  card (whose viewing ray isn't square-on) shows a thick slab of side wall. */
const CARD_DEPTH = 0.16;
/** Cap on cell growth so a 2-item basket doesn't blow up into a billboard. */
const CELL_MAX_UNITS = 6.5;
const IDLE_FACE = shade(THEME.panel, 0.09);
const INK_PANEL = THEME.bgBottom;

export function paintBasket(ctx: CanvasRenderingContext2D, scene: BasketScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nYears = scene.years.length;
  const totalBeats = offset + nYears;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-bskt3d";

  const wholes = scene.items.every((it) => it.prices.every((p) => Number.isInteger(p)));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = wholes
      ? Math.round(v).toLocaleString(locale)
      : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${u}${body}`;
    return u ? `${body} ${u}` : body;
  };

  const yearRaw = active - offset;
  const ghost = yearRaw < 0;
  const yi = Math.min(Math.max(yearRaw, 0), nYears - 1);
  const t = ghost ? 0 : beatT(env.beats, offset + yi, totalBeats, env.p);
  const mv = ghost ? 0 : easeInOutCubic(clamp01(t / RISE));
  const priceOf = (it: BasketScene["items"][number]): number => {
    if (ghost || yi === 0) return it.prices[0];
    return it.prices[yi - 1] + (it.prices[yi] - it.prices[yi - 1]) * mv;
  };
  const roseOf = (it: BasketScene["items"][number]): boolean => !ghost && yi >= 1 && it.prices[yi] > it.prices[yi - 1];
  const liveBeat = !ghost && t < 1;
  /** Rise-then-settle pulse per item: 0 -> 1 by `t=RISE`, back to 0 by `t=RISE+0.3`.
   *  Drives emphasis by MAGNITUDE (lerp), never a boolean switch — a switch made
   *  any nonzero residual (down to a floating-point sliver right at t=1) render
   *  as the full warn colour, so a card stayed solid yellow for nearly the whole
   *  tail instead of fading back to idle. */
  const flashOf = (it: BasketScene["items"][number]): number =>
    roseOf(it) && liveBeat ? easeOutCubic(clamp01(t / RISE)) * (1 - clamp01((t - RISE) / 0.3)) : 0;

  const total = scene.items.reduce((s, it) => s + priceOf(it), 0);
  const base0 = scene.items.reduce((s, it) => s + it.prices[0], 0);
  const pctSince = base0 > 0 ? ((total - base0) / base0) * 100 : 0;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = contentH - band;

  const yearW = scene.years[yi].when;
  const prevWhen = !ghost && yi > 0 ? scene.years[yi - 1].when : null;
  const yearIn = ghost ? ghostIn : easeOutCubic(clamp01(t / 0.25));
  {
    const cxc = ax + aw / 2;
    const yb = ay + unit * 0.2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${unit * 1.9}px ${FONT_MONO}`;
    if (prevWhen && yearIn < 1) {
      ctx.globalAlpha = 0.2 * (1 - yearIn);
      ctx.fillStyle = THEME.text;
      ctx.fillText(prevWhen, cxc, yb + unit * 1.4 - unit * 0.8 * yearIn);
    }
    const pop = ghost ? 1 : 0.86 + 0.14 * easeOutBack(yearIn);
    ctx.globalAlpha = ghost ? 0.55 * ghostIn : 1;
    ctx.translate(cxc, yb + unit * 1.4);
    ctx.scale(pop, pop);
    ctx.translate(-cxc, -(yb + unit * 1.4));
    ctx.fillStyle = THEME.text;
    ctx.fillText(yearW, cxc, yb + unit * 1.4);
    ctx.textAlign = "start";
    ctx.restore();
  }
  const yearBandH = unit * 2.4;

  const totalBandH = unit * (vertical ? 4.0 : 3.6);
  const totalTop = ay + ah - totalBandH;

  const gridTop = ay + yearBandH + unit * 0.3;
  const gridH = totalTop - gridTop - unit * 0.4;
  const n = scene.items.length;
  const cols = Math.min(n, vertical ? 2 : 3);
  const rows = Math.ceil(n / cols);

  const rect = { x: ax, y: gridTop, w: aw, h: gridH };

  /**
   * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`: cards
   * sat on a ground plane at a fixed world spread (3.5-5.5 units) under a camera
   * elevated to (0,12,10), so how much of the frame they filled depended on that
   * plane's foreshortening, never on `rect` — a 2x2 basket rendered into a small
   * patch near the top of both aspects with dead space below. The grid is now
   * laid out in pixels first (cell pitch capped so a 2-item basket doesn't
   * become a billboard) and cards are mapped onto it via an on-axis camera +
   * `mappingAt`/`toWorld` (same technique as `table.ts`/`circuit.ts`).
   */
  const cellW = aw / cols;
  const cellH = Math.min(gridH / rows, unit * CELL_MAX_UNITS);
  const cellTop = gridTop + Math.max(0, (gridH - cellH * rows) / 2);
  const cellRect = (c: number, r: number): Rect => {
    const x = ax + c * cellW;
    const y = cellTop + r * cellH;
    return { x, y, w: cellW, h: cellH, cx: x + cellW / 2, cy: y + cellH / 2 };
  };
  const blockWpx = cellW * 0.72;
  /**
   * Explicit vertical stack within a cell — icon, then label, then the card,
   * then the price tag. Icon/label/tag are fixed sizes in `unit`s (they're
   * text/glyph chrome, not something that should balloon with the grid); the
   * card fills whatever is left, so it still grows to use a roomy cell. The
   * card used to be a thin ground-level slab (0.4 of a ~2.8-wide footprint) so
   * a label floating just above its centre never touched it; sized to
   * actually fill its cell, that same offset ran the label through its top.
   */
  const MIN_CARD = unit * 1.2;
  /** A dense grid (e.g. 4 items at 3 columns -> a sparse 2nd row on a 16:9 frame)
   *  can make `cellH` shorter than the fixed chrome needs — the zones shrink
   *  together rather than overflow into the next row down. */
  const zoneScale = Math.min(1, cellH / (unit * 1.5 + unit * 0.15 + unit * 1.0 + unit * 0.15 + unit * 1.35 + MIN_CARD));
  const ICON_ZONE = unit * 1.5 * zoneScale;
  const LABEL_ZONE = unit * 1.0 * zoneScale;
  const TAG_ZONE = unit * 1.35 * zoneScale;
  const ZONE_GAP = unit * 0.15 * zoneScale;
  const blockHpx = Math.max(MIN_CARD * zoneScale, cellH - ICON_ZONE - ZONE_GAP - LABEL_ZONE - ZONE_GAP - TAG_ZONE);
  const cellLayout = (cr: Rect) => {
    const cardTop = cr.y + ICON_ZONE + ZONE_GAP + LABEL_ZONE + ZONE_GAP;
    return {
      iconBaseline: cr.y + ICON_ZONE * 0.78,
      labelBaseline: cr.y + ICON_ZONE + ZONE_GAP + LABEL_ZONE * 0.72,
      cardCy: cardTop + blockHpx / 2,
      tagTop: cardTop + blockHpx + ZONE_GAP,
    };
  };

  /** Pixels-per-world-unit and pixel origin on the z=`z` plane, for a camera
   *  sitting ON-AXIS at (0,0,D) — exact, invertible pixel<->world map (same
   *  technique as `table.ts`/`circuit.ts`/`diagram.ts`). */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle<Ctx> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, CARD_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models = scene.items.map((it, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cr = cellRect(c, r);
      const g = makeBlock(blockWpx / m.sx, blockHpx / m.sy, CARD_DEPTH, IDLE_FACE, THEME.textDim);
      const w = toWorld(cr.cx, cellLayout(cr).cardCy);
      g.position.set(w.x, w.y, 0);
      s.add(g);
      return { mesh: g, item: it, idx: i, base: g.position.clone() };
    });

    const update = (elapsedMs: number, data?: Ctx) => {
      if (!data) return;
      const { gIn, flash } = data;
      models.forEach(({ mesh, idx, base }) => {
        mesh.visible = gIn > 0.01;
        const f = flash[idx] ?? 0;
        const bobPx = Math.sin(elapsedMs / 1200 + idx) * unit * 0.4;
        const popPx = f * unit * 3.0;
        const worldOffset = (bobPx + popPx) / m.sy;
        mesh.position.set(base.x, base.y + worldOffset, base.z);
        mesh.scale.setScalar(Math.max(0.001, 0.9 * gIn));

        mesh.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = gIn * 0.9;
            const face = lerpColor(IDLE_FACE, THEME.warn, f);
            mat.color.setStyle(face);
            mat.emissive.setStyle(face);
            mat.emissiveIntensity = 0.1 + 0.5 * f;
          }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const flashByIdx = scene.items.map((it) => flashOf(it));
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: ghostIn, flash: flashByIdx }, env);
  const flat = !cam;

  // Items overlays — drawn from the same pixel cell centers the 3D layer was
  // mapped onto, so the card and its icon/label/price tag can never drift apart.
  scene.items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rose = roseOf(it);
    const flash = flashByIdx[i];

    const cr = cellRect(col, row);
    const cl = cellLayout(cr);
    const bobPx = Math.sin(env.elapsedMs / 1200 + i) * unit * 0.4;
    const popPx = flash * unit * 3.0;
    const shiftPx = bobPx + popPx;

    ctx.save();
    ctx.globalAlpha = ghost ? 0.6 * ghostIn : ghostIn;

    if (flat) {
      roundRect(ctx, cr.cx - blockWpx / 2, cl.cardCy - shiftPx - blockHpx / 2, blockWpx, blockHpx, unit * 0.15);
      ctx.fillStyle = lerpColor(IDLE_FACE, THEME.warn, flash);
      ctx.fill();
      ctx.strokeStyle = THEME.textDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    const cxc = cr.cx;
    if (it.icon) {
      ctx.font = `${ICON_ZONE * 0.72}px ${FONT_SANS}`;
      ctx.fillText(it.icon, cxc, cl.iconBaseline - shiftPx);
    }
    const lpx = fitFontSize(ctx, it.label, { maxW: cellW * 0.8, startPx: unit * 0.66 * zoneScale, minPx: unit * 0.46, weight: 600 });
    ctx.font = `600 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(it.label, cxc, cl.labelBaseline - shiftPx);

    // Price tag pill — sized off `zoneScale` too, or a tight grid reserves a
    // shrunken `TAG_ZONE` but draws a full-size pill into it, overflowing into
    // the row below (the same fixed-vs-shrunk mismatch `TAG_ZONE` itself fixes).
    const priceTxt = fmt(priceOf(it));
    const tagPx = unit * (vertical ? 0.78 : 0.72) * zoneScale;
    ctx.font = `800 ${tagPx}px ${FONT_MONO}`;
    const arrow = rose ? " ↑" : "";
    const pw = ctx.measureText(priceTxt + arrow).width + unit * 0.8;
    const tagH = unit * 1.0 * zoneScale;
    const tagY = cl.tagTop - shiftPx;
    const tagColor = lerpColor(THEME.text, THEME.warn, flash);
    // `lerpColor` returns an `rgb()` string, which `rgba()`'s hex parser can't
    // read — alpha is ramped by re-declaring the colour with a trailing alpha.
    const borderColor = lerpColor(accent, THEME.warn, flash).replace("rgb(", "rgba(").replace(")", `, ${0.4 + 0.6 * flash})`);
    if (flash > 0) {
      ctx.shadowColor = rgba(THEME.warn, 0.6);
      ctx.shadowBlur = unit * 0.5 * flash;
    }
    roundRect(ctx, cxc - pw / 2, tagY, pw, tagH, unit * 0.28 * zoneScale);
    ctx.fillStyle = INK_PANEL;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tagColor;
    ctx.fillText(priceTxt, cxc - (arrow ? ctx.measureText(arrow).width / 2 : 0), tagY + tagH * 0.72);
    if (arrow) {
      ctx.fillStyle = THEME.warn;
      ctx.fillText(arrow, cxc + ctx.measureText(priceTxt).width / 2, tagY + tagH * 0.72);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // TOTAL
  ctx.save();
  ctx.globalAlpha = ghost ? 0.7 * ghostIn : 1;
  ctx.textAlign = "center";
  const cxc = ax + aw / 2;
  const labelY = totalTop + unit * 0.7;
  ctx.font = `700 ${unit * 0.66}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText("BASKET TOTAL", cxc, labelY);
  const totalTxt = fmt(total);
  const bigPx = fitFontSize(ctx, totalTxt, { maxW: aw * 0.7, startPx: unit * 1.4, minPx: unit * 0.95, weight: 800, family: FONT_MONO });
  ctx.font = `800 ${bigPx}px ${FONT_MONO}`;
  if (liveBeat) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.3 + 0.7 * idle(env, 1600));
  } else if (!ghost) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.2 + 0.3 * idle(env, 2800));
  }
  ctx.fillStyle = accent;
  const numBaseline = labelY + unit * 0.45 + bigPx;
  ctx.fillText(totalTxt, cxc, numBaseline);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (!ghost && yi >= 1) {
    const pctIn = easeOutCubic(clamp01(t / 0.4));
    ctx.save();
    ctx.globalAlpha = pctIn;
    ctx.font = `800 ${unit * 0.62}px ${FONT_MONO}`;
    const pctTxt = `+${pctSince.toFixed(pctSince >= 100 ? 0 : 1)}% since ${scene.years[0].when}`;
    const pw = ctx.measureText(pctTxt).width + unit * 0.9;
    const py = numBaseline + unit * 0.75;
    roundRect(ctx, cxc - pw / 2, py - unit * 0.5, pw, unit * 0.95, unit * 0.26);
    ctx.fillStyle = rgba(THEME.warn, 0.14);
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.warn, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(pctTxt, cxc, py + unit * 0.22);
    ctx.textAlign = "start";
    ctx.restore();
  }
  ctx.textAlign = "start";
}
