import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";
import {
  FONT_MONO,
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  flowDots,
  glowRing,
  rgba,
  roundRect,
} from "./common";
import type { Scene } from "../schema";

type EventbusScene = Extract<Scene, { kind: "eventbus" }>;

export function paintEventbus(ctx: CanvasRenderingContext2D, scene: EventbusScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 2);

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt;

  // Header Title
  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);

  const areaX = contentX;
  const areaY = contentY + layout.unit * 1.8;
  const areaW = contentW;
  const areaH = contentH - layout.unit * 2.8;

  // Outer Container
  roundRect(ctx, areaX, areaY, areaW, areaH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const isVert = vertical;
  const activeStepIdx = Math.min(
    scene.steps.length - 1,
    Math.floor(env.p * (scene.sayIntro ? scene.steps.length + 0.5 : scene.steps.length))
  );
  const activeStep = scene.steps[Math.max(0, activeStepIdx)];

  const key = scene.id + "-eb3d";
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  const spreadX = isVert ? 2.5 : 4.5;
  const spreadZ = isVert ? 3.5 : 2.5;

  const getProdPos = (i: number) => {
    const num = scene.producers.length;
    const frac = num === 1 ? 0.5 : (i / (num - 1));
    return new THREE.Vector3(-spreadX, 0, (frac - 0.5) * spreadZ * 1.8);
  };
  
  const getConsPos = (i: number) => {
    const num = scene.consumers.length;
    const frac = num === 1 ? 0.5 : (i / (num - 1));
    return new THREE.Vector3(spreadX, 0, (frac - 0.5) * spreadZ * 1.8);
  };

  const busPos = new THREE.Vector3(0, 0, 0);

  const getTopicPos = (i: number) => {
    const num = scene.topics.length;
    const frac = num === 1 ? 0.5 : (i / (num - 1));
    return new THREE.Vector3(0, 0.25, (frac - 0.5) * spreadZ * 1.8);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(isVert ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, isVert ? 14 : 10, isVert ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, palette.accent, palette.secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(palette.accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadZ * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // producers
    const prodBlocks: THREE.Group[] = [];
    scene.producers.forEach((p, i) => {
      const b = makeBlock(1.4, 0.6, 1.4, "#1e293b", "#31435a");
      b.position.copy(getProdPos(i));
      s.add(b);
      prodBlocks.push(b);
    });

    // consumers
    const consBlocks: THREE.Group[] = [];
    scene.consumers.forEach((c, i) => {
      const b = makeBlock(1.4, 0.6, 1.4, "#1e293b", "#31435a");
      b.position.copy(getConsPos(i));
      s.add(b);
      consBlocks.push(b);
    });

    // bus
    const busBlock = makeBlock(2.2, 0.5, spreadZ * 2.2, "#1e293b", palette.secondary);
    busBlock.position.copy(busPos);
    s.add(busBlock);

    // topics
    const topicBlocks: THREE.Group[] = [];
    scene.topics.forEach((t, i) => {
      const b = makeBlock(1.8, 0.3, 1.0, "#1e293b", palette.accent);
      b.position.copy(getTopicPos(i));
      s.add(b);
      topicBlocks.push(b);
    });

    const update = (elapsedMs: number, ctxData: any) => {
      const { gIn, actPubId, actSubId, actTopicId } = ctxData;

      const applyMat = (b: THREE.Group, isActive: boolean, color: string, basePos: THREE.Vector3, bobOffset: number) => {
        b.visible = gIn > 0;
        b.scale.setScalar(Math.max(0.001, gIn));
        b.position.y = basePos.y + Math.sin(elapsedMs / 1200 + bobOffset) * 0.05 + (isActive ? 0.2 : 0);
        
        b.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * 0.9;
                
                if (isActive) {
                    mat.color.setStyle(color);
                    mat.emissive.setStyle(color);
                    mat.emissiveIntensity = 0.5;
                } else {
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
                    mat.emissiveIntensity = 0.1;
                }
            }
        });
      };

      prodBlocks.forEach((b, i) => {
        const isActive = actPubId === scene.producers[i].id;
        applyMat(b, isActive, palette.accent, getProdPos(i), i);
      });

      consBlocks.forEach((b, i) => {
        const isActive = actSubId === scene.consumers[i].id;
        applyMat(b, isActive, palette.secondary, getConsPos(i), i + 10);
      });

      topicBlocks.forEach((b, i) => {
        const isActive = actTopicId === scene.topics[i].id;
        applyMat(b, isActive, palette.accentSoft, getTopicPos(i), i + 20);
      });

      // Bus stays mostly static but bobs
      busBlock.visible = gIn > 0;
      busBlock.scale.setScalar(Math.max(0.001, gIn));
      busBlock.position.y = busPos.y + Math.sin(elapsedMs / 1200) * 0.02;
      busBlock.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = gIn * 0.9;
            mat.color.setStyle(palette.secondary);
            mat.emissive.setStyle(palette.secondary);
            mat.emissiveIntensity = 0.15;
        }
      });
    };

    return { scene: s, camera, update };
  };

  const activePubId = activeStep?.publish?.producerId;
  const activeSubId = activeStep?.consume?.consumerId;
  const activeTopicId = activeStep?.publish?.topicId || activeStep?.consume?.topicId;

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { 
    gIn: tEnt, 
    actPubId: activePubId, 
    actSubId: activeSubId, 
    actTopicId: activeTopicId 
  });

  if (!cam) {
      ctx.restore();
      return;
  }

  const get2D = (pos: THREE.Vector3, bobOffset: number = 0) => {
      const p = pos.clone();
      p.y += Math.sin(env.elapsedMs / 1200 + bobOffset) * 0.05;
      return projectToRect(cam, p, rect);
  };

  const get2DWithActive = (pos: THREE.Vector3, isActive: boolean, bobOffset: number = 0) => {
      const p = pos.clone();
      p.y += Math.sin(env.elapsedMs / 1200 + bobOffset) * 0.05 + (isActive ? 0.2 : 0);
      return projectToRect(cam, p, rect);
  };

  const bus2D = get2D(busPos, 0);

  // Bus Label
  ctx.font = `700 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
  ctx.fillStyle = palette.secondary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(scene.busName ?? "Message Bus", bus2D.x, bus2D.y - unit * 1.5);

  // Topics
  scene.topics.forEach((topic, i) => {
      const isActive = activeTopicId === topic.id;
      const t2D = get2DWithActive(getTopicPos(i), isActive, i + 20);
      
      ctx.font = `600 ${Math.round(layout.unit * 0.45)}px ${FONT_MONO}`;
      // The active topic's block is lit accent, so its label goes dark.
      ctx.fillStyle = isActive ? THEME.bgMid : THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(topic.name, t2D.x, t2D.y);
  });

  // Producers
  scene.producers.forEach((prod, i) => {
      const isActive = activePubId === prod.id;
      const p2D = get2DWithActive(getProdPos(i), isActive, i);
      
      if (isActive) {
          glowRing(ctx, p2D.x, p2D.y, unit * 1.5, palette.accent, env);
      }

      ctx.font = `700 ${Math.round(layout.unit * 0.45)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(prod.label, p2D.x, p2D.y - unit * 1.2);

      // Lines & Flow
      if (isActive && activeStep?.publish) {
          const tIdx = scene.topics.findIndex(t => t.id === activeStep.publish!.topicId);
          if (tIdx >= 0) {
              const t2D = get2DWithActive(getTopicPos(tIdx), true, tIdx + 20);
              
              ctx.strokeStyle = palette.accent;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(p2D.x, p2D.y);
              ctx.lineTo(t2D.x, t2D.y);
              ctx.stroke();

              flowDots(ctx, [p2D, t2D], env, { count: 3, speedMs: 1200, r: 3.5, color: palette.accent });
              
              // Draw event bubble
              const mid = { x: (p2D.x + t2D.x) / 2, y: (p2D.y + t2D.y) / 2 - unit * 0.5 };
              ctx.font = `500 ${Math.round(layout.unit * 0.35)}px ${FONT_MONO}`;
              const tw = ctx.measureText(activeStep.publish.event).width;
              roundRect(ctx, mid.x - tw / 2 - unit * 0.3, mid.y - unit * 0.4, tw + unit * 0.6, unit * 0.8, unit * 0.2);
              ctx.fillStyle = palette.accentSoft;
              ctx.fill();
              // accentSoft is a 14% wash over a dark scene, so the label stays light.
              ctx.fillStyle = palette.accent;
              ctx.fillText(activeStep.publish.event, mid.x, mid.y);
          }
      }
  });

  // Consumers
  scene.consumers.forEach((cons, i) => {
      const isActive = activeSubId === cons.id;
      const c2D = get2DWithActive(getConsPos(i), isActive, i + 10);
      
      if (isActive) {
          glowRing(ctx, c2D.x, c2D.y, unit * 1.5, palette.secondary, env);
      }

      ctx.font = `700 ${Math.round(layout.unit * 0.45)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cons.label, c2D.x, c2D.y - unit * 1.2);

      // Lines & Flow
      if (isActive && activeStep?.consume) {
          const tIdx = scene.topics.findIndex(t => t.id === activeStep.consume!.topicId);
          if (tIdx >= 0) {
              const t2D = get2DWithActive(getTopicPos(tIdx), true, tIdx + 20);
              
              ctx.strokeStyle = palette.secondary;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(t2D.x, t2D.y);
              ctx.lineTo(c2D.x, c2D.y);
              ctx.stroke();

              flowDots(ctx, [t2D, c2D], env, { count: 3, speedMs: 1200, r: 3.5, color: palette.secondary });
          }
      }
  });

  // Step Caption Banner
  if (activeStep?.say) {
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
    ctx.fillText(activeStep.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  }

  ctx.restore();
}
