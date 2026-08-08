import type { Scene } from "../schema";
import {
  THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, wrapText, roundRect,
  fitFontSize, glowRing, departT,
} from "./common";
import type { PaintEnv } from "./index";

type QuestionScene = Extract<Scene, { kind: "question" }>;

/**
 * One canonical composition under the phase's one-look-per-kind decision: a
 * large pulsing "?" over centered text with expanding rings — the variant
 * with the most continuous motion of the three that existed (the calmer
 * underline mark and the static watermark both scored low on occupancy once
 * settled). One measured, top-to-bottom stack — mark, question, hint, CTA —
 * computed from the actual text before anything is drawn, so a long question
 * can never collide with the CTA the way a fixed-offset layout would.
 *
 * Deliberately pure 2D. The previous three.js version rendered a "glossy
 * backboard" panel projected through an off-axis camera the same way `rect`
 * maps the panel onto the screen — but the floating "?" mark was projected
 * through that SAME camera from a different world position, so it landed
 * wherever the projection error carried it: the "2d-layout-round-tripped-
 * through-camera" systemic bug. A pixel-only layout can't drift.
 */
export function paintQuestion(ctx: CanvasRenderingContext2D, scene: QuestionScene, env: PaintEnv) {
  const { layout } = env;
  const { w, unit, contentW, contentY, safeH } = layout;
  const { accent, accentGlow } = env.palette;
  const cx = w / 2;

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const measure = (scale: number) => {
    const qMaxPx = unit * 1.55 * scale;
    const qMinPx = unit * 0.85 * scale;
    const qPx = fitFontSize(ctx, scene.text, { maxW: contentW * 0.92, startPx: qMaxPx, minPx: qMinPx, weight: 800 });
    ctx.font = `800 ${qPx}px ${FONT_SANS}`;
    const qLines = wrapText(ctx, scene.text, contentW * 0.92);
    const qLineH = qPx * 1.22;

    const hintPx = unit * 0.85 * scale;
    let hintLines: string[] = [];
    if (scene.hint) {
      ctx.font = `500 ${hintPx}px ${FONT_SANS}`;
      hintLines = wrapText(ctx, `Hint: ${scene.hint}`, contentW * 0.8);
    }
    const hintLineH = hintPx * 1.32;

    const markH = unit * 3.0 * scale;
    const markGap = unit * 0.7 * scale;
    const gapToHint = unit * 0.85 * scale;
    const gapToCta = unit * 1.05 * scale;

    const ctaPx = unit * 1.0 * scale;
    ctx.font = `700 ${ctaPx}px ${FONT_SANS}`;
    const ctaLabel = "Comment your answer 👇";
    const ctaPadX = unit * 1.15 * scale;
    const ctaH = unit * 2.15 * scale;
    const ctaW = ctx.measureText(ctaLabel).width + ctaPadX * 2;

    const qBlockH = qLines.length * qLineH;
    const hintBlockH = hintLines.length * hintLineH;
    const total =
      markH + markGap + qBlockH + (hintLines.length ? gapToHint + hintBlockH : 0) + gapToCta + ctaH;

    return { qPx, qLines, qLineH, hintPx, hintLines, hintLineH, markH, markGap, gapToHint, gapToCta, ctaPx, ctaLabel, ctaW, ctaH, qBlockH, hintBlockH, total };
  };

  let m = measure(1);
  if (m.total > safeH) m = measure(Math.max(0.6, safeH / m.total));

  const startY = Math.max(contentY, contentY + (safeH - m.total) / 2);

  let cursor = startY;

  // ── Pulsing "?" mark with expanding rings ────────────────────────────────
  {
    const markIn = easeOutBack(enterT(env, 450));
    const markCy = cursor + m.markH / 2;
    const pulse = 1 + 0.03 * Math.sin(env.elapsedMs / 320);
    ctx.save();
    ctx.globalAlpha *= leave;
    ctx.textAlign = "center";
    ctx.translate(cx, markCy);
    const ringPhase = (env.elapsedMs % 2200) / 2200;
    for (const off of [0, 0.5]) {
      const rp = (ringPhase + off) % 1;
      ctx.beginPath();
      ctx.arc(0, 0, unit * (1.4 + rp * 2.8), 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.35 * (1 - rp) * markIn * leave;
      ctx.lineWidth = unit * 0.08;
      ctx.stroke();
    }
    ctx.globalAlpha = clamp01(markIn) * leave;
    ctx.scale(pulse, pulse);
    ctx.rotate(0.05 * Math.sin(env.elapsedMs / 700));
    const markPx = unit * 3.4;
    ctx.font = `900 ${markPx}px ${FONT_SANS}`;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.7;
    ctx.fillStyle = accent;
    ctx.fillText("?", 0, markPx * 0.32);
    ctx.restore();
    cursor += m.markH + m.markGap;
  }

  // ── Question lines ───────────────────────────────────────────────────────
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `800 ${m.qPx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  m.qLines.forEach((line, i) => {
    const tIn = easeOutCubic(enterT(env, 350, 200 + i * 110));
    ctx.globalAlpha = tIn * leave;
    ctx.fillText(line, cx, cursor + i * m.qLineH + m.qLineH * 0.82 + (1 - tIn) * unit * 0.6);
  });
  ctx.restore();
  cursor += m.qBlockH;

  // ── Hint ─────────────────────────────────────────────────────────────────
  if (m.hintLines.length) {
    cursor += m.gapToHint;
    ctx.save();
    // Duration-aware: the hint should land only once the question has been read.
    ctx.globalAlpha = easeOutCubic(Math.max(enterT(env, 350, 600), env.p > 0.35 ? 1 : 0)) * leave;
    ctx.font = `500 ${m.hintPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    m.hintLines.forEach((line, i) => ctx.fillText(line, cx, cursor + i * m.hintLineH + m.hintLineH * 0.8));
    ctx.restore();
    cursor += m.hintBlockH;
  }

  // ── CTA pill, always directly below whatever came before it ───────────
  cursor += m.gapToCta;
  const ctaT = Math.max(env.p > 0.5 ? clamp01((env.p - 0.5) / 0.25) : 0, enterT(env, 450, 1400));
  const ctaIn = easeOutBack(ctaT);
  if (ctaIn > 0) {
    const bx = cx - m.ctaW / 2;
    const by = cursor;
    const bob = (idle(env, 2400) - 0.5) * unit * 0.16 * clamp01(ctaT);

    ctx.save();
    ctx.globalAlpha = Math.min(1, ctaIn) * leave;
    ctx.translate(cx, by + m.ctaH / 2 + bob);
    ctx.scale(Math.max(0.001, ctaIn), Math.max(0.001, ctaIn));

    // A slow pulsing ring reads as "tap here" the way a real UI affordance would.
    // Radius keyed to the pill's HEIGHT, not its (label-dependent, often much
    // wider) width — otherwise a long CTA label blows the ring's growth radius
    // out past the hint/question text sitting well above it.
    glowRing(ctx, 0, 0, m.ctaH * 0.75, accent, env, 2000);

    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    roundRect(ctx, -m.ctaW / 2, -m.ctaH / 2, m.ctaW, m.ctaH, m.ctaH / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `700 ${m.ctaPx}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#06121a";
    ctx.fillText(m.ctaLabel, 0, m.ctaPx * 0.36);
    ctx.restore();
  }
}
