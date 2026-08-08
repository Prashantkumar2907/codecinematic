import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
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

type SheetMusicScene = Extract<Scene, { kind: "sheet_music" }>;
type Note = SheetMusicScene["steps"][number]["notes"][number];

/** Staff position unit = half a line-space; standard 5-line staff lines sit at -4,-2,0,2,4. */
const STAFF_LINE_POSITIONS = [-4, -2, 0, 2, 4];
/** Vertical budget (in half-space units) a row reserves above+below its 5 lines for stems/ledger notes. */
const ROW_MARGIN_HALFSPACES = 16;
const LABEL_ROW_UNIT = 0.95;
const ROW_GAP_UNIT = 0.55;
const MIN_HALF_SPACE_UNIT = 0.16;
const MAX_HALF_SPACE_UNIT = 0.46;
const MIN_ROW_UNIT = 2.2;
const CHIP_ROW_UNIT = 1.35;
const NOTE_REVEAL_WINDOW = 0.4;

/**
 * A musical staff that reveals one phrase (step) per beat as its own row,
 * with a playhead sweeping left-to-right across the active row's notes,
 * lighting each notehead as it passes — the generic primitive for ragas,
 * instrument comparisons (two colour-coded voices sharing one staff) and
 * rhythmic-cycle (tala) explanations. Future rows hold as faint ghost staves
 * (same idiom as dp_table_fill's ghost cells) so the whole piece's shape reads
 * immediately; past rows stay fully lit with gentle idle life.
 */
export function paintSheetMusic(ctx: CanvasRenderingContext2D, scene: SheetMusicScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.35;
  let areaY = contentY + band;
  let areaH = contentH - band;

  // Chip row: raga/tala label + up to-two voice legend dots, right under the title.
  const chipIn = easeOutCubic(enterT(env, 340, 120));
  const hasChips = !!scene.keyLabel || scene.legend.length > 0;
  if (hasChips) {
    ctx.save();
    ctx.globalAlpha = introIn * chipIn;
    ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
    ctx.textBaseline = "middle";
    let cx = contentX;
    const cy = areaY + unit * (CHIP_ROW_UNIT * 0.5);
    if (scene.keyLabel) {
      const tw = ctx.measureText(scene.keyLabel).width;
      const w = tw + unit * 1.0;
      ctx.fillStyle = rgba(accent, 0.16);
      roundRect(ctx, cx, cy - unit * 0.5, w, unit * 1.0, unit * 0.5);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(scene.keyLabel, cx + w / 2, cy + unit * 0.02);
      cx += w + unit * 0.5;
    }
    ctx.textAlign = "start";
    scene.legend.forEach((entry) => {
      const dotColor = entry.voice === "a" ? accent : secondary;
      const tw = ctx.measureText(entry.label).width;
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(cx + unit * 0.22, cy, unit * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(entry.label, cx + unit * 0.52, cy + unit * 0.02);
      cx += unit * 0.52 + tw + unit * 0.6;
    });
    ctx.restore();
    const chipH = unit * CHIP_ROW_UNIT;
    areaY += chipH;
    areaH -= chipH;
  }

  // Tala (rhythmic-cycle) strip reserved at the bottom, if the piece names one.
  const talaH = scene.tala ? unit * 1.7 : 0;
  areaH -= talaH;

  const n = scene.steps.length;
  const rowGap = unit * ROW_GAP_UNIT;
  const rowH = Math.max(unit * MIN_ROW_UNIT, (areaH - rowGap * (n - 1)) / n);
  const halfSpace = Math.max(
    unit * MIN_HALF_SPACE_UNIT,
    Math.min(unit * MAX_HALF_SPACE_UNIT, (rowH - unit * LABEL_ROW_UNIT) / ROW_MARGIN_HALFSPACES)
  );
  const marginX = Math.min(unit * 1.2, contentW * 0.06);
  const staffX0 = contentX + marginX;
  const staffX1 = contentX + contentW - marginX;

  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  scene.steps.forEach((step, i) => {
    const rowCenter = areaY + i * (rowH + rowGap) + rowH / 2;
    const isPast = i < activeStep;
    const isActive = i === activeStep;
    const isFuture = i > activeStep;
    const rowIn = enterT(env, 300, 60 + i * 40);
    if (rowIn <= 0) return;
    const ghostAlpha = 0.14 * introIn * easeOutCubic(rowIn);

    // Five staff lines (+ start/end barlines).
    ctx.save();
    ctx.globalAlpha = isFuture ? ghostAlpha : introIn * easeOutCubic(rowIn);
    ctx.strokeStyle = isFuture ? rgba(THEME.textDim, 0.7) : THEME.textFaint;
    ctx.lineWidth = Math.max(1, unit * 0.045);
    STAFF_LINE_POSITIONS.forEach((pos) => {
      const y = rowCenter - pos * halfSpace;
      ctx.beginPath();
      ctx.moveTo(staffX0, y);
      ctx.lineTo(staffX1, y);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(staffX0, rowCenter - 4 * halfSpace);
    ctx.lineTo(staffX0, rowCenter + 4 * halfSpace);
    ctx.moveTo(staffX1, rowCenter - 4 * halfSpace);
    ctx.lineTo(staffX1, rowCenter + 4 * halfSpace);
    ctx.stroke();
    ctx.restore();

    if (isFuture) return; // Ghost staff only — notes stay hidden until their beat.

    const count = step.notes.length;
    const noteX = (k: number) => staffX0 + ((k + 0.5) / count) * (staffX1 - staffX0);

    step.notes.forEach((note, k) => {
      const startAt = isActive ? (k / count) * (1 - NOTE_REVEAL_WINDOW) : 0;
      const local = isActive ? clamp01((stepT - startAt) / NOTE_REVEAL_WINDOW) : 1;
      if (local <= 0) return;
      const x = noteX(k);
      const y = rowCenter - note.pos * halfSpace;
      const isCurrent = isActive && local < 1;
      const bob = idle(env, 1500, k) * halfSpace * 0.12;
      drawNote(ctx, note, x, y - bob, halfSpace, note.voice === "b" ? secondary : accent, {
        introIn,
        rowIn: easeOutCubic(rowIn),
        appear: easeOutCubic(local),
        pop: isCurrent ? easeOutBack(local) : 1,
        glow: isCurrent ? accentGlow : undefined,
      });

      // Meend/glide tie into the next note of the same voice within this phrase.
      if (note.slideToNext && k < count - 1 && step.notes[k + 1].voice === note.voice) {
        const nx = noteX(k + 1);
        const ny = rowCenter - step.notes[k + 1].pos * halfSpace;
        const nextLocal = isActive ? clamp01((stepT - ((k + 1) / count) * (1 - NOTE_REVEAL_WINDOW)) / NOTE_REVEAL_WINDOW) : 1;
        if (nextLocal > 0) {
          ctx.save();
          ctx.globalAlpha = introIn * easeOutCubic(rowIn) * Math.min(local, nextLocal) * 0.85;
          ctx.strokeStyle = note.voice === "b" ? secondary : accent;
          ctx.lineWidth = unit * 0.05;
          const midY = Math.min(y, ny) - halfSpace * 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y - halfSpace * 0.9);
          ctx.quadraticCurveTo((x + nx) / 2, midY, nx, ny - halfSpace * 0.9);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (note.label) {
        ctx.save();
        ctx.globalAlpha = introIn * easeOutCubic(rowIn) * easeOutCubic(local);
        const labelPx = Math.min(unit * 0.62, halfSpace * 1.7);
        ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
        ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(note.label, x, rowCenter + (4 + 2) * halfSpace + unit * 0.16);
        ctx.restore();
      }
    });

    // Playhead: a glowing vertical sweep across the active row, driven only by stepT.
    if (isActive) {
      const px = staffX0 + stepT * (staffX1 - staffX0);
      ctx.save();
      ctx.globalAlpha = introIn * 0.9;
      ctx.strokeStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
      ctx.lineWidth = unit * 0.08;
      ctx.beginPath();
      ctx.moveTo(px, rowCenter - (4 + 2.4) * halfSpace);
      ctx.lineTo(px, rowCenter + (4 + 2.4) * halfSpace);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(px - unit * 0.16, rowCenter - (4 + 2.4) * halfSpace - unit * 0.02);
      ctx.lineTo(px + unit * 0.16, rowCenter - (4 + 2.4) * halfSpace - unit * 0.02);
      ctx.lineTo(px, rowCenter - (4 + 2.4) * halfSpace + unit * 0.32);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }
  });

  // Tala cycle strip: one tick per matra, sam accented, current matra pulsing.
  if (scene.tala) {
    const { beats, sam, label } = scene.tala;
    const talaY = contentY + contentH - talaH * 0.55;
    const talaIn = easeOutCubic(enterT(env, 340, 160));
    const activeMatra = activeStep >= 0 ? scene.steps[activeStep].matra : undefined;
    ctx.save();
    ctx.globalAlpha = introIn * talaIn;
    if (label) {
      ctx.font = `700 ${unit * 0.55}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "start";
      ctx.textBaseline = "middle";
      ctx.fillText(label, contentX, talaY);
    }
    const tickX0 = contentX + (label ? unit * 3.2 : 0);
    const tickX1 = contentX + contentW;
    for (let m = 1; m <= beats; m++) {
      const tx = tickX0 + ((m - 0.5) / beats) * (tickX1 - tickX0);
      const isSam = m === sam;
      const isCurrent = activeMatra === m;
      const pulse = isCurrent ? 1 + 0.35 * idle(env, 900) : 1;
      const r = (isSam ? unit * 0.24 : unit * 0.15) * pulse;
      ctx.beginPath();
      ctx.arc(tx, talaY, r, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? accent : isSam ? rgba(accent, 0.7) : rgba(THEME.textDim, 0.45);
      ctx.fill();
      if (isCurrent) {
        ctx.lineWidth = unit * 0.05;
        ctx.strokeStyle = accentGlow;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  note: Note,
  x: number,
  y: number,
  halfSpace: number,
  color: string,
  opts: { introIn: number; rowIn: number; appear: number; pop: number; glow?: string }
) {
  const { introIn, rowIn, appear, pop, glow } = opts;
  const headW = halfSpace * 1.5;
  const headH = halfSpace * 1.15;
  const hollow = note.dur === "whole" || note.dur === "half";
  const stemUp = note.pos <= 0;
  const stemLen = halfSpace * 3.4;

  ctx.save();
  ctx.globalAlpha = introIn * rowIn * appear;
  ctx.translate(x, y);
  ctx.rotate(-0.18);
  ctx.scale(pop, pop);

  // Ledger stub for notes that sit off the 5-line staff.
  if (Math.abs(note.pos) >= 5) {
    ctx.save();
    ctx.rotate(0.18);
    ctx.strokeStyle = rgba(THEME.textDim, 0.6);
    ctx.lineWidth = halfSpace * 0.18;
    ctx.beginPath();
    ctx.moveTo(-headW * 0.95, 0);
    ctx.lineTo(headW * 0.95, 0);
    ctx.stroke();
    ctx.restore();
  }

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = halfSpace * 2.2;
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, headW, headH, 0, 0, Math.PI * 2);
  if (hollow) {
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.lineWidth = halfSpace * 0.32;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  if (note.dur !== "whole") {
    const dir = stemUp ? -1 : 1;
    const stemX = stemUp ? headW * 0.92 : -headW * 0.92;
    ctx.beginPath();
    ctx.moveTo(stemX, 0);
    ctx.lineTo(stemX, dir * stemLen);
    ctx.strokeStyle = color;
    ctx.lineWidth = halfSpace * 0.22;
    ctx.stroke();

    const flags = note.dur === "eighth" ? 1 : note.dur === "sixteenth" ? 2 : 0;
    for (let f = 0; f < flags; f++) {
      const fy = dir * stemLen + dir * f * halfSpace * 0.55;
      ctx.beginPath();
      ctx.moveTo(stemX, fy);
      ctx.quadraticCurveTo(stemX + headW * 1.3, fy + dir * halfSpace * 0.3, stemX + headW * 0.5, fy + dir * halfSpace * 1.1);
      ctx.strokeStyle = color;
      ctx.lineWidth = halfSpace * 0.2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
