import * as THREE from "three";
import type { PaintEnv } from "./index";
import {
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  glowRing,
  rgba,
  roundRect,
  strokePolylineProgress,
  sub,
  easeOutBack,
  activeBeatIndex
} from "./common";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";

type GeometryScene = Extract<Scene, { kind: "geometry" }>;
type GeometryStep = GeometryScene["steps"][number];

export function paintGeometry(ctx: CanvasRenderingContext2D, scene: GeometryScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;

  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 3);

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
  const key = scene.id + "-geom3d";

  const activeStepIdx = Math.min(
    scene.steps.length - 1,
    activeBeatIndex(env.beats, (scene.sayIntro ? 1 : 0) + scene.steps.length, env.p) - (scene.sayIntro ? 1 : 0)
  );
  const activeStep = scene.steps[Math.max(0, activeStepIdx)];

  const SPREAD = 8;
  const mapToWorld = (x: number, y: number) => {
    return new THREE.Vector3((x / 100 - 0.5) * SPREAD, 0, (y / 100 - 0.5) * SPREAD);
  };

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

    const ptMeshes = new Map<string, THREE.Group>();
    scene.points.forEach((pt) => {
      const pos = mapToWorld(pt.x, pt.y);
      const group = new THREE.Group();
      group.position.copy(pos);
      
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 24, 24),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(palette.accent),
          emissive: new THREE.Color(palette.accent),
          emissiveIntensity: 0.2,
          metalness: 0.2,
          roughness: 0.3,
          clearcoat: 0.8
        })
      );
      sphere.position.y = 0.1;
      sphere.castShadow = true;
      group.add(sphere);
      s.add(group);
      ptMeshes.set(pt.id, group);
    });

    const segMeshes: { mesh: THREE.Group, a: string, b: string, style: string }[] = [];
    if (scene.segments) {
      scene.segments.forEach((seg) => {
        const pA = mapToWorld(scene.points.find(p => p.id === seg.a)!.x, scene.points.find(p => p.id === seg.a)!.y);
        const pB = mapToWorld(scene.points.find(p => p.id === seg.b)!.x, scene.points.find(p => p.id === seg.b)!.y);
        const dist = pA.distanceTo(pB);
        const style = seg.style ?? "side";
        
        let color = "#cbd5e1";
        if (style === "aux") color = "#64748b";
        else if (style === "ray") color = palette.accent;
        else if (style === "radius") color = palette.secondary;

        const block = makeBlock(0.1, 0.1, dist, color, color);
        block.position.set((pA.x + pB.x) / 2, 0.05, (pA.z + pB.z) / 2);
        block.lookAt(pB.x, 0.05, pB.z);
        s.add(block);
        segMeshes.push({ mesh: block, a: seg.a, b: seg.b, style });
      });
    }

    const update = (elapsedMs: number, ctxData: { activeStep: GeometryStep, p: number }) => {
      const { activeStep, p } = ctxData;
      
      // Animate points
      let i = 0;
      scene.points.forEach((pt) => {
        const mesh = ptMeshes.get(pt.id)!;
        const popT = easeOutBack(sub(p, i * 0.1, 0.15));
        mesh.scale.setScalar(Math.max(0.001, popT));
        
        const isHighlight = activeStep?.highlight?.includes(pt.id);
        const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
        mat.emissiveIntensity = isHighlight ? 0.6 + 0.3 * Math.sin(elapsedMs / 200) : 0.2;
        i++;
      });

      // Animate segments
      segMeshes.forEach(({ mesh, a, b, style }) => {
        const isHighlight = activeStep?.highlight?.includes(a) || activeStep?.highlight?.includes(b);
        mesh.scale.setScalar(Math.max(0.001, Math.min(1, p * 1.4)));
        
        const blockMesh = mesh.children[0] as THREE.Mesh;
        const mat = blockMesh.material as THREE.MeshPhysicalMaterial;
        if (isHighlight) {
          mat.color.setStyle(palette.accent);
          mat.emissive.setStyle(palette.accent);
          mat.emissiveIntensity = 0.5;
        } else {
          let color = "#cbd5e1";
          if (style === "aux") color = "#64748b";
          else if (style === "ray") color = palette.accent;
          else if (style === "radius") color = palette.secondary;
          mat.color.setStyle(color);
          mat.emissive.setStyle(color);
          mat.emissiveIntensity = 0.1;
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { activeStep, p: env.p });

  if (!cam) {
    ctx.restore();
    return;
  }

  // 2D Overlays mapping
  const ptMap = new Map<string, { x: number; y: number; label?: string }>();
  scene.points.forEach((pt) => {
    const p2d = projectToRect(cam, mapToWorld(pt.x, pt.y), rect);
    ptMap.set(pt.id, { x: p2d.x, y: p2d.y, label: pt.label });
  });

  // Render Area Fills (2D)
  if (scene.fills) {
    scene.fills.forEach((fill, fIdx) => {
      const polygonPts = fill.pts.map((id) => ptMap.get(id)).filter((p): p is { x: number; y: number } => p !== undefined);
      if (polygonPts.length < 3) return;

      const isRevealed = !activeStep || activeStep.reveal?.includes(fill.pts[0]) || activeStepIdx >= fIdx;
      if (!isRevealed) return;

      ctx.beginPath();
      ctx.moveTo(polygonPts[0].x, polygonPts[0].y);
      for (let i = 1; i < polygonPts.length; i++) {
        ctx.lineTo(polygonPts[i].x, polygonPts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = fIdx % 2 === 0 ? rgba(palette.accentSoft, 0.4) : rgba(palette.secondary, 0.2);
      ctx.fill();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const centerX = polygonPts.reduce((sum, p) => sum + p.x, 0) / polygonPts.length;
      const centerY = polygonPts.reduce((sum, p) => sum + p.y, 0) / polygonPts.length;
      if (fill.label || fill.value) {
        ctx.font = `600 ${Math.round(unit * 0.5)}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(fill.label ?? fill.value ?? "", centerX, centerY);
      }
    });
  }

  // Render Segment Labels (2D)
  if (scene.segments) {
    scene.segments.forEach((seg) => {
      const pA = ptMap.get(seg.a);
      const pB = ptMap.get(seg.b);
      if (!pA || !pB || !seg.label) return;
      if (Math.min(1, env.p * 1.4) < 1) return; // Wait until mostly drawn

      const style = seg.style ?? "side";
      let color: string = THEME.text;
      if (style === "aux") color = THEME.textDim;
      else if (style === "ray") color = palette.accent;
      else if (style === "radius") color = palette.secondary;

      const midX = (pA.x + pB.x) / 2;
      const midY = (pA.y + pB.y) / 2;
      ctx.font = `600 ${Math.round(unit * 0.45)}px ${FONT_SANS}`;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(seg.label, midX, midY - 12);
    });
  }

  // Render Angles (2D)
  if (scene.angles) {
    scene.angles.forEach((ang) => {
      const atPt = ptMap.get(ang.at);
      const fromPt = ptMap.get(ang.from);
      const toPt = ptMap.get(ang.to);
      if (!atPt || !fromPt || !toPt) return;

      const a1 = Math.atan2(fromPt.y - atPt.y, fromPt.x - atPt.x);
      const a2 = Math.atan2(toPt.y - atPt.y, toPt.x - atPt.x);
      const radius = unit * 1.2;

      ctx.beginPath();
      if (ang.right) {
        const dx1 = Math.cos(a1) * radius * 0.7;
        const dy1 = Math.sin(a1) * radius * 0.7;
        const dx2 = Math.cos(a2) * radius * 0.7;
        const dy2 = Math.sin(a2) * radius * 0.7;
        ctx.moveTo(atPt.x + dx1, atPt.y + dy1);
        ctx.lineTo(atPt.x + dx1 + dx2, atPt.y + dy1 + dy2);
        ctx.lineTo(atPt.x + dx2, atPt.y + dy2);
      } else {
        ctx.arc(atPt.x, atPt.y, radius, a1, a2);
      }
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (ang.label) {
        const midA = (a1 + a2) / 2;
        const lx = atPt.x + Math.cos(midA) * radius * 1.6;
        const ly = atPt.y + Math.sin(midA) * radius * 1.6;
        ctx.font = `600 ${Math.round(unit * 0.45)}px ${FONT_SANS}`;
        ctx.fillStyle = palette.secondary;
        ctx.textAlign = "center";
        ctx.fillText(ang.label, lx, ly + 6);
      }
    });
  }

  // Render Points overlays (Labels and Glows)
  scene.points.forEach((pt, pIdx) => {
    const canvasPt = ptMap.get(pt.id);
    if (!canvasPt) return;

    const isHighlight = activeStep?.highlight?.includes(pt.id);
    const popT = easeOutBack(sub(env.p, pIdx * 0.1, 0.15));
    if (popT <= 0) return;

    if (isHighlight) {
      glowRing(ctx, canvasPt.x, canvasPt.y, unit * 0.5, palette.accent, env);
    }

    if (canvasPt.label) {
      ctx.font = `800 ${Math.round(unit * 0.6)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(canvasPt.label, canvasPt.x, canvasPt.y - unit * 0.7);
    }
  });

  // Caption Banner
  if (activeStep?.say) {
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
    ctx.fillText(activeStep.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  }

  ctx.restore();
}
