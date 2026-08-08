import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  shade,
  easeInOutCubic,
  clamp01,
  wrapText,
  beatT,
  activeBeatIndex,
  enterT,
  rgba,
  roundRect,
  departT,
  idle,
} from "./common";
import type { PaintEnv } from "./index";

type DialogueScene = Extract<Scene, { kind: "dialogue" }>;

const TYPING_FRAC = 0.22;
const REACT_AT = 0.7;

/** Incoming bubbles are the accent darkened toward black. */
const INCOMING_FACE_DARKEN = -0.62;
const REACTION_DISC_LIFT = 0.16;
const EDGE_ALPHA = 0.6;

type BubbleMetrics = { lines: string[]; w: number; h: number };

export function paintDialogue(ctx: CanvasRenderingContext2D, scene: DialogueScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.messages.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const cur = Math.min(active - offset, n - 1);
  const tCur = cur >= 0 ? beatT(env.beats, offset + cur, totalBeats, env.p) : 0;
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const panelIn = easeOutCubic(enterT(env, 340));
  if (panelIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  const titleGap = scene.title ? unit * 1.6 : 0;
  const panelW = vertical ? contentW : contentW * 0.75;
  const panelX = contentX + (contentW - panelW) / 2;
  const panelY = contentY + titleGap;
  const panelH = vertical ? Math.min(contentH - titleGap, contentH * 0.75) : contentH - titleGap;

  // Title in crisp flat 2D
  if (scene.title) {
    ctx.save();
    ctx.font = `600 ${unit * 0.85}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(scene.title, panelX + panelW / 2, contentY + unit * 0.9);
    ctx.restore();
  }

  // Header bottom position
  const headerH = unit * 2.6;
  const headerBottom = panelY + headerH;

  // ── Bubble metrics + bottom-anchored scroll ────────────────────────────────
  const pad = unit * 0.9;
  const innerX = panelX + pad;
  const innerW = panelW - pad * 2;
  const maxBubbleW = innerW * 0.85;
  const bpadX = unit * 0.8;
  const bpadY = unit * 0.65;
  const fontPx = unit * (vertical ? 1.15 : 1.05);
  const lineH = fontPx * 1.4;
  const gap = unit * 0.65;

  ctx.save();
  ctx.font = `500 ${fontPx}px ${FONT_SANS}`;
  const metrics: BubbleMetrics[] = scene.messages.map((m) => {
    const lines = wrapText(ctx, m.text, maxBubbleW - bpadX * 2);
    const bubbleW = Math.min(maxBubbleW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + bpadX * 2);
    return { lines, w: bubbleW, h: lines.length * lineH + bpadY * 2 };
  });
  ctx.restore();

  const cumTop: number[] = [];
  let acc = 0;
  for (const m of metrics) {
    cumTop.push(acc);
    acc += m.h + gap;
  }
  const totalH = (m: number) => (m <= 0 ? 0 : cumTop[m - 1] + metrics[m - 1].h);
  const listBottom = panelY + panelH - pad * 1.2;
  const listTop = headerBottom + pad * 0.8;
  // Bottom-anchored once the thread overflows, centred while it still fits: a
  // two-message thread pinned to the bottom left ~60% of the panel empty on 9:16.
  const shiftFor = (m: number) => {
    const th = totalH(m);
    const avail = listBottom - listTop;
    return th >= avail ? listBottom - th : listTop + (avail - th) / 2;
  };
  const scrollE = easeInOutCubic(clamp01(tCur / TYPING_FRAC));
  const shift = cur < 0 ? shiftFor(0) : shiftFor(cur) + (shiftFor(cur + 1) - shiftFor(cur)) * scrollE;

  // Generate bubble states
  const bubbleStates = scene.messages.map((msg, i) => {
    const fromLeft = msg.from === "left";
    const t = i === cur ? tCur : 1;
    const slotBottom = cumTop[i] + metrics[i].h + shift;
    const isTyping = i === cur && t < TYPING_FRAC;

    let bx = 0;
    let by = 0;
    let bubbleW = 0;
    let bubbleH = 0;
    let scale = 0;
    let opacity = 0;
    let visible = false;

    if (i <= cur) {
      visible = true;
      if (isTyping) {
        bubbleW = unit * 3.2;
        bubbleH = unit * 1.6;
        bx = fromLeft ? innerX : innerX + innerW - bubbleW;
        by = slotBottom - bubbleH;
        scale = easeOutCubic(clamp01(t / 0.05));
        opacity = panelIn * scale * leave;
      } else {
        const popT = i === cur ? clamp01((t - TYPING_FRAC) / 0.14) : 1;
        scale = popT < 1 ? 0.4 + 0.6 * easeOutBack(popT) : 1;
        bubbleW = metrics[i].w;
        bubbleH = metrics[i].h;
        bx = fromLeft ? innerX : innerX + innerW - bubbleW;
        by = slotBottom - bubbleH;
        opacity = panelIn * clamp01(popT * 2) * leave;
      }
    }

    return {
      visible,
      isTyping,
      bx,
      by,
      w: bubbleW,
      h: bubbleH,
      scale,
      opacity,
    };
  });

  // ── Panel background, drawn directly in 2D ──────────────────────────────────
  ctx.save();
  ctx.globalAlpha = panelIn * leave;
  roundRect(ctx, panelX, panelY, panelW, panelH, unit * 0.4);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.strokeStyle = rgba(accent, EDGE_ALPHA);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  ctx.restore();

  // ── Header overlay in 2D HUD ───────────────────────────────
  ctx.save();
  ctx.globalAlpha = panelIn * leave;

  const aR = unit * 0.85;
  const leftAv = { x: panelX + pad + aR, y: panelY + headerH / 2 };
  const rightAv = { x: panelX + panelW - pad - aR, y: panelY + headerH / 2 };

  const drawAvatar = (cx: number, cy: number, fill: string, who: DialogueScene["left"]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, aR, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = unit * 0.04;
    ctx.strokeStyle = THEME.panelBorder;
    ctx.stroke();
    
    ctx.textAlign = "center";
    if (who.icon) {
      ctx.font = `${aR * 1.15}px ${FONT_SANS}`;
      ctx.fillText(who.icon, cx, cy + aR * 0.4);
    } else {
      ctx.font = `800 ${aR * 1.05}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(who.name.slice(0, 1).toUpperCase(), cx, cy + aR * 0.38);
    }
    ctx.textAlign = "start";
  };
  drawAvatar(leftAv.x, leftAv.y, rgba(secondary, 0.25), scene.left);
  drawAvatar(rightAv.x, rightAv.y, accentSoft, scene.right);

  ctx.font = `700 ${unit * 0.85}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(scene.left.name, leftAv.x + aR + unit * 0.5, leftAv.y + unit * 0.28);
  ctx.textAlign = "right";
  ctx.fillText(scene.right.name, rightAv.x - aR - unit * 0.5, rightAv.y + unit * 0.28);
  ctx.textAlign = "center";
  ctx.fillStyle = THEME.textFaint;
  ctx.fillText("↔", panelX + panelW / 2, leftAv.y + unit * 0.28);
  ctx.textAlign = "start";

  // Online dot beside whoever speaks next — the viewer's anticipation cue.
  const pendingIdx = cur < 0 ? 0 : tCur < TYPING_FRAC ? cur : cur + 1;
  if (pendingIdx < n) {
    const av = scene.messages[pendingIdx].from === "left" ? leftAv : rightAv;
    const pulse = 0.6 + 0.4 * Math.sin(env.elapsedMs / 400);
    ctx.save();
    ctx.globalAlpha = panelIn * leave * (0.55 + 0.45 * pulse);
    ctx.fillStyle = THEME.good;
    ctx.shadowColor = rgba(THEME.good, 0.6);
    ctx.shadowBlur = unit * 0.3 * pulse;
    ctx.beginPath();
    ctx.arc(av.x + aR * 0.75, av.y + aR * 0.75, unit * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Divider
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + unit * 0.4, headerBottom);
  ctx.lineTo(panelX + panelW - unit * 0.4, headerBottom);
  ctx.stroke();
  ctx.restore();

  // ── Bubbles overlay ────────────────────────────────────────
  ctx.save();
  // Clip scrollable bubble text under the header
  ctx.beginPath();
  ctx.rect(panelX + unit * 0.1, headerBottom + 1, panelW - unit * 0.2, panelY + panelH - headerBottom - unit * 0.15);
  ctx.clip();

  if (cur < 0) {
    ctx.save();
    ctx.font = `800 ${unit * 1.3}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textFaint;
    ctx.globalAlpha = panelIn * leave * (0.5 + 0.2 * Math.sin(env.elapsedMs / 600));
    ctx.textAlign = "center";
    ctx.fillText("· · ·", panelX + panelW / 2, headerBottom + (panelH - headerH) / 2 + unit * 0.3);
    ctx.restore();
  }

  bubbleStates.forEach((state, i) => {
    if (!state.visible) return;

    const fromLeft = scene.messages[i].from === "left";
    const bx = state.bx;
    const by = state.by;
    const cx = bx + state.w / 2;
    const cy = by + state.h / 2;

    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.translate(cx, cy);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-cx, -cy);

    // The most-recently-landed bubble breathes on its fill alpha — once the pop-in
    // settles this is the only large-area element still visibly alive between messages.
    const breathe = i === cur ? 0.88 + 0.24 * idle(env, 1600, i) : 1;
    roundRect(ctx, bx, by, state.w, state.h, unit * 0.5);
    ctx.fillStyle = fromLeft ? shade(THEME.panel, 0.14) : shade(accent, INCOMING_FACE_DARKEN);
    ctx.globalAlpha = state.opacity * breathe;
    ctx.fill();
    ctx.globalAlpha = state.opacity;
    ctx.strokeStyle = rgba(fromLeft ? THEME.textDim : accent, EDGE_ALPHA);
    ctx.lineWidth = unit * 0.04;
    ctx.stroke();

    if (state.isTyping) {
      ctx.fillStyle = THEME.textDim;
      const tx = bx;
      const ty = by;
      const typW = state.w;
      const typH = state.h;
      for (let d = 0; d < 3; d++) {
        const wave = Math.sin(env.elapsedMs / 200 + d * 0.8);
        const bounce = wave * unit * 0.08;
        const alpha = 0.5 + 0.5 * ((wave + 1) / 2);
        const dotR = unit * 0.12 * (0.8 + 0.2 * ((wave + 1) / 2));
        ctx.save();
        ctx.globalAlpha = state.opacity * alpha;
        ctx.beginPath();
        ctx.arc(tx + typW * 0.28 + d * typW * 0.22, ty + typH * 0.52 + bounce, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      const textIn = i === cur ? clamp01((tCur - TYPING_FRAC - 0.06) / 0.1) : 1;
      ctx.globalAlpha = state.opacity * textIn;
      ctx.font = `500 ${fontPx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      const met = metrics[i];
      met.lines.forEach((line, li) => {
        ctx.fillText(line, bx + bpadX, by + bpadY + fontPx * 0.85 + li * lineH);
      });
    }
    ctx.restore();

    // Reaction Pop-in
    const msg = scene.messages[i];
    if (msg.reaction && !state.isTyping) {
      const t = i === cur ? tCur : 1;
      const rT = i === cur ? clamp01((t - REACT_AT) / 0.12) : 1;
      if (rT > 0) {
        const pop = easeOutBack(rT);
        const angle = (1 - pop) * (fromLeft ? 0.4 : -0.4);
        const rx = fromLeft ? bx + state.w - unit * 0.2 : bx + unit * 0.2;
        const ry = by + state.h - unit * 0.2;
        ctx.save();
        ctx.globalAlpha = state.opacity;
        ctx.translate(rx, ry - (1 - easeOutCubic(rT)) * unit * 1.0);
        ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop));
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, unit * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = shade(THEME.panel, REACTION_DISC_LIFT);
        ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.5);
        ctx.lineWidth = unit * 0.05;
        ctx.stroke();
        ctx.font = `${unit * 0.75}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.fillStyle = THEME.text;
        ctx.fillText(msg.reaction, 0, unit * 0.28);
        if (rT < 1 && i === cur) {
          ctx.globalAlpha = state.opacity * (1 - rT);
          ctx.strokeStyle = rgba(accent, 0.6);
          ctx.lineWidth = unit * 0.05;
          ctx.beginPath();
          ctx.arc(0, 0, unit * (0.65 + rT * 0.7), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });

  // Dissolve gradient at header bottom
  const fade = ctx.createLinearGradient(0, headerBottom, 0, headerBottom + unit * 1.2);
  fade.addColorStop(0, THEME.panel);
  fade.addColorStop(1, rgba(THEME.panel, 0));
  ctx.globalAlpha = leave;
  ctx.fillStyle = fade;
  ctx.fillRect(panelX + unit * 0.1, headerBottom, panelW - unit * 0.2, unit * 1.2);

  ctx.restore();
}
