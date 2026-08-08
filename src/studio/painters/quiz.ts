import type { Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  clamp01,
  wrapText,
  fitFontSize,
  roundRect,
  beatWindow,
  beatT,
  activeBeatIndex,
  enterT,
  rgba,
  departT,
  applyElevation,
  clearShadow,
  RADIUS,
  shade,
  idle,
} from "./common";
import type { PaintEnv } from "./index";

type QuizScene = Extract<Scene, { kind: "quiz" }>;

const LETTERS = ["A", "B", "C", "D"];
const ROW_FACE_LIFT = 0.06;
const PULSE_MS = 2200;

/** Beat 0 shows the question + options; beat 1 reveals the correct answer. */
export function paintQuiz(ctx: CanvasRenderingContext2D, scene: QuizScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft } = env.palette;
  const totalBeats = 2;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const revealing = active >= 1;
  const revealT = revealing ? easeOutCubic(clamp01(beatT(env.beats, 1, totalBeats, env.p) / 0.28)) : 0;

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const qIn = easeOutCubic(enterT(env, 380));
  ctx.save();
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  const qLines = wrapText(ctx, scene.question, contentW * 0.96);
  ctx.restore();

  const m = scene.options.length;
  const gap = unit * 0.7;
  const rowH = Math.min(
    (contentH - (qLines.length * unit * 1.7 + unit * 1.1) - (m - 1) * gap) / m,
    unit * (vertical ? 3.0 : 2.3)
  );

  const blockH = qLines.length * unit * 1.7 + unit * 1.1 + m * rowH + (m - 1) * gap;
  const qTop = contentY + Math.max(unit * 1.4, (contentH - blockH) / 2);

  ctx.save();
  ctx.globalAlpha = qIn * leave;
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  qLines.forEach((line, i) => ctx.fillText(line, contentX, qTop + unit * 1.05 + i * unit * 1.7));
  ctx.restore();

  const optsTop = qTop + unit * 1.05 + qLines.length * unit * 1.7 + unit * 0.75;
  const beat0T = beatT(env.beats, 0, totalBeats, env.p);

  // Think-time countdown HUD.
  const w0 = beatWindow(env.beats, 0, totalBeats);
  const w1 = beatWindow(env.beats, 1, totalBeats);
  if (!revealing && env.p >= w0.end && w1.start > w0.end) {
    const tt = clamp01((env.p - w0.end) / (w1.start - w0.end));
    const secsLeft = Math.max(1, Math.ceil(((w1.start - env.p) * env.durationMs) / 1000));
    const cx = contentX + contentW / 2;
    const cy = optsTop + m * rowH + (m - 1) * gap + unit * 1.7;
    const r = unit * 1.05;
    ctx.save();
    ctx.globalAlpha = 0.95 * leave;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(THEME.panel, 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.textDim, 0.25);
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
    ctx.restore();
  }

  const rowInset = unit * 0.32;
  const optionStates = scene.options.map((opt, i) => {
    const appear = easeOutCubic(clamp01(beat0T * 2.5 - i * 0.35));
    const showCorrect = revealing && opt.correct;
    const dim = revealing && !opt.correct;
    const y = optsTop + i * (rowH + gap);
    return {
      visible: appear > 0,
      x: contentX + rowInset,
      y,
      w: contentW - rowInset * 2,
      h: rowH,
      scale: appear,
      opacity: appear * (dim ? 1 - 0.58 * revealT : 1),
      showCorrect,
      dim,
    };
  });

  // Panel card behind the options, matching the frame the 3D slab used to occupy.
  const panelY = optsTop - unit * 0.4;
  const panelH = m * rowH + (m - 1) * gap + unit * 0.8;
  ctx.save();
  ctx.globalAlpha = qIn * leave;
  applyElevation(ctx, unit, "raised");
  roundRect(ctx, contentX, panelY, contentW, panelH, unit * RADIUS.lg);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  clearShadow(ctx);
  ctx.restore();

  optionStates.forEach((state, i) => {
    if (!state.visible) return;
    const cx = state.x + state.w / 2;
    const cy = state.y + state.h / 2;
    ctx.save();
    ctx.globalAlpha = state.opacity * leave;
    ctx.translate(cx, cy);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-cx, -cy);

    // The correct row breathes continuously once revealed — a static tint left
    // the scene fully still for the reveal beat's whole remaining hold (~36% of
    // the scene once settled), the same class of defect table/bullets had.
    const breathe = state.showCorrect ? 0.85 + 0.3 * idle(env, PULSE_MS) : 1;
    applyElevation(ctx, unit, state.showCorrect ? "floating" : "raised");
    if (state.showCorrect) {
      ctx.shadowColor = THEME.good;
      ctx.shadowBlur = unit * 0.5 * breathe;
    }
    roundRect(ctx, state.x, state.y, state.w, state.h, unit * RADIUS.md);
    ctx.fillStyle = state.showCorrect
      ? rgba(THEME.good, (0.16 + 0.08 * revealT) * breathe)
      : shade(THEME.panel, ROW_FACE_LIFT);
    ctx.fill();
    clearShadow(ctx);
    roundRect(ctx, state.x, state.y, state.w, state.h, unit * RADIUS.md);
    ctx.strokeStyle = state.showCorrect ? THEME.good : rgba(THEME.textDim, 0.3);
    ctx.lineWidth = unit * (state.showCorrect ? 0.06 : 0.03);
    ctx.stroke();

    const badgeR = unit * 0.72;
    const badgeX = state.x + unit * 1.3;
    ctx.beginPath();
    ctx.arc(badgeX, cy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = state.showCorrect ? THEME.good : accentSoft;
    ctx.fill();
    ctx.fillStyle = state.showCorrect ? THEME.bgBottom : accent;
    ctx.font = `800 ${unit * 0.9}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(LETTERS[i] ?? "?", badgeX, cy + unit * 0.32);

    ctx.textAlign = "start";
    const textX = badgeX + badgeR + unit * 0.9;
    const textW = state.x + state.w - textX - unit * 2.2;
    const weight = state.showCorrect ? 700 : 500;
    const px = fitFontSize(ctx, scene.options[i].text, {
      maxW: textW,
      startPx: unit * 0.95,
      minPx: unit * 0.6,
      weight,
    });
    ctx.font = `${weight} ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(scene.options[i].text, textX, cy + px * 0.34);

    if (state.showCorrect) {
      ctx.font = `900 ${unit * 1.1 * (0.7 + 0.3 * revealT)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.good;
      ctx.textAlign = "right";
      ctx.fillText("✓", state.x + state.w - unit * 0.7, cy + unit * 0.36);
    }

    ctx.restore();
  });
  ctx.textAlign = "start";
}
