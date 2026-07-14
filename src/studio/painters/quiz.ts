import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, sub, clamp01, wrapText, roundRect, beatWindow, beatT, activeBeatIndex, rgba } from "./common";
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
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  const qLines = wrapText(ctx, scene.question, contentW * 0.96);
  const m = scene.options.length;
  const gap = unit * 0.7;
  const rowH = Math.min(
    (contentH - (qLines.length * unit * 1.7 + unit * 1.1) - (m - 1) * gap) / m,
    unit * (vertical ? 3.0 : 2.3)
  );
  // Center the question+options block — a 2-option quiz otherwise leaves the
  // bottom half of a 9:16 frame empty.
  const blockH = qLines.length * unit * 1.7 + unit * 1.1 + m * rowH + (m - 1) * gap;
  const qTop = contentY + Math.max(unit * 1.4, (contentH - blockH) / 2);

  ctx.save();
  ctx.globalAlpha = qIn;
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  qLines.forEach((line, i) => ctx.fillText(line, contentX, qTop + unit * 1.05 + i * unit * 1.7));
  ctx.restore();

  const optsTop = qTop + unit * 1.05 + qLines.length * unit * 1.7 + unit * 0.75;
  const beat0T = beatT(env.beats, 0, totalBeats, env.p);

  // Think-time countdown: the engine leaves a gap between the question beat
  // and the reveal beat — draw a depleting ring + seconds so viewers guess.
  const w0 = beatWindow(env.beats, 0, totalBeats);
  const w1 = beatWindow(env.beats, 1, totalBeats);
  if (!revealing && env.p >= w0.end && w1.start > w0.end) {
    const tt = clamp01((env.p - w0.end) / (w1.start - w0.end));
    const secsLeft = Math.max(1, Math.ceil(((w1.start - env.p) * env.durationMs) / 1000));
    // Centered below the options — top-right collided with long question lines.
    const cx = contentX + contentW / 2;
    const cy = optsTop + m * rowH + (m - 1) * gap + unit * 1.7;
    const r = unit * 1.05;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(13,17,23,0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = unit * 0.14;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (1 - tt) * Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    ctx.stroke();
    const tick = 1 + 0.12 * Math.max(0, 1 - ((env.elapsedMs % 1000) / 1000) * 4);
    ctx.font = `900 ${unit * 1.0 * tick}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(String(secsLeft), cx, cy + unit * 0.36);
    ctx.font = `700 ${unit * 0.52}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText("GUESS!", cx, cy + r + unit * 0.75);
    ctx.textAlign = "start";
    ctx.restore();
  }

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
