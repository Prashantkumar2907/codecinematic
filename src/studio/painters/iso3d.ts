import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, enterT, clamp01, roundRect, drawSceneTitle, beatT, activeBeatIndex, flowDots, rgba } from "./common";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, makeDatabaseStack, makeServerRack, type ThreeBundle } from "./three3d";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type Iso3dScene = Extract<Scene, { kind: "iso3d" }>;

/** Per-scene beat state the cached three.js `update` reads each frame (build()
 *  runs once, so live beat progress is passed through this side channel). */
type FlowState = { revealed: number; activeIdx: number; flowT: number };
const flowState = new Map<string, FlowState>();

/** Stage position in world space. Landscape lays the row left→right (X);
 *  portrait lays it front→back (Z) so it recedes into the tall frame instead of
 *  overflowing the narrow width. */
function stagePos(i: number, n: number, vertical: boolean, spread: number): THREE.Vector3 {
  const t = n === 1 ? 0.5 : i / (n - 1);
  const u = -spread + t * spread * 2;
  return vertical ? new THREE.Vector3(0, 0, -u) : new THREE.Vector3(u, 0, 0);
}

/**
 * Real-3-D isometric system scene (ByteByteGo hard-drive→RAM / client→server→DB
 * look): ordered stages as extruded blocks / cylinders on a ground grid, with a
 * glowing packet flowing into each stage as its beat plays. Labels are projected
 * from the 3-D positions so they track the models. Falls back to a 2-D isometric
 * drawing if WebGL is unavailable.
 */
export function paintIso3d(ctx: CanvasRenderingContext2D, scene: Iso3dScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, h } = layout;
  const { accent, secondary } = env.palette;
  const n = scene.stages.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset; // -1 during intro
  const key = scene.id;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;

  // How many stages are revealed, and flow progress into the active one.
  const flowT = activeIdx >= 0 ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  flowState.set(key, { revealed: activeIdx < 0 ? 0 : activeIdx + easeOutCubic(clamp01(flowT * 1.4)), activeIdx, flowT });

  const rect = { x: contentX, y: contentY + band * 0.4, w: contentW, h: contentH - band * 0.4 };
  const spread = vertical ? 2.7 : 3.8;

  const shapeColor = (shape?: string) => (shape === "database" || shape === "disk" ? secondary : accent);

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    // Framed tight so the models fill the frame instead of floating small in it.
    const camera = new THREE.PerspectiveCamera(vertical ? 44 : 36, 1, 0.1, 100);
    const dist = vertical ? 9.0 : 8.4;
    camera.position.copy(new THREE.Vector3(1, 0.82, 1.32).normalize().multiplyScalar(dist));
    camera.lookAt(0, 0, vertical ? -0.3 : 0);
    studioLights(s, accent, secondary);
    const grid = new THREE.GridHelper(spread * 4, 14, new THREE.Color(accent), new THREE.Color(THEME.textDim));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.3;
    grid.position.y = -1.3;
    s.add(grid);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spread * 6, spread * 6),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.3;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models = scene.stages.map((st, i) => {
      const col = shapeColor(st.shape);
      const isCyl = st.shape === "database" || st.shape === "disk";
      const isServer = st.shape === "server";
      const g = isCyl
        ? makeDatabaseStack(0.82, 1.9, col.toString(), THEME.text)
        : isServer
          ? makeServerRack(1.6, 2.2, 1.6, col.toString(), THEME.text)
          : makeBlock(1.6, 1.5, 1.6, col.toString(), THEME.text);
      const p = stagePos(i, n, vertical, spread);
      g.position.set(p.x, isCyl ? -0.25 : isServer ? -0.05 : -0.5, p.z);
      s.add(g);
      return g;
    });

    const update = (elapsedMs: number) => {
      const stt = flowState.get(key) ?? { revealed: 0, activeIdx: -1, flowT: 0 };
      models.forEach((m, i) => {
        const local = clamp01(stt.revealed - i);
        const sc = easeOutCubic(local);
        m.scale.setScalar(Math.max(0.001, sc));
        m.visible = sc > 0.01;
        // A gentle continuous bob keeps every revealed model alive.
        m.position.y = m.userData.baseY ?? (m.userData.baseY = m.position.y);
        m.position.y += Math.sin(elapsedMs / 1300 + i) * 0.05;
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs);

  // --- 2-D glowing connectors with animated flow between revealed stages ---
  if (cam) {
    const revNow = flowState.get(key)?.revealed ?? 0;
    for (let i = 1; i < n; i++) {
      const prevIn = clamp01(revNow - (i - 1));
      const curIn = clamp01(revNow - i);
      if (prevIn <= 0) continue;
      // Route the flow beam in FRONT of the models (toward camera) so it never
      // slices across a block face.
      const off = vertical ? new THREE.Vector3(1.15, 0, 0) : new THREE.Vector3(0, 0, 1.15);
      const a3 = stagePos(i - 1, n, vertical, spread).add(off); a3.y = -0.55;
      const b3 = stagePos(i, n, vertical, spread).add(off); b3.y = -0.55;
      const a = projectToRect(cam, a3, rect);
      const b = projectToRect(cam, b3, rect);
      const grow = i === activeIdx ? easeOutCubic(clamp01(flowT * 1.3)) : curIn > 0 ? 1 : easeOutCubic(prevIn);
      const end = { x: a.x + (b.x - a.x) * grow, y: a.y + (b.y - a.y) * grow };
      ctx.save();
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = unit * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
      if (grow > 0.15) flowDots(ctx, [a, end], env, { count: 2, speedMs: 1500, r: unit * 0.16, color: accent });
    }
  }

  // Labels + icons projected from each stage's 3-D base (tracks the models).
  const drawLabel = (i: number, sx: number, sy: number) => {
    const st = scene.stages[i];
    const local = clamp01((flowState.get(key)?.revealed ?? 0) - i);
    if (local <= 0) return;
    ctx.save();
    ctx.globalAlpha = easeOutCubic(local);
    const isActive = i === activeIdx;
    ctx.font = `${isActive ? 800 : 600} ${unit * 0.82}px ${FONT_SANS}`;
    const tw = ctx.measureText(st.label).width;
    const padX = unit * 0.5;
    const chipW = tw + padX * 2, chipH = unit * 1.5;
    roundRect(ctx, sx - chipW / 2, sy, chipW, chipH, unit * 0.35);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.82);
    ctx.fill();
    ctx.strokeStyle = rgba(isActive ? accent : THEME.textDim, isActive ? 0.9 : 0.4);
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.label, sx, sy + chipH / 2);
    ctx.restore();
  };

  if (cam) {
    // The 3-D models carry the concept; a projected label sits under each.
    scene.stages.forEach((_st, i) => {
      const w = stagePos(i, n, vertical, spread); w.y = -1.5;
      const p = projectToRect(cam, w, rect);
      drawLabel(i, p.x, p.y);
    });
  } else {
    // 2-D fallback: simple isometric-ish boxes in a row.
    const bw = Math.min(rect.w / n * 0.7, unit * 5);
    scene.stages.forEach((st, i) => {
      const cx = rect.x + rect.w * ((i + 0.5) / n);
      const cy = rect.y + rect.h / 2;
      const local = clamp01((flowState.get(key)?.revealed ?? 0) - i);
      if (local <= 0) return;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(local);
      roundRect(ctx, cx - bw / 2, cy - bw / 2, bw, bw, unit * 0.4);
      ctx.fillStyle = rgba(shapeColor(st.shape).toString(), 0.12);
      ctx.fill();
      ctx.strokeStyle = shapeColor(st.shape).toString();
      ctx.lineWidth = 2;
      ctx.stroke();
      if (st.shape) drawIcon(ctx, st.shape, cx, cy - unit * 0.4, bw * 0.5, env, shapeColor(st.shape).toString());
      ctx.fillStyle = THEME.text;
      ctx.font = `700 ${unit * 0.7}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(st.label, cx, cy + bw / 2 + unit * 0.9);
      ctx.restore();
    });
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  void h;
}
