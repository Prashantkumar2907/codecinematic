import type { Scene } from "../schema";
import {
  THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, wrapText, roundRect, rgba,
  variantOf, fitFontSize, glowRing,
} from "./common";
import type { PaintEnv } from "./index";

type QuestionScene = Extract<Scene, { kind: "question" }>;

/**
 * Seeded composition (scene id): 0 a large pulsing "?" over centered text with
 * expanding rings, 1 a calmer mark with an accent underline hugging the last
 * line, 2 spotlight background with a giant faint "?" watermark and no small
 * mark. All three share one measured, top-to-bottom stack — mark, question,
 * hint, CTA — computed from the actual text before anything is drawn, so a
 * long question can never collide with the CTA the way a fixed-offset layout
 * would.
 *
 * Deliberately pure 2D. The previous version rendered a three.js "glossy
 * backboard" panel behind the card, projected through an off-axis camera the
 * same way `rect` maps the panel onto the screen — but the floating "?" mark
 * was projected through that SAME camera from a different world position, so
 * it landed wherever the projection error carried it (off the left edge on
 * one variant, mid-sentence on another): the exact "2d-layout-round-tripped-
 * through-camera" systemic bug already named in qa/ledger.json, just never
 * caught here because the QA fixture's question text was short enough to
 * never need the hint/CTA stack to move. A pixel-only layout can't drift.
 */
export function paintQuestion(ctx: CanvasRenderingContext2D, scene: QuestionScene, env: PaintEnv) {
  const { layout } = env;
  const { w, unit, contentW, contentY, safeH } = layout;
  const { accent, accentGlow } = env.palette;
  const variant = variantOf(scene.id, 3);
  const cx = w / 2;

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

    const markH = variant === 2 ? 0 : unit * (variant === 1 ? 2.2 : 3.0) * scale;
    const markGap = variant === 2 ? 0 : unit * 0.7 * scale;
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

  // Giant faint watermark behind everything, variant 2 only — decorative, not
  // part of the measured stack.
  if (variant === 2) {
    const wmIn = easeOutCubic(enterT(env, 600));
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.07 * wmIn;
    ctx.font = `900 ${unit * 11}px ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.fillText("?", cx, startY + m.total * 0.55);
    ctx.restore();
    const spot = ctx.createRadialGradient(cx, startY + m.total * 0.4, 0, cx, startY + m.total * 0.4, Math.min(w, layout.h) * 0.55);
    spot.addColorStop(0, rgba(accent, 0.14 * wmIn));
    spot.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, layout.h);
  }

  let cursor = startY;

  // ── Small pulsing "?" mark (variants 0 and 1) ───────────────────────────
  if (variant !== 2) {
    const markIn = easeOutBack(enterT(env, 450));
    const markCy = cursor + m.markH / 2;
    const pulse = 1 + 0.03 * Math.sin(env.elapsedMs / 320);
    ctx.save();
    ctx.textAlign = "center";
    ctx.translate(cx, markCy);
    if (variant === 0) {
      const ringPhase = (env.elapsedMs % 2200) / 2200;
      for (const off of [0, 0.5]) {
        const rp = (ringPhase + off) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, unit * (1.4 + rp * 2.8), 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.35 * (1 - rp) * markIn;
        ctx.lineWidth = unit * 0.08;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = clamp01(markIn);
    ctx.scale(pulse, pulse);
    ctx.rotate(0.05 * Math.sin(env.elapsedMs / 700));
    const markPx = variant === 0 ? unit * 3.4 : unit * 2.2;
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
    ctx.globalAlpha = tIn;
    ctx.fillText(line, cx, cursor + i * m.qLineH + m.qLineH * 0.82 + (1 - tIn) * unit * 0.6);
  });
  ctx.restore();

  // Accent underline hugging the last question line — variant 1 only.
  if (variant === 1) {
    const lastLine = m.qLines[m.qLines.length - 1];
    ctx.save();
    ctx.font = `800 ${m.qPx}px ${FONT_SANS}`;
    const lw = ctx.measureText(lastLine).width;
    const uIn = easeOutCubic(enterT(env, 350, 250 + m.qLines.length * 110));
    const uy = cursor + (m.qLines.length - 1) * m.qLineH + m.qLineH * 0.98;
    ctx.globalAlpha = uIn;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - (lw / 2) * uIn, uy);
    ctx.lineTo(cx + (lw / 2) * uIn, uy);
    ctx.stroke();
    ctx.restore();
  }
  cursor += m.qBlockH;

  // ── Hint ─────────────────────────────────────────────────────────────────
  if (m.hintLines.length) {
    cursor += m.gapToHint;
    ctx.save();
    // Duration-aware: the hint should land only once the question has been read.
    ctx.globalAlpha = easeOutCubic(Math.max(enterT(env, 350, 600), env.p > 0.35 ? 1 : 0));
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
    ctx.globalAlpha = Math.min(1, ctaIn);
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
