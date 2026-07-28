import { introBeatCount, type Scene } from "../schema";
import {
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  beatT,
  activeBeatIndex,
  glowRing,
  rgba,
  shade,
  hashStr,
} from "./common";
import type { PaintEnv } from "./index";

type ScrollScene = Extract<Scene, { kind: "scroll" }>;

const MAX_ROWS_PER_LINE = 2;

/**
 * An aged parchment / edict that unfurls: two scroll rods with the paper rolled
 * between them, the bottom rod descending on entrance to reveal the sheet. An
 * optional heading sits at the top under an ink rule; each line[] then writes
 * itself in one per beat (fade + quill typewriter), so historical inscriptions,
 * constitutional articles and royal edicts read the way they were recorded. When
 * the last line lands a wax seal presses in at the foot. Palette-driven: the warm
 * paper, ink and rods are all shaded from the subject accent, wax from secondary.
 * Works in 9:16 (full-width sheet) and 16:9 (centred column).
 */
export function paintScroll(ctx: CanvasRenderingContext2D, scene: ScrollScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;

  const n = scene.lines.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeLine = active - offset;
  const stepT = activeLine >= 0 ? beatT(env.beats, offset + activeLine, totalBeats, env.p) : 0;

  const introIn = easeOutCubic(enterT(env, 380));
  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Warm parchment family, all derived from the subject accent so History reads
  // amber-on-cream, Polity saffron, etc. Wax is the secondary brand colour.
  const paperLit = shade(accent, 0.82);
  const paperDim = shade(accent, 0.6);
  const rodHex = shade(accent, -0.5);
  const ink = shade(accent, -0.64);
  const inkDim = shade(accent, -0.42);

  // Centred sheet. In 9:16 it takes the full content width; in 16:9 a column.
  const panelW = Math.min(contentW, vertical ? contentW : unit * 20);
  const px = contentX + (contentW - panelW) / 2;
  const fullH = Math.min(areaH * 0.96, panelW * (vertical ? 1.5 : 1.05));
  const py = areaY + (areaH - fullH) / 2;
  const rodH = Math.min(unit * 0.85, fullH * 0.07);
  const sway = Math.sin(env.elapsedMs / 2600) * unit * 0.06;

  // Unfurl: top rod fixed, bottom rod descends. Layout is computed against the
  // FULL sheet (stable positions) and clipped to the unrolled height.
  const unroll = easeOutCubic(enterT(env, 760, 120));
  const panelH = Math.max(rodH * 2.2, fullH * unroll);
  const botRodY = py + panelH;

  // ---- Paper body (drawn only over the unrolled span) ----
  ctx.save();
  ctx.globalAlpha = introIn;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = unit * 1.4;
  ctx.shadowOffsetY = unit * 0.5;
  const paperG = ctx.createLinearGradient(px, py, px, botRodY);
  paperG.addColorStop(0, paperLit);
  paperG.addColorStop(0.5, shade(accent, 0.72));
  paperG.addColorStop(1, paperDim);
  roundRect(ctx, px + sway, py, panelW, panelH, unit * 0.25);
  ctx.fillStyle = paperG;
  ctx.fill();
  ctx.restore();

  // Clip everything below to the paper so text is revealed as the sheet unrolls.
  ctx.save();
  roundRect(ctx, px + sway, py, panelW, panelH, unit * 0.25);
  ctx.clip();

  // Deterministic aged fibres + a couple of foxing stains.
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.05);
  ctx.lineWidth = 1;
  const fibres = 9;
  for (let i = 0; i < fibres; i++) {
    const fy = py + (hashStr(scene.id + "f" + i) % 1000) / 1000 * fullH;
    ctx.beginPath();
    ctx.moveTo(px + sway + unit * 0.4, fy);
    ctx.lineTo(px + sway + panelW - unit * 0.4, fy);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const sx = px + sway + (hashStr(scene.id + "sx" + i) % 1000) / 1000 * panelW;
    const sy = py + (hashStr(scene.id + "sy" + i) % 1000) / 1000 * fullH;
    const sr = unit * (1.2 + (hashStr(scene.id + "sr" + i) % 100) / 100);
    const st = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    st.addColorStop(0, rgba(shade(accent, -0.1), 0.06));
    st.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = st;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Warm inner vignette.
  const vig = ctx.createRadialGradient(px + sway + panelW / 2, py + fullH / 2, fullH * 0.2, px + sway + panelW / 2, py + fullH / 2, fullH * 0.75);
  vig.addColorStop(0, rgba(accent, 0));
  vig.addColorStop(1, rgba(shade(accent, -0.2), 0.14));
  ctx.fillStyle = vig;
  ctx.fillRect(px + sway, py, panelW, fullH);
  ctx.restore();

  // ---- Content geometry (against full sheet) ----
  const pad = panelW * (vertical ? 0.08 : 0.09);
  const innerX = px + sway + pad;
  const innerW = panelW - pad * 2;
  let cursorY = py + rodH * 1.4;

  // Heading + ink rule.
  if (scene.heading) {
    const hPx = fitFontSize(ctx, scene.heading, { maxW: innerW, startPx: unit * 1.05, minPx: unit * 0.7, weight: 800 });
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(clamp01((unroll - 0.2) / 0.4));
    ctx.font = `800 ${hPx}px ${FONT_SANS}`;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(scene.heading, px + sway + panelW / 2, cursorY + hPx);
    const ruleY = cursorY + hPx * 1.5;
    ctx.strokeStyle = rgba(ink, 0.5);
    ctx.lineWidth = Math.max(1, unit * 0.05);
    ctx.beginPath();
    ctx.moveTo(innerX + innerW * 0.14, ruleY);
    ctx.lineTo(innerX + innerW * 0.86, ruleY);
    ctx.stroke();
    // Small diamond flourish centred on the rule.
    ctx.fillStyle = rgba(ink, 0.6);
    ctx.save();
    ctx.translate(px + sway + panelW / 2, ruleY);
    ctx.rotate(Math.PI / 4);
    const d = unit * 0.2;
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.restore();
    ctx.restore();
    cursorY = ruleY + unit * 0.7;
  } else {
    cursorY += unit * 0.3;
  }

  const linesTop = cursorY;
  const linesBottom = py + fullH - rodH * 1.5;
  const slotH = (linesBottom - linesTop) / n;
  const hasLabel = scene.lines.some((l) => !!l.label);
  const bodyPx = Math.min(unit * 0.92, slotH * (hasLabel ? 0.3 : 0.36));
  const labelPx = Math.min(unit * 0.56, slotH * 0.2);
  const lineGap = bodyPx * 1.22;

  scene.lines.forEach((line, i) => {
    const reveal =
      i < activeLine ? 1 : i === activeLine ? easeOutCubic(clamp01(stepT * 1.6)) : 0;
    if (reveal <= 0) return;
    const isActive = i === activeLine;
    const charFrac = isActive ? clamp01((stepT - 0.12) / 0.7) : 1;

    const slotY = linesTop + i * slotH;
    let ty = slotY + slotH * 0.5;

    ctx.save();
    ctx.globalAlpha = introIn * reveal;

    // Clause / era label above the body.
    if (line.label) {
      ctx.font = `700 ${labelPx}px ${FONT_MONO}`;
      ctx.fillStyle = inkDim;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(line.label.toUpperCase(), innerX, slotY + labelPx + slotH * 0.06);
      ty = slotY + labelPx + slotH * 0.06 + bodyPx * 0.9;
    }

    // Wrap body, then reveal a character budget across the rows (quill writing).
    ctx.font = `500 ${bodyPx}px ${FONT_SANS}`;
    const rows = wrapText(ctx, line.text, innerW).slice(0, MAX_ROWS_PER_LINE);
    const totalChars = rows.reduce((a, r) => a + r.length, 0);
    let budget = Math.round(totalChars * charFrac);
    const blockH = (rows.length - 1) * lineGap;
    // A label anchors the body's first row below it (top-down); unlabeled
    // lines centre the whole wrapped block in the slot instead.
    let ry = line.label ? ty : ty - blockH / 2;
    let nibX = innerX;
    let nibY = ry;

    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    for (const row of rows) {
      const shown = isActive ? row.slice(0, Math.max(0, budget)) : row;
      if (isActive && charFrac < 1) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
      }
      ctx.fillStyle = ink;
      ctx.fillText(shown, innerX, ry);
      ctx.shadowBlur = 0;
      if (shown.length > 0) {
        nibX = innerX + ctx.measureText(shown).width;
        nibY = ry;
      }
      budget -= row.length;
      ry += lineGap;
    }

    // Quill nib glow at the writing head.
    if (isActive && charFrac > 0 && charFrac < 1) {
      const nb = 0.5 + 0.5 * idle(env, 420);
      ctx.globalAlpha = introIn * reveal * nb;
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.beginPath();
      ctx.arc(nibX + unit * 0.12, nibY, unit * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Faint separator rule beneath every entry but the last.
    if (i < n - 1) {
      ctx.globalAlpha = introIn * reveal * 0.4;
      ctx.strokeStyle = rgba(ink, 0.35);
      ctx.lineWidth = Math.max(1, unit * 0.035);
      const sepY = slotY + slotH - lineGap * 0.15;
      ctx.beginPath();
      ctx.moveTo(innerX, sepY);
      ctx.lineTo(innerX + innerW, sepY);
      ctx.stroke();
    }
    ctx.restore();
  });

  // ---- Wax seal at the foot once the final line lands ----
  const sealReveal = activeLine >= n - 1 ? easeOutBack(clamp01((stepT - 0.25) / 0.75)) : 0;
  if (sealReveal > 0) {
    const scx = px + sway + panelW * (vertical ? 0.5 : 0.78);
    const scy = py + fullH - rodH * 2.0;
    const sr = unit * 1.15 * clamp01(sealReveal);
    ctx.save();
    ctx.globalAlpha = introIn * clamp01(sealReveal);
    // Scalloped wax edge.
    ctx.fillStyle = shade(secondary, -0.15);
    ctx.beginPath();
    const scallops = 16;
    for (let i = 0; i <= scallops; i++) {
      const a = (i / scallops) * Math.PI * 2;
      const rr = sr * (1.02 + 0.08 * Math.sin(a * scallops));
      const x = scx + Math.cos(a) * rr;
      const y = scy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // Wax disc.
    const wg = ctx.createRadialGradient(scx - sr * 0.3, scy - sr * 0.3, sr * 0.1, scx, scy, sr);
    wg.addColorStop(0, shade(secondary, 0.25));
    wg.addColorStop(1, shade(secondary, -0.3));
    ctx.beginPath();
    ctx.arc(scx, scy, sr, 0, Math.PI * 2);
    ctx.fillStyle = wg;
    ctx.fill();
    // Embossed emblem.
    ctx.fillStyle = rgba(shade(secondary, -0.45), 0.75);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${sr * 1.1}px -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillText(scene.seal ?? "❈", scx, scy + sr * 0.04);
    ctx.restore();
    glowRing(ctx, scx, scy, sr * 1.15, secondary, env, 1800);
  }

  ctx.restore(); // clip

  // ---- Scroll rods (drawn over the paper ends, outside the clip) ----
  const drawRod = (ry: number) => {
    const rx = px + sway - unit * 0.35;
    const rw = panelW + unit * 0.7;
    // Curl shadow just inside the rod.
    ctx.save();
    ctx.globalAlpha = introIn * 0.5;
    const cs = ctx.createLinearGradient(0, ry - rodH, 0, ry + rodH);
    cs.addColorStop(0, rgba(shade(accent, -0.3), 0));
    cs.addColorStop(0.5, rgba(shade(accent, -0.3), 0.35));
    cs.addColorStop(1, rgba(shade(accent, -0.3), 0));
    ctx.fillStyle = cs;
    ctx.fillRect(px + sway, ry - rodH, panelW, rodH * 2);
    ctx.restore();
    // Rod body.
    ctx.save();
    ctx.globalAlpha = introIn;
    const rg = ctx.createLinearGradient(0, ry - rodH, 0, ry + rodH);
    rg.addColorStop(0, shade(rodHex, 0.35));
    rg.addColorStop(0.45, rodHex);
    rg.addColorStop(1, shade(rodHex, -0.4));
    roundRect(ctx, rx, ry - rodH, rw, rodH * 2, rodH);
    ctx.fillStyle = rg;
    ctx.fill();
    // End caps.
    ctx.fillStyle = shade(rodHex, 0.2);
    for (const cx of [rx + rodH, rx + rw - rodH]) {
      ctx.beginPath();
      ctx.ellipse(cx, ry, rodH * 0.5, rodH * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lit highlight streak.
    ctx.globalAlpha = introIn * (0.4 + 0.3 * idle(env, 3200));
    ctx.fillStyle = rgba(shade(accent, 0.6), 0.5);
    roundRect(ctx, rx + rodH, ry - rodH * 0.55, rw - rodH * 2, rodH * 0.28, rodH * 0.14);
    ctx.fill();
    ctx.restore();
  };
  drawRod(py);
  drawRod(botRodY);

  ctx.restore(); // introIn alpha wrapper

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
