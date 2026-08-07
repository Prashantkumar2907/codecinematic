import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  enterT,
  sub,
  shade,
  clamp01,
  clampRange,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  pointAlongPolyline,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CircuitScene = Extract<Scene, { kind: "circuit" }>;
type Part = CircuitScene["parts"][number];
type Pt = { x: number; y: number };

const INK_PANEL = THEME.bgBottom;
/** Idle (unlit) part face — matches the same idle-face convention as
 *  `table.ts`/`bits.ts`/`callstack.ts` rather than a one-off hex. */
const IDLE_FACE = shade(THEME.panel, 0.09);
/** A travelling electron reads as white-hot regardless of subject accent —
 *  same convention as `cipher.ts`'s `INK_BRIGHT`. */
const SPARK = "#eaf6ff";

type Ctx = {
  gIn: number;
  stLit: Record<string, number>;
  stLever: Record<string, number>;
  hl: Set<string>;
  flowRamp: number;
};

/** Board footprint of a component, in px — fixed regardless of how spread out the
 *  schematic is, so a two-part and a ten-part circuit both read at a legible size. */
const NODE_W = 1.55;
const NODE_H = 0.85;
const BULB_D = 1.4;
/** Shallow on purpose (mirrors `diagram.ts`/`table.ts`): just enough extrusion for a
 *  bevel edge under the camera; never mapped to pixels itself. */
const NODE_DEPTH = 0.16;
/** Cap on how large the grid may grow past a square fit, so two parts a beat apart
 *  don't blow up into a billboard-sized board. */
const CELL_MAX_UNITS = 3.4;

export function paintCircuit(ctx: CanvasRenderingContext2D, scene: CircuitScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const frameIn = easeOutCubic(enterT(env, 340));
  const key = scene.id + "-circ3d";

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const rect = { x: contentX, y: contentY + titleBand, w: contentW, h: contentH - titleBand };

  /**
   * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`: the
   * previous build placed parts at their raw data x/y (a 0-11 design grid, see
   * `GRID` in `schema.ts`) under a camera elevated to (0,12,10), so the board's
   * true on-screen size depended on how that plane foreshortens with depth, not
   * on `rect` — a 3-part circuit rendered into the top third of the frame with a
   * dead void below. The board is now laid out in PIXELS first (used extent
   * centred and scaled to fill `rect`, capped by `CELL_MAX_UNITS` so a tiny
   * circuit doesn't become a billboard) and parts are mapped onto that grid.
   */
  const rawMinX = Math.min(...scene.parts.map((p) => p.x));
  const rawMaxX = Math.max(...scene.parts.map((p) => p.x));
  const rawMinY = Math.min(...scene.parts.map((p) => p.y));
  const rawMaxY = Math.max(...scene.parts.map((p) => p.y));
  /** A wide-on-short circuit (this demo: 8 units wide, 3 tall) fit straight into a
   *  9:16 frame leaves the diagram pinned to a horizontal band with dead space
   *  above and below — same fix as `diagram.ts`'s `shouldRotate`: swap axes when
   *  the schematic's aspect fights the frame's. */
  const rawAspect = Math.max(rawMaxX - rawMinX, 1) / Math.max(rawMaxY - rawMinY, 1);
  const rot = vertical ? rawAspect >= 1.5 : rawAspect <= 0.66;
  const disp = (p: Part): Pt => (rot ? { x: p.y, y: p.x } : { x: p.x, y: p.y });

  const minX = Math.min(...scene.parts.map((p) => disp(p).x));
  const maxX = Math.max(...scene.parts.map((p) => disp(p).x));
  const minY = Math.min(...scene.parts.map((p) => disp(p).y));
  const maxY = Math.max(...scene.parts.map((p) => disp(p).y));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);

  const marginTop = unit * 2.4;
  const marginSide = unit * 1.3;
  const marginBottom = unit * 0.9;
  const areaX = rect.x + marginSide;
  const areaY = rect.y + marginTop;
  const areaW = Math.max(unit * 2, rect.w - marginSide * 2);
  const areaH = Math.max(unit * 2, rect.h - marginTop - marginBottom);

  const fit = Math.min(areaW / usedW, areaH / usedH, unit * CELL_MAX_UNITS);
  const cw = Math.min(areaW / usedW, fit * 1.35);
  const ch = Math.min(areaH / usedH, fit * 1.35);
  const ox = areaX + (areaW - usedW * cw) / 2 - minX * cw;
  const oy = areaY + (areaH - usedH * ch) / 2 - minY * ch;
  const pixelPos = (p: Part): Pt => {
    const d = disp(p);
    return { x: ox + d.x * cw, y: oy + d.y * ch };
  };

  const centers = new Map(scene.parts.map((p) => [p.id, pixelPos(p)]));
  const byId = new Map(scene.parts.map((p) => [p.id, p]));

  const energizeBeat = new Map<string, number>();
  const closeBeat = new Map<string, number>();
  let flowing = false;
  let signalBeat = -1;
  scene.steps.forEach((st, k) => {
    const b = offset + k;
    for (const id of st.on) if (!energizeBeat.has(id)) energizeBeat.set(id, b);
    for (const id of st.close) if (!closeBeat.has(id)) closeBeat.set(id, b);
    if (st.signal && signalBeat < 0) signalBeat = b;
    if (b <= active && st.signal) flowing = true;
  });

  const beatFrac = (b: number) => {
    const win = beatWindow(env.beats, b, totalBeats);
    return clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
  };
  const litOf = (id: string): number => {
    const b = energizeBeat.get(id);
    if (b == null || active < b) return 0;
    return easeOutCubic(beatFrac(b));
  };
  const leverOf = (id: string, kind: string): number => {
    const b = closeBeat.get(id);
    if (b == null) return kind === "switch" ? 0 : 1;
    if (active < b) return 0;
    return easeOutBack(beatFrac(b));
  };

  const highlights =
    active - offset >= 0 && !inTail ? new Set(scene.steps[Math.min(active - offset, scene.steps.length - 1)]?.highlight ?? []) : new Set<string>();

  const flowRamp = flowing && signalBeat >= 0 ? easeOutCubic(beatFrac(signalBeat)) : 0;
  const wireLit = (w: { from: string; to: string }): number => {
    if (flowRamp > 0) return flowRamp;
    return Math.min(litOf(w.from), litOf(w.to));
  };

  /** Pixels-per-world-unit and pixel origin on the z=`z` plane, for a camera sitting
   *  ON-AXIS at (0,0,D). `projectToRect` is then affine, so this is an exact,
   *  invertible pixel<->world map (same technique as `table.ts`/`diagram.ts`). */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle<Ctx> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, NODE_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models = scene.parts.map((p) => {
      const isRound = p.kind === "bulb" || p.kind === "led";
      const g = isRound ? makeCylinder(0.5, 1, IDLE_FACE, THEME.textDim) : makeBlock(1, 1, 1, IDLE_FACE, THEME.textDim);
      if (isRound) g.rotation.x = Math.PI / 2; // face the flat cap at the on-axis camera
      const c = pixelPos(p);
      const w = toWorld(c.x, c.y);
      g.position.set(w.x, w.y, 0);
      const sizePx = (isRound ? BULB_D : NODE_W) * unit;
      const heightPx = (isRound ? BULB_D : NODE_H) * unit;
      // Depth is a fixed, shallow WORLD thickness for the card bevel — it must
      // never be derived from the pixel mapping like width/height are, or an
      // edge part (whose viewing ray isn't square-on to its face) shows a thick
      // slab of side wall instead of a thin card edge.
      const base = isRound
        ? new THREE.Vector3(sizePx / m.sx, NODE_DEPTH, sizePx / m.sx)
        : new THREE.Vector3(sizePx / m.sx, heightPx / m.sy, NODE_DEPTH);
      g.scale.copy(base);
      s.add(g);
      return { mesh: g, p, base };
    });

    const update = (elapsedMs: number, data?: Ctx) => {
      if (!data) return;
      const { gIn, stLit, stLever, hl, flowRamp: flow } = data;
      models.forEach(({ mesh, p, base }) => {
        mesh.visible = gIn > 0.01;
        const lit = Math.max(stLit[p.id] || 0, flow);
        const lever = stLever[p.id] || 0;
        const highlighted = hl.has(p.id);
        const energized = lit > 0 || (p.kind === "switch" && lever > 0);
        const breathe = lit > 0 && (p.kind === "bulb" || p.kind === "led") ? 1 + 0.05 * Math.sin(elapsedMs / 320) : 1;
        mesh.scale.copy(base).multiplyScalar(Math.max(0.001, gIn) * breathe);

        mesh.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = gIn * 0.9;
            if (energized || highlighted) {
              mat.color.setStyle(accent);
              mat.emissive.setStyle(accent);
              mat.emissiveIntensity = Math.max(0.2, lit * 0.8 * breathe);
            } else {
              mat.color.setStyle(IDLE_FACE);
              mat.emissive.setStyle(IDLE_FACE);
              mat.emissiveIntensity = 0.1;
            }
          }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const stLit: Record<string, number> = {};
  const stLever: Record<string, number> = {};
  scene.parts.forEach((p) => {
    stLit[p.id] = litOf(p.id);
    stLever[p.id] = leverOf(p.id, p.kind);
  });

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, stLit, stLever, hl: highlights, flowRamp }, env);
  const flat = !cam;

  // Wires in 2D — drawn from the same pixel centers the 3D layer was mapped onto,
  // so they always meet the part regardless of camera/projection.
  for (const w of scene.wires) {
    const a = centers.get(w.from);
    const b = centers.get(w.to);
    if (!a || !b) continue;
    const lit = wireLit(w);
    ctx.save();
    ctx.globalAlpha = frameIn;
    ctx.lineCap = "round";
    ctx.lineWidth = unit * 0.2;
    ctx.strokeStyle = lit > 0.5 ? accent : rgba(THEME.textDim, 0.28);
    if (lit > 0.5) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5 * lit;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    if (flowing && lit > 0.5) {
      const pts = [a, b];
      for (let d = 0; d < 3; d++) {
        const f = ((env.elapsedMs / 1300 + d / 3) % 1 + 1) % 1;
        const dot = pointAlongPolyline(pts, f);
        ctx.save();
        ctx.globalAlpha = frameIn * (0.5 + 0.5 * Math.sin(Math.PI * f));
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.8;
        ctx.fillStyle = SPARK;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Flat 2D fallback for parts, only reached if WebGL is unavailable.
  if (flat) {
    scene.parts.forEach((p) => {
      const c = centers.get(p.id)!;
      const lit = Math.max(litOf(p.id), flowRamp);
      const energized = lit > 0 || (p.kind === "switch" && leverOf(p.id, p.kind) > 0);
      const highlighted = highlights.has(p.id);
      const w = (p.kind === "bulb" || p.kind === "led" ? BULB_D : NODE_W) * unit;
      const h = (p.kind === "bulb" || p.kind === "led" ? BULB_D : NODE_H) * unit;
      ctx.save();
      ctx.globalAlpha = frameIn;
      if (energized || highlighted) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.4;
      }
      roundRect(ctx, c.x - w / 2, c.y - h / 2, w, h, unit * 0.15);
      ctx.fillStyle = energized || highlighted ? accent : IDLE_FACE;
      ctx.fill();
      ctx.strokeStyle = THEME.textDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });
  }

  // Label chips for parts
  if (active - offset >= 0 && active - offset < scene.steps.length && !inTail) {
    const step = scene.steps[active - offset];
    const t = beatFrac(offset + (active - offset));
    step.highlight
      .map((id) => byId.get(id))
      .filter((p): p is Part => !!p && !!p.label)
      .forEach((p, i) => {
        const c = centers.get(p.id)!;
        const chipIn = easeOutCubic(sub(t, 0.1 + i * 0.05, 0.25));
        if (chipIn <= 0) return;
        const label = p.label!;
        ctx.save();
        ctx.globalAlpha = chipIn * frameIn;
        const fpx = fitFontSize(ctx, label, { maxW: unit * 5, startPx: unit * 0.62, minPx: unit * 0.4, weight: 700 });
        ctx.font = `700 ${fpx}px ${FONT_SANS}`;
        const tw = ctx.measureText(label).width;
        const cw2 = tw + unit * 0.8;
        // Clamped so a long label on an edge part can't hang off the frame.
        const chipCx = clampRange(c.x, rect.x + cw2 / 2, rect.x + rect.w - cw2 / 2);
        const chY = c.y - unit * NODE_H - unit * 1.4; // above the part's board footprint
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.3;
        roundRect(ctx, chipCx - cw2 / 2, chY, cw2, unit * 1.05, unit * 0.3);
        ctx.fillStyle = INK_PANEL;
        ctx.fill();
        ctx.shadowBlur = 0;
        roundRect(ctx, chipCx - cw2 / 2, chY, cw2, unit * 1.05, unit * 0.3);
        ctx.strokeStyle = rgba(accent, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(label, chipCx, chY + unit * 0.72);
        ctx.textAlign = "start";
        ctx.restore();
      });
  }

  ctx.textAlign = "start";
}
