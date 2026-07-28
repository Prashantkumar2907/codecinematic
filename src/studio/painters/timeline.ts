import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, enterT, wrapText, drawSceneTitle, beatT, activeBeatIndex } from "./common";
import type { PaintEnv } from "./index";

type TimelineScene = Extract<Scene, { kind: "timeline" }>;

export function paintTimeline(ctx: CanvasRenderingContext2D, scene: TimelineScene, env: PaintEnv) {
  const isHorizontal = (scene.orient ?? "vertical") === "horizontal" && !env.layout.vertical;
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary, accentSoft } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.events.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-tl3d" + (isHorizontal ? "h" : "v");

  const titleIn = Math.max(env.p, enterT(env, 380) * 0.12);
  const band = drawSceneTitle(ctx, scene.title, layout, titleIn, accent) + unit * 0.3;
  const areaTop = contentY + band;
  const areaH = contentH - band;
  
  const rect = { x: contentX, y: areaTop, w: contentW, h: areaH };
  const spreadX = isHorizontal ? 6.0 : 3.0;
  const spreadY = isHorizontal ? 3.0 : 5.0;

  const worldPos = (i: number) => {
    if (isHorizontal) {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadX * 2;
      return new THREE.Vector3(x, 0, 0);
    } else {
      const y = n === 1 ? 0 : (0.5 - i / (n - 1)) * spreadY * 2;
      return new THREE.Vector3(0, y, 0);
    }
  };

  const blockW = isHorizontal ? (spreadX * 2.0) / n * 0.8 : (spreadX * 2.0) * 0.8;
  const blockH = isHorizontal ? 1.0 : (spreadY * 2.0) / n * 0.8;
  const blockD = 0.2;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 14 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -spreadY - 0.5;
    if (!isHorizontal) {
       grid.position.y = -0.5;
       grid.rotation.x = Math.PI / 2;
       grid.position.z = -1;
    }
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadY * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = isHorizontal ? grid.position.y : -spreadY - 1;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Connecting line (spine)
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.3 });
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const p = worldPos(i);
        positions[i*3] = p.x;
        positions[i*3+1] = p.y;
        positions[i*3+2] = p.z;
    }
    lineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(lineGeo, lineMat);
    s.add(line);

    const models: { mesh: THREE.Group, idx: number, isHighlighted: boolean }[] = [];
    for (let i = 0; i < n; i++) {
        const g = makeBlock(blockW, blockH, blockD, "#1e293b", "#31435a");
        g.position.copy(worldPos(i));
        s.add(g);
        models.push({ mesh: g, idx: i, isHighlighted: scene.events[i].highlight || false });
    }

    const update = (elapsedMs: number, ctxData: { p: number, active: number }) => {
      const frameIn = easeOutCubic(enterT(env, 420));
      lineMat.opacity = frameIn * 0.3;
      
      models.forEach(({ mesh, idx, isHighlighted }) => {
        const beatIdx = offset + idx;
        const t = beatT(env.beats, beatIdx, totalBeats, ctxData.p);
        const appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
        const isCurrent = ctxData.active === beatIdx;

        const pop = Math.max(0.001, appear);
        mesh.scale.setScalar(pop);
        mesh.visible = appear > 0.01;
        
        const base = worldPos(idx);
        const bob = Math.sin(elapsedMs / 1200 + idx * 0.5) * 0.08;
        
        mesh.position.y = base.y + (isHorizontal ? bob : 0);
        mesh.position.x = base.x + (!isHorizontal ? bob : 0);
        mesh.position.z = isCurrent ? 0.5 : isHighlighted ? 0.2 : 0;

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = appear * 0.9;
                
                if (isCurrent) {
                    mat.color.setStyle(accentSoft);
                    mat.emissive.setStyle(accentSoft);
                } else if (isHighlighted) {
                    mat.color.setStyle("#0e2433");
                    mat.emissive.setStyle("#0e2433");
                } else {
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
                }
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { p: env.p, active }, env);
  if (!cam) return;

  const get2D = (i: number) => projectToRect(cam, worldPos(i), rect);

  scene.events.forEach((e, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) return;
    
    const appear = easeOutCubic(Math.min(1, t * 3));
    const isCurrent = active === offset + i;
    
    const p = get2D(i);
    const bob = Math.sin(env.elapsedMs / 1200 + i * 0.5) * unit * 1.5;
    const cy = isHorizontal ? p.y - bob : p.y;
    const cx = isHorizontal ? p.x : p.x + bob;

    ctx.save();
    ctx.globalAlpha = appear;
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    
    ctx.textAlign = isHorizontal ? "center" : "right";
    ctx.font = `800 ${unit * (isHorizontal ? 0.72 : 0.8)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? accent : THEME.textDim;
    
    if (isHorizontal) {
        ctx.fillText(e.when, cx, cy + unit * 2.2);
    } else {
        ctx.fillText(e.when, cx - blockW * 15, cy + unit * 0.28);
    }
    
    ctx.textAlign = isHorizontal ? "center" : "start";
    ctx.font = `${isCurrent ? 700 : 500} ${unit * (isHorizontal ? 0.72 : 0.88)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    
    const labelX = isHorizontal ? cx : cx + blockW * 5;
    const maxW = isHorizontal ? contentW / n * 0.9 : contentW * 0.5;
    const lines = wrapText(ctx, e.label, maxW).slice(0, 3);
    
    const baseY = isHorizontal ? cy - unit * 1.2 : cy + unit * 0.32 - (lines.length - 1) * unit * 0.62;
    lines.forEach((line, li) => {
        ctx.fillText(line, labelX, baseY + li * unit * 1.1 * (isHorizontal ? 0.8 : 1));
    });
    ctx.restore();
  });
}
