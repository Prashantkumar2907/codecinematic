import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, SKYLINE_BUILDINGS, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
  hashStr,
} from "./common";
import type { PaintEnv } from "./index";

type SkylineScene = Extract<Scene, { kind: "skyline" }>;
type BuildingKind = (typeof SKYLINE_BUILDINGS)[number];

type Placed = {
  kind: BuildingKind;
  hUnits: number;
  era: number;
  withinEra: number;
  slotX: number; // left of slot
  slotW: number;
  seed: number;
};

type SkylineContext = {
  env: PaintEnv;
  active: number;
};

export function paintSkyline(ctx: CanvasRenderingContext2D, scene: SkylineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const ms = env.elapsedMs;
  const offset = introBeatCount(scene);
  const nEras = scene.eras.length;
  const totalBeats = offset + nEras;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 360));

  const band = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.3;

  // Era "when" chip band under the title.
  const chipRowY = contentY + band;
  const chipRowH = unit * 1.4;
  const areaTop = chipRowY + chipRowH + unit * 0.4;
  const groundY = contentY + contentH - unit * (vertical ? 1.4 : 1.0);
  const maxH = (groundY - areaTop) * 0.94;

  const placed: Placed[] = [];
  scene.eras.forEach((era, ei) => {
    era.buildings.forEach((b, bi) => {
      placed.push({ kind: b.kind, hUnits: b.h, era: ei, withinEra: bi, slotX: 0, slotW: 0, seed: 0 });
    });
  });
  const N = Math.max(placed.length, 1);
  const slotW = contentW / N;
  placed.forEach((pl, i) => {
    pl.slotX = contentX + i * slotW;
    pl.slotW = slotW;
    pl.seed = hashStr(`${scene.id}:${i}:${pl.kind}`);
  });

  const eraFrac = nEras > 1 ? clamp01((active - offset) / (nEras - 1)) : 0;
  const skyGlow = ctx.createLinearGradient(0, areaTop, 0, groundY);
  skyGlow.addColorStop(0, rgba(secondary, 0.05 + 0.09 * eraFrac));
  skyGlow.addColorStop(1, rgba(accent, 0.02 + 0.05 * eraFrac));
  ctx.save();
  ctx.globalAlpha = easeOutCubic(enterT(env, 520));
  ctx.fillStyle = skyGlow;
  ctx.fillRect(contentX, areaTop, contentW, groundY - areaTop);
  ctx.restore();

  const rect = { x: contentX, y: areaTop, w: contentW, h: groundY - areaTop };

  // 3D coordinates system: X from -rangeX/2 to rangeX/2, Z fixed
  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 5.5 : 3.5;
  
  const worldPos = (pixelX: number) => {
    // Map from 2D pixel X to 3D world X
    const cx = (pixelX - contentX) / contentW - 0.5;
    return new THREE.Vector3(cx * spreadX * 2, 0, 0);
  };

  const key = scene.id + "-skyline3d";

  const build = (): ThreeBundle<SkylineContext> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 9, vertical ? 9 : 7);
    camera.lookAt(0, 3, 0);
    studioLights(s, accent, rgba(secondary, 0.5));
    
    const grid = new THREE.GridHelper(spreadX * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
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

    const models = placed.map(pl => {
      const g = new THREE.Group();
      
      const faceColor = "#1e293b"; // base
      const edgeColor = rgba(accent, 0.8);
      
      const maxH_units = 5.0; // max logical height in 3D
      const blockH = (pl.hUnits / 10) * maxH_units;
      const blockW = (pl.slotW / contentW) * spreadX * 2 * 0.82; // roughly mapped
      const blockD = blockW; // square base

      let mesh: THREE.Group;
      if (pl.kind === "dome" || pl.kind === "mill" || pl.kind === "tower" || pl.kind === "temple") {
        mesh = makeCylinder(blockW/2, blockH, faceColor, edgeColor);
        if (pl.kind === "dome") {
           const dome = makeCylinder(blockW/3, blockH/2, faceColor, edgeColor);
           dome.position.y = blockH/2 + blockH/4;
           mesh.add(dome);
        } else if (pl.kind === "temple") {
           const step1 = makeCylinder(blockW*0.3, blockH/3, faceColor, edgeColor);
           step1.position.y = blockH/2 + blockH/6;
           mesh.add(step1);
        }
      } else {
        mesh = makeBlock(blockW, blockH, blockD, faceColor, edgeColor);
        if (pl.kind === "skyscraper") {
           const antennae = makeCylinder(blockW*0.1, blockH*0.3, faceColor, edgeColor);
           antennae.position.y = blockH/2 + blockH*0.15;
           mesh.add(antennae);
        }
      }
      
      mesh.position.y = blockH/2 - 0.5; // sit on the ground
      g.add(mesh);
      
      const centerPixelX = pl.slotX + pl.slotW/2;
      g.position.copy(worldPos(centerPixelX));
      
      s.add(g);
      return { id: pl.seed, group: g, pl };
    });

    const update = (elapsedMs: number, ctxData: SkylineContext) => {
      const { env: currentEnv, active: currentActive } = ctxData;
      const currentGhostIn = easeOutCubic(enterT(currentEnv, 360));
      
      models.forEach(({ group, pl }) => {
        const beat = offset + pl.era;
        const bt = beatT(currentEnv.beats, beat, totalBeats, currentEnv.p);
        
        let t = 0;
        let scaleY = 0.001;
        let visible = false;

        if (currentEnv.p < beatWindow(currentEnv.beats, beat, totalBeats).start) {
            // Faint ghost
            visible = currentEnv.p > 0 || currentGhostIn > 0;
            scaleY = 0.1 * (currentEnv.p > 0 ? 1 : currentGhostIn);
            t = 0;
        } else if (bt > 0) {
            const stagger = pl.withinEra * 0.08;
            const rise = easeOutBack(clamp01((bt - stagger) / 0.4));
            if (rise > 0) {
                visible = true;
                scaleY = rise;
                t = 1;
            }
        }
        
        const isCurrentEra = currentActive === beat;
        let bob = 0;
        if (isCurrentEra && t === 1) {
            bob = 0.1 * Math.abs(Math.sin(elapsedMs / 700 + pl.seed));
        }

        group.visible = visible;
        group.scale.set(1, Math.max(0.001, scaleY), 1);
        group.position.y = bob;
        
        // Emissive pulse for active era
        group.traverse(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                if (mat.emissive) {
                    mat.emissiveIntensity = isCurrentEra ? 0.3 + bob : 0.1;
                }
                mat.transparent = true;
                mat.opacity = t === 0 ? 0.3 : 1.0;
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const contextData: SkylineContext = { env, active };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, contextData, env);

  const landIn = easeOutCubic(enterT(env, 420));
  ctx.save();
  ctx.globalAlpha = landIn;
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = unit * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(contentX, groundY);
  ctx.lineTo(contentX + contentW, groundY);
  ctx.stroke();
  ctx.restore();

  // Era "when" chip (+ optional stat), crossfading per beat.
  const eraIdx = active >= offset ? active - offset : -1;
  
  scene.eras.forEach((era, ei) => {
    const beat = offset + ei;
    const t = beatT(env.beats, beat, totalBeats, env.p);
    const isCur = ei === eraIdx;
    if (!isCur && !(ei < eraIdx)) {
      if (t <= 0) return;
    }
    if (!isCur) return;
    
    // Calculate center of buildings in this era
    let eraTotalX = 0;
    let eraCount = 0;
    placed.forEach(pl => {
       if (pl.era === ei) {
           eraTotalX += pl.slotX + pl.slotW/2;
           eraCount++;
       }
    });
    const avgX = eraCount > 0 ? eraTotalX / eraCount : contentX + contentW/2;
    
    const pop = easeOutBack(clamp01(t / 0.25));
    ctx.save();
    ctx.globalAlpha = clamp01(t * 4);
    ctx.font = `800 ${unit * 0.72}px ${FONT_MONO}`;
    const whenW = ctx.measureText(era.when).width;
    let totalW = whenW + unit * 1.2;
    let statW = 0;
    if (era.stat) {
      ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
      statW = ctx.measureText(era.stat).width + unit * 1.0;
      totalW += statW + unit * 0.4;
    }
    
    let chipCx = avgX - totalW/2;
    // Keep in bounds
    chipCx = Math.max(contentX, Math.min(contentX + contentW - totalW, chipCx));
    
    ctx.translate(chipCx + totalW / 2, chipRowY + chipRowH / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(chipCx + totalW / 2), -(chipRowY + chipRowH / 2));
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    roundRect(ctx, chipCx, chipRowY, whenW + unit * 1.2, chipRowH, chipRowH / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.72}px ${FONT_MONO}`;
    ctx.fillStyle = "#06121a";
    ctx.textAlign = "center";
    ctx.fillText(era.when, chipCx + (whenW + unit * 1.2) / 2, chipRowY + chipRowH / 2 + unit * 0.26);
    if (era.stat) {
      const sx = chipCx + whenW + unit * 1.2 + unit * 0.4;
      roundRect(ctx, sx, chipRowY, statW, chipRowH, chipRowH / 2);
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = rgba(secondary, 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
      ctx.fillStyle = secondary;
      ctx.fillText(era.stat, sx + statW / 2, chipRowY + chipRowH / 2 + unit * 0.24);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });
  ctx.textAlign = "start";
}
