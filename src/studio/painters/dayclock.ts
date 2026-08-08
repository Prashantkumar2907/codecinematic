import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  STROKE,
  shade,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  clampRange,
  roundRect,
  fitFontSize,
  wrapText,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type DayclockScene = Extract<Scene, { kind: "dayclock" }>;

/** Hour-hand fraction (0-1 around the dial) for "HH:MM" on the given face. */
function pinFrac(at: string, face: DayclockScene["face"]): number {
  const [hh, mm] = at.split(":").map((n) => parseInt(n, 10));
  const span = face === "12h" ? 12 : 24;
  const hours = (face === "12h" ? hh % 12 : hh) + mm / 60;
  return hours / span;
}

// Dial proportions, as multiples of the pixel radius R.
const TICK_MAJOR_LEN = 0.194;
const TICK_MINOR_LEN = 0.097;
const TICK_MAJOR_W = 0.032;
const TICK_MINOR_W = 0.016;
const TICK_INSET = 0.032;
const HUB_R = 0.097;
const MINUTE_LEN = 0.78;
const MINUTE_W = 0.032;
const HOUR_LEN = 0.52;
const HOUR_W = 0.065;
const PIN_R = 0.097;
const PIN_DROP_DIST = 0.65;

// Radial reach of the active pin's icon/chip, as multiples of the dial radius
// R — scales with the dial itself instead of a hardcoded world span, so both
// aspects stay proportional. R is sized below to keep this inside the rect;
// the chip additionally self-clamps as a backstop for unusually long labels.
const ICON_R_MULT = 1.26;
const CHIP_R_MULT_ICON = 1.52;
const CHIP_R_MULT_NO_ICON = 1.32;
const ICON_PAD_U = 0.7;
const READOUT_R_MULT = 1.8;
const READOUT_PAD_U = 1.0;

const MUTED = shade(THEME.textDim, -0.35);

export function paintDayclock(ctx: CanvasRenderingContext2D, scene: DayclockScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.pins.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + titleBand;
  const availH = contentH - titleBand;

  const faceIn = easeOutCubic(enterT(env, 380));
  if (faceIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  // ---- pixel dial geometry: R derives from the rect, never a hardcoded span --
  // Top/left/right must clear the active pin's icon; bottom must additionally
  // clear the digital readout below the dial, so it gets its own larger reach.
  const topMargin = (R: number) => R * ICON_R_MULT + unit * ICON_PAD_U;
  const botMargin = (R: number) => R * READOUT_R_MULT + unit * READOUT_PAD_U;
  const rByW = (contentW / 2 - unit * ICON_PAD_U) / ICON_R_MULT;
  const rByH = (availH - unit * (ICON_PAD_U + READOUT_PAD_U)) / (ICON_R_MULT + READOUT_R_MULT);
  const R = Math.max(unit * 2, Math.min(rByW, rByH));
  const usedH = topMargin(R) + botMargin(R);
  const cx = contentX + contentW / 2;
  const cy = areaY + Math.max(0, (availH - usedH) / 2) + topMargin(R);

  // angleOf(0) is 12 o'clock (top), increasing clockwise — dayclock's own
  // convention, independent of gauge's maths-CCW one.
  const angleOf = (frac: number) => -Math.PI / 2 + frac * Math.PI * 2;
  /** Pixel point `rFrac` of the way out to R at clock-angle `angle`. */
  const pixelAt = (angle: number, rFrac: number) => ({
    x: cx + Math.cos(angle) * R * rFrac,
    y: cy + Math.sin(angle) * R * rFrac,
  });

  const cycles = scene.face === "12h" ? 12 : 24;

  const k = Math.min(active - offset, scene.pins.length - 1);
  const t = k >= 0 ? beatT(env.beats, offset + k, totalBeats, env.p) : 0;
  const prevFrac = k <= 0 ? 0 : pinFrac(scene.pins[k - 1].at, scene.face);
  const curFrac = k >= 0 ? pinFrac(scene.pins[k].at, scene.face) : 0;
  let delta = curFrac - prevFrac;
  if (delta < 0) delta += 1;
  if (delta === 0 && k > 0) delta = 1;
  const sweepE = easeInOutCubic(clamp01(t / 0.55));
  const master = prevFrac + delta * sweepE;
  const settled = k < 0 || t > 0.6;
  const tremor = settled ? 0.0012 * Math.sin(env.elapsedMs / 320) : 0;
  const hourFrac = (master % 1) + tremor;
  const minuteFrac = ((master * cycles) % 1) + tremor;

  // ---- dial, drawn directly in 2D — pixel geometry already decided it --------
  ctx.save();
  ctx.globalAlpha = faceIn * leave;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.strokeStyle = shade(THEME.panel, 0.22);
  ctx.lineWidth = Math.max(1, R * 0.016);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  ctx.strokeStyle = shade(THEME.panel, 0.22);
  ctx.lineWidth = Math.max(1, R * 0.012);
  ctx.stroke();

  const nTicks = scene.face === "12h" ? 12 : 24;
  const majorEvery = scene.face === "12h" ? 3 : 6;
  ctx.lineCap = "butt";
  for (let i = 0; i < nTicks; i++) {
    const frac = i / nTicks;
    const major = i % majorEvery === 0;
    const angle = angleOf(frac);
    const tickL = major ? TICK_MAJOR_LEN : TICK_MINOR_LEN;
    const tickW = major ? TICK_MAJOR_W : TICK_MINOR_W;
    const rOut = 1 - TICK_INSET;
    const rIn = rOut - tickL;
    const from = pixelAt(angle, rIn);
    const to = pixelAt(angle, rOut);
    ctx.strokeStyle = major ? THEME.textDim : MUTED;
    ctx.lineWidth = Math.max(1, tickW * R);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.lineCap = "round";
  const hourEnd = pixelAt(angleOf(hourFrac), HOUR_LEN);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, HOUR_W * R);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(hourEnd.x, hourEnd.y);
  ctx.stroke();

  const minuteEnd = pixelAt(angleOf(minuteFrac), MINUTE_LEN);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, MINUTE_W * R);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(minuteEnd.x, minuteEnd.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, HUB_R * R, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  // Pins: past pins mute in place, the newly active one drops in from above,
  // the current one pulses so the dial keeps something alive while it holds.
  scene.pins.forEach((pin, i) => {
    const angle = angleOf(pinFrac(pin.at, scene.face));
    if (i < k) {
      const p = pixelAt(angle, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R * R * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = MUTED;
      ctx.fill();
    } else if (i === k && offset + i === active && !inTail) {
      const drop = easeOutBack(clamp01((t - 0.4) / 0.4));
      if (drop <= 0) return;
      const hot = active === offset + k && !inTail;
      const pulse = hot ? 0.5 + 0.3 * Math.sin(env.elapsedMs / 260) : 0.2;
      const rest = pixelAt(angle, 1);
      // Falls straight down (pixel-Y only) from above onto its resting spot on
      // the rim, matching the removed 3D pin's world-Y-only drop.
      const p = { x: rest.x, y: rest.y - (1 - drop) * PIN_DROP_DIST * R };
      ctx.save();
      ctx.globalAlpha *= drop;
      if (hot) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = R * 0.3 * pulse;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R * R * Math.max(0.001, drop), 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }
  });
  ctx.restore();

  // ---- 2D chrome: numbers, active pin label/icon, digital readout -----------
  const numbers = scene.face === "12h" ? ["12", "3", "6", "9"] : ["0", "6", "12", "18"];
  ctx.save();
  ctx.globalAlpha = faceIn * leave;
  ctx.font = `700 ${unit * 0.7}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  numbers.forEach((num, i) => {
    const np = pixelAt(angleOf(i / 4), 0.7);
    ctx.fillText(num, np.x, np.y + unit * 0.25);
  });
  ctx.restore();

  // Active pin label & icon
  if (k >= 0) {
    const pin = scene.pins[k];
    const angle = angleOf(pinFrac(pin.at, scene.face));
    const drop = easeOutBack(clamp01((t - 0.4) / 0.4));
    const hot = active === offset + k && !inTail;

    if (drop > 0) {
      if (pin.icon) {
        const iconHalf = unit * ICON_PAD_U;
        const ipRaw = pixelAt(angle, ICON_R_MULT);
        const ip = {
          x: clampRange(ipRaw.x, contentX + iconHalf, contentX + contentW - iconHalf),
          y: clampRange(ipRaw.y, areaY + iconHalf, areaY + availH - iconHalf),
        };
        ctx.save();
        ctx.globalAlpha = faceIn * drop * leave;
        ctx.font = `${unit * 1.1}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.fillText(pin.icon, ip.x, ip.y + unit * 0.32);
        ctx.textAlign = "start";
        ctx.restore();
      }

      const chipT = easeOutCubic(clamp01((t - 0.5) / 0.4));
      if (chipT > 0) {
        const anchor = pixelAt(angle, pin.icon ? CHIP_R_MULT_ICON : CHIP_R_MULT_NO_ICON);
        ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
        const maxTextW = unit * 6;
        const px = fitFontSize(ctx, pin.label, { maxW: maxTextW, startPx: unit * 0.66, minPx: unit * 0.46, weight: 700 });
        ctx.font = `700 ${px}px ${FONT_SANS}`;
        let lines = [pin.label];
        if (ctx.measureText(pin.label).width > maxTextW) lines = wrapText(ctx, pin.label, maxTextW).slice(0, 2);
        const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const lineH = px * 1.2;
        const chipW = tw + unit * 0.8;
        const chipH = lines.length * lineH + unit * 0.4;

        // Very basic layout
        const c = Math.cos(angle);
        const side: -1 | 0 | 1 = Math.abs(c) < 0.35 ? 0 : c > 0 ? 1 : -1;
        let chipX = side === 1 ? anchor.x : side === -1 ? anchor.x - chipW : anchor.x - chipW / 2;
        let chipY = anchor.y - chipH / 2;
        chipX = clampRange(chipX, contentX, contentX + contentW - chipW);
        chipY = clampRange(chipY, areaY, areaY + availH - chipH);

        ctx.save();
        ctx.globalAlpha = faceIn * chipT * leave;
        if (hot) {
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.5;
        }
        roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
        ctx.fillStyle = THEME.panel;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(accent, 0.7);
        ctx.lineWidth = unit * STROKE.thin;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        const y0 = chipY + chipH / 2 - ((lines.length - 1) * lineH) / 2 + px * 0.35;
        lines.forEach((line, i) => ctx.fillText(line, chipX + chipW / 2, y0 + i * lineH));
        ctx.textAlign = "start";
        ctx.restore();
      }
    }
  }

  // Digital readout — fixed south of the dial (angle = pi/2), same spot for
  // every scene since it never depends on which pin is active.
  const readoutY = pixelAt(Math.PI / 2, READOUT_R_MULT).y;
  const drawTime = (text: string, alpha: number, dy = 0) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = faceIn * alpha * leave;
    ctx.font = `800 ${unit * 1.5}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(text, cx, readoutY + dy);
    ctx.textAlign = "start";
    ctx.restore();
  };
  if (k >= 0) {
    const cross = easeOutCubic(clamp01(t / 0.55));
    if (k > 0 && cross < 1) drawTime(scene.pins[k - 1].at, 1 - cross, -cross * unit * 0.7);
    drawTime(scene.pins[k].at, k > 0 ? cross : easeOutCubic(clamp01(t / 0.4)), k > 0 ? (1 - cross) * unit * 0.7 : 0);
  } else {
    drawTime(scene.face === "12h" ? "12:00" : "0:00", 0.5);
  }
}
