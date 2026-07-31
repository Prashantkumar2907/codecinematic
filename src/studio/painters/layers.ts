import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";
import {
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  rgba,
  roundRect,
  sub,
  easeOutBack,
  activeBeatIndex
} from "./common";

export type LayersScene = {
  kind: "layers";
  id: string;
  sayIntro?: string;
  title: string;
  shape?: "stack" | "rings" | "dome";
  layers: {
    label: string;
    detail?: string;
    icon?: string;
    say: string;
  }[];
};

export function paintLayers(ctx: CanvasRenderingContext2D, scene: LayersScene, env: PaintEnv) {
  const { layout, palette } = env;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 5);

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt;

  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);

  const areaX = layout.contentX;
  const areaY = layout.contentY + layout.unit * 1.8;
  const areaW = layout.contentW;
  const areaH = layout.contentH - layout.unit * 2.8;
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const numLayers = scene.layers.length;
  const activeIdx = Math.min(
    numLayers - 1,
    activeBeatIndex(env.beats, (scene.sayIntro ? 1 : 0) + numLayers, env.p) - (scene.sayIntro ? 1 : 0)
  );
  const activeLayer = scene.layers[Math.max(0, activeIdx)];
  const shapeMode = scene.shape ?? "stack";
  
  const key = scene.id + "-layers3d";

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(6, 6, 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, palette.accent, "rgba(148,163,184,0.5)");
    
    const grid = new THREE.GridHelper(12, 12, new THREE.Color(palette.accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models = scene.layers.map((layer, idx) => {
      const blendHex = idx % 2 === 0 ? palette.accent : palette.secondary;
      let mesh: THREE.Group;
      if (shapeMode === "stack") {
          mesh = makeBlock(4, 0.6, 4, blendHex, blendHex);
      } else {
          const maxR = 2.5;
          const r = shapeMode === "dome" ? maxR * Math.sqrt((numLayers - idx) / numLayers) : maxR * ((idx + 1) / numLayers);
          mesh = makeCylinder(r, 0.6, blendHex, blendHex);
      }
      s.add(mesh);
      return { layer, idx, mesh };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ layer, idx, mesh }) => {
        const isActive = idx === activeIdx;
        const bandT = easeOutBack(sub(env.p, idx * 0.1, 0.15));
        
        mesh.scale.setScalar(Math.max(0.001, bandT));
        if (bandT <= 0) { mesh.visible = false; return; }
        mesh.visible = true;

        const popOffset = isActive ? 0.3 : 0;
        const bob = Math.sin(elapsedMs / 1000 + idx) * 0.05;
        
        if (shapeMode === "stack") {
            // Stack from top (idx 0) down to bottom
            const yPos = (numLayers / 2 - idx) * 0.8;
            mesh.position.set(0, yPos + popOffset + bob, 0);
        } else if (shapeMode === "dome") {
            // Dome builds up
            const yPos = (numLayers - 1 - idx) * 0.8;
            mesh.position.set(0, yPos + popOffset + bob, 0);
        } else {
            // Rings are flat concentric or slightly stepped
            const yPos = -idx * 0.2; // step down to avoid Z fighting
            mesh.position.set(0, yPos + popOffset + bob, 0);
        }
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.Material;
                mat.transparent = true;
                mat.opacity = isActive ? 0.9 : 0.4;
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) { ctx.restore(); return; }

  // Draw labels using 2D projection
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.clip();

  scene.layers.forEach((layer, idx) => {
    const isActive = idx === activeIdx;
    const bandT = easeOutBack(sub(env.p, idx * 0.1, 0.15));
    if (bandT <= 0) return;

    let yPos = 0;
    if (shapeMode === "stack") yPos = (numLayers / 2 - idx) * 0.8;
    else if (shapeMode === "dome") yPos = (numLayers - 1 - idx) * 0.8;
    else yPos = -idx * 0.2;
    
    const popOffset = isActive ? 0.3 : 0;
    const bob = Math.sin(env.elapsedMs / 1000 + idx) * 0.05;
    yPos += popOffset + bob;

    const wp = new THREE.Vector3(0, yPos + 0.35, 0); // slightly above top face
    const sp = projectToRect(cam, wp, rect);

    // Label
    ctx.font = `700 ${Math.round(layout.unit * (isActive ? 0.65 : 0.55))}px ${FONT_SANS}`;
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // For stack mode, place label on the left side, detail on the right side of the block projection
    if (shapeMode === "stack") {
        const wpLeft = new THREE.Vector3(-1.8, yPos + 0.35, 1.8);
        const wpRight = new THREE.Vector3(1.8, yPos + 0.35, -1.8);
        const spLeft = projectToRect(cam, wpLeft, rect);
        const spRight = projectToRect(cam, wpRight, rect);
        
        ctx.textAlign = "left";
        ctx.fillText(layer.label, spLeft.x, spLeft.y);
        
        if (layer.detail && areaW > 300) {
            ctx.font = `500 ${Math.round(layout.unit * 0.45)}px ${FONT_SANS}`;
            ctx.fillStyle = THEME.textDim;
            ctx.textAlign = "right";
            ctx.fillText(layer.detail, spRight.x, spRight.y);
        }
    } else {
        ctx.fillText(layer.label, sp.x, sp.y);
    }
  });
  ctx.restore();

  if (activeLayer?.say) {
    const bannerH = layout.unit * 1.6;
    const bannerY = areaY + areaH - bannerH - layout.unit * 0.4;
    const bannerW = areaW - layout.unit * 1.2;
    const bannerX = areaX + layout.unit * 0.6;

    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(activeLayer.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  }

  ctx.restore();
}
