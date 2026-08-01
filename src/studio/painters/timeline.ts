import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, enterT, wrapText, drawSceneTitle, beatT, activeBeatIndex, lerpColor, shade, DUR, GLOW } from "./common";
import type { PaintEnv } from "./index";

type TimelineScene = Extract<Scene, { kind: "timeline" }>;

const CURRENT_TINT = 0.22;

export function paintTimeline(ctx: CanvasRenderingContext2D, scene: TimelineScene, env: PaintEnv) {
  const isHorizontal = (scene.orient ?? "vertical") === "horizontal" && !env.layout.vertical;
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  // Neutral chrome comes from the shared THEME, not from hex typed into this
  // painter; the edge is derived from the fill so the two can never disagree.
  const panelFill = THEME.panel;
  const panelEdge = shade(THEME.panel, 0.22);
  const offset = introBeatCount(scene);
  const n = scene.events.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-tl3d" + (isHorizontal ? "h" : "v");

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const areaTop = contentY + band;
  const areaH = contentH - band;
  
  // Clamp the 3D viewport to the caption-safe band. Without this the last event
  // projects to ~86% of frame height in 9:16 and sits underneath the burned-in
  // caption, which has been on by default since row 2.2.
  const rect = { x: contentX, y: areaTop, w: contentW, h: Math.max(unit, Math.min(areaH, layout.safeBottom - areaTop)) };
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

  /**
   * ONE idle bob, in world space, used by both the 3D block and the 2D label.
   *
   * They used to be computed separately — the mesh moved by 0.08 world units and
   * the label by `unit * 1.5` pixels off the STATIC projection — so the label
   * drifted away from the block it belongs to. Projecting the bobbed position
   * keeps them locked by construction.
   */
  const BOB_WORLD = 0.08;
  const bobbedPos = (i: number, elapsedMs: number) => {
    const v = worldPos(i);
    const bob = Math.sin(elapsedMs / 1200 + i * 0.5) * BOB_WORLD;
    if (isHorizontal) v.y += bob;
    else v.x += bob;
    return v;
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

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 14, new THREE.Color(accent), new THREE.Color(panelEdge));
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

    const models: { mesh: THREE.Group, idx: number }[] = [];
    for (let i = 0; i < n; i++) {
        const g = makeBlock(blockW, blockH, blockD, panelFill, panelEdge);
        g.position.copy(worldPos(i));
        s.add(g);
        models.push({ mesh: g, idx: i });
    }

    const update = (elapsedMs: number, ctxData: { p: number, active: number }) => {
      const frameIn = easeOutCubic(enterT(env, DUR.base));
      lineMat.opacity = frameIn * 0.3;
      
      models.forEach(({ mesh, idx }) => {
        const beatIdx = offset + idx;
        const t = beatT(env.beats, beatIdx, totalBeats, ctxData.p);
        const appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
        const isCurrent = ctxData.active === beatIdx;

        const pop = Math.max(0.001, appear);
        mesh.scale.setScalar(pop);
        mesh.visible = appear > 0.01;
        
        // z stays at 0. Pushing the current card to 0.5 moved it toward a perspective
        // camera, which scales and shifts its projection while the 2D label is drawn
        // from the z=0 position — the one thing the shared bob above exists to prevent.
        const at = bobbedPos(idx, elapsedMs);
        mesh.position.set(at.x, at.y, 0);

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = appear * 0.9;
                
                // A tinted panel, not solid accent: THEME.text on full #38bdf8 measures
                // about 1.9:1, so the current card was the least readable one on screen.
                const face = isCurrent ? lerpColor(panelFill, accent, CURRENT_TINT) : panelFill;
                mat.color.setStyle(face);
                mat.emissive.setStyle(face);
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { p: env.p, active }, env);
  if (!cam) return;

  const get2D = (i: number) => projectToRect(cam, bobbedPos(i, env.elapsedMs), rect);

  scene.events.forEach((e, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) return;

    const appear = easeOutCubic(Math.min(1, t * 3));
    const isCurrent = active === offset + i;
    
    const p = get2D(i);
    const cx = p.x;
    const cy = p.y;

    ctx.save();
    ctx.globalAlpha = appear;
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * GLOW.soft;
    }
    
    // Half-width of THIS block in pixels. The panel's on-screen width comes from
    // the projection, so `contentW * 0.5` was never the right bound for its text —
    // it let "Seed funding and core team" run past the panel's own right edge.
    const edge = projectToRect(cam, bobbedPos(i, env.elapsedMs).add(new THREE.Vector3(blockW / 2, 0, 0)), rect);
    const halfW = Math.abs(edge.x - cx);

    ctx.textAlign = isHorizontal ? "center" : "right";
    ctx.font = `800 ${unit * (isHorizontal ? 0.72 : 0.8)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? accent : THEME.textDim;

    if (isHorizontal) {
        ctx.fillText(e.when, cx, cy + unit * 2.2);
    } else {
        ctx.fillText(e.when, cx - halfW * 0.42, cy + unit * 0.28);
    }

    ctx.textAlign = isHorizontal ? "center" : "start";
    ctx.font = `${isCurrent ? 700 : 500} ${unit * (isHorizontal ? 0.72 : 0.88)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;

    // The year needs a narrow gutter, not half the panel. Giving the label the
    // remaining ~66% is what keeps "Seed funding and core team" from losing its
    // last word to the 3-line clamp.
    const labelX = isHorizontal ? cx : cx - halfW * 0.34;
    const maxW = isHorizontal
      ? (contentW / n) * 0.9
      : Math.max(unit * 4, halfW * 1.34 - unit * 0.5);
    const lines = wrapText(ctx, e.label, maxW).slice(0, 3);
    
    const baseY = isHorizontal ? cy - unit * 1.2 : cy + unit * 0.32 - (lines.length - 1) * unit * 0.62;
    lines.forEach((line, li) => {
        ctx.fillText(line, labelX, baseY + li * unit * 1.1 * (isHorizontal ? 0.8 : 1));
    });
    ctx.restore();
  });
}
