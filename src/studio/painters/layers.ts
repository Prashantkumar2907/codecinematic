import { introBeatCount, type Scene } from "../schema";
import type { PaintEnv } from "./index";
import {
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  rgba,
  roundRect,
  shade,
  sub,
  easeOutBack,
  activeBeatIndex,
  idle,
  departT,
  STROKE,
} from "./common";

type LayersScene = Extract<Scene, { kind: "layers" }>;

const IDLE_FACE_LIFT = 0.1;

export function paintLayers(ctx: CanvasRenderingContext2D, scene: LayersScene, env: PaintEnv) {
  const { layout, palette } = env;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 5);

  const offset = introBeatCount(scene);
  const numLayers = scene.layers.length;
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt * leave;

  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);
  ctx.restore();

  const areaX = layout.contentX;
  const areaY = layout.contentY + layout.unit * 1.8;
  const areaW = layout.contentW;
  const areaH = layout.contentH - layout.unit * 2.8;

  ctx.save();
  ctx.globalAlpha = leave;
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = layout.unit * STROKE.hair;
  ctx.stroke();
  ctx.restore();

  const activeIdx = Math.min(
    numLayers - 1,
    activeBeatIndex(env.beats, offset + numLayers, env.p) - offset
  );
  const activeLayer = scene.layers[Math.max(0, activeIdx)];
  const shapeMode = scene.shape ?? "stack";

  const tint = (idx: number) => (idx % 2 === 0 ? palette.accent : palette.secondary);
  const bandT = (idx: number) => easeOutBack(sub(env.p, idx * 0.1, 0.15));

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.clip();

  if (shapeMode === "stack") {
    // Cross-section, drawn directly in 2D — a stack of bands read top to
    // bottom, the same idea the removed 3D blocks conveyed from an isometric
    // angle with none of the camera math.
    const gap = layout.unit * 0.15;
    const rowH = (areaH - gap * (numLayers - 1)) / numLayers;
    scene.layers.forEach((layer, idx) => {
      const bt = bandT(idx);
      if (bt <= 0) return;
      const isActive = idx === activeIdx;
      const rowY = areaY + idx * (rowH + gap);
      const rowCy = rowY + rowH / 2;
      const breathe = isActive ? 1 + 0.015 * idle(env, 1600, idx) : 1;
      const w = areaW * Math.max(0.001, bt) * breathe;
      const x0 = areaX + (areaW - w) / 2;

      ctx.save();
      ctx.globalAlpha = leave;
      if (isActive) {
        ctx.shadowColor = palette.accentGlow;
        ctx.shadowBlur = layout.unit * 0.5;
      }
      roundRect(ctx, x0, rowY, w, rowH, layout.unit * 0.2);
      ctx.fillStyle = isActive ? tint(idx) : shade(THEME.panel, IDLE_FACE_LIFT);
      ctx.globalAlpha = leave * (isActive ? 0.9 : 0.5);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x0, rowY, w, rowH, layout.unit * 0.2);
      ctx.strokeStyle = rgba(tint(idx), isActive ? 0.9 : 0.45);
      ctx.lineWidth = layout.unit * (isActive ? STROKE.base : STROKE.thin);
      ctx.globalAlpha = leave;
      ctx.stroke();

      ctx.font = `700 ${Math.round(layout.unit * (isActive ? 0.65 : 0.55))}px ${FONT_SANS}`;
      ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(layer.label, x0 + layout.unit * 0.5, rowCy);
      if (layer.detail && areaW > 300) {
        ctx.font = `500 ${Math.round(layout.unit * 0.45)}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "right";
        ctx.fillText(layer.detail, x0 + w - layout.unit * 0.5, rowCy);
      }
      ctx.restore();
    });
  } else {
    // Rings/dome — concentric circles viewed from directly above, replacing
    // the removed 3D cylinders (which were themselves only ever viewed at a
    // fixed angle, so nothing about the "nested layer" idea depended on
    // rendering them as cylinders rather than circles).
    const cx = areaX + areaW / 2;
    const cy = areaY + areaH / 2;
    const maxR = Math.min(areaW, areaH) / 2 * 0.85;
    scene.layers.forEach((layer, idx) => {
      const bt = bandT(idx);
      if (bt <= 0) return;
      const isActive = idx === activeIdx;
      const rFrac = shapeMode === "dome" ? Math.sqrt((numLayers - idx) / numLayers) : (idx + 1) / numLayers;
      const breathe = isActive ? 1 + 0.02 * idle(env, 1600, idx) : 1;
      const r = maxR * rFrac * Math.max(0.001, bt) * breathe;

      ctx.save();
      ctx.globalAlpha = leave;
      if (isActive) {
        ctx.shadowColor = palette.accentGlow;
        ctx.shadowBlur = layout.unit * 0.5;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? tint(idx) : shade(THEME.panel, IDLE_FACE_LIFT);
      ctx.globalAlpha = leave * (isActive ? 0.55 : 0.35);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(tint(idx), isActive ? 0.9 : 0.45);
      ctx.lineWidth = layout.unit * (isActive ? STROKE.base : STROKE.thin);
      ctx.globalAlpha = leave;
      ctx.stroke();

      ctx.font = `700 ${Math.round(layout.unit * (isActive ? 0.65 : 0.55))}px ${FONT_SANS}`;
      ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(layer.label, cx, cy - r + layout.unit * (isActive ? 0.7 : 0.6));
      ctx.restore();
    });
  }
  ctx.restore();

  if (activeLayer?.say) {
    const bannerH = layout.unit * 1.6;
    const bannerY = areaY + areaH - bannerH - layout.unit * 0.4;
    const bannerW = areaW - layout.unit * 1.2;
    const bannerX = areaX + layout.unit * 0.6;

    ctx.save();
    ctx.globalAlpha = leave;
    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = layout.unit * STROKE.thin;
    ctx.stroke();

    ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(activeLayer.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
    ctx.restore();
  }
}
