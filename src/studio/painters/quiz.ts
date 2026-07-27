import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  wrapText,
  fitFontSize,
  shade,
  beatWindow,
  beatT,
  activeBeatIndex,
  enterT,
  idle,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type QuizScene = Extract<Scene, { kind: "quiz" }>;

const LETTERS = ["A", "B", "C", "D"];

/** Straight-on camera: any tilt makes the pixel<->world mapping below non-affine,
 *  which is what desynchronised the option slabs from their labels. */
const CAM_DIST = 9;
const PANEL_Z = 0;
const PANEL_DEPTH = 0.25;
/** Option slabs float clear of the panel's front face so they cannot z-fight it. */
const ROW_Z = 0.3;
const ROW_DEPTH = 0.18;
/** Horizontal inset of an option slab inside the panel. */
const ROW_INSET = 0.32;
/** makeBlock builds its edge wireframe at 0.6 opacity; keep that ratio when fading. */
const EDGE_ALPHA = 0.6;
const ROW_FACE_LIFT = 0.14;
const CORRECT_EMISSIVE = 0.4;
const ROW_EMISSIVE = 0.1;

/** Beat 0 shows the question + options; beat 1 reveals the correct answer. */
export function paintQuiz(ctx: CanvasRenderingContext2D, scene: QuizScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft, secondary } = env.palette;
  const totalBeats = 2;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const revealing = active >= 1;
  const revealT = revealing ? easeOutCubic(clamp01(beatT(env.beats, 1, totalBeats, env.p) / 0.28)) : 0;

  const qIn = easeOutCubic(enterT(env, 380));
  ctx.save();
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  const qLines = wrapText(ctx, scene.question, contentW * 0.96);
  ctx.restore();

  const m = scene.options.length;
  const gap = unit * 0.7;
  const rowH = Math.min(
    (contentH - (qLines.length * unit * 1.7 + unit * 1.1) - (m - 1) * gap) / m,
    unit * (vertical ? 3.0 : 2.3)
  );

  const blockH = qLines.length * unit * 1.7 + unit * 1.1 + m * rowH + (m - 1) * gap;
  const qTop = contentY + Math.max(unit * 1.4, (contentH - blockH) / 2);

  // Question lines in crisp flat 2D
  ctx.save();
  ctx.globalAlpha = qIn;
  ctx.font = `800 ${unit * 1.35}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  qLines.forEach((line, i) => ctx.fillText(line, contentX, qTop + unit * 1.05 + i * unit * 1.7));
  ctx.restore();

  const optsTop = qTop + unit * 1.05 + qLines.length * unit * 1.7 + unit * 0.75;
  const beat0T = beatT(env.beats, 0, totalBeats, env.p);

  // Think-time countdown: flat 2D HUD at the bottom
  const w0 = beatWindow(env.beats, 0, totalBeats);
  const w1 = beatWindow(env.beats, 1, totalBeats);
  if (!revealing && env.p >= w0.end && w1.start > w0.end) {
    const tt = clamp01((env.p - w0.end) / (w1.start - w0.end));
    const secsLeft = Math.max(1, Math.ceil(((w1.start - env.p) * env.durationMs) / 1000));
    const cx = contentX + contentW / 2;
    const cy = optsTop + m * rowH + (m - 1) * gap + unit * 1.7;
    const r = unit * 1.05;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(THEME.panel, 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.textDim, 0.25);
    ctx.lineWidth = unit * 0.14;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (1 - tt) * Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    ctx.stroke();
    const tick = 1 + 0.12 * Math.max(0, 1 - ((env.elapsedMs % 1000) / 1000) * 4);
    ctx.font = `900 ${unit * 1.0 * tick}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(String(secsLeft), cx, cy + unit * 0.36);
    ctx.font = `700 ${unit * 0.52}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText("GUESS!", cx, cy + r + unit * 0.75);
    ctx.restore();
  }

  // Options 3D Setup
  const rect = { x: contentX, y: optsTop, w: contentW, h: m * rowH + (m - 1) * gap };
  const key = scene.id + "-quiz3d";

  const rowInset = unit * ROW_INSET;
  const optionStates = scene.options.map((opt, i) => {
    const appear = easeOutCubic(clamp01(beat0T * 2.5 - i * 0.35));
    const showCorrect = revealing && opt.correct;
    const dim = revealing && !opt.correct;
    const y = optsTop + i * (rowH + gap);

    return {
      visible: appear > 0,
      x: contentX + rowInset,
      y,
      w: contentW - rowInset * 2,
      h: rowH,
      scale: appear,
      opacity: appear * (dim ? 1 - 0.58 * revealT : 1),
      showCorrect,
      dim,
    };
  });

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };
  type Mapping = ReturnType<typeof mappingAt>;
  const toWorld = (m: Mapping, px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

  // The 2D layout is authoritative; the 3D layer aligns to IT. projectToRect is
  // affine on a z=const plane for an axis-aligned camera, so each slab's front face
  // lands exactly on the pixel row its label is drawn in.
  const build = (): ThreeBundle<{ qIn: number; revealT: number; optionStates: typeof optionStates }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 34, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const panelM = mappingAt(camera, PANEL_Z + PANEL_DEPTH / 2);
    const panelBlock = makeBlock(rect.w / panelM.sx, rect.h / panelM.sy, PANEL_DEPTH, THEME.panel, accent);
    panelBlock.position.set(0, 0, PANEL_Z);
    s.add(panelBlock);

    const rowM = mappingAt(camera, ROW_Z + ROW_DEPTH / 2);
    const rowFace = shade(THEME.panel, ROW_FACE_LIFT);
    const optionMeshes = optionStates.map((state) => {
      const mesh = makeBlock(state.w / rowM.sx, state.h / rowM.sy, ROW_DEPTH, rowFace, THEME.textDim);
      mesh.position.z = ROW_Z;
      s.add(mesh);
      return mesh;
    });

    /** Fade faces AND the edge wireframe: makeBlock parents the LineSegments under
     *  the mesh, so a faces-only fade left an opaque outline in the air. */
    const fade = (block: THREE.Group, alpha: number) =>
      block.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (!mat) return;
        mat.transparent = true;
        mat.opacity = alpha * (o instanceof THREE.LineSegments ? EDGE_ALPHA : 1);
      });

    const update = (_elapsedMs: number, data: { qIn: number; revealT: number; optionStates: typeof optionStates }) => {
      fade(panelBlock, data.qIn);

      optionMeshes.forEach((mesh, i) => {
        const state = data.optionStates[i];
        mesh.visible = !!state?.visible;
        if (!state?.visible) return;

        const c = toWorld(rowM, state.x + state.w / 2, state.y + state.h / 2);
        mesh.position.set(c.x, c.y, ROW_Z);
        mesh.scale.set(Math.max(0.001, state.scale), Math.max(0.001, state.scale), 1);
        fade(mesh, state.opacity);

        mesh.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const mat = o.material as THREE.MeshPhysicalMaterial;
          mat.color.setStyle(state.showCorrect ? THEME.good : rowFace);
          mat.emissive.setStyle(state.showCorrect ? THEME.good : rowFace);
          mat.emissiveIntensity = state.showCorrect ? CORRECT_EMISSIVE * data.revealT : ROW_EMISSIVE;
        });
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { qIn, revealT, optionStates }, env);
  if (!cam) return;

  // Draw Option text/badge/checkmark overlays in crisp flat 2D
  optionStates.forEach((state, i) => {
    if (!state.visible) return;

    const showCorrect = state.showCorrect;
    const cx = state.x + state.w / 2;
    const cy = state.y + state.h / 2;
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.translate(cx, cy);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-cx, -cy);

    const badgeR = unit * 0.72;
    const badgeX = state.x + unit * 1.3;
    ctx.beginPath();
    ctx.arc(badgeX, cy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = showCorrect ? THEME.good : accentSoft;
    ctx.fill();
    ctx.fillStyle = showCorrect ? THEME.bgBottom : accent;
    ctx.font = `800 ${unit * 0.9}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(LETTERS[i] ?? "?", badgeX, cy + unit * 0.32);

    ctx.textAlign = "start";
    const textX = badgeX + badgeR + unit * 0.9;
    // The tick needs its own lane on the right of the correct row.
    const textW = state.x + state.w - textX - unit * 2.2;
    const weight = showCorrect ? 700 : 500;
    // Shrink to fit rather than take wrapText()[0], which silently truncated any
    // option wider than its row (schema allows 52 chars).
    const px = fitFontSize(ctx, scene.options[i].text, {
      maxW: textW,
      startPx: unit * 0.95,
      minPx: unit * 0.6,
      weight,
    });
    ctx.font = `${weight} ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(scene.options[i].text, textX, cy + px * 0.34);

    if (showCorrect) {
      ctx.font = `900 ${unit * 1.1 * (0.7 + 0.3 * revealT)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.good;
      ctx.textAlign = "right";
      ctx.fillText("\u2713", state.x + state.w - unit * 0.7, cy + unit * 0.36);
    }

    ctx.restore();
  });
}
