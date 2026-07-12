import type { SceneScript } from "./schema";
import {
  drawBackground,
  roundRect,
  wrapText,
  fitFontSize,
  paletteForSubject,
  variantOf,
  BG_MOTIFS,
  rgba,
  THEME,
  FONT_SANS,
  FONT_MONO,
} from "./painters/common";

const THUMB_W = 1280;
const THUMB_H = 720;

/** The word most worth colouring: a number > ALL-CAPS > the longest word. */
function pickKeyword(words: string[]): string {
  const numeric = words.find((w) => /\d/.test(w));
  if (numeric) return numeric;
  const caps = words.find((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (caps) return caps;
  return [...words].sort((a, b) => b.length - a.length)[0] ?? "";
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  keyword: string,
  x: number,
  topBaseline: number,
  lineH: number,
  accent: string,
  centered: boolean,
  blockW: number
) {
  let highlighted = false;
  lines.forEach((line, i) => {
    const y = topBaseline + i * lineH;
    const words = line.split(" ");
    const lineW = ctx.measureText(line).width;
    let wx = centered ? x + (blockW - lineW) / 2 : x;
    for (const word of words) {
      const isKey = !highlighted && word === keyword;
      ctx.fillStyle = isKey ? accent : THEME.text;
      ctx.fillText(word, wx, y);
      if (isKey) highlighted = true;
      wx += ctx.measureText(word + " ").width;
    }
  });
}

/**
 * Renders a YouTube thumbnail for the script; resolves to a PNG blob.
 * Palette follows the subject; layout is one of 3 variants seeded by the topic
 * so a channel page doesn't look like one repeated template.
 */
export function renderThumbnail(script: SceneScript, brand: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d")!;
  const unit = THUMB_H / 24;
  const palette = paletteForSubject(script.subject);
  const { accent } = palette;
  const variant = variantOf(`thumb:${script.topic}`, 3);
  const motif = variantOf(`${script.topic}|${script.subject}`, BG_MOTIFS);

  drawBackground(ctx, THUMB_W, THUMB_H, 4000, palette, motif);

  const headline = script.topic.split(":")[0].trim();
  const keyword = pickKeyword(headline.split(" "));
  const pillLabel = (script.submodule || script.module || script.subject).toUpperCase();

  const pill = (px: number, py: number) => {
    ctx.font = `800 ${unit * 1.0}px ${FONT_SANS}`;
    const pw = ctx.measureText(pillLabel).width + unit * 2;
    roundRect(ctx, px, py, pw, unit * 2.0, unit);
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(pillLabel, px + unit, py + unit * 1.35);
    return pw;
  };

  if (variant === 2) {
    // Split: headline left, giant keyword initial in a panel on the right.
    const panelW = THUMB_W * 0.3;
    const panelX = THUMB_W - panelW - unit * 1.6;
    ctx.save();
    roundRect(ctx, panelX, unit * 1.6, panelW, THUMB_H - unit * 3.2, unit * 0.9);
    ctx.fillStyle = "rgba(13,17,23,0.72)";
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 3;
    ctx.stroke();
    const initial = (keyword[0] ?? "?").toUpperCase();
    ctx.font = `900 ${unit * 11}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(accent, 0.85);
    ctx.shadowColor = palette.accentGlow;
    ctx.shadowBlur = unit * 1.5;
    ctx.fillText(initial, panelX + panelW / 2, THUMB_H * 0.56);
    ctx.shadowBlur = 0;
    ctx.font = `700 ${unit * 0.85}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(script.subject.toUpperCase(), panelX + panelW / 2, THUMB_H * 0.56 + unit * 3.2);
    ctx.textAlign = "start";
    ctx.restore();

    pill(unit * 1.8, unit * 1.8);
    const maxW = panelX - unit * 3.2;
    const px = fitFontSize(ctx, headline, { maxW, startPx: unit * 4.0, minPx: unit * 2.0, weight: 900 });
    ctx.font = `900 ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, headline, maxW).slice(0, 3);
    const lineH = px * 1.1;
    const blockTop = THUMB_H * 0.54 - (lines.length * lineH) / 2;
    drawHeadline(ctx, lines, keyword, unit * 1.8, blockTop + lineH, lineH, accent, false, maxW);
    ctx.fillStyle = accent;
    ctx.fillRect(unit * 1.8, blockTop + lines.length * lineH + unit * 0.9, unit * 6.5, unit * 0.35);
  } else if (variant === 1) {
    // Centered impact card.
    const glow = ctx.createRadialGradient(THUMB_W / 2, THUMB_H * 0.5, 0, THUMB_W / 2, THUMB_H * 0.5, THUMB_H * 0.75);
    glow.addColorStop(0, rgba(accent, 0.14));
    glow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    ctx.font = `800 ${unit * 1.0}px ${FONT_SANS}`;
    const pw = ctx.measureText(pillLabel).width + unit * 2;
    pill((THUMB_W - pw) / 2, unit * 2.0);

    const maxW = THUMB_W - unit * 8;
    const px = fitFontSize(ctx, headline, { maxW, startPx: unit * 4.6, minPx: unit * 2.2, weight: 900 });
    ctx.font = `900 ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, headline, maxW).slice(0, 3);
    const lineH = px * 1.1;
    const blockTop = THUMB_H * 0.55 - (lines.length * lineH) / 2;
    drawHeadline(ctx, lines, keyword, unit * 4, blockTop + lineH, lineH, accent, true, THUMB_W - unit * 8);
    ctx.fillStyle = accent;
    ctx.fillRect(THUMB_W / 2 - unit * 3.5, blockTop + lines.length * lineH + unit * 0.9, unit * 7, unit * 0.35);
  } else {
    // Editorial left (evolved original): accent edge + off-corner ring.
    ctx.strokeStyle = rgba(accent, 0.12);
    ctx.lineWidth = unit * 0.5;
    ctx.beginPath();
    ctx.arc(THUMB_W * 0.94, THUMB_H * 0.9, THUMB_H * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(THUMB_W * 0.94, THUMB_H * 0.9, THUMB_H * 0.26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, unit * 0.5, THUMB_H);

    pill(unit * 2, unit * 2.2);

    const maxW = THUMB_W - unit * 5;
    const px = fitFontSize(ctx, headline, { maxW, startPx: unit * 4.4, minPx: unit * 2.2, weight: 900 });
    ctx.font = `900 ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, headline, maxW).slice(0, 3);
    const lineH = px * 1.12;
    const blockTop = THUMB_H * 0.52 - (lines.length * lineH) / 2;
    drawHeadline(ctx, lines, keyword, unit * 2, blockTop + lineH, lineH, accent, false, maxW);
    ctx.fillStyle = accent;
    ctx.fillRect(unit * 2, blockTop + lines.length * lineH + unit * 0.9, unit * 7, unit * 0.35);
  }

  ctx.font = `700 ${unit * 0.95}px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(230,237,243,0.55)";
  ctx.textAlign = variant === 1 ? "center" : "start";
  ctx.fillText(`</> ${brand}`, variant === 1 ? THUMB_W / 2 : unit * 2, THUMB_H - unit * 1.4);
  ctx.textAlign = "start";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("thumbnail toBlob failed"))), "image/png");
  });
}
