import * as THREE from "three";
import type { PaintEnv } from "./index";
import {
  FONT_MONO,
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  glowRing,
  rgba,
  roundRect,
  sub,
  easeOutBack,
  activeBeatIndex
} from "./common";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";

type NumberlineScene = {
  kind: "numberline";
  id: string;
  sayIntro?: string;
  title: string;
  min: number;
  max: number;
  tickUnit?: string;
  mode?: "line" | "plane";
  marks: {
    value: number;
    y?: number;
    label: string;
    kind?: "point" | "jump" | "range";
    to?: number;
    say?: string;
  }[];
};

export function paintNumberline(ctx: CanvasRenderingContext2D, scene: NumberlineScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;

  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 2);

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt;

  // Header Title
  ctx.font = `700 ${Math.round(unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, contentY);

  const areaX = contentX;
  const areaY = contentY + unit * 1.8;
  const areaW = contentW;
  const areaH = contentH - unit * 2.8;

  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };
  const key = scene.id + "-num3d";

  const isPlane = scene.mode === "plane";
  const SPREAD = 12; // width in world space

  const rangeVal = Math.max(1, scene.max - scene.min);
  const valToWorldX = (v: number) => ((v - scene.min) / rangeVal - 0.5) * SPREAD;
  // If plane, map Y to Z (depth). Say Y goes from 0 to max Y? Or use rangeVal for Y too.
  // For simplicity, map Y the same scale as X, with 0 at center Z.
  const valToWorldZ = (yVal: number) => -(yVal / rangeVal - 0.5) * SPREAD;

  const activeMarkIdx = Math.min(
    scene.marks.length - 1,
    activeBeatIndex(env.beats, (scene.sayIntro ? 1 : 0) + scene.marks.length, env.p) - (scene.sayIntro ? 1 : 0)
  );
  const activeMark = scene.marks[Math.max(0, activeMarkIdx)];

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 10, 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, palette.accent, palette.secondary);

    const grid = new THREE.GridHelper(SPREAD * 1.5, 14, new THREE.Color(palette.accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(SPREAD * 2, SPREAD * 2),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Axis Line
    const axisBlock = makeBlock(SPREAD * 1.1, 0.1, 0.1, "#64748b", "#334155");
    axisBlock.position.set(0, 0, isPlane ? valToWorldZ(0) : 0);
    s.add(axisBlock);

    // Ticks
    const numTicks = 6;
    const tickStep = rangeVal / numTicks;
    for (let i = 0; i <= numTicks; i++) {
      const v = scene.min + i * tickStep;
      const tx = valToWorldX(v);
      const tick = makeBlock(0.05, 0.15, 0.4, "#94a3b8", "#475569");
      tick.position.set(tx, 0, isPlane ? valToWorldZ(0) : 0);
      s.add(tick);
    }

    // Y Axis if plane
    if (isPlane) {
      const yAxis = makeBlock(0.1, 0.1, SPREAD * 1.1, "#64748b", "#334155");
      yAxis.position.set(valToWorldX(0), 0, 0);
      s.add(yAxis);
    }

    const markMeshes: { group: THREE.Group, kind: string, idx: number, m: any }[] = [];
    
    scene.marks.forEach((m, idx) => {
      const mx = valToWorldX(m.value);
      const mz = isPlane && m.y !== undefined ? valToWorldZ(m.y) : 0;
      const kind = m.kind ?? "point";
      
      const group = new THREE.Group();
      group.position.set(mx, 0, mz);
      
      if (kind === "point") {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 24, 24),
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(palette.accent),
            emissive: new THREE.Color(palette.accent),
            emissiveIntensity: 0.2,
            metalness: 0.2, roughness: 0.3, clearcoat: 0.8
          })
        );
        sphere.castShadow = true;
        group.add(sphere);
      } else if (kind === "range" && m.to !== undefined) {
        const tx = valToWorldX(m.to);
        const w = Math.abs(tx - mx);
        const cx = (mx + tx) / 2 - mx; // relative to group
        const block = makeBlock(w, 0.2, 0.4, palette.accent, palette.accent);
        block.position.set(cx, 0.1, 0);
        (block.children[0] as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(palette.accent),
          transparent: true, opacity: 0.3,
          metalness: 0.1, roughness: 0.5
        });
        group.add(block);
      }
      
      s.add(group);
      markMeshes.push({ group, kind, idx, m });
    });

    const update = (elapsedMs: number, ctxData: { p: number, activeIdx: number }) => {
      const { p, activeIdx } = ctxData;
      
      markMeshes.forEach(({ group, kind, idx }) => {
        const isPast = idx <= activeIdx;
        const popT = easeOutBack(sub(p, idx * 0.15, 0.15));
        
        group.visible = isPast;
        
        if (kind === "point") {
          group.scale.setScalar(Math.max(0.001, popT));
          group.position.y = 0.3 + (1 - popT) * 2; // Drop in
          const mat = (group.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
          mat.emissiveIntensity = (idx === activeIdx) ? 0.6 + 0.3 * Math.sin(elapsedMs / 200) : 0.2;
        } else if (kind === "range") {
          group.scale.setScalar(Math.max(0.001, popT));
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { p: env.p, activeIdx: activeMarkIdx });
  if (!cam) { ctx.restore(); return; }

  const get2D = (wx: number, wy: number, wz: number) => projectToRect(cam, new THREE.Vector3(wx, wy, wz), rect);

  // Axis Ticks Labels
  const numTicks = 6;
  const tickStep = rangeVal / numTicks;
  ctx.font = `600 ${Math.round(unit * 0.45)}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  for (let i = 0; i <= numTicks; i++) {
    const v = scene.min + i * tickStep;
    const tx = valToWorldX(v);
    const p2d = get2D(tx, 0, isPlane ? valToWorldZ(0) : 0);
    const displayVal = Math.round(v * 10) / 10;
    ctx.fillText(`${displayVal}${scene.tickUnit ?? ""}`, p2d.x, p2d.y + unit * 1.2);
  }

  // Jumps and Labels
  scene.marks.forEach((m, idx) => {
    const isPast = idx <= activeMarkIdx;
    if (!isPast) return;

    const mx = valToWorldX(m.value);
    const mz = isPlane && m.y !== undefined ? valToWorldZ(m.y) : 0;
    const kind = m.kind ?? "point";
    const popT = easeOutBack(sub(env.p, idx * 0.15, 0.15));
    if (popT <= 0) return;

    const pStart2D = get2D(mx, 0.3, mz);
    
    if (kind === "point") {
      if (idx === activeMarkIdx) {
        glowRing(ctx, pStart2D.x, pStart2D.y, unit * 0.5, palette.accent, env);
      }
      ctx.font = `700 ${Math.round(unit * 0.5)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(m.label, pStart2D.x, pStart2D.y - unit * 1.5);
    } else if (kind === "jump" && m.to !== undefined) {
      const tx = valToWorldX(m.to);
      const pEnd2D = get2D(tx, 0.3, 0); // Assuming jumps return to axis
      
      const midX = (pStart2D.x + pEnd2D.x) / 2;
      const arcH = Math.abs(pEnd2D.x - pStart2D.x) * 0.45;
      const midY = pStart2D.y - arcH;

      ctx.save();
      ctx.globalAlpha = popT;
      ctx.beginPath();
      ctx.moveTo(pStart2D.x, pStart2D.y);
      ctx.quadraticCurveTo(midX, midY, pEnd2D.x, pEnd2D.y);
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.font = `600 ${Math.round(unit * 0.5)}px ${FONT_SANS}`;
      ctx.fillStyle = palette.secondary;
      ctx.textAlign = "center";
      ctx.fillText(m.label, midX, midY - 6);
      ctx.restore();
    } else if (kind === "range" && m.to !== undefined) {
      const tx = valToWorldX(m.to);
      const cx = (mx + tx) / 2;
      const pMid2D = get2D(cx, 0.5, mz);
      
      ctx.font = `600 ${Math.round(unit * 0.45)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(m.label, pMid2D.x, pMid2D.y - unit * 1.0);
    }
  });

  // Caption Banner
  if (activeMark?.say) {
    const bannerH = unit * 1.6;
    const bannerY = areaY + areaH - bannerH - unit * 0.4;
    const bannerW = areaW - unit * 1.2;
    const bannerX = areaX + unit * 0.6;

    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `600 ${Math.round(unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(activeMark.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  }

  ctx.restore();
}
