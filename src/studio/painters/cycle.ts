import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  sub,
  clamp01,
  enterT,
  wrapText,
  fitFontSize,
  drawArrowhead,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  roundRect,
  strokePolylineProgress,
  pointAlongPolyline,
} from "./common";
import type { PaintEnv } from "./index";

type CycleScene = Extract<Scene, { kind: "cycle" }>;
type Pt = { x: number; y: number };

const ARC_GAP = (14 * Math.PI) / 180;

export function paintCycle(ctx: CanvasRenderingContext2D, scene: CycleScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.nodes.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  let availH = contentH - titleBand;
  if (vertical) availH = Math.min(availH, layout.h * 0.86 - (contentY + titleBand));
  const cx = contentX + contentW / 2;
  const cy = contentY + titleBand + availH / 2;
  const nodeR = unit * 1.05;
  let radius = Math.min(contentW, availH) * 0.36;
  if (vertical) radius = Math.min(radius, contentW / 2 - nodeR - unit * 3.2);
  const step = (Math.PI * 2) / n;
  const angleOf = (k: number) => -Math.PI / 2 + k * step;
  
  const rawPosOf = (a: number) => ({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  
  const worldRadius = 4.0;
  const worldPos = (px: number, py: number) => {
    const nx = (px - cx) / radius;
    const ny = (py - cy) / radius;
    return new THREE.Vector3(nx * worldRadius, 0, ny * worldRadius);
  };

  const ghostIn = easeOutCubic(enterT(env, 420));
  const key = scene.id + "-cyc3d";
  const rect = { x: contentX, y: contentY + titleBand, w: contentW, h: availH };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 14 : 11, vertical ? 11 : 8.5);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, "rgba(148,163,184,0.5)");
    
    const grid = new THREE.GridHelper(worldRadius * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(worldRadius * 4, worldRadius * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models = scene.nodes.map((node, k) => {
      const g = makeCylinder(1.2, 0.5, "#1e293b", accent);
      s.add(g);
      return { id: k, mesh: g, node };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ id, mesh }) => {
        const t = beatT(env.beats, offset + id, totalBeats, env.p);
        const isActive = active === offset + id;
        
        const pop = easeOutBack(clamp01(t / 0.3));
        const pulse = isActive ? 1 + 0.018 * Math.sin(elapsedMs / 250) : 1;
        mesh.scale.setScalar(Math.max(0.001, pop * pulse));
        mesh.visible = ghostIn > 0 || t > 0.01;
        if (t <= 0) {
            mesh.scale.setScalar(Math.max(0.001, 0.9 * ghostIn));
        }
        
        const raw = rawPosOf(angleOf(id));
        const wp = worldPos(raw.x, raw.y);
        mesh.position.copy(wp);
        mesh.position.y = (t <= 0 ? -0.4 : 0) + (isActive ? 0.2 : 0) + Math.sin(elapsedMs / 1500 + id) * 0.05;
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.Material;
                mat.transparent = true;
                mat.opacity = t <= 0 ? 0.2 * ghostIn : 1.0;
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const posOf = (a: number) => {
    const raw = rawPosOf(a);
    return projectToRect(cam, worldPos(raw.x, raw.y), rect);
  };

  const getArcPts = (a0: number, a1: number): Pt[] => {
    const pts: Pt[] = [];
    const steps = 30;
    for(let i=0; i<=steps; i++) {
        const a = a0 + (a1 - a0) * (i/steps);
        pts.push(posOf(a));
    }
    return pts;
  };

  const arcProgress = (j: number): number => {
    if (j < n - 1) return easeInOutCubic(clamp01(beatT(env.beats, offset + j + 1, totalBeats, env.p) / 0.45));
    // Closing arc completes the loop during the final stretch of the last beat.
    return easeInOutCubic(sub(beatT(env.beats, totalBeats - 1, totalBeats, env.p), 0.8, 0.2));
  };

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

  for (let j = 0; j < n; j++) {
    const a0 = angleOf(j) + ARC_GAP;
    const a1 = angleOf(j) + step - ARC_GAP;
    const prog = arcProgress(j);

    if (prog < 1 && ghostIn > 0) {
      ctx.save();
      ctx.globalAlpha = 0.15 * ghostIn;
      ctx.strokeStyle = THEME.textDim;
      ctx.lineWidth = unit * 0.08;
      ctx.setLineDash([unit * 0.3, unit * 0.32]);
      const pts = getArcPts(a0, a1);
      strokePolylineProgress(ctx, pts, 1);
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (prog <= 0) continue;

    const isHot = !inTail && (active === offset + j + 1 || (j === n - 1 && prog < 1));
    const aEnd = a0 + (a1 - a0) * prog;
    const activePts = getArcPts(a0, aEnd);
    
    ctx.save();
    ctx.globalAlpha = isHot || inTail ? 1 : 0.55;
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = unit * 0.14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (isHot || inTail) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    
    strokePolylineProgress(ctx, activePts, 1);
    ctx.shadowBlur = 0;
    
    if (prog > 0.2 && activePts.length >= 2) {
      const last = activePts[activePts.length - 1];
      const prev = activePts[activePts.length - 2];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      drawArrowhead(ctx, last.x, last.y, angle, unit * 0.5);
    }
    ctx.restore();

    if (prog > 0 && prog < 1 && activePts.length > 0) {
      const tip = activePts[activePts.length - 1];
      glowDot(tip.x, tip.y, 0.95, unit * 0.24);
    } else if (prog >= 1 && !inTail) {
      // Completed arcs carry one slow flowing dot, phase-locked to elapsedMs.
      const f = (env.elapsedMs % 1600) / 1600;
      const fullPts = getArcPts(a0, a1);
      const d = pointAlongPolyline(fullPts, f);
      glowDot(d.x, d.y, 0.9 * Math.sin(Math.PI * f), unit * 0.2);
    }
  }

  if (inTail) {
    for (let d = 0; d < 3; d++) {
      const f = (env.elapsedMs / 2600 + d / 3) % 1;
      const a = -Math.PI / 2 + f * Math.PI * 2;
      const pt = posOf(a);
      glowDot(pt.x, pt.y, 0.9, unit * 0.22);
    }
  }

  const drawLabelChip = (k: number, slide: number, alpha: number, ghost: boolean) => {
    if (alpha <= 0) return;
    const node = scene.nodes[k];
    
    const projectedPos = posOf(angleOf(k));
    const ax = projectedPos.x;
    
    // Determine logical side using the raw angle to keep layout stable
    const rawA = angleOf(k);
    const rawC = Math.cos(rawA);
    const rawS = Math.sin(rawA);
    
    // Offset slightly out from the 3D projected center
    const dist2D = nodeR + unit * (0.25 + 0.45 * slide);
    const finalX = ax + rawC * dist2D;
    const finalY = projectedPos.y + rawS * dist2D;
    
    const side: -1 | 0 | 1 = Math.abs(rawC) < 0.35 ? 0 : rawC > 0 ? 1 : -1;
    const maxW = side === 0 ? unit * 9 : Math.max(unit * 2.2, (side > 0 ? w - finalX : finalX) - unit * 0.5);
    const px = fitFontSize(ctx, node.label, { maxW, startPx: unit * (vertical ? 0.8 : 0.72), minPx: unit * 0.56, weight: 700 });
    ctx.font = `700 \${px}px \${FONT_SANS}`;
    let lines = [node.label];
    if (ctx.measureText(node.label).width > maxW) lines = wrapText(ctx, node.label, maxW).slice(0, 2);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const chipW = tw + unit * 0.7;
    const lineH = px * 1.2;
    const chipH = lines.length * lineH + unit * 0.45;
    const chipX = side === 1 ? finalX : side === -1 ? finalX - chipW : finalX - chipW / 2;
    const chipY = finalY - chipH / 2;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.3);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = ghost ? "rgba(148,163,184,0.35)" : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = ghost ? THEME.textDim : THEME.text;
    ctx.textAlign = "center";
    const y0 = chipY + chipH / 2 - ((lines.length - 1) * lineH) / 2 + px * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, chipX + chipW / 2, y0 + i * lineH));
    ctx.textAlign = "start";
    ctx.restore();
  };

  for (let k = 0; k < n; k++) {
    const node = scene.nodes[k];
    const pos = posOf(angleOf(k));
    const t = beatT(env.beats, offset + k, totalBeats, env.p);

    if (t <= 0) {
      if (ghostIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.14 * ghostIn;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(148,163,184,0.7)";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.3, unit * 0.3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawLabelChip(k, 1, 0.2 * ghostIn, true);
      continue;
    }

    const isActive = active === offset + k;
    const pop = easeOutBack(clamp01(t / 0.3));
    ctx.save();
    ctx.globalAlpha = (isActive ? 1 : 0.65) * clamp01(t * 4);
    ctx.translate(pos.x, pos.y);
    ctx.scale(pop, pop);
    ctx.translate(-pos.x, -pos.y);
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 1.0;
    } else {
      ctx.shadowBlur = 0;
    }
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isActive ? accent : "rgba(148,163,184,0.5)";
    ctx.lineWidth = isActive ? unit * 0.12 : unit * 0.07;
    ctx.stroke();
    
    if (node.icon) {
      ctx.font = `\${nodeR}px \${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(node.icon, pos.x, pos.y + nodeR * 0.36);
      ctx.textAlign = "start";
    } else {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, unit * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (isActive) {
      const pr = (env.elapsedMs % 1800) / 1800;
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.35;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeR * (1 + pr * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const slide = easeOutCubic(clamp01((t - 0.08) / 0.3));
    drawLabelChip(k, slide, slide * (isActive ? 1 : 0.8), false);
  }

  const activeIdx = active - offset;
  const tActive = activeIdx >= 0 ? beatT(env.beats, active, totalBeats, env.p) : 0;
  const fadeIn = easeOutCubic(sub(tActive, 0.05, 0.22));
  const cur = activeIdx >= 0 ? scene.nodes[activeIdx].detail : undefined;
  const prev = activeIdx >= 1 ? scene.nodes[activeIdx - 1].detail : undefined;

  const drawDetail = (text: string, alpha: number, dy: number) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `500 \${unit * (vertical ? 0.8 : 0.78)}px \${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    
    const centerProj = projectToRect(cam, new THREE.Vector3(0, 0, 0), rect);
    
    const lines = wrapText(ctx, text, radius * 1.3).slice(0, 3);
    const lh = unit * 1.0;
    const y0 = centerProj.y - ((lines.length - 1) * lh) / 2 + unit * 0.28 + dy;
    lines.forEach((l, i) => ctx.fillText(l, centerProj.x, y0 + i * lh));
    ctx.textAlign = "start";
    ctx.restore();
  };

  if (prev && fadeIn < 1) drawDetail(prev, 1 - fadeIn, -unit * 0.9 * fadeIn);
  if (cur) drawDetail(cur, fadeIn, unit * 0.9 * (1 - fadeIn));
  else {
    const glyphAlpha = 0.25 * (prev ? fadeIn : ghostIn);
    if (glyphAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = glyphAlpha;
      const centerProj = projectToRect(cam, new THREE.Vector3(0, 0, 0), rect);
      ctx.translate(centerProj.x, centerProj.y);
      ctx.rotate((env.elapsedMs / 4000) * Math.PI * 2 * 0.05);
      ctx.strokeStyle = THEME.textDim;
      ctx.fillStyle = THEME.textDim;
      ctx.lineWidth = unit * 0.12;
      ctx.lineCap = "round";
      for (const base of [0, Math.PI]) {
        ctx.beginPath();
        ctx.arc(0, 0, unit * 1.35, base + 0.5, base + Math.PI - 0.7);
        ctx.stroke();
        const end = base + Math.PI - 0.7;
        drawArrowhead(ctx, Math.cos(end) * unit * 1.35, Math.sin(end) * unit * 1.35, end + Math.PI / 2, unit * 0.34);
      }
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
