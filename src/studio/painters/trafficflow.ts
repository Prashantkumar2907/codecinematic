import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
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
import type { PaintEnv } from "./index";
import type { TrafficflowScene } from "../schema";

export function paintTrafficflow(ctx: CanvasRenderingContext2D, scene: TrafficflowScene, env: PaintEnv) {
  const { layout, palette } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, 1);

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

  const numServers = scene.servers.length;
  const activeStepIdx = Math.min(
    scene.steps.length - 1,
    Math.floor(env.p * (scene.sayIntro ? scene.steps.length + 0.5 : scene.steps.length))
  );
  const activeStep = scene.steps[Math.max(0, activeStepIdx)];

  const isVert = vertical;
  const key = scene.id + "-tf3d";

  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  const spreadX = isVert ? 3.0 : 5.0;
  const spreadZ = isVert ? 4.5 : 3.0;

  // Positions in 3D
  // LB is at one end
  const lbPos = new THREE.Vector3(isVert ? 0 : -spreadX * 0.6, 0, isVert ? -spreadZ * 0.6 : 0);
  const serverPos = (i: number) => {
    const frac = numServers === 1 ? 0.5 : (i / (numServers - 1));
    if (isVert) {
      return new THREE.Vector3((frac - 0.5) * spreadX * 2, 0, spreadZ * 0.6);
    } else {
      return new THREE.Vector3(spreadX * 0.6, 0, (frac - 0.5) * spreadZ * 2);
    }
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(isVert ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, isVert ? 12 : 10, isVert ? 10 : 8);
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

    // LB block
    const lbSizeX = isVert ? 3.0 : 1.5;
    const lbSizeZ = isVert ? 1.5 : 3.0;
    const lbBlock = makeBlock(lbSizeX, 1.0, lbSizeZ, "#1e293b", palette.secondary);
    lbBlock.position.copy(lbPos);
    s.add(lbBlock);

    // Server blocks
    const serverSizeX = isVert ? 2.0 : 2.5;
    const serverSizeZ = isVert ? 1.5 : 1.5;
    const srvBlocks: THREE.Group[] = [];

    scene.servers.forEach((srv, i) => {
      const b = makeBlock(serverSizeX, 0.8, serverSizeZ, "#1e293b", "#31435a");
      b.position.copy(serverPos(i));
      s.add(b);
      srvBlocks.push(b);
    });

    const update = (elapsedMs: number, ctxData: any) => {
      const { gIn, actTarget, actIdx } = ctxData;
      
      lbBlock.visible = gIn > 0;
      lbBlock.scale.setScalar(Math.max(0.001, gIn));
      lbBlock.position.y = lbPos.y + Math.sin(elapsedMs / 1200) * 0.05;
      
      lbBlock.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = gIn * 0.9;
              mat.color.setStyle(palette.secondary);
              mat.emissive.setStyle(palette.secondary);
              mat.emissiveIntensity = 0.2;
          }
      });

      srvBlocks.forEach((b, i) => {
        b.visible = gIn > 0;
        b.scale.setScalar(Math.max(0.001, gIn));
        
        const srv = scene.servers[i];
        const isActive = actTarget === srv.id || (actIdx % numServers) === i;
        const isOverloaded = srv.status === "overloaded" || srv.load > 85;
        const statusColor = isOverloaded ? "#ef4444" : srv.status === "drained" ? THEME.textDim : palette.accent;
        
        const bob = Math.sin(elapsedMs / 1200 + i) * 0.05;
        b.position.y = serverPos(i).y + bob + (isActive ? 0.2 : 0);
        
        b.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * 0.9;
                
                if (isActive) {
                    mat.color.setStyle(statusColor);
                    mat.emissive.setStyle(statusColor);
                    mat.emissiveIntensity = 0.5;
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

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: tEnt, actTarget: activeStep?.targetServer, actIdx: activeStepIdx });
  if (!cam) {
      ctx.restore();
      return;
  }

  const get2D = (pos: THREE.Vector3) => projectToRect(cam, pos, rect);

  const lb2D = get2D(lbPos);
  
  // LB Label
  ctx.font = `700 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Load Balancer", lb2D.x, lb2D.y - unit * 0.6);

  ctx.font = `600 ${Math.round(layout.unit * 0.4)}px ${FONT_MONO}`;
  ctx.fillStyle = palette.secondary;
  ctx.fillText(`[${scene.algorithm ?? "round-robin"}]`, lb2D.x, lb2D.y + unit * 0.8);

  // Servers
  scene.servers.forEach((server, sIdx) => {
    const s2D = get2D(serverPos(sIdx));
    const isActive = activeStep?.targetServer === server.id || (activeStepIdx % numServers) === sIdx;
    const isOverloaded = server.status === "overloaded" || server.load > 85;
    const statusColor = isOverloaded ? "#ef4444" : server.status === "drained" ? THEME.textDim : palette.accent;

    if (isActive) {
      glowRing(ctx, s2D.x, s2D.y, unit * 1.5, statusColor, env);
    }

    // Server Label
    ctx.font = `700 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(server.label, s2D.x, s2D.y - unit * 1.0);

    // Load Bar
    const barW = unit * 3.5;
    const barH = layout.unit * 0.35;
    const barX = s2D.x - barW / 2;
    const barY = s2D.y + unit * 0.8;

    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.8);
    ctx.fill();

    const loadW = (Math.min(100, server.load) / 100) * barW;
    roundRect(ctx, barX, barY, loadW, barH, barH / 2);
    ctx.fillStyle = statusColor;
    ctx.fill();

    // Load Percentage
    ctx.font = `600 ${Math.round(layout.unit * 0.4)}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(`${server.load}%`, s2D.x, barY + unit * 0.6);

    // Pipe
    const startPt = { x: lb2D.x, y: lb2D.y };
    const endPt = { x: s2D.x, y: s2D.y };
    
    // Create an L-shaped or direct path
    const pipePts = isVert 
        ? [startPt, { x: endPt.x, y: startPt.y + (endPt.y - startPt.y) * 0.5 }, endPt]
        : [startPt, { x: startPt.x + (endPt.x - startPt.x) * 0.5, y: endPt.y }, endPt];

    ctx.strokeStyle = isActive ? statusColor : THEME.panelBorder;
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    ctx.setLineDash(isActive ? [] : [4, 4]);

    ctx.beginPath();
    ctx.moveTo(pipePts[0].x, pipePts[0].y);
    for (let p = 1; p < pipePts.length; p++) ctx.lineTo(pipePts[p].x, pipePts[p].y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isActive) {
      flowDots(ctx, pipePts, env, { count: 3, speedMs: 1600, r: 3.5, color: statusColor });
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
