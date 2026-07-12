import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, wrapText, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type TimelineScene = Extract<Scene, { kind: "timeline" }>;

/** Vertical dated spine: each event reveals on its beat, current one glows. */
export function paintTimeline(ctx: CanvasRenderingContext2D, scene: TimelineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.events.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const titleIn = easeOutCubic(sub(env.p, 0, 0.12));
  ctx.save();
  ctx.globalAlpha = titleIn;
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(scene.title, contentX, contentY + unit * 1.3);
  ctx.fillStyle = accent;
  ctx.fillRect(contentX, contentY + unit * 1.8, unit * 3 * titleIn, unit * 0.2);
  ctx.restore();

  const listTop = contentY + unit * 3.0;
  const n = scene.events.length;
  const rowGap = Math.min((contentH - (listTop - contentY)) / n, unit * (vertical ? 3.9 : 3.0));
  const spineX = contentX + unit * 3.0;
  const dotR = unit * 0.42;

  scene.events.forEach((e, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) return;
    const appear = easeOutCubic(Math.min(1, t * 3));
    const pop = easeOutBack(Math.min(1, t * 3));
    const isCurrent = active === offset + i;
    const y = listTop + i * rowGap + rowGap * 0.5;

    if (i > 0) {
      const prevY = listTop + (i - 1) * rowGap + rowGap * 0.5;
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.strokeStyle = rgba(accent, 0.4);
      ctx.lineWidth = unit * 0.09;
      ctx.beginPath();
      ctx.moveTo(spineX, prevY + dotR);
      ctx.lineTo(spineX, prevY + (y - dotR - (prevY + dotR)) * appear + dotR);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = appear;
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
    }
    ctx.beginPath();
    ctx.arc(spineX, y, dotR * pop, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent ? accent : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = unit * 0.08;
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(spineX, y, dotR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.font = `800 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? accent : THEME.textDim;
    ctx.fillText(e.when, spineX - unit * 0.95, y + unit * 0.28);

    ctx.textAlign = "start";
    ctx.font = `${isCurrent ? 700 : 500} ${unit * 0.98}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    const labelX = spineX + unit * 1.1;
    const lines = wrapText(ctx, e.label, contentW - (labelX - contentX)).slice(0, 2);
    const baseY = y + unit * 0.32 - (lines.length - 1) * unit * 0.62;
    lines.forEach((line, li) => ctx.fillText(line, labelX, baseY + li * unit * 1.25));
    ctx.restore();
  });
  ctx.textAlign = "start";
}
