import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, roundRect, drawSceneTitle, beatWindow, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type CompareScene = Extract<Scene, { kind: "compare" }>;

const DIM_ALPHA = 0.85;

export function paintCompare(ctx: CanvasRenderingContext2D, scene: CompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + 2 + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const verdictBeat = scene.sayVerdict ? offset + 2 : -1;

  const band = drawSceneTitle(ctx, scene.title, layout, env.p, accent, { centered: true });
  const panelsTop = contentY + band + unit * 0.3;
  const verdictBand = scene.verdict ? unit * 3.2 : unit * 0.5;
  const gap = unit * (vertical ? 0.9 : 1.4);

  const stacked = vertical;
  const pw = stacked ? contentW : (contentW - gap) / 2;
  const availH = contentH - (panelsTop - contentY) - verdictBand;

  // Height a panel actually needs for its title + items, so a 2-item panel in
  // a stacked layout hugs its content instead of ballooning to half the frame.
  const panelContentH = (items: string[]): number => {
    ctx.font = `500 ${unit * 0.85}px ${FONT_SANS}`;
    let h = unit * 2.8;
    for (const item of items) {
      const lines = Math.min(wrapText(ctx, item, pw - unit * 3).length, 2);
      h += unit * 1.2 * lines + unit * 0.6;
    }
    return h + unit * 0.6;
  };

  let ph: number;
  let blockTop = panelsTop;
  if (stacked) {
    const need = Math.max(panelContentH(scene.left.items), panelContentH(scene.right.items));
    ph = Math.min(need, (availH - gap) / 2);
    // Center the two-panel stack in the available height.
    blockTop = panelsTop + Math.max(0, (availH - (ph * 2 + gap)) / 2);
  } else {
    ph = availH;
  }

  const panels = [
    { side: scene.left, x: contentX, y: blockTop, dir: -1, color: accent, glow: accentGlow, beatIdx: offset },
    {
      side: scene.right,
      x: stacked ? contentX : contentX + pw + gap,
      y: stacked ? blockTop + ph + gap : panelsTop,
      dir: 1,
      color: secondary,
      glow: secondaryGlow,
      beatIdx: offset + 1,
    },
  ];

  panels.forEach(({ side, x, y, dir, color, glow, beatIdx }) => {
    const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (bt <= 0) {
      // Ghost panel + side title, so an intro beat never plays over a frame
      // that is empty below the scene title.
      const ghostIn = easeOutCubic(sub(env.p, 0, 0.12));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18 * ghostIn;
        roundRect(ctx, x, y, pw, ph, unit * 0.7);
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.35, unit * 0.3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
        ctx.fillStyle = color;
        ctx.fillText(side.title, x + unit, y + unit * 1.5);
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, bt * 2.5));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent || active >= verdictBeat && verdictBeat > 0 ? 1 : active > beatIdx ? DIM_ALPHA : 1;

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    ctx.translate(dir * (1 - appear) * unit * 1.6, 0);

    if (isCurrent) {
      // Breathing glow while this panel is the one being narrated.
      ctx.shadowColor = glow;
      ctx.shadowBlur = unit * (0.75 + 0.3 * Math.sin(env.elapsedMs / 240));
    }
    roundRect(ctx, x, y, pw, ph, unit * 0.7);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, pw, ph, unit * 0.7);
    // A non-active panel keeps a clearly visible tinted border — with the old
    // 1px dark border, a finished panel collapsed visually into just its accent
    // top strip (a bare horizontal line) with floating bullet text.
    ctx.strokeStyle = isCurrent ? color : rgba(color, 0.45);
    ctx.lineWidth = isCurrent ? 2.5 : unit * 0.05;
    ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, pw, unit * 0.24, unit * 0.12);
    ctx.fill();

    let titleX = x + unit;
    if (side.icon) {
      // Emoji icon leading the panel title.
      ctx.font = `${unit * 1.2}px ${FONT_SANS}`;
      ctx.fillText(side.icon, titleX, y + unit * 1.55);
      titleX += ctx.measureText(side.icon).width + unit * 0.45;
    }
    ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(side.title, titleX, y + unit * 1.5);

    ctx.font = `500 ${unit * 0.85}px ${FONT_SANS}`;
    let iy = y + unit * 2.8;
    side.items.forEach((item, i) => {
      const it = clamp01(bt * side.items.length - i * 0.5);
      if (it <= 0) return;
      const ease = easeOutCubic(it);
      const slide = (1 - ease) * unit * 1.4 * dir;
      const pop = easeOutBack(clamp01(it * 1.6));
      ctx.save();
      ctx.translate(slide, 0);
      ctx.globalAlpha = appear * alpha * ease;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + unit * 1.2, iy - unit * 0.28, unit * 0.16 * Math.max(0.01, pop), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      const lines = wrapText(ctx, item, pw - unit * 3);
      lines.slice(0, 2).forEach((line, li) => ctx.fillText(line, x + unit * 1.9, iy + li * unit * 1.2));
      ctx.restore();
      iy += unit * 1.2 * Math.min(lines.length, 2) + unit * 0.6;
    });
    ctx.restore();
  });

  const rightWin = beatWindow(env.beats, offset + 1, totalBeats);
  const vsIn = easeOutBack(sub(env.p, rightWin.start, 0.1));
  if (vsIn > 0) {
    const vx = stacked ? contentX + contentW / 2 : contentX + pw + gap / 2;
    const vy = stacked ? blockTop + ph + gap / 2 : panelsTop + ph / 2;
    const vsPulse = 1 + 0.05 * Math.sin(env.elapsedMs / 260);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vsIn * vsPulse, vsIn * vsPulse);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.6;
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
