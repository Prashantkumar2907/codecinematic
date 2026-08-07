import * as THREE from "three";
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
} from "./common";
import { render3D, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type DayclockScene = Extract<Scene, { kind: "dayclock" }>;

/** Hour-hand fraction (0-1 around the dial) for "HH:MM" on the given face. */
function pinFrac(at: string, face: DayclockScene["face"]): number {
  const [hh, mm] = at.split(":").map((n) => parseInt(n, 10));
  const span = face === "12h" ? 12 : 24;
  const hours = (face === "12h" ? hh % 12 : hh) + mm / 60;
  return hours / span;
}

// On-axis camera, fixed regardless of aspect — pxPerWorld is derived from the
// rendered rect (below), never the other way round. Matches gauge.ts/race.ts.
const CAM_FOV = 30;
const CAM_HALF_H = 5;

// Dial built at normalized radius 1 and scaled to the pixel radius R by the
// per-frame context, so 2D chrome and the 3D dial can never disagree.
const RIM_R = 0.9;
const RIM_TUBE = 0.016;
const BASE_H = 0.065;
const TICK_MAJOR_LEN = 0.194;
const TICK_MINOR_LEN = 0.097;
const TICK_MAJOR_W = 0.032;
const TICK_MINOR_W = 0.016;
const TICK_DEPTH = 0.016;
const TICK_INSET = 0.032;
const HUB_R = 0.097;
const HUB_H = 0.129;
const MINUTE_LEN = 0.78;
const MINUTE_W = 0.032;
const HOUR_LEN = 0.52;
const HOUR_W = 0.065;
const HOUR_H = 0.048;
const PIN_R = 0.097;
const PIN_DROP_DIST = 0.65;

// Small z-depth stacking (+z = toward camera), purely for draw/shadow order —
// the dial has no ground plane any more so there is no "height", only depth.
const Z_RIM = 0.05;
const Z_TICK = 0.05;
const Z_MINUTE = 0.1;
const Z_HOUR = 0.13;
const Z_HUB = 0.16;
const Z_PIN = 0.1;

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
const TICK_EDGE = shade(THEME.panel, -0.4);

type DayclockCtx = {
  scale: number;
  posX: number;
  posY: number;
  faceIn: number;
  master: number;
  settled: boolean;
  k: number;
  t: number;
};

export function paintDayclock(ctx: CanvasRenderingContext2D, scene: DayclockScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.pins.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const key = scene.id + "-dayclock3d";

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + titleBand;
  const availH = contentH - titleBand;
  const rect = { x: contentX, y: areaY, w: contentW, h: availH };

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

  const build = (): ThreeBundle<DayclockCtx> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_HALF_H / Math.tan((CAM_FOV * Math.PI) / 360));
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const root = new THREE.Group();
    s.add(root);

    // Clock face base — a cylinder's axis is Y by default; rotating it onto Z
    // turns its flat cap into the camera-facing dial (same trick as the hub
    // below, and as gauge.ts's own hub).
    const base = makeCylinder(1, BASE_H, THEME.panel, shade(THEME.panel, 0.22));
    base.rotation.x = Math.PI / 2;
    root.add(base);

    // Inner rim — a torus already lies in the XY plane by default, so it needs
    // no rotation to face the camera, only a small forward offset off the base.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM_R, RIM_TUBE, 16, 64),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(shade(THEME.panel, 0.22)),
        metalness: 0.2,
        roughness: 0.5,
        clearcoat: 0.8,
      })
    );
    rim.position.z = Z_RIM;
    root.add(rim);

    // Ticks. rotation.z = -2*pi*frac points the block's long (local Y) axis at
    // angleOf(frac), matching how the hands are aimed below.
    const nTicks = scene.face === "12h" ? 12 : 24;
    const majorEvery = scene.face === "12h" ? 3 : 6;
    for (let i = 0; i < nTicks; i++) {
      const frac = i / nTicks;
      const major = i % majorEvery === 0;
      const angle = angleOf(frac);
      const tickL = major ? TICK_MAJOR_LEN : TICK_MINOR_LEN;
      const tickW = major ? TICK_MAJOR_W : TICK_MINOR_W;
      const rIn = 1 - tickL / 2 - TICK_INSET;
      const tick = makeBlock(tickW, tickL, TICK_DEPTH, major ? THEME.textDim : MUTED, TICK_EDGE);
      tick.position.set(Math.cos(angle) * rIn, -Math.sin(angle) * rIn, Z_TICK);
      tick.rotation.z = -2 * Math.PI * frac;
      root.add(tick);
    }

    // Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_H, 32),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(accent), metalness: 0.3, roughness: 0.2 })
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.z = Z_HUB;
    root.add(hub);

    // makeBlock centres its box on its own origin, so a hand rotated about that
    // origin would sweep through the hub. Offset the arm inside a pivot group by
    // half its length instead — translating the geometry would leave the baked
    // EdgesGeometry behind. Rest pose (rotation.z = 0) points local +Y, i.e.
    // angleOf(0) — the same 12-o'clock reference the ticks are aimed from.
    const handOnPivot = (w: number, thick: number, len: number, z: number) => {
      const pivot = new THREE.Group();
      const arm = makeBlock(w, len, thick, accent, accent);
      arm.position.y = len / 2;
      pivot.add(arm);
      pivot.position.z = z;
      root.add(pivot);
      return pivot;
    };

    const minuteHand = handOnPivot(MINUTE_W, MINUTE_W, MINUTE_LEN, Z_MINUTE);
    const hourHand = handOnPivot(HOUR_W, HOUR_H, HOUR_LEN, Z_HOUR);

    // Pins
    const pinMeshes: THREE.Group[] = [];
    const pinBaseY: number[] = [];
    scene.pins.forEach((pin) => {
      const angle = angleOf(pinFrac(pin.at, scene.face));
      const baseY = -Math.sin(angle);
      pinBaseY.push(baseY);

      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(angle), baseY, Z_PIN);

      const pinBody = new THREE.Mesh(
        new THREE.SphereGeometry(PIN_R, 24, 24),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(accent),
          emissive: new THREE.Color(accent),
          emissiveIntensity: 0.2,
          metalness: 0.2,
          roughness: 0.3,
          clearcoat: 0.8,
        })
      );
      pGroup.add(pinBody);
      root.add(pGroup);
      pinMeshes.push(pGroup);
    });

    const update = (elapsedMs: number, c?: DayclockCtx) => {
      if (!c) return;
      const { faceIn, master, settled, k, t } = c;
      root.scale.setScalar(c.scale);
      root.position.set(c.posX, c.posY, 0);

      base.scale.setScalar(Math.max(0.001, faceIn));

      const tremor = settled ? 0.0012 * Math.sin(elapsedMs / 320) : 0;
      const hourFrac = (master % 1) + tremor;
      const minuteFrac = ((master * cycles) % 1) + tremor;

      hourHand.rotation.z = -hourFrac * Math.PI * 2;
      minuteHand.rotation.z = -minuteFrac * Math.PI * 2;

      scene.pins.forEach((pin, i) => {
        const mesh = pinMeshes[i];
        const baseY = pinBaseY[i];
        if (i < k) {
          mesh.scale.setScalar(0.5);
          mesh.position.y = baseY;
          mesh.visible = true;
          (mesh.children[0] as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(MUTED) });
        } else if (i === k && (offset + i === active && !inTail)) {
          const drop = easeOutBack(clamp01((t - 0.4) / 0.4));
          mesh.scale.setScalar(Math.max(0.001, drop));
          mesh.position.y = baseY + (1 - drop) * PIN_DROP_DIST; // falls in from above
          mesh.visible = drop > 0;
          const hot = active === offset + k && !inTail;
          const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
          mat.color.setStyle(accent);
          mat.emissive.setStyle(accent);
          mat.emissiveIntensity = hot ? 0.5 + 0.3 * Math.sin(elapsedMs / 260) : 0.2;
        } else {
          mesh.visible = false;
        }
      });
    };
    return { scene: s, camera, update };
  };

  const pxPerWorld = rect.h / (2 * CAM_HALF_H);
  const cam = render3D<DayclockCtx>(
    ctx,
    key,
    rect,
    build,
    env.elapsedMs,
    {
      scale: R / pxPerWorld,
      posX: (cx - (rect.x + rect.w / 2)) / pxPerWorld,
      posY: -(cy - (rect.y + rect.h / 2)) / pxPerWorld,
      faceIn,
      master,
      settled,
      k,
      t,
    },
    env
  );

  if (!cam) {
    ctx.textAlign = "start";
    return;
  }

  // ---- 2D overlays: pure pixel math ------------------------------------------
  // The camera is on-axis and the 3D group's scale/position are derived from
  // this same (cx, cy, R), so `pixelAt` always lands exactly on the 3D dial —
  // an affine mapping, not a per-point projection.
  const numbers = scene.face === "12h" ? ["12", "3", "6", "9"] : ["0", "6", "12", "18"];
  ctx.save();
  ctx.globalAlpha = faceIn;
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
        ctx.globalAlpha = faceIn * drop;
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
        ctx.globalAlpha = faceIn * chipT;
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
    ctx.globalAlpha = faceIn * alpha;
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
