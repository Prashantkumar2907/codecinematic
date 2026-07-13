import type { Scene } from "../schema";
import { THEME, FONT_MONO, FONT_SANS, easeOutCubic, sub, roundRect } from "./common";
import type { PaintEnv } from "./index";

type TerminalScene = Extract<Scene, { kind: "terminal" }>;

const LINES_SPAN = 0.7;

export function paintTerminal(ctx: CanvasRenderingContext2D, scene: TerminalScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent } = env.palette;

  const frameIn = easeOutCubic(sub(env.p, 0, 0.15));
  const barH = unit * 1.6;
  const longestChars = Math.max(8, ...scene.lines.map((l) => Array.from(l).length + (l.startsWith("$") ? 2 : 0)));
  const textAvailW = contentW - unit * 2.0;
  const MONO_ADVANCE = 0.62;
  const fontPx = Math.min(vertical ? unit * 0.95 : unit * 0.85, textAvailW / (longestChars * MONO_ADVANCE));
  const lineH = fontPx * 1.9;
  // Panel hugs its lines (bar + one lead gap + n lines + tail) so a 2-line
  // output doesn't sit in a frame-tall empty box.
  const fh = Math.min(contentH * 0.86, barH + lineH * (scene.lines.length + 1.6));
  const fy = contentY + (contentH - fh) / 2;

  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, contentX, fy, contentW, fh, unit * 0.7);
  ctx.fillStyle = "#0a0e13";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, contentX, fy, contentW, fh, unit * 0.7);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, contentX, fy, contentW, barH, unit * 0.7);
  ctx.clip();
  ctx.fillStyle = "#141a21";
  ctx.fillRect(contentX, fy, contentW, barH);
  ctx.restore();
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(contentX + unit * (0.9 + i * 0.85), fy + barH / 2, unit * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = THEME.textFaint;
  ctx.font = `500 ${unit * 0.7}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("terminal", contentX + contentW / 2, fy + barH * 0.66);
  ctx.textAlign = "start";

  ctx.font = `500 ${fontPx}px ${FONT_MONO}`;
  const textX = contentX + unit * 1.1;
  let y = fy + barH + lineH;

  const n = scene.lines.length;
  let lastVisible = -1;
  scene.lines.forEach((line, i) => {
    const t = sub(env.p, 0.12 + (LINES_SPAN * i) / n, 0.1);
    if (t <= 0) return;
    lastVisible = i;
    ctx.globalAlpha = frameIn * easeOutCubic(t);
    const isCommand = line.startsWith("$");
    if (isCommand) {
      ctx.fillStyle = accent;
      ctx.fillText("$", textX, y + i * lineH);
      ctx.fillStyle = THEME.text;
      ctx.fillText(line.slice(1).trimStart(), textX + fontPx * 1.2, y + i * lineH);
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(line, textX, y + i * lineH);
    }
  });

  if (lastVisible >= 0 && Math.floor(env.elapsedMs / 500) % 2 === 0) {
    const lastLine = scene.lines[lastVisible];
    const prefixW = lastLine.startsWith("$")
      ? fontPx * 1.2 + ctx.measureText(lastLine.slice(1).trimStart()).width
      : ctx.measureText(lastLine).width;
    ctx.globalAlpha = frameIn;
    ctx.fillStyle = accent;
    ctx.fillRect(textX + prefixW + fontPx * 0.3, y + lastVisible * lineH - fontPx, fontPx * 0.55, fontPx * 1.2);
  }
  ctx.restore();
}
