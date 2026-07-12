import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, roundRect, beatWindow, beatT, activeBeatIndex } from "./common";
import type { PaintEnv } from "./index";

type CompareScene = Extract<Scene, { kind: "compare" }>;

const DIM_ALPHA = 0.65;

export function paintCompare(ctx: CanvasRenderingContext2D, scene: CompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + 2 + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const verdictBeat = scene.sayVerdict ? offset + 2 : -1;

  const titleIn = easeOutCubic(sub(env.p, 0, 0.12));
  ctx.save();
  ctx.globalAlpha = titleIn;
  ctx.textAlign = "center";
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(scene.title, w / 2, contentY + unit * 1.4);
  ctx.restore();

  const panelsTop = contentY + unit * 2.6;
  const verdictBand = scene.verdict ? unit * 3.2 : unit * 0.5;
  const gap = unit * (vertical ? 0.9 : 1.4);

  const stacked = vertical;
  const pw = stacked ? contentW : (contentW - gap) / 2;
  const ph = stacked ? (contentH - (panelsTop - contentY) - verdictBand - gap) / 2 : contentH - (panelsTop - contentY) - verdictBand;

  const panels = [
    { side: scene.left, x: contentX, y: panelsTop, dir: -1, color: accent, glow: accentGlow, beatIdx: offset },
    {
      side: scene.right,
      x: stacked ? contentX : contentX + pw + gap,
      y: stacked ? panelsTop + ph + gap : panelsTop,
      dir: 1,
      color: secondary,
      glow: secondaryGlow,
      beatIdx: offset + 1,
    },
  ];

  panels.forEach(({ side, x, y, dir, color, glow, beatIdx }) => {
    const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (bt <= 0) return;
    const appear = easeOutCubic(Math.min(1, bt * 2.5));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent || active >= verdictBeat && verdictBeat > 0 ? 1 : active > beatIdx ? DIM_ALPHA : 1;

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    ctx.translate(dir * (1 - appear) * unit * 1.6, 0);

    if (isCurrent) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = unit * 0.8;
    }
    roundRect(ctx, x, y, pw, ph, unit * 0.7);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, pw, ph, unit * 0.7);
    ctx.strokeStyle = isCurrent ? color : THEME.panelBorder;
    ctx.lineWidth = isCurrent ? 2.5 : 1;
    ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, pw, unit * 0.24, unit * 0.12);
    ctx.fill();

    ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(side.title, x + unit, y + unit * 1.5);

    ctx.font = `500 ${unit * 0.85}px ${FONT_SANS}`;
    let iy = y + unit * 2.8;
    side.items.forEach((item, i) => {
      const it = clamp01(bt * side.items.length - i * 0.5);
      if (it <= 0) return;
      ctx.globalAlpha = appear * alpha * easeOutCubic(it);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + unit * 1.2, iy - unit * 0.28, unit * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      const lines = wrapText(ctx, item, pw - unit * 3);
      lines.slice(0, 2).forEach((line, li) => ctx.fillText(line, x + unit * 1.9, iy + li * unit * 1.2));
      iy += unit * 1.2 * Math.min(lines.length, 2) + unit * 0.6;
    });
    ctx.restore();
  });

  const rightWin = beatWindow(env.beats, offset + 1, totalBeats);
  const vsIn = easeOutBack(sub(env.p, rightWin.start, 0.1));
  if (vsIn > 0) {
    const vx = stacked ? contentX + contentW / 2 : contentX + pw + gap / 2;
    const vy = stacked ? panelsTop + ph + gap / 2 : panelsTop + ph / 2;
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vsIn, vsIn);
    ctx.beginPath();
    ctx.arc(0, 0, unit * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = "#06121a";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();
    ctx.font = `900 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, unit * 0.3);
    ctx.restore();
  }

  if (scene.verdict) {
    const t = scene.sayVerdict
      ? easeOutCubic(Math.min(1, beatT(env.beats, verdictBeat, totalBeats, env.p) * 3))
      : easeOutCubic(sub(env.p, 0.78, 0.15));
    if (t > 0) {
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      const ty = contentY + contentH - unit * 0.8;
      const lines = wrapText(ctx, scene.verdict, contentW * 0.9);
      ctx.fillStyle = THEME.good;
      lines.forEach((line, i) => ctx.fillText(`✓ ${line}`, w / 2, ty + i * unit * 1.3 - (lines.length - 1) * unit * 1.3));
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
