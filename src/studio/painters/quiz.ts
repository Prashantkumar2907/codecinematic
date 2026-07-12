import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, sub, clamp01, wrapText, roundRect, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type QuizScene = Extract<Scene, { kind: "quiz" }>;

const LETTERS = ["A", "B", "C", "D"];

/** Beat 0 shows the question + options; beat 1 reveals the correct answer. */
export function paintQuiz(ctx: CanvasRenderingContext2D, scene: QuizScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft } = env.palette;
  const totalBeats = 2;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const revealing = active >= 1;

  const qIn = easeOutCubic(sub(env.p, 0, 0.16));
  ctx.save();
  ctx.globalAlpha = qIn;
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const qLines = wrapText(ctx, scene.question, contentW * 0.96);
  const qTop = contentY + unit * 1.4;
  qLines.forEach((line, i) => ctx.fillText(line, contentX, qTop + i * unit * 1.7));
  ctx.restore();

  const optsTop = qTop + qLines.length * unit * 1.7 + unit * 1.1;
  const m = scene.options.length;
  const gap = unit * 0.7;
  const rowH = Math.min((contentH - (optsTop - contentY) - (m - 1) * gap) / m, unit * (vertical ? 3.0 : 2.3));
  const beat0T = beatT(env.beats, 0, totalBeats, env.p);

  scene.options.forEach((opt, i) => {
    const appear = easeOutCubic(clamp01(beat0T * 2.5 - i * 0.35));
    if (appear <= 0) return;
    const y = optsTop + i * (rowH + gap);
    const showCorrect = revealing && opt.correct;
    const dim = revealing && !opt.correct;

    ctx.save();
    ctx.globalAlpha = appear * (dim ? 0.42 : 1);
    ctx.translate((1 - appear) * unit * 1.5, 0);

    roundRect(ctx, contentX, y, contentW, rowH, unit * 0.5);
    ctx.fillStyle = showCorrect ? rgba(THEME.good, 0.14) : THEME.panel;
    if (showCorrect) {
      ctx.shadowColor = rgba(THEME.good, 0.5);
      ctx.shadowBlur = unit * 0.8;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, contentX, y, contentW, rowH, unit * 0.5);
    ctx.lineWidth = showCorrect ? unit * 0.11 : unit * 0.05;
    ctx.strokeStyle = showCorrect ? THEME.good : "rgba(148,163,184,0.4)";
    ctx.stroke();

    const badgeX = contentX + unit * 1.5;
    const badgeR = unit * 0.72;
    ctx.beginPath();
    ctx.arc(badgeX, y + rowH / 2, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = showCorrect ? THEME.good : accentSoft;
    ctx.fill();
    ctx.fillStyle = showCorrect ? "#06121a" : accent;
    ctx.font = `800 ${unit * 0.9}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(LETTERS[i] ?? "?", badgeX, y + rowH / 2 + unit * 0.32);

    ctx.textAlign = "start";
    ctx.font = `${showCorrect ? 700 : 500} ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const textX = badgeX + badgeR + unit * 0.9;
    const line = wrapText(ctx, opt.text, contentW - (textX - contentX) - unit * 1.8)[0] ?? opt.text;
    ctx.fillText(line, textX, y + rowH / 2 + unit * 0.32);

    if (showCorrect) {
      ctx.font = `900 ${unit * 1.1}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.good;
      ctx.textAlign = "right";
      ctx.fillText("✓", contentX + contentW - unit * 0.9, y + rowH / 2 + unit * 0.36);
      ctx.textAlign = "start";
    }
    ctx.restore();
  });
}
