import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  enterT,
  idle,
  sub,
  clamp01,
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

const INK_PANEL = "#0a0e13";

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

  const minX = Math.min(...scene.parts.map((p) => p.x));
  const maxX = Math.max(...scene.parts.map((p) => p.x));
  const minY = Math.min(...scene.parts.map((p) => p.y));
  const maxY = Math.max(...scene.parts.map((p) => p.y));
  
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  
  const spread = vertical ? 1.0 : 1.2;

  const worldPos = (x: number, y: number) => {
    return new THREE.Vector3((x - midX) * spread, 0, (y - midY) * spread);
  };

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

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const gw = Math.max(maxX - minX + 2, maxY - minY + 2) * spread;
    const grid = new THREE.GridHelper(gw * 2, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(gw * 3, gw * 3),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Group, p: Part }[] = [];

    scene.parts.forEach((p) => {
        const isRound = p.kind === "bulb" || p.kind === "led";
        const g = isRound 
            ? makeCylinder(0.4, 0.5, "#1e293b", "#31435a") 
            : makeBlock(0.8, 0.4, 0.8, "#1e293b", "#31435a");
        g.position.copy(worldPos(p.x, p.y));
        s.add(g);
        models.push({ mesh: g, p });
    });

    const update = (elapsedMs: number, ctxData: any) => {
      const { gIn, stLit, stLever, hl } = ctxData;
      
      models.forEach(({ mesh, p }) => {
        mesh.visible = gIn > 0;
        mesh.scale.setScalar(Math.max(0.001, gIn));
        
        const lit = Math.max(stLit[p.id] || 0, ctxData.flowRamp);
        const lever = stLever[p.id] || 0;
        const highlighted = hl.has(p.id);
        const energized = lit > 0 || (p.kind === "switch" && lever > 0);
        
        const breathe = lit > 0 && (p.kind === "bulb" || p.kind === "led") ? 1 + 0.05 * Math.sin(elapsedMs / 320) : 1;
        const bob = Math.sin(elapsedMs / 1200 + p.x) * 0.05;
        const p0 = worldPos(p.x, p.y);
        mesh.position.y = p0.y + bob + (highlighted ? 0.2 : 0);
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * 0.9;
                
                if (energized || highlighted) {
                    mat.color.setStyle(accent);
                    mat.emissive.setStyle(accent);
                    mat.emissiveIntensity = Math.max(0.2, lit * 0.8 * breathe);
                } else {
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
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
  scene.parts.forEach(p => {
      stLit[p.id] = litOf(p.id);
      stLever[p.id] = leverOf(p.id, p.kind);
  });

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, stLit, stLever, hl: highlights, flowRamp });
  if (!cam) return;

  const centers = new Map(scene.parts.map((p) => {
    const p3D = worldPos(p.x, p.y);
    const bob = Math.sin(env.elapsedMs / 1200 + p.x) * 0.05;
    p3D.y += bob + (highlights.has(p.id) ? 0.2 : 0);
    return [p.id, projectToRect(cam, p3D, rect)];
  }));
  const byId = new Map(scene.parts.map((p) => [p.id, p]));

  // Wires in 2D
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
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
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
        const cw = tw + unit * 0.8;
        const chY = c.y - unit * 2.0; // Place above 3D block
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.3;
        roundRect(ctx, c.x - cw / 2, chY, cw, unit * 1.05, unit * 0.3);
        ctx.fillStyle = INK_PANEL;
        ctx.fill();
        ctx.shadowBlur = 0;
        roundRect(ctx, c.x - cw / 2, chY, cw, unit * 1.05, unit * 0.3);
        ctx.strokeStyle = rgba(accent, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(label, c.x, chY + unit * 0.72);
        ctx.textAlign = "start";
        ctx.restore();
      });
  }

  ctx.textAlign = "start";
}
