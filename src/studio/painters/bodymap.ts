import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  fitFontSize,
  wrapText,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import { render3D, projectToRect, studioLights, type ThreeBundle, makeBlock, color3, makeCylinder } from "./three3d";
import type { PaintEnv } from "./index";

type BodymapScene = Extract<Scene, { kind: "bodymap" }>;
type Region = BodymapScene["marks"][number]["region"];
type BBox = { x: number; y: number; w: number; h: number };

/** Anatomical anchor per region as (fx = offset from centre, fy = down) fractions of body height. */
const REGION_POS: Record<Region, { fx: number; fy: number }> = {
  brain: { fx: 0, fy: 0.05 },
  eyes: { fx: 0, fy: 0.085 },
  ears: { fx: 0, fy: 0.075 },
  throat: { fx: 0, fy: 0.165 },
  heart: { fx: -0.045, fy: 0.28 },
  lungs: { fx: 0, fy: 0.26 },
  stomach: { fx: -0.02, fy: 0.4 },
  liver: { fx: 0.05, fy: 0.37 },
  kidneys: { fx: 0, fy: 0.45 },
  intestines: { fx: 0, fy: 0.49 },
  muscles: { fx: -0.15, fy: 0.4 },
  bones: { fx: 0.07, fy: 0.72 },
  skin: { fx: 0, fy: 0.34 },
  blood: { fx: 0, fy: 0.33 },
};

function regionPoint3D(region: Region): THREE.Vector3 {
  const pos = REGION_POS[region];
  const H = 12.5;
  const topY = 6.5;
  return new THREE.Vector3(pos.fx * H, topY - pos.fy * H, 0);
}

export function paintBodymap(ctx: CanvasRenderingContext2D, scene: BodymapScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.marks.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;
  const areaY = contentY + titleBand;
  const availH = contentH - titleBand;

  const rect = { x: contentX, y: areaY, w: contentW, h: availH };

  const marginW = unit * 1.5;
  const chipMaxTextW = Math.max(unit * 2.4, (contentW / 2) - marginW - unit * 1.5);

  const bodyIn = easeOutCubic(enterT(env, 360));
  if (bodyIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, env.palette.secondary);

    const group = new THREE.Group();
    
    const fillHex = THEME.panel;
    const edgeHex = accent;

    // Body parts
    const head = makeBlock(2, 2.5, 2, fillHex, edgeHex);
    head.position.y = 5.25;
    group.add(head);

    const neck = makeBlock(0.8, 1, 0.8, fillHex, edgeHex);
    neck.position.y = 3.5;
    group.add(neck);

    const torso = makeBlock(4.5, 5, 2.2, fillHex, edgeHex);
    torso.position.y = 0.5;
    group.add(torso);

    const lArm = makeCylinder(0.6, 6, fillHex, edgeHex);
    lArm.position.set(-3, 0, 0);
    group.add(lArm);

    const rArm = makeCylinder(0.6, 6, fillHex, edgeHex);
    rArm.position.set(3, 0, 0);
    group.add(rArm);

    const lLeg = makeCylinder(0.7, 6, fillHex, edgeHex);
    lLeg.position.set(-1.2, -5, 0);
    group.add(lLeg);

    const rLeg = makeCylinder(0.7, 6, fillHex, edgeHex);
    rLeg.position.set(1.2, -5, 0);
    group.add(rLeg);

    // Fade in body based on bodyIn parameter
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const mat = c.material as THREE.Material;
        mat.transparent = true;
        mat.opacity = 0; // Handled in update
      }
      if (c instanceof THREE.LineSegments) {
        const mat = c.material as THREE.Material;
        mat.transparent = true;
        mat.opacity = 0; // Handled in update
      }
    });

    s.add(group);

    const grid = new THREE.GridHelper(30, 30, color3(accent), color3("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -8;
    s.add(grid);

    const update = (elapsedMs: number, ctxData: { alpha: number }) => {
      const { alpha } = ctxData;
      
      const bob = Math.sin(elapsedMs / 1200) * 0.2;
      group.position.y = bob;
      
      const rot = Math.sin(elapsedMs / 2000) * 0.05;
      group.rotation.y = rot;

      group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          (c.material as THREE.Material).opacity = alpha * 0.4;
        }
        if (c instanceof THREE.LineSegments) {
          (c.material as THREE.Material).opacity = alpha * 0.5;
        }
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, scene.id + "-body3d", rect, build, env.elapsedMs, { alpha: bodyIn });
  if (!cam) return;

  const get2DPos = (region: Region) => {
    const p3d = regionPoint3D(region);
    // Apply the same bob and rot as the group in 3D
    const bob = Math.sin(env.elapsedMs / 1200) * 0.2;
    const rot = Math.sin(env.elapsedMs / 2000) * 0.05;
    
    // Create matrix for transformation
    const euler = new THREE.Euler(0, rot, 0);
    p3d.applyEuler(euler);
    p3d.y += bob;
    
    return projectToRect(cam, p3d, rect);
  };

  const pts = scene.marks.map((m) => get2DPos(m.region));

  const glowDot = (x: number, y: number, alpha: number, r: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawOrgan = (x: number, y: number, alpha: number, hot: boolean, scale: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);
    if (hot) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.82 + 0.34 * idle(env, 1500));
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, unit * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(x, y, unit * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (hot) {
      const pr = (env.elapsedMs % 1600) / 1600;
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.4;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      ctx.beginPath();
      ctx.arc(x, y, unit * (0.44 + pr * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawLabel = (k: number, organ: { x: number; y: number }, label: string, tLocal: number, hot: boolean, baseAlpha: number) => {
    const side = k % 2;
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    const px = fitFontSize(ctx, label, { maxW: chipMaxTextW, startPx: unit * 0.64, minPx: unit * 0.44, weight: 600 });
    ctx.font = `600 ${px}px ${FONT_SANS}`;
    let lines = [label];
    if (ctx.measureText(label).width > chipMaxTextW) lines = wrapText(ctx, label, chipMaxTextW).slice(0, 2);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const lineH = px * 1.2;
    const chipW = tw + unit * 0.8;
    const chipH = lines.length * lineH + unit * 0.4;
    const chipX = side === 0 ? contentX + unit * 1 : contentX + contentW - chipW - unit * 1;
    const chipY = Math.min(Math.max(organ.y - chipH / 2, areaY), areaY + availH - chipH);
    const innerX = side === 0 ? chipX + chipW : chipX;

    const leadIn = easeOutCubic(sub(tLocal, 0.15, 0.3));
    if (leadIn > 0) {
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = hot ? rgba(accent, 0.55) : "rgba(148,163,184,0.4)";
      ctx.lineWidth = unit * 0.045;
      strokePolylineProgress(ctx, [{ x: organ.x, y: organ.y }, { x: innerX, y: chipY + chipH / 2 }], leadIn);
      ctx.restore();
    }
    const chipIn = easeOutCubic(sub(tLocal, 0.3, 0.2));
    if (chipIn <= 0) return;
    ctx.save();
    ctx.globalAlpha = baseAlpha * chipIn;
    if (hot) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hot ? rgba(accent, 0.7) : "rgba(148,163,184,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = hot ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    const y0 = chipY + chipH / 2 - ((lines.length - 1) * lineH) / 2 + px * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, chipX + chipW / 2, y0 + i * lineH));
    ctx.textAlign = "start";
    ctx.restore();
  };

  if (scene.path) {
    const activeMark = Math.min(active - offset, scene.marks.length - 1);
    // Traversed segments: the signal/food journeys between regions.
    for (let j = 1; j <= activeMark; j++) {
      const seg = [pts[j - 1], pts[j]];
      const isActiveSeg = !inTail && active === offset + j;
      const t = beatT(env.beats, offset + j, totalBeats, env.p);
      const prog = isActiveSeg ? easeInOutCubic(clamp01(t / 0.55)) : 1;
      ctx.save();
      ctx.globalAlpha = isActiveSeg ? 0.5 : 0.32;
      ctx.strokeStyle = rgba(accent, 0.7);
      ctx.lineWidth = unit * 0.14;
      ctx.lineCap = "round";
      strokePolylineProgress(ctx, seg, prog);
      ctx.restore();
      if (isActiveSeg && prog < 1) {
        const dot = pointAlongPolyline(seg, prog);
        glowDot(dot.x, dot.y, 0.95, unit * 0.24);
      } else {
        const f = (env.elapsedMs / 1600 + j * 0.2) % 1;
        const dot = pointAlongPolyline(seg, f);
        glowDot(dot.x, dot.y, 0.8 * Math.sin(Math.PI * f), unit * 0.16);
      }
    }
    scene.marks.forEach((mark, k) => {
      if (k > activeMark) return;
      const organ = pts[k];
      const t = beatT(env.beats, offset + k, totalBeats, env.p);
      const isDest = k === activeMark && !inTail;
      const hot = isDest && active === offset + k;
      let alpha = 0.55;
      let scale = 1;
      if (k === 0) {
        const pop = easeOutBack(clamp01(t / 0.3));
        scale = Math.max(0.01, pop);
        alpha = hot ? 1 : 0.55;
      } else if (isDest) {
        const arrive = easeOutBack(clamp01((t - 0.4) / 0.4));
        scale = Math.max(0.01, arrive);
        alpha = 0.4 + 0.6 * clamp01((t - 0.4) / 0.4);
      }
      drawOrgan(organ.x, organ.y, alpha, hot, scale);
      const strong = isDest || k === activeMark;
      drawLabel(k, organ, mark.label, isDest ? t : 1, hot, strong ? 1 : 0.7);
    });
    ctx.textAlign = "start";
    return;
  }

  // Independent organs mode.
  scene.marks.forEach((mark, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const organ = pts[k];
    const hot = !inTail && active === offset + k;
    const pop = easeOutBack(clamp01(t / 0.3));
    drawOrgan(organ.x, organ.y, hot ? 1 : 0.55, hot, Math.max(0.01, pop));
    drawLabel(k, organ, mark.label, t, hot, hot ? 1 : 0.7);
  });
  ctx.textAlign = "start";
}
