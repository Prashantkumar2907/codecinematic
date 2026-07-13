import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, wrapText, roundRect, beatT, activeBeatIndex, variantOf } from "./common";
import type { PaintEnv } from "./index";

type BulletsScene = Extract<Scene, { kind: "bullets" }>;

const DIM_ALPHA = 0.55;

export function paintBullets(ctx: CanvasRenderingContext2D, scene: BulletsScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const titleIn = easeOutCubic(sub(env.p, 0, 0.12));
  ctx.save();
  ctx.globalAlpha = titleIn;
  ctx.translate((1 - titleIn) * -unit, 0);
  ctx.font = `800 ${unit * 1.7}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const titleLines = wrapText(ctx, scene.title, contentW);
  titleLines.forEach((line, i) => ctx.fillText(line, contentX, contentY + unit * 1.6 + i * unit * 2.1));
  const titleBottom = contentY + unit * 1.6 + titleLines.length * unit * 2.1;
  ctx.fillStyle = accent;
  ctx.fillRect(contentX, titleBottom - unit * 0.5, unit * 3.4 * titleIn, unit * 0.22);
  ctx.restore();

  const n = scene.items.length;
  const listTop = titleBottom + unit * (vertical ? 1.6 : 1.0);
  const rowGap = Math.min((contentH - (listTop - contentY)) / n, unit * (vertical ? 4.4 : 3.4));
  // Marker style varies per scene: 0 dot, 1 check-in-circle, 2 numbered chip.
  const marker = variantOf(scene.id, 3);
  const markR = marker === 0 ? unit * 0.34 : unit * 0.62;

  scene.items.forEach((item, i) => {
    const beatIdx = offset + i;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    const y = listTop + i * rowGap;
    const cy = y + unit * 0.75;
    if (t <= 0) {
      // Ghost marker for the not-yet-revealed item — the list's full extent
      // shows from the start instead of leaving the lower rows empty.
      const ghostIn = easeOutCubic(sub(env.p, 0, 0.12));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.16 * ghostIn;
        ctx.beginPath();
        ctx.arc(contentX + markR, cy, Math.max(markR, unit * 0.34), 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.06;
        ctx.setLineDash([unit * 0.22, unit * 0.22]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, t * 3));
    const pop = easeOutBack(Math.min(1, t * 3));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent ? 1 : DIM_ALPHA;

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    ctx.translate((1 - appear) * unit * 1.2, 0);

    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
    }
    if (marker === 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(contentX + markR, cy, markR * pop, 0, Math.PI * 2);
      ctx.fill();
    } else if (marker === 1) {
      ctx.beginPath();
      ctx.arc(contentX + markR, cy, markR * pop, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? accent : "rgba(148,163,184,0.16)";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isCurrent ? "#06121a" : accent;
      ctx.font = `900 ${unit * 0.72 * pop}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("✓", contentX + markR, cy + unit * 0.26);
      ctx.textAlign = "start";
    } else {
      const s = markR * 2 * pop;
      roundRect(ctx, contentX + markR - s / 2, cy - s / 2, s, s, unit * 0.32);
      ctx.fillStyle = isCurrent ? accent : "rgba(148,163,184,0.16)";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isCurrent ? "#06121a" : accent;
      ctx.font = `800 ${unit * 0.72 * pop}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), contentX + markR, cy + unit * 0.26);
      ctx.textAlign = "start";
    }
    ctx.shadowBlur = 0;

    ctx.font = `${isCurrent ? 600 : 500} ${unit * 1.1}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const textX = contentX + markR * 2 + unit * 0.8;
    const lines = wrapText(ctx, item.text, contentW - (textX - contentX));
    lines.slice(0, 2).forEach((line, li) => ctx.fillText(line, textX, y + unit * 1.1 + li * unit * 1.5));
    ctx.restore();
  });
}
