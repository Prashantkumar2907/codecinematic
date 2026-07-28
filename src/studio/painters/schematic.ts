import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  strokePolylineProgress,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type SchematicScene = Extract<Scene, { kind: "schematic" }>;
type Part = SchematicScene["parts"][number];
type ShapeName = Part["shape"];
type Rect = { x: number; y: number; w: number; h: number };

const GRID = 12;
const DIM_ALPHA = 0.4;

type GridMap = { ox: number; oy: number; cw: number; ch: number };

/** Center the used grid extent below the title (parts may overlap on purpose). */
function gridMap(parts: Part[], layout: Layout, titleBand: number): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  const areaH = layout.contentH - titleBand;
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const minX = Math.min(...parts.map((p) => p.x));
  const maxX = Math.max(...parts.map((p) => p.x + p.w));
  const minY = Math.min(...parts.map((p) => p.y));
  const maxY = Math.max(...parts.map((p) => p.y + p.h));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const f = Math.min(GRID / usedW, GRID / usedH, 1.3);
  const cw = cellW * f;
  const ch = cellH * f;
  return {
    cw,
    ch,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function partRect(part: Part, map: GridMap): Rect {
  return { x: map.ox + part.x * map.cw, y: map.oy + part.y * map.ch, w: part.w * map.cw, h: part.h * map.ch };
}

/** Beat index (relative to steps) at which each part first reveals; default step 0. */
function revealSteps(scene: SchematicScene): Map<string, number> {
  const steps = new Map<string, number>();
  scene.steps.forEach((step, k) => {
    for (const id of step.reveal) if (!steps.has(id)) steps.set(id, k);
  });
  for (const part of scene.parts) if (!steps.has(part.id)) steps.set(part.id, 0);
  return steps;
}

/** Factory for 3D schematic parts */
function createShape3D(shape: ShapeName, w: number, h: number, d: number, color: string): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.1,
        metalness: 0.2,
        roughness: 0.15,
        clearcoat: 0.8,
    });
    
    // Default fallback is a block
    let mesh: THREE.Mesh;
    
    switch (shape) {
        case "pillar":
        case "tower":
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(w/2, w/2, h, 32), mat);
            break;
        case "cone":
        case "spire":
        case "finial":
            mesh = new THREE.Mesh(new THREE.ConeGeometry(w/2, h, 32), mat);
            break;
        case "orb":
            mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, h)/2, 32, 32), mat);
            break;
        case "dome":
        case "mound":
        case "onion-dome":
        case "umbrella":
            mesh = new THREE.Mesh(new THREE.SphereGeometry(w/2, 32, 16, 0, Math.PI*2, 0, Math.PI/2), mat);
            break;
        case "ring":
            mesh = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w,h)/2, Math.min(w,h)*0.1, 16, 32), mat);
            break;
        case "arch": {
            // An arch made of a half-torus + two pillars
            const archGrp = new THREE.Group();
            
            const arcMat = mat.clone();
            const arcMesh = new THREE.Mesh(new THREE.TorusGeometry(w/2 - d/4, d/2, 16, 32, Math.PI), arcMat);
            arcMesh.castShadow = true;
            arcMesh.receiveShadow = true;
            arcMesh.position.y = h/2 - d/2; // top part
            archGrp.add(arcMesh);
            
            const pHeight = h - d/2;
            const pGeo = new THREE.CylinderGeometry(d/2, d/2, pHeight, 16);
            const pLeft = new THREE.Mesh(pGeo, arcMat);
            pLeft.position.set(-w/2 + d/4, -d/4, 0);
            pLeft.castShadow = true; pLeft.receiveShadow = true;
            archGrp.add(pLeft);
            
            const pRight = new THREE.Mesh(pGeo, arcMat);
            pRight.position.set(w/2 - d/4, -d/4, 0);
            pRight.castShadow = true; pRight.receiveShadow = true;
            archGrp.add(pRight);
            
            return archGrp;
        }
        case "stairs": {
            const steps = 4;
            const sg = new THREE.Group();
            for(let i=0; i<steps; i++) {
                const sw = w/steps;
                const sh = h/steps * (i+1);
                const sm = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, d), mat);
                sm.position.set(-w/2 + sw/2 + i*sw, -h/2 + sh/2, 0);
                sm.castShadow = true; sm.receiveShadow = true;
                sg.add(sm);
            }
            return sg;
        }
        case "flag": {
            const fg = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(d*0.1, d*0.1, h), mat);
            pole.castShadow = true; pole.receiveShadow = true;
            fg.add(pole);
            const flag = new THREE.Mesh(new THREE.BoxGeometry(w, h*0.4, d*0.05), mat);
            flag.position.set(w/2, h*0.3, 0);
            flag.castShadow = true; flag.receiveShadow = true;
            fg.add(flag);
            return fg;
        }
        case "gateway": {
            const gg = new THREE.Group();
            const pw = w * 0.15;
            const pillarGeo = new THREE.BoxGeometry(pw, h, d);
            const pL = new THREE.Mesh(pillarGeo, mat);
            pL.position.set(-w/2 + pw/2, 0, 0);
            pL.castShadow = true; pL.receiveShadow = true;
            gg.add(pL);
            const pR = new THREE.Mesh(pillarGeo, mat);
            pR.position.set(w/2 - pw/2, 0, 0);
            pR.castShadow = true; pR.receiveShadow = true;
            gg.add(pR);
            const topGeo = new THREE.BoxGeometry(w, h*0.2, d);
            const top = new THREE.Mesh(topGeo, mat);
            top.position.set(0, h/2 - h*0.1, 0);
            top.castShadow = true; top.receiveShadow = true;
            gg.add(top);
            return gg;
        }
        case "wave": {
            // Just a block for simplicity in abstract mode
            mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            break;
        }
        case "platform":
        case "wall":
        case "block":
        default:
            mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            break;
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
}

export function paintSchematic(ctx: CanvasRenderingContext2D, scene: SchematicScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const key = scene.id + "-schm3d";

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;
  const areaX = contentX;
  const areaY = contentY + titleBand;
  const areaW = contentW;
  const areaH = contentH - titleBand;
  const reveals = revealSteps(scene);

  const gridIn = easeOutCubic(enterT(env, 360));

  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };
  
  // Base 3D coordinate system: map grid to world coordinates
  const spreadX = vertical ? 8 : 12;
  const spreadY = vertical ? 8 : 12;
  
  // Determine bounds to center the 3D structure
  const minX = Math.min(...scene.parts.map((p) => p.x));
  const maxX = Math.max(...scene.parts.map((p) => p.x + p.w));
  const maxY = Math.max(...scene.parts.map((p) => p.y + p.h)); // Bottom-most
  const minY = Math.min(...scene.parts.map((p) => p.y));      // Top-most
  
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  
  const scale3D = Math.min(spreadX / Math.max(spanX, 1), spreadY / Math.max(spanY, 1));
  
  const worldPos = (gx: number, gy: number, gw: number, gh: number) => {
      // gx, gy are top-left in grid coordinates
      // we want center of the part in 3D
      const cx = gx + gw/2;
      // y in grid goes down. Y in 3D goes up. Base of the part should be placed.
      // Actually, createShape3D is centered at 0,0,0. So we need center Y.
      const cy = gy + gh/2;
      
      const wx = (cx - (minX + spanX/2)) * scale3D;
      // y=maxY is floor. So floor is y=0.
      const wy = (maxY - cy) * scale3D;
      return new THREE.Vector3(wx, wy, 0);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(vertical ? 4 : 5, vertical ? 6 : 8, vertical ? 12 : 14);
    camera.lookAt(0, (spanY * scale3D) / 2, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(spreadX * 2, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.05;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadX * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.05;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { partId: string, group: THREE.Group, yOffset: number }[] = [];
    
    scene.parts.forEach(part => {
        const w = part.w * scale3D;
        const h = part.h * scale3D;
        const d = Math.max(w * 0.4, 0.5); // depth proportional to width
        
        const g = createShape3D(part.shape, w, h, d, "#1e293b");
        const wp = worldPos(part.x, part.y, part.w, part.h);
        g.position.copy(wp);
        
        // Custom vertical adjust for shapes that build from the floor up, like domes
        if (part.shape === "dome" || part.shape === "mound" || part.shape === "onion-dome") {
             g.position.y -= h/2; 
        }
        
        s.add(g);
        models.push({ partId: part.id, group: g, yOffset: g.position.y });
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, p: number, activeIdx: number, inTail: boolean, highlights: Set<string> }) => {
      const { gIn, p, activeIdx, inTail, highlights } = ctxData;
      
      models.forEach(m => {
          const stepK = reveals.get(m.partId) ?? 0;
          const t = beatT(env.beats, offset + stepK, totalBeats, p);
          
          if (t <= 0) {
              m.group.visible = false;
          } else {
              m.group.visible = true;
              const prog = easeInOutCubic(clamp01(t / 0.45));
              
              const isHighlighted = highlights.has(m.partId);
              const isDimmed = !isHighlighted && highlights.size > 0;
              
              // pop in from below
              m.group.position.y = m.yOffset - (1 - prog) * 2.0;
              
              // scale effect
              m.group.scale.setScalar(prog * gIn);

              const bob = isHighlighted && !inTail ? Math.sin(elapsedMs / 400) * 0.1 : 0;
              m.group.position.y += bob;
              
              m.group.traverse(child => {
                  if (child instanceof THREE.Mesh) {
                      const mat = child.material as THREE.MeshPhysicalMaterial;
                      mat.transparent = true;
                      mat.opacity = gIn * (isHighlighted ? 1 : isDimmed ? DIM_ALPHA : 0.9);
                      if (isHighlighted) {
                          mat.color.setStyle(accent);
                          mat.emissive.setStyle(accent);
                          mat.emissiveIntensity = 0.5 + 0.3 * Math.sin(elapsedMs / 300);
                      } else {
                          mat.color.setStyle("#1e293b");
                          mat.emissive.setStyle("#1e293b");
                          mat.emissiveIntensity = 0.1;
                      }
                  }
              });
          }
      });
    };

    return { scene: s, camera, update };
  };

  const highlights = activeStep >= 0 && !inTail ? new Set(scene.steps[Math.min(activeStep, scene.steps.length - 1)]?.highlight ?? []) : new Set<string>();

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: gridIn, p: env.p, activeIdx: active, inTail, highlights }, env);
  
  if (!cam) {
     // Fallback to 2D
     return;
  }

  // Label chips for the active step's highlighted parts
  if (activeStep >= 0 && activeStep < scene.steps.length && !inTail) {
    const tA = beatT(env.beats, offset + activeStep, totalBeats, env.p);
    const labelled = scene.steps[activeStep].highlight
      .map((id) => scene.parts.find((pt) => pt.id === id))
      .filter((pt): pt is Part => !!pt && !!pt.label);
      
    labelled.forEach((part, i) => {
      // Calculate 3D center position to project to 2D
      const wp = worldPos(part.x, part.y, part.w, part.h);
      
      const p2d = projectToRect(cam, wp, rect);
      
      const cxP = p2d.x;
      const cyP = p2d.y;
      
      ctx.save();
      ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
      const tw = ctx.measureText(part.label!).width;
      const chipW = tw + unit * 0.9;
      const chipH = unit * 1.1;
      const side = i % 2;
      let chipX: number;
      let chipY: number;
      let fromPt: { x: number; y: number };
      let toPt: { x: number; y: number };
      
      if (vertical) {
        chipX = Math.min(Math.max(cxP - chipW / 2, contentX), contentX + contentW - chipW);
        chipY = side === 0 ? Math.max(cyP - unit * 2.9, areaY) : Math.min(cyP + unit * 1.8, areaY + areaH - chipH);
        fromPt = { x: cxP, y: side === 0 ? cyP - unit * 1.0 : cyP + unit * 1.0 };
        toPt = { x: chipX + chipW / 2, y: side === 0 ? chipY + chipH : chipY };
      } else {
        chipX = side === 0 ? contentX + unit : contentX + contentW - chipW - unit;
        chipY = Math.min(Math.max(cyP - chipH / 2, areaY), areaY + areaH - chipH);
        fromPt = { x: side === 0 ? cxP - unit * 1.5 : cxP + unit * 1.5, y: cyP };
        toPt = { x: side === 0 ? chipX + chipW : chipX, y: chipY + chipH / 2 };
      }
      
      const leadIn = easeOutCubic(sub(tA, 0.05 + i * 0.05, 0.25));
      if (leadIn > 0) {
        ctx.strokeStyle = rgba(accent, 0.8);
        ctx.lineWidth = unit * 0.06;
        ctx.setLineDash([unit * 0.3, unit * 0.2]);
        strokePolylineProgress(ctx, [fromPt, toPt], leadIn);
        ctx.setLineDash([]);
      }
      
      const chipIn = easeOutCubic(sub(tA, 0.18 + i * 0.05, 0.18));
      if (chipIn > 0) {
        ctx.globalAlpha = chipIn;
        roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
        ctx.fillStyle = "#0a0e13";
        ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(part.label!, chipX + chipW / 2, chipY + chipH * 0.68);
        ctx.textAlign = "start";
      }
      ctx.restore();
    });
  }
  ctx.textAlign = "start";
}
