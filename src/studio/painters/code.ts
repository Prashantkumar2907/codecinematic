import { introBeatCount, type Scene } from "../schema";
import { tokenizeLine } from "../tokenize";
import { THEME, FONT_MONO, FONT_SANS, easeOutCubic, sub, clamp01, roundRect, beatWindow, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type CodeScene = Extract<Scene, { kind: "code" }>;

/** Fraction of a segment's beat spent typing; the rest holds for listening. */
const TYPE_WITHIN_BEAT = 0.88;
const BASE_COLS = 46;

type TypingState = {
  lines: { content: string; number: number; typedChars: number }[];
  activeIndex: number;
  typing: boolean;
  activeSegment: number;
};

function typingState(scene: CodeScene, env: PaintEnv, offset: number, totalBeats: number): TypingState {
  const rawLines = scene.code.split("\n");
  const lines: TypingState["lines"] = [];
  let activeIndex = 0;
  let typing = false;
  let activeSegment = -1;

  for (const [k, seg] of scene.segments.entries()) {
    const win = beatWindow(env.beats, offset + k, totalBeats);
    const q = clamp01((env.p - win.start) / Math.max((win.end - win.start) * TYPE_WITHIN_BEAT, 0.001));
    if (env.p >= win.start && env.p < win.end) activeSegment = k;
    if (q <= 0) break;

    const segLines = rawLines.slice(seg.fromLine - 1, seg.toLine);
    const charCounts = segLines.map((l) => Math.max(Array.from(l).length, 1) + 2);
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    let budget = totalChars * q;

    for (let i = 0; i < segLines.length; i++) {
      const lineNumber = seg.fromLine + i;
      const chars = Array.from(segLines[i]).length;
      if (budget >= charCounts[i]) {
        lines.push({ content: segLines[i], number: lineNumber, typedChars: chars });
        budget -= charCounts[i];
        activeIndex = Math.min(lineNumber, rawLines.length) - 1;
      } else {
        const typed = Math.min(Math.floor(budget), chars);
        lines.push({ content: segLines[i], number: lineNumber, typedChars: typed });
        activeIndex = lineNumber - 1;
        typing = true;
        budget = 0;
        break;
      }
    }
    if (q < 1) break;
  }
  return { lines, activeIndex, typing, activeSegment };
}

export function paintCode(ctx: CanvasRenderingContext2D, scene: CodeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft } = env.palette;
  const focus = new Set(scene.focusLines);
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.segments.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const frameIn = easeOutCubic(sub(env.p, 0, 0.1));
  const fx = contentX;
  const fw = contentW;
  const fh = contentH * (vertical ? 0.92 : 0.96);
  const fy = contentY + (contentH - fh) / 2;

  ctx.save();
  ctx.globalAlpha = frameIn;

  ctx.shadowColor = "rgba(56,189,248,0.05)";
  ctx.shadowBlur = 60;
  roundRect(ctx, fx - 2, fy - 2, fw + 4, fh + 4, unit * 0.75);
  ctx.strokeStyle = "rgba(56,189,248,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, fx, fy, fw, fh, unit * 0.7);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, fx, fy, fw, fh, unit * 0.7);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.stroke();

  const barH = unit * 1.7;
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

  ctx.font = `500 ${unit * 0.72}px ${FONT_SANS}`;
  const tabX = fx + unit * 3.4;
  const tabW = Math.min(ctx.measureText(scene.title).width + unit * 1.6, fw * 0.5);
  ctx.fillStyle = THEME.panel;
  roundRect(ctx, tabX, fy + barH * 0.16, tabW, barH * 0.84, unit * 0.4);
  ctx.fill();
  ctx.fillStyle = rgba(accent, 0.6);
  ctx.fillRect(tabX + unit * 0.3, fy + barH * 0.16, tabW - unit * 0.6, 2);
  ctx.fillStyle = THEME.text;
  ctx.fillText(scene.title, tabX + unit * 0.8, fy + barH * 0.68);

  const langTxt = scene.lang.toUpperCase();
  ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
  const lw = ctx.measureText(langTxt).width + unit * 0.7;
  ctx.fillStyle = accentSoft;
  roundRect(ctx, fx + fw - lw - unit * 0.6, fy + barH / 2 - unit * 0.5, lw, unit, unit * 0.25);
  ctx.fill();
  ctx.fillStyle = rgba(accent, 0.75);
  ctx.fillText(langTxt, fx + fw - lw - unit * 0.25, fy + barH / 2 + unit * 0.22);

  const gutterW = unit * 1.9;
  const codeW = fw - gutterW - unit * 1.1;
  const longestLine = Math.max(BASE_COLS, ...scene.code.split("\n").map((l) => Array.from(l).length));
  const fontPx = Math.min((codeW / longestLine) * 1.62, vertical ? unit * 1.15 : unit * 0.95);
  const lineH = fontPx * 1.55;
  const codeTop = fy + barH + lineH * 0.4;
  const codeAreaH = fh - barH - unit * 1.4;
  const maxVisible = Math.floor(codeAreaH / lineH);

  ctx.fillStyle = "rgba(13,17,23,0.35)";
  ctx.fillRect(fx, fy + barH, gutterW, fh - barH);

  const state = typingState(scene, env, offset, totalBeats);
  const activeSegRange =
    state.activeSegment >= 0 ? scene.segments[state.activeSegment] : null;
  const startIdx = Math.max(0, state.lines.length - maxVisible);
  const visible = state.lines.slice(startIdx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy + barH, fw, fh - barH - unit * 0.5);
  ctx.clip();

  visible.forEach((line, vi) => {
    const y = codeTop + (vi + 1) * lineH;
    const isActive = line.number - 1 === state.activeIndex && state.typing;
    const isFocus = focus.has(line.number);
    const inActiveSegment =
      activeSegRange !== null && line.number >= activeSegRange.fromLine && line.number <= activeSegRange.toLine;

    if (isActive || isFocus || inActiveSegment) {
      ctx.fillStyle = isActive
        ? "rgba(56,189,248,0.07)"
        : inActiveSegment
          ? "rgba(56,189,248,0.035)"
          : "rgba(255,255,255,0.025)";
      ctx.fillRect(fx, y - lineH + fontPx * 0.35, fw, lineH);
      if (isFocus) {
        ctx.fillStyle = rgba(accent, 0.5);
        ctx.fillRect(fx + gutterW, y - lineH + fontPx * 0.35, 3, lineH);
      }
    }

    ctx.font = `${fontPx * 0.8}px ${FONT_MONO}`;
    ctx.fillStyle = isActive ? rgba(accent, 0.6) : "rgba(100,116,139,0.4)";
    ctx.textAlign = "right";
    ctx.fillText(String(line.number), fx + gutterW - unit * 0.35, y);
    ctx.textAlign = "start";

    ctx.font = `${fontPx}px ${FONT_MONO}`;
    let cx = fx + gutterW + unit * 0.55;
    let drawn = 0;
    for (const token of tokenizeLine(line.content, scene.lang)) {
      if (drawn >= line.typedChars) break;
      const chars = Array.from(token.text);
      const take = Math.min(chars.length, line.typedChars - drawn);
      const text = chars.slice(0, take).join("");
      ctx.fillStyle = token.color;
      ctx.fillText(text, cx, y);
      cx += ctx.measureText(text).width;
      drawn += take;
    }

    if (isActive && Math.floor(env.elapsedMs / 460) % 2 === 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(cx + fontPx * 0.12, y - fontPx * 0.85, fontPx * 0.5, fontPx * 1.05);
    }
  });

  if (state.lines.length === 0 && active < offset) {
    ctx.font = `${fontPx}px ${FONT_MONO}`;
    if (Math.floor(env.elapsedMs / 460) % 2 === 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(fx + gutterW + unit * 0.55, codeTop + lineH - fontPx * 0.85, fontPx * 0.5, fontPx * 1.05);
    }
  }
  ctx.restore();

  const sbH = unit * 1.0;
  ctx.fillStyle = "#161b22";
  roundRect(ctx, fx, fy + fh - sbH, fw, sbH, unit * 0.35);
  ctx.fill();
  ctx.fillStyle = THEME.textFaint;
  ctx.font = `500 ${unit * 0.55}px ${FONT_SANS}`;
  ctx.fillText(`Ln ${state.activeIndex + 1}`, fx + unit * 0.8, fy + fh - sbH * 0.32);
  ctx.fillText("UTF-8", fx + fw - unit * 2.2, fy + fh - sbH * 0.32);
  ctx.restore();
}
