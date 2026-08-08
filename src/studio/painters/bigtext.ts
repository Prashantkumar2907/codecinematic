import type { Scene } from "../schema";
import type { PaintEnv } from "./index";
import {
  THEME,
  FONT_SANS,
  DUR,
  clamp01,
  easeOutCubic,
  stagger,
  springT,
  anticipateT,
  developT,
  departT,
  beatPulse,
  composition,
  applyElevation,
  clearShadow,
} from "./common";

/**
 * REFERENCE IMPLEMENTATION — the template the other 49 rebuilds copy.
 *
 * Which primitive does which job:
 *   springT / anticipateT  entrance with weight (s9 staging)
 *   stagger                sibling cascade, never all on one tick (s3)
 *   developT               spreads the rule and sub-line across the MIDDLE of the
 *                          scene, so a 12s card is not finished at 380ms (s6)
 *   beatPulse              a visible change on every narrated beat (s7)
 *   departT                the card leaves on purpose; 10.x replaced the crossfade
 *                          with hard cuts, so without this it vanishes (s8)
 *   composition(layout)    two per-aspect compositions, not one squeezed (s10)
 *   applyElevation         one light direction and one shadow language (s4)
 *
 * No three.js and no variantOf, per the phase's standing decisions. The previous
 * version was 845 lines with 5 variants, a 3D layer, and private copies of
 * hashStr and easeSpring that common.ts already exported.
 */

type BigtextScene = Extract<Scene, { kind: "bigtext" }>;
type StyledWord = { text: string; type: "normal" | "accent" | "secondary" };

const LINE_H = 1.14;
const PUSH_IN = 0.035;

/** `**word**` reads accent, `__word__` reads secondary; a span may cover many words. */
function tokenize(text: string): StyledWord[] {
  let type: StyledWord["type"] = "normal";
  return text.split(/\s+/).map((raw) => {
    let word = raw;
    let wordType = type;
    if (word.startsWith("**")) {
      wordType = type = "accent";
      word = word.slice(2);
    } else if (word.startsWith("__")) {
      wordType = type = "secondary";
      word = word.slice(2);
    }
    if (word.endsWith("**")) {
      word = word.slice(0, -2);
      type = "normal";
    } else if (word.endsWith("__")) {
      word = word.slice(0, -2);
      type = "normal";
    }
    return { text: word, type: wordType };
  });
}

function measure(ctx: CanvasRenderingContext2D, words: StyledWord[]): number {
  return words.reduce((acc, word, i) => acc + ctx.measureText(word.text + (i < words.length - 1 ? " " : "")).width, 0);
}

function wrap(ctx: CanvasRenderingContext2D, words: StyledWord[], maxW: number): StyledWord[][] {
  const lines: StyledWord[][] = [];
  let line: StyledWord[] = [];
  for (const word of words) {
    if (line.length && measure(ctx, [...line, word]) > maxW) {
      lines.push(line);
      line = [];
    }
    line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Largest even size whose wrap fits the box; even sizes render cleaner on canvas. */
function fit(
  ctx: CanvasRenderingContext2D,
  words: StyledWord[],
  maxW: number,
  maxH: number,
  startPx: number,
  minPx: number
): { px: number; lines: StyledWord[][] } {
  let low = minPx;
  let high = startPx;
  let best = { px: minPx, lines: [] as StyledWord[][] };
  while (low <= high) {
    const mid = Math.floor((low + high) / 2) & ~1;
    ctx.font = `900 ${mid}px ${FONT_SANS}`;
    const lines = wrap(ctx, words, maxW);
    if (lines.length * mid * LINE_H <= maxH) {
      best = { px: mid, lines };
      low = mid + 2;
    } else {
      high = mid - 2;
    }
  }
  if (!best.lines.length) {
    ctx.font = `900 ${minPx}px ${FONT_SANS}`;
    best = { px: minPx, lines: wrap(ctx, words, maxW) };
  }
  return best;
}

function colorFor(type: StyledWord["type"], accent: string, secondary: string): string {
  return type === "accent" ? accent : type === "secondary" ? secondary : THEME.text;
}

function drawStyledLine(
  ctx: CanvasRenderingContext2D,
  line: StyledWord[],
  centerX: number,
  y: number,
  accent: string,
  secondary: string,
  normal: string
) {
  let x = centerX - measure(ctx, line) / 2;
  for (let i = 0; i < line.length; i++) {
    const word = line[i];
    ctx.fillStyle = word.type === "normal" ? normal : colorFor(word.type, accent, secondary);
    ctx.fillText(word.text, x, y);
    x += ctx.measureText(word.text + (i < line.length - 1 ? " " : "")).width;
  }
}

export function paintBigtext(ctx: CanvasRenderingContext2D, scene: BigtextScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { w, unit } = layout;
  const { accent, secondary } = palette;
  const comp = composition(layout);

  const leave = departT(env, DUR.slow);
  if (leave <= 0) return;

  const words = tokenize(scene.text);
  const maxW = layout.contentW * 0.94;
  const maxH = layout.safeH * (scene.sub ? 0.42 : 0.52);
  const { px, lines } = fit(ctx, words, maxW, maxH, unit * 3.4 * comp.titleScale, unit * 1.5);
  const lineH = px * LINE_H;

  const iconPx = scene.icon ? unit * 2.4 * comp.titleScale : 0;
  const iconGap = scene.icon ? unit * 1.1 : 0;
  const ruleGap = unit * 0.9;
  const ruleH = unit * 0.26;
  const subPx = unit * 1.02 * comp.bodyScale;

  ctx.save();
  ctx.font = `500 ${subPx}px ${FONT_SANS}`;
  const subLines = scene.sub ? wrap(ctx, tokenize(scene.sub), maxW * 0.92) : [];
  ctx.restore();
  const subH = subLines.length ? subLines.length * subPx * 1.45 + unit * 1.1 : 0;

  const blockH = iconPx + iconGap + lines.length * lineH + ruleGap + ruleH + subH;
  const bandTop = layout.contentY;
  const bandH = layout.safeBottom - bandTop;
  const top = bandTop + Math.max(0, (bandH - blockH) / 2);

  // Continuous push-in across the whole scene: motion that is not ambient float,
  // so the middle of a long card is never static (s6).
  const push = 1 + PUSH_IN * easeOutCubic(clamp01(env.elapsedMs / Math.max(1, env.durationMs)));
  const beatCount = Math.max(env.beats.length, 1);
  const pulse = beatPulse(env.beats, Math.min(beatCount - 1, Math.floor(env.p * beatCount)), beatCount, env.p);

  ctx.save();
  ctx.globalAlpha = leave;
  const cy = top + blockH / 2;
  ctx.translate(w / 2, cy);
  ctx.scale(push, push);
  ctx.translate(-w / 2, -cy);
  // Departure lifts as it fades, so the hard cut lands on a card already leaving.
  ctx.translate(0, (1 - leave) * -unit * 0.7);

  let y = top;

  if (scene.icon) {
    const t = springT(env, DUR.slow);
    ctx.save();
    ctx.globalAlpha *= clamp01(t * 1.6);
    ctx.textAlign = "center";
    ctx.font = `${iconPx * Math.max(0.01, t)}px ${FONT_SANS}`;
    ctx.fillText(scene.icon, w / 2, y + iconPx);
    ctx.restore();
    y += iconPx + iconGap;
  }

  lines.forEach((line, li) => {
    const t = clamp01(anticipateT(env, DUR.base, stagger(li, lines.length, DUR.step)));
    ctx.save();
    ctx.globalAlpha *= t;
    ctx.textAlign = "start";
    ctx.font = `900 ${px}px ${FONT_SANS}`;
    applyElevation(ctx, unit, "raised");
    drawStyledLine(ctx, line, w / 2, y + px + li * lineH + (1 - t) * unit * 0.55, accent, secondary, THEME.text);
    clearShadow(ctx);
    ctx.restore();
  });
  y += lines.length * lineH + ruleGap;

  // The rule keeps growing through the develop band and breathes on each beat, so
  // the card still changes at second six of a twelve-second hold.
  const ruleW = unit * (comp.stack ? 5.5 : 6.5) * developT(env, 0, 1);
  if (ruleW > 0) {
    ctx.save();
    applyElevation(ctx, unit, "raised");
    ctx.fillStyle = accent;
    ctx.globalAlpha *= 0.85 + 0.15 * pulse;
    const grow = 1 + 0.06 * pulse;
    ctx.fillRect(w / 2 - (ruleW * grow) / 2, y, ruleW * grow, ruleH);
    clearShadow(ctx);
    ctx.restore();
  }
  y += ruleH + unit * 1.1;

  if (subLines.length) {
    ctx.textAlign = "start";
    ctx.font = `500 ${subPx}px ${FONT_SANS}`;
    subLines.forEach((line, i) => {
      const t = clamp01(developT(env, i, subLines.length + 1));
      ctx.save();
      ctx.globalAlpha *= t;
      drawStyledLine(
        ctx,
        line,
        w / 2,
        y + subPx + i * subPx * 1.45 + (1 - t) * unit * 0.3,
        accent,
        secondary,
        THEME.textDim
      );
      ctx.restore();
    });
  }

  ctx.restore();
  ctx.restore();
}
