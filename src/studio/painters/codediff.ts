import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CodediffScene = Extract<Scene, { kind: "codediff" }>;

const GOOD = THEME.good;
const DANGER = "#f87171";
const MIN_COLS = 30;
const SIGN: Record<"same" | "add" | "del", string> = { same: "", add: "+", del: "-" };

/**
 * A unified inline code-diff panel. `same` context lines set the file's shape
 * immediately; each beat reveals one hunk of `add`/`del` lines (green additions,
 * red deletions with a strikethrough) sliding in behind a +/- gutter. The active
 * hunk gets a breathing accent edge and a left→right scan shimmer; not-yet-revealed
 * diff lines hold as dashed ghosts so the panel height never jumps. One column,
 * so it reads the same in 16:9 and 9:16. Beats = sayIntro? + steps.
 */
export function paintCodediff(ctx: CanvasRenderingContext2D, scene: CodediffScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  // Earliest step that focuses each line → when it reveals. `same` context lines
  // are always visible (-1); a diff line no step references reveals at step 0.
  const revealAt = scene.lines.map((ln) => (ln.kind === "same" ? -1 : Infinity));
  scene.steps.forEach((s, k) => {
    s.focus.forEach((i) => {
      if (i >= 0 && i < revealAt.length && revealAt[i] === Infinity) revealAt[i] = k;
    });
  });
  for (let i = 0; i < revealAt.length; i++) if (revealAt[i] === Infinity) revealAt[i] = 0;
  const focusNow = new Set(activeStep >= 0 ? scene.steps[activeStep].focus : []);

  const frameIn = easeOutCubic(enterT(env, 340));
  const areaY = contentY + band;
  const areaH = contentH - band;
  const fx = contentX;
  const fw = contentW;
  const barH = unit * 1.7;
  const sbH = unit * 0.9;
  const gutterW = unit * 1.4;
  const pad = unit * 0.7;
  const codeW = fw - gutterW - pad * 2;

  const nLines = scene.lines.length;
  const longest = Math.max(MIN_COLS, ...scene.lines.map((l) => l.text.length + 1));
  const fontPx = Math.min((codeW / longest) * 1.62, vertical ? unit * 1.1 : unit * 0.92);
  const lineH = fontPx * 1.7;
  const bottom = vertical ? Math.min(areaY + areaH, layout.h * 0.92) : areaY + areaH;
  const availH = bottom - areaY;
  const fh = Math.min(availH, barH + lineH * (nLines + 0.9) + sbH);
  const fy = areaY + Math.max(0, (availH - fh) / 2);
  const codeTop = fy + barH + lineH * 0.4;

  ctx.save();
  ctx.globalAlpha = frameIn;

  // Panel shell + drop shadow.
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = unit * 1.6;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, fx, fy, fw, fh, unit * 0.7);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, fx, fy, fw, fh, unit * 0.7);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Title bar.
  ctx.save();
  roundRect(ctx, fx, fy, fw, barH, unit * 0.7);
  ctx.clip();
  const tb = ctx.createLinearGradient(fx, fy, fx, fy + barH);
  tb.addColorStop(0, "#161b22");
  tb.addColorStop(1, "#12161d");
  ctx.fillStyle = tb;
  ctx.fillRect(fx, fy, fw, barH);
  ctx.restore();
  ctx.strokeStyle = "rgba(48,54,64,0.45)";
  ctx.beginPath();
  ctx.moveTo(fx, fy + barH);
  ctx.lineTo(fx + fw, fy + barH);
  ctx.stroke();
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(fx + unit * (0.9 + i * 0.8), fy + barH / 2, unit * 0.21, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.font = `600 ${unit * 0.72}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textBaseline = "middle";
  ctx.fillText(scene.filename, fx + unit * 3.4, fy + barH / 2);
  ctx.textBaseline = "alphabetic";

  // +N / −M change counts on the right of the bar.
  const adds = scene.lines.filter((l) => l.kind === "add").length;
  const dels = scene.lines.filter((l) => l.kind === "del").length;
  ctx.font = `700 ${unit * 0.62}px ${FONT_MONO}`;
  const badge = `+${adds}  -${dels}`;
  const bw = ctx.measureText(badge).width + unit * 0.9;
  roundRect(ctx, fx + fw - bw - unit * 0.6, fy + barH / 2 - unit * 0.5, bw, unit, unit * 0.25);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = rgba(GOOD, 0.85);
  ctx.fillText(`+${adds}`, fx + fw - bw - unit * 0.2, fy + barH / 2);
  const plusW = ctx.measureText(`+${adds}`).width;
  ctx.fillStyle = rgba(DANGER, 0.85);
  ctx.fillText(`  -${dels}`, fx + fw - bw - unit * 0.2 + plusW, fy + barH / 2);
  ctx.textBaseline = "alphabetic";

  // Sign-gutter background strip.
  ctx.fillStyle = "rgba(13,17,23,0.5)";
  ctx.fillRect(fx, fy + barH, gutterW, fh - barH - sbH);

  // Clip the code body.
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy + barH, fw, fh - barH - sbH);
  ctx.clip();

  scene.lines.forEach((ln, i) => {
    const y = codeTop + (i + 1) * lineH;
    const rowY = y - lineH + fontPx * 0.4;
    const rev = revealAt[i];
    const pending = ln.kind !== "same" && rev > activeStep;
    const revealingNow = rev === activeStep && ln.kind !== "same";
    const localT = revealingNow ? easeOutCubic(clamp01(stepT * 1.6)) : 1;

    if (pending) {
      // Not yet reached — dashed placeholder keeps the panel height stable.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "rgba(148,163,184,0.9)";
      ctx.lineWidth = Math.max(1, unit * 0.05);
      ctx.setLineDash([unit * 0.3, unit * 0.26]);
      ctx.beginPath();
      ctx.moveTo(fx + gutterW + pad, y - fontPx * 0.32);
      ctx.lineTo(fx + gutterW + pad + Math.min(codeW, (ln.text.length + 1) * fontPx * 0.62), y - fontPx * 0.32);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    const tone = ln.kind === "add" ? GOOD : ln.kind === "del" ? DANGER : null;
    const isFocus = focusNow.has(i);
    const slide = revealingNow ? (1 - localT) * unit * 1.1 : 0;

    ctx.save();
    ctx.globalAlpha = revealingNow ? localT : 1;
    ctx.translate(slide, 0);

    // Row wash: diff tone, plus an extra accent pulse on the active hunk.
    if (tone) {
      ctx.fillStyle = rgba(tone, ln.kind === "add" ? 0.14 : 0.11);
      ctx.fillRect(fx, rowY, fw, lineH);
    }
    if (isFocus) {
      ctx.fillStyle = rgba(accent, 0.05 + 0.05 * idle(env, 1800));
      ctx.fillRect(fx, rowY, fw, lineH);
      // Breathing edge bar.
      ctx.fillStyle = rgba(accent, 0.5 + 0.4 * idle(env, 1600));
      ctx.fillRect(fx, rowY, unit * 0.16, lineH);
    } else if (tone) {
      ctx.fillStyle = rgba(tone, 0.7);
      ctx.fillRect(fx, rowY, unit * 0.12, lineH);
    }

    // +/- sign in the gutter (pops on reveal).
    const sign = SIGN[ln.kind];
    if (sign) {
      const pop = revealingNow ? easeOutBack(localT) : 1;
      ctx.font = `800 ${fontPx * 1.05 * pop}px ${FONT_MONO}`;
      ctx.fillStyle = tone ?? THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(sign, fx + gutterW / 2, y);
      ctx.textAlign = "start";
    }

    // The code text.
    ctx.font = `${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle =
      ln.kind === "add" ? rgba(GOOD, 0.95) : ln.kind === "del" ? rgba(DANGER, 0.85) : THEME.textDim;
    const tx = fx + gutterW + pad;
    ctx.fillText(ln.text, tx, y);

    // Deletions get struck through.
    if (ln.kind === "del") {
      ctx.strokeStyle = rgba(DANGER, 0.6);
      ctx.lineWidth = Math.max(1, fontPx * 0.06);
      const w = Math.min(codeW, ctx.measureText(ln.text).width);
      ctx.beginPath();
      ctx.moveTo(tx, y - fontPx * 0.3);
      ctx.lineTo(tx + w, y - fontPx * 0.3);
      ctx.stroke();
    }

    // Scan shimmer sweeping across the active hunk's added lines.
    if (isFocus && ln.kind !== "del") {
      const sweep = (env.elapsedMs % 2200) / 2200;
      const sx = fx + gutterW + sweep * (fw - gutterW);
      const g = ctx.createLinearGradient(sx - unit * 1.2, 0, sx + unit * 1.2, 0);
      g.addColorStop(0, rgba(accent, 0));
      g.addColorStop(0.5, rgba(accent, 0.16));
      g.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(fx + gutterW, rowY, fw - gutterW, lineH);
    }

    ctx.restore();
  });

  ctx.restore();

  // Reveal glow on the panel while a hunk lands.
  if (hunkLanding(scene, activeStep) && stepT < 1) {
    ctx.save();
    ctx.globalAlpha = frameIn * (1 - stepT) * 0.5;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 1.4;
    roundRect(ctx, fx, fy, fw, fh, unit * 0.7);
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * 0.1;
    ctx.stroke();
    ctx.restore();
  }

  // Status bar.
  ctx.fillStyle = "#161b22";
  roundRect(ctx, fx, fy + fh - sbH, fw, sbH, unit * 0.35);
  ctx.fill();
  ctx.fillStyle = THEME.textFaint;
  ctx.font = `500 ${unit * 0.55}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText(scene.lang.toUpperCase(), fx + unit * 0.8, fy + fh - sbH / 2);
  const step = Math.max(0, activeStep) + 1;
  ctx.textAlign = "right";
  ctx.fillText(`hunk ${Math.min(step, scene.steps.length)}/${scene.steps.length}`, fx + fw - unit * 0.8, fy + fh - sbH / 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  ctx.restore();
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** True when the active step reveals at least one add/del line (drives the panel glow). */
function hunkLanding(scene: CodediffScene, activeStep: number): boolean {
  if (activeStep < 0 || activeStep >= scene.steps.length) return false;
  return scene.steps[activeStep].focus.some((i) => i >= 0 && i < scene.lines.length && scene.lines[i].kind !== "same");
}
