import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, wrapText, drawSceneTitle, beatT, activeBeatIndex, rgba, shade, departT, idle, roundRect } from "./common";
import type { PaintEnv } from "./index";

/** On 9:16 the bottom quarter is covered by the YouTube Shorts UI (CLAUDE_PROMPT.md:207). */
const SHORTS_SAFE_BOTTOM = 0.75;
const PULSE_MS = 2200;

type StepsScene = Extract<Scene, { kind: "steps" }>;

/** Numbered process: circled numbers on a spine, each step revealed in order. */
export function paintSteps(ctx: CanvasRenderingContext2D, scene: StepsScene, env: PaintEnv) {
  const { layout } = env;
  const { h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const n = scene.steps.length;
  // Centre within the VISIBLE band on 9:16. Centring in the full content box put
  // the list low, with a dead third under the title and the slack below it hidden
  // by the caption strip anyway.
  const listLimit = vertical
    ? Math.min(contentY + contentH, h * SHORTS_SAFE_BOTTOM)
    : contentY + contentH;
  const availH = listLimit - (contentY + band);
  const rowGap = Math.min(availH / n, unit * (vertical ? 4.2 : 3.2));
  const listTop = contentY + band + Math.max(0, (availH - n * rowGap) / 2);
  const numX = contentX + unit * 1.4;
  const numR = unit * 1.0;
  const textX = numX + numR + unit * 1.1;

  scene.steps.forEach((s, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    const cyc = listTop + i * rowGap + rowGap * 0.42;
    if (t <= 0) {
      // Ghost of the upcoming step number, so the spine's full extent is
      // visible from the start instead of an empty lower half.
      const ghostIn = easeOutCubic(sub(env.p, 0, 0.12));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18 * ghostIn * leave;
        ctx.beginPath();
        ctx.arc(numX, cyc, numR, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.06;
        ctx.setLineDash([unit * 0.25, unit * 0.25]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent;
        ctx.font = `800 ${unit}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), numX, cyc + unit * 0.36);
        ctx.textAlign = "start";
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, t * 3));
    const pop = easeOutBack(Math.min(1, t * 3));
    const isCurrent = active === offset + i;

    if (i < n - 1) {
      const nextC = listTop + (i + 1) * rowGap + rowGap * 0.42;
      ctx.save();
      ctx.globalAlpha = appear * 0.6 * leave;
      ctx.strokeStyle = rgba(accent, 0.35);
      ctx.lineWidth = unit * 0.08;
      ctx.beginPath();
      ctx.moveTo(numX, cyc + numR);
      ctx.lineTo(numX, cyc + numR + (nextC - numR - (cyc + numR)) * appear);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = appear * leave;
    ctx.translate(numX, cyc);
    ctx.scale(pop, pop);
    ctx.translate(-numX, -cyc);
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9 * (0.7 + 0.3 * idle(env, PULSE_MS));
    }
    ctx.beginPath();
    ctx.arc(numX, cyc, numR, 0, Math.PI * 2);
    ctx.fillStyle = isCurrent ? accent : shade(accent, -0.82);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = unit * 0.07;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = isCurrent ? shade(accent, -0.9) : accent;
    ctx.font = `800 ${unit}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), numX, cyc + unit * 0.36);
    ctx.textAlign = "start";
    ctx.restore();

    // The active row's whole text band breathes — the number's glow alone covers
    // too little of the frame to register once a row settles and just holds.
    if (isCurrent) {
      ctx.save();
      ctx.globalAlpha = appear * leave * (0.08 + 0.05 * idle(env, PULSE_MS));
      roundRect(ctx, textX - unit * 0.3, cyc - rowGap * 0.42, contentX + contentW - textX + unit * 0.3, rowGap * 0.9, unit * 0.4);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = appear * leave;
    const maxTextW = contentW - (textX - contentX);
    ctx.font = `${isCurrent ? 700 : 600} ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    const lines = wrapText(ctx, s.text, maxTextW).slice(0, 2);
    const detailOffset = s.detail ? unit * 0.5 : 0;
    const baseY = cyc + unit * 0.32 - (lines.length - 1) * unit * 0.65 - detailOffset;
    lines.forEach((line, li) => ctx.fillText(line, textX, baseY + li * unit * 1.3));
    if (s.detail) {
      ctx.font = `500 ${unit * 0.82}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textFaint;
      const dLines = wrapText(ctx, s.detail, maxTextW);
      const dLine = dLines.length > 1 ? `${dLines[0].replace(/\s+\S*$/, "")}…` : dLines[0] ?? "";
      ctx.fillText(dLine, textX, baseY + lines.length * unit * 1.3 + unit * 0.1);
    }
    ctx.restore();
  });
}
