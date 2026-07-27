import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  shade,
  idle,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  clamp01,
  roundRect,
  wrapText,
  fitFontSize,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  enterT,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type StoryboardScene = Extract<Scene, { kind: "storyboard" }>;
type Panel = StoryboardScene["panels"][number];

function chooseGrid(n: number, vertical: boolean): { rows: number; cols: number } {
  if (n <= 2) return vertical ? { rows: 2, cols: 1 } : { rows: 1, cols: 2 };
  if (n === 3) return vertical ? { rows: 3, cols: 1 } : { rows: 1, cols: 3 };
  if (n === 4) return { rows: 2, cols: 2 };
  return vertical ? { rows: 3, cols: 2 } : { rows: 2, cols: 3 };
}

/** Axis-aligned camera: a tilted one keystones each slab while the panel art and
 *  caption are axis-aligned pixel rects, so their margins never match the slab. */
const CAM_DIST = 9;
const PANEL_DEPTH = 0.6;
/** Slab inset inside its grid cell, and the art/caption inset inside the slab. */
const CELL_FILL = 0.98;
const INNER_INSET_UNITS = 0.42;
/** Lowest usable baseline as a fraction of frame height (Shorts UI band on 9:16). */
const SAFE_BOTTOM_SHORT = 0.75;
const SAFE_BOTTOM_LONG = 0.94;
const GLASS_INSET = 0.98;
/** Slab face, lifted off THEME.panel so the extrusion catches the studio lights. */
const GHOST_ALPHA = 0.3;
const PANEL_FACE_LIFT = 0.16;

type StoryboardContext = {
  env: PaintEnv;
  active: number;
};

export function paintStoryboard(ctx: CanvasRenderingContext2D, scene: StoryboardScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.panels.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const ghostIn = easeOutCubic(enterT(env, 380));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;
  const areaX = contentX;
  const areaY = contentY + titleBand;
  const areaW = contentW;
  // The panel grid must clear the Shorts UI band: the last row's caption is
  // load-bearing text and was landing at y~1690 on a 1920-tall frame.
  const areaBottom = Math.min(contentY + contentH, (vertical ? SAFE_BOTTOM_SHORT : SAFE_BOTTOM_LONG) * layout.h);
  const areaH = areaBottom - areaY;

  const { rows, cols } = chooseGrid(scene.panels.length, vertical);
  const gap = unit * 0.7;
  const cellW = (areaW - (cols - 1) * gap) / cols;
  const cellH = (areaH - (rows - 1) * gap) / rows;

  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  /** The pixel grid is authoritative; the slabs are mapped onto it. */
  const cellRect = (k: number) => {
    const row = Math.floor(k / cols);
    const col = k % cols;
    return {
      x: areaX + col * (cellW + gap) + (cellW * (1 - CELL_FILL)) / 2,
      y: areaY + row * (cellH + gap) + (cellH * (1 - CELL_FILL)) / 2,
      w: cellW * CELL_FILL,
      h: cellH * CELL_FILL,
    };
  };

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const key = scene.id + "-storyboard3d";

  const build = (): ThreeBundle<StoryboardContext> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, PANEL_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models = scene.panels.map((panel, k) => {
      const cell = cellRect(k);
      const bw = cell.w / m.sx;
      const bh = cell.h / m.sy;
      const g = makeBlock(bw, bh, PANEL_DEPTH, shade(THEME.panel, PANEL_FACE_LIFT), accent);

      const glassGeo = new THREE.BoxGeometry(bw * GLASS_INSET, bh * GLASS_INSET, 0.05);
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.1,
        roughness: 0.1,
        metalness: 0.8,
        clearcoat: 1.0,
      });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.z = PANEL_DEPTH / 2 + 0.025;
      g.add(glass);

      const c = toWorld(cell.x + cell.w / 2, cell.y + cell.h / 2);
      g.position.set(c.x, c.y, 0);
      s.add(g);
      return { id: k, group: g };
    });

    const update = (elapsedMs: number, ctxData: StoryboardContext) => {
      const { env: currentEnv, active: currentActive } = ctxData;
      const currentGhostIn = easeOutCubic(enterT(currentEnv, 380));
      
      models.forEach(({ id, group }) => {
        const t = beatT(currentEnv.beats, offset + id, totalBeats, currentEnv.p);
        const isActive = currentActive === offset + id && !inTail;
        
        let scale = 0.001;
        let visible = false;

        // Scale stays at 1 in every state. The slab is mapped onto an exact pixel cell
        // and the socket outline, art and caption are drawn in that cell, so any scale
        // shows up as a double outline; the entrance and the reveal are opacity only.
        if (currentEnv.p < beatWindow(currentEnv.beats, offset + id, totalBeats).start) {
            visible = currentEnv.p > 0 || currentGhostIn > 0;
            scale = 1;
        } else if (t > 0) {
            visible = true;
            scale = 1;
        }

        // Life comes from the emissive breath, not a position bob: moving the slab
        // slides it out from under the pixel-pinned art and caption.
        const breath = isActive ? 0.12 * idle({ elapsedMs }, 1400) : 0;

        group.visible = visible;
        group.scale.set(Math.max(0.001, scale), Math.max(0.001, scale), 1);
        
        group.traverse(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                if (mat.emissive) {
                    mat.emissiveIntensity = isActive ? 0.3 + breath : 0.1;
                }
                mat.transparent = true;
                if (child.geometry.type !== 'EdgesGeometry') {
                   mat.opacity = t <= 0 ? GHOST_ALPHA * currentGhostIn : (isActive ? 1.0 : 0.8);
                }
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const contextData: StoryboardContext = { env, active };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, contextData, env);
  if (!cam) return;

  const frameIn = easeOutCubic(enterT(env, 380));
  if (frameIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  const drawIcons = (panel: Panel, x: number, y: number, artW: number, artH: number, t: number, drift: number) => {
    const icons = panel.icons;
    const n = icons.length;
    const cxA = x + artW / 2;
    const cyA = y + artH / 2;
    const positions: { x: number; y: number; size: number }[] = [];
    if (n === 1) {
      positions.push({ x: cxA, y: cyA, size: Math.min(artH * 0.6, artW * 0.55) });
    } else if (n === 2) {
      const size = Math.min(artH * 0.5, artW * 0.34);
      positions.push({ x: x + artW * 0.28, y: cyA, size });
      positions.push({ x: x + artW * 0.72, y: cyA, size });
    } else {
      const size = Math.min(artH * 0.42, (artW * 0.9) / n);
      icons.forEach((_, i) => positions.push({ x: x + artW * ((i + 0.5) / n), y: cyA, size }));
    }
    icons.forEach((icon, i) => {
      const pop = easeOutBack(clamp01((t - 0.05 - i * 0.08) / 0.35));
      if (pop <= 0) return;
      const pos = positions[i];
      const kb = 1 + drift * 0.04;
      ctx.save();
      ctx.globalAlpha = clamp01((t - i * 0.08) / 0.2);
      ctx.font = `${pos.size * Math.max(0.01, pop) * kb}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      // Adding shadow for better contrast against 3D blocks
      ctx.shadowColor = rgba(THEME.bgBottom, 0.8);
      ctx.shadowBlur = 4;
      ctx.fillText(icon, pos.x + drift * unit * 0.15, pos.y + pos.size * 0.34);
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
      ctx.restore();
    });
  };

  scene.panels.forEach((panel, k) => {
    const row = Math.floor(k / cols);
    const col = k % cols;
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    const revealed = t > 0;
    const isActive = active === offset + k && !inTail;
    
    // The slab was mapped onto this exact pixel cell, so the card is the cell inset —
    // no projection round-trip, and the margins match on all four sides.
    const cell = cellRect(k);
    // One absolute inset on all four sides — a fractional inset gave a cell twice as
    // wide as it is tall twice the horizontal margin of the vertical one.
    const inset = unit * INNER_INSET_UNITS;
    const innerX = cell.x + inset;
    const innerY = cell.y + inset;
    const innerW = cell.w - inset * 2;
    const innerH = cell.h - inset * 2;

    const captionH = innerH * 0.32;
    const artH = innerH - captionH;
    const rr = unit * 0.2;

    const drift = isActive ? Math.sin(env.elapsedMs / 1400) : 0;

    if (!revealed) {
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = ghostIn * 0.2;
        ctx.strokeStyle = rgba(THEME.textDim, 0.5);
        ctx.lineWidth = unit * 0.06;
        ctx.setLineDash([unit*0.2, unit*0.2]);
        roundRect(ctx, innerX, innerY, innerW, innerH, rr);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const entrance = clamp01(t / 0.2);
    ctx.save();
    ctx.globalAlpha = frameIn * entrance;
    
    // Fade in an overlay for the panel to make text readable
    ctx.fillStyle = isActive ? rgba(shade(THEME.panel, PANEL_FACE_LIFT), 0.6) : rgba(THEME.panel, 0.4);
    roundRect(ctx, innerX, innerY, innerW, innerH, rr);
    ctx.fill();

    // Inner vignette.
    const vg = ctx.createRadialGradient(innerX + innerW / 2, innerY + artH / 2, artH * 0.2, innerX + innerW / 2, innerY + artH / 2, artH * 0.7);
    vg.addColorStop(0, rgba(THEME.bgBottom, 0));
    vg.addColorStop(1, rgba(THEME.bgBottom, 0.5));
    ctx.fillStyle = vg;
    roundRect(ctx, innerX, innerY, innerW, innerH, rr);
    ctx.fill();
    ctx.restore();

    // Icons in the art area.
    ctx.save();
    roundRect(ctx, innerX, innerY, innerW, innerH - captionH, rr);
    ctx.clip();
    drawIcons(panel, innerX + unit * 0.2, innerY + unit * 0.2, innerW - unit * 0.4, artH - unit * 0.4, t, drift);
    ctx.restore();

    // Caption band sliding up from the bottom.
    const capT = easeOutCubic(clamp01((t - 0.25) / 0.4));
    if (capT > 0) {
      const bandY = innerY + innerH - captionH + (1 - capT) * captionH;
      ctx.save();
      roundRect(ctx, innerX, innerY, innerW, innerH, rr);
      ctx.clip();
      ctx.globalAlpha = frameIn * capT;
      ctx.fillStyle = isActive ? rgba(accent, 0.4) : rgba(THEME.panel, 0.8);
      ctx.fillRect(innerX, bandY, innerW, captionH + rr);
      ctx.strokeStyle = isActive ? rgba(accent, 0.8) : rgba(THEME.textDim, 0.4);
      ctx.lineWidth = unit * 0.04;
      ctx.beginPath();
      ctx.moveTo(innerX, bandY);
      ctx.lineTo(innerX + innerW, bandY);
      ctx.stroke();

      const capMaxW = innerW - unit * 0.4;
      const cpx = fitFontSize(ctx, panel.caption, { maxW: capMaxW, startPx: unit * 0.6, minPx: unit * 0.35, weight: 600 });
      ctx.font = `600 ${cpx}px ${FONT_SANS}`;
      const lines = wrapText(ctx, panel.caption, capMaxW).slice(0, 2);
      const lineH = cpx * 1.22;
      ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      const y0 = bandY + captionH / 2 - ((lines.length - 1) * lineH) / 2 + cpx * 0.35;
      lines.forEach((line, i) => ctx.fillText(line, innerX + innerW / 2, y0 + i * lineH));
      ctx.textAlign = "start";
      ctx.restore();
    }
  });
  ctx.textAlign = "start";
}
