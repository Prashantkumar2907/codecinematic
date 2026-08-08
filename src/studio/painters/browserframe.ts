import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  enterT,
  clamp01,
  roundRect,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
  type Palette,
  shade,
  STROKE,
  lerpColor,
  departT,
  applyElevation,
  clearShadow,
} from "./common";
import type { PaintEnv } from "./index";

type BrowserframeScene = Extract<Scene, { kind: "browserframe" }>;
type BlockRole = BrowserframeScene["blocks"][number]["role"];
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;
const CARET_MS = 530;
/**
 * Rows the page's blocks actually occupy drive the vertical mapping, not the full 12.
 * Every block y/h was divided by GRID, so a page ending at row 6 — which the demo does,
 * and which is typical — left the bottom HALF of the browser window empty below its own
 * content. Horizontal still divides by GRID: a page is as wide as the window.
 */
const MIN_ROWS = 5;
/** Fraction of the window rect the page content occupies. */
const WINDOW_FILL = 0.92;
const BOB_UNITS = 0.12;

/** Opaque fill for a block, tinted by role. */
function roleFace(role: BlockRole, palette: Palette): string {
  switch (role) {
    case "hero":
    case "card":
      return lerpColor(THEME.panel, palette.accent, 0.14);
    case "image":
      return lerpColor(THEME.panel, palette.secondary, 0.14);
    case "header":
    case "button":
      return lerpColor(THEME.panel, palette.accent, 0.2);
    case "text":
      return shade(THEME.panel, 0.09);
  }
}

function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  role: BlockRole,
  r: Rect,
  unit: number,
  painted: boolean,
  elapsedMs: number,
  palette: Palette
) {
  const ink = painted ? THEME.textDim : THEME.textFaint;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(unit * 0.06, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const dash = (x: number, y: number, w: number, h: number) => {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
  };
  const dh = Math.max(Math.min(unit * 0.16, r.h * 0.08), 2);

  switch (role) {
    case "header": {
      const dr = Math.min(r.h * 0.22, unit * 0.28);
      ctx.beginPath();
      ctx.arc(r.x + Math.min(r.h * 0.6, unit), r.cy, dr, 0, Math.PI * 2);
      ctx.fill();
      const navW = Math.min(unit * 0.9, r.w * 0.08);
      for (let i = 0; i < 3; i++) {
        dash(r.x + r.w - (3 - i) * (navW + unit * 0.3), r.cy - dh / 2, navW, dh);
      }
      break;
    }
    case "hero": {
      dash(r.x + r.w * 0.08, r.y + r.h * 0.28, r.w * 0.55, dh * 1.3);
      dash(r.x + r.w * 0.08, r.y + r.h * 0.45, r.w * 0.38, dh);
      const pw = Math.min(unit * 2.4, r.w * 0.3);
      const ph = Math.min(unit * 0.75, r.h * 0.2);
      const pcx = r.x + r.w * 0.08 + pw / 2;
      const pcy = r.y + r.h * 0.68 + ph / 2;
      const scale = painted ? 1 + 0.05 * Math.sin(elapsedMs / 450) : 1;
      ctx.save();
      ctx.translate(pcx, pcy);
      ctx.scale(scale, scale);
      ctx.translate(-pcx, -pcy);
      roundRect(ctx, pcx - pw / 2, pcy - ph / 2, pw, ph, ph / 2);
      if (painted) {
        ctx.fillStyle = palette.accent;
        ctx.fill();
      } else {
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case "text": {
      const widths = [0.92, 0.78, 0.85, 0.55];
      const count = r.h > unit * 2.5 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const y = r.y + r.h * ((i + 1) / (count + 1)) - dh / 2;
        dash(r.x + r.w * 0.06, y, r.w * 0.88 * widths[i], dh);
      }
      break;
    }
    case "image": {
      const baseY = r.y + r.h * 0.78;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.1, baseY);
      ctx.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.32);
      ctx.lineTo(r.x + r.w * 0.58, baseY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.46, baseY);
      ctx.lineTo(r.x + r.w * 0.68, r.y + r.h * 0.48);
      ctx.lineTo(r.x + r.w * 0.9, baseY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.78, r.y + r.h * 0.24, Math.min(unit * 0.24, r.h * 0.12), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "button": {
      const bw = Math.min(r.w * 0.72, unit * 3);
      const bh = Math.min(r.h * 0.6, unit * 1.1);
      roundRect(ctx, r.cx - bw / 2, r.cy - bh / 2, bw, bh, bh / 2);
      if (painted) {
        ctx.fillStyle = palette.accent;
        ctx.fill();
        ctx.fillStyle = shade(THEME.panel, -0.35);
      } else {
        ctx.stroke();
      }
      dash(r.cx - bw * 0.22, r.cy - dh / 2, bw * 0.44, dh);
      break;
    }
    case "card": {
      const pad = Math.min(unit * 0.2, r.w * 0.06);
      ctx.save();
      ctx.fillStyle = painted ? rgba(palette.secondary, 0.16) : rgba(THEME.textDim, 0.08);
      roundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h * 0.42, unit * 0.15);
      ctx.fill();
      ctx.restore();
      dash(r.x + r.w * 0.08, r.y + r.h * 0.58, r.w * 0.7, dh);
      dash(r.x + r.w * 0.08, r.y + r.h * 0.72, r.w * 0.5, dh);
      break;
    }
  }
  ctx.restore();
}

export function paintBrowserframe(ctx: CanvasRenderingContext2D, scene: BrowserframeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const palette = env.palette;
  const { accent, accentGlow } = palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const base = easeOutCubic(enterT(env, 380));
  const leave = departT(env, 380);
  if (base <= 0 || leave <= 0) return;

  // `contentH` ran the window frame to ~90% of frame height in 9:16, so the bottom of
  // the browser chrome sat under the burned-in caption while ~45% of the window was
  // empty below its own content.
  const winRect = { x: contentX, y: contentY, w: contentW, h: Math.max(unit * 6, layout.safeBottom - contentY) };

  type Anim = { show: number | null; paint: number | null; shifts: { beat: number; y: number }[] };
  const anims = new Map<string, Anim>(scene.blocks.map((b) => [b.id, { show: null, paint: null, shifts: [] }]));
  scene.steps.forEach((st, k) => {
    const beat = offset + k;
    for (const id of st.show) {
      const a = anims.get(id);
      if (a && a.show === null) a.show = beat;
    }
    for (const id of st.paint) {
      const a = anims.get(id);
      if (a && a.paint === null) a.paint = beat;
    }
    if (st.shift) anims.get(st.shift.block)?.shifts.push({ beat, y: st.shift.y });
  });

  const usedRows = Math.max(MIN_ROWS, ...scene.blocks.map((b) => b.y + b.h));
  // Pixel half-extents of the content area — no camera needed, this IS the frustum
  // the removed on-axis camera would have produced (it was never tilted or moved).
  const winCX = winRect.x + winRect.w / 2;
  const winCY = winRect.y + winRect.h / 2;
  const spreadXpx = (winRect.w / 2) * WINDOW_FILL;
  const spreadYpx = (winRect.h / 2) * WINDOW_FILL;
  const bob = Math.sin(env.elapsedMs / 2000) * unit * BOB_UNITS;

  /** Pixel rect of block `b` at its (possibly shifted) row `gy`. */
  const blockRect = (b: (typeof scene.blocks)[number], gy: number): Rect => {
    const bw = (b.w / GRID) * (spreadXpx * 2 * 0.95);
    const bh = (b.h / usedRows) * (spreadYpx * 2 * 0.85);
    const cx = winCX + (b.x / GRID - 0.5) * (spreadXpx * 2 * 0.95) + bw / 2;
    const cy = winCY + (0.5 - gy / usedRows) * (spreadYpx * 2 * 0.85) - bh / 2 - spreadYpx * 2 * 0.05 + bob;
    return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, cx, cy };
  };

  ctx.save();
  ctx.globalAlpha = base * leave;

  // Browser window backing.
  applyElevation(ctx, unit, "raised");
  roundRect(ctx, winRect.x, winRect.y, winRect.w, winRect.h, unit * 0.6);
  ctx.fillStyle = shade(THEME.panel, -0.35);
  ctx.fill();
  clearShadow(ctx);
  roundRect(ctx, winRect.x, winRect.y, winRect.w, winRect.h, unit * 0.6);
  ctx.strokeStyle = shade(THEME.panel, 0.22);
  ctx.lineWidth = unit * 0.03;
  ctx.stroke();

  // Blocks: fill + glyphs.
  for (const b of scene.blocks) {
    const a = anims.get(b.id)!;
    const showBeat = a.show ?? a.paint ?? offset;
    const ts = beatT(env.beats, showBeat, totalBeats, env.p);
    if (ts <= 0) continue;

    let gy = b.y;
    for (const sh of a.shifts) {
      const t = beatT(env.beats, sh.beat, totalBeats, env.p);
      if (t <= 0) continue;
      gy = gy + (sh.y - gy) * easeInOutCubic(clamp01((t - 0.2) / 0.55));
    }

    const r = blockRect(b, gy);
    const tp = a.paint !== null ? beatT(env.beats, a.paint, totalBeats, env.p) : 0;
    const painted = tp > 0;
    const pop = easeOutBack(clamp01(ts / 0.3));
    const isActivePaint = a.paint !== null && active === a.paint;

    ctx.save();
    ctx.globalAlpha = base * leave * clamp01(ts * 4);
    ctx.translate(r.cx, r.cy);
    ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
    ctx.translate(-r.cx, -r.cy);

    applyElevation(ctx, unit, isActivePaint ? "floating" : "raised");
    if (isActivePaint) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * 0.15);
    ctx.fillStyle = painted ? roleFace(b.role, palette) : shade(THEME.panel, 0.09);
    ctx.fill();
    clearShadow(ctx);
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * 0.15);
    ctx.strokeStyle = painted ? rgba(accent, 0.4) : rgba(THEME.textDim, 0.3);
    ctx.lineWidth = unit * 0.025;
    ctx.stroke();

    drawGlyphs(ctx, b.role, r, unit, painted, env.elapsedMs, palette);
    ctx.restore();
  }

  // URL bar.
  const barTopY = winRect.y + winRect.h / 2 - spreadYpx + bob;
  const barBotY = winRect.y + winRect.h / 2 - spreadYpx * 0.85 + bob;
  const px0 = winCX - spreadXpx;
  const pw = spreadXpx * 2;
  const py0 = barBotY;
  const bandH = barBotY - barTopY;

  // macOS traffic lights are a real-world reference, not palette semantics.
  const lights = ["#f87171", THEME.warn, THEME.good] as const;
  lights.forEach((c, i) => {
    ctx.fillStyle = rgba(c, 0.5);
    ctx.beginPath();
    ctx.arc(px0 + unit * 0.8 + i * unit * 0.6, py0 - Math.abs(bandH) / 2, unit * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });

  const fx = px0 + unit * 2.8;
  const fw = pw - unit * 2.8 - unit * 0.6;
  const fh = unit * 1.05;
  const fy = py0 - Math.abs(bandH) / 2 - fh / 2;

  roundRect(ctx, fx, fy, fw, fh, fh / 2);
  ctx.fillStyle = rgba(THEME.bgBottom, 0.7);
  ctx.fill();
  roundRect(ctx, fx, fy, fw, fh, fh / 2);
  ctx.strokeStyle = rgba(THEME.textDim, 0.3);
  ctx.lineWidth = unit * STROKE.thin;
  ctx.stroke();

  const badgeDefs: { text: string; beat: number }[] = [];
  scene.steps.forEach((st, k) => {
    if (st.badge) badgeDefs.push({ text: st.badge, beat: offset + k });
  });
  const visibleBadges = badgeDefs.filter((b) => beatT(env.beats, b.beat, totalBeats, env.p) > 0);
  ctx.font = `600 ${unit * 0.5}px ${FONT_MONO}`;
  const badgesW = visibleBadges.reduce((acc, b) => acc + ctx.measureText(b.text).width + unit * 0.55 + unit * 0.2, 0);

  const t0 = beatT(env.beats, 0, totalBeats, env.p);
  const typed = Math.round(clamp01(t0 / 0.85) * scene.url.length);
  const urlPx = fitFontSize(ctx, scene.url, {
    maxW: Math.max(unit * 3, fw - unit * 2.0 - badgesW),
    startPx: unit * 0.6,
    minPx: unit * 0.36,
    weight: 500,
    family: FONT_MONO,
  });
  ctx.font = `500 ${urlPx}px ${FONT_MONO}`;
  const shown = scene.url.slice(0, typed);
  const textX = fx + unit * 1.05;
  ctx.fillStyle = THEME.textDim;
  ctx.save();
  ctx.beginPath();
  ctx.rect(textX - unit * 0.1, fy, Math.max(unit, fx + fw - badgesW - unit * 0.4 - textX), fh);
  ctx.clip();
  ctx.fillText(shown, textX, fy + fh / 2 + urlPx * 0.35);
  ctx.restore();
  if (Math.floor(env.elapsedMs / CARET_MS) % 2 === 0) {
    const cw2 = ctx.measureText(shown).width;
    ctx.fillStyle = accent;
    ctx.fillRect(textX + cw2 + unit * 0.08, fy + fh * 0.22, unit * 0.07, fh * 0.56);
  }

  // Badges.
  let bx = fx + fw - unit * 0.25;
  for (let i = visibleBadges.length - 1; i >= 0; i--) {
    const b = visibleBadges[i];
    const bt = beatT(env.beats, b.beat, totalBeats, env.p);
    const pop = easeOutBack(clamp01(bt / 0.25));
    const newest = i === visibleBadges.length - 1;
    ctx.font = `600 ${unit * 0.5}px ${FONT_MONO}`;
    const tw = ctx.measureText(b.text).width;
    const bw = tw + unit * 0.55;
    const bh = unit * 0.78;
    bx -= bw;
    const by = fy + (fh - bh) / 2;
    ctx.save();
    ctx.globalAlpha = base * leave * (newest ? 1 : 0.5) * clamp01(bt * 4);
    ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.strokeStyle = rgba(accent, newest ? 0.9 : 0.5);
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.fillStyle = newest ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(b.text, bx + bw / 2, by + bh / 2 + unit * 0.18);
    ctx.restore();
    bx -= unit * 0.2;
  }

  ctx.restore();
  ctx.textAlign = "start";
}
