import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, FONT_MONO, easeOutCubic, easeOutBack, enterT, idle, wrapText, roundRect, drawSceneTitle, beatT, beatWindow, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type TableScene = Extract<Scene, { kind: "table" }>;

const CAPTION_SAFE_Y = 0.86;
const GOOD = THEME.good;
const DANGER = "#f87171";

function diffTone(cell: string): "good" | "danger" | null {
  if (cell.startsWith("+")) return "good";
  if (cell.startsWith("-")) return "danger";
  return null;
}

export function paintTable(ctx: CanvasRenderingContext2D, scene: TableScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, accentSoft, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nRows = scene.rows.length;
  const totalBeats = offset + nRows;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-tbl3d";

  const titleIn = Math.max(env.p, enterT(env, 400) * 0.12);
  const band = drawSceneTitle(ctx, scene.title, layout, titleIn, accent) + unit * 0.4;
  const nCols = scene.columns.length;
  const allDone = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const hasHighlight = scene.rows.some((r) => r.highlight);
  const breathe = idle(env, 2400);

  const availTop = contentY + band;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const availH = safeBottom - availTop - (scene.caption ? unit * 1.6 : 0);
  const rect = { x: contentX, y: availTop, w: contentW, h: availH };

  const spreadX = vertical ? 3.5 : 5.0;
  const spreadY = vertical ? 4.5 : 3.0;

  const totalGridRows = nRows + 1; // including header
  
  const worldPos = (col: number, row: number) => {
    const x = nCols === 1 ? 0 : (col / (nCols - 1) - 0.5) * spreadX * 2;
    const y = totalGridRows === 1 ? 0 : (0.5 - row / (totalGridRows - 1)) * spreadY * 2;
    return new THREE.Vector3(x, y, 0);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.8;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadY * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.8;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Group, r: number, c: number, isHeader: boolean }[] = [];
    const blockW = (spreadX * 2.0) / nCols;
    const blockH = Math.min((spreadY * 1.5) / totalGridRows, 1.2);

    // Headers
    for (let c = 0; c < nCols; c++) {
        const g = makeBlock(blockW, blockH, 0.2, secondary, accent);
        g.position.copy(worldPos(c, 0));
        s.add(g);
        models.push({ mesh: g, r: 0, c, isHeader: true });
    }

    // Rows
    for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
            const g = makeBlock(blockW, blockH, 0.15, "#1e293b", "#31435a");
            g.position.copy(worldPos(c, r + 1));
            s.add(g);
            models.push({ mesh: g, r: r + 1, c, isHeader: false });
        }
    }

    const update = (elapsedMs: number) => {
      const frameIn = easeOutCubic(enterT(env, 380));
      
      models.forEach(({ mesh, r, c, isHeader }) => {
        let appear = 0;
        let isCurrent = false;
        let isHighlighted = false;
        
        if (isHeader) {
            appear = frameIn;
        } else {
            const rowIdx = r - 1;
            const beatIdx = offset + rowIdx;
            const t = beatT(env.beats, beatIdx, totalBeats, env.p);
            appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
            isCurrent = active === beatIdx;
            isHighlighted = scene.rows[rowIdx].highlight;
        }

        const pop = Math.max(0.001, appear);
        mesh.scale.setScalar(pop);
        mesh.visible = appear > 0.01;
        
        const base = worldPos(c, r);
        const bob = Math.sin(elapsedMs / 1200 + r * 0.5 + c * 0.2) * 0.08;
        
        mesh.position.y = base.y + bob;
        // Current row pops forward
        mesh.position.z = isCurrent ? 0.4 : isHighlighted ? 0.2 : 0;
        if (isHeader) mesh.position.z = 0.2;

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = appear * 0.9;
                
                if (!isHeader) {
                    const rowIdx = r - 1;
                    const tone = diffTone(scene.rows[rowIdx].cells[c] || "");
                    if (tone === "good") {
                        mat.color.setStyle(GOOD);
                        mat.emissive.setStyle(GOOD);
                    } else if (tone === "danger") {
                        mat.color.setStyle(DANGER);
                        mat.emissive.setStyle(DANGER);
                    } else if (isCurrent) {
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
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const get2D = (c: number, r: number) => projectToRect(cam, worldPos(c, r), rect);

  const cellFont = (px: number) => `${px}px ${FONT_MONO}`;
  const cellPad = unit * 0.5;
  const baseCellPx = unit * (vertical ? 0.85 : 0.78);
  const blockW2D = contentW / nCols * 0.9; 

  const fitCell = (text: string, maxW: number, startPx: number) => {
    let px = startPx;
    ctx.font = cellFont(px);
    while (ctx.measureText(text).width > maxW && px > unit * 0.55) {
      px -= 1;
      ctx.font = cellFont(px);
    }
    return px;
  };

  const frameIn = easeOutCubic(enterT(env, 380));

  // Headers
  scene.columns.forEach((col, c) => {
    ctx.save();
    ctx.globalAlpha = frameIn;
    const p = get2D(c, 0);
    const px = fitCell(col, blockW2D - cellPad * 2, baseCellPx);
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(col, p.x, p.y + px * 0.35);
    ctx.restore();
  });

  // Rows
  scene.rows.forEach((row, r) => {
    const beatIdx = offset + r;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;
    
    const appear = easeOutCubic(Math.min(1, t * 3));
    const isCurrent = active === beatIdx;

    row.cells.forEach((cell, c) => {
      const tone = diffTone(cell);
      const p = get2D(c, r + 1);
      
      ctx.save();
      ctx.globalAlpha = appear;
      if (isCurrent) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
      }
      
      const px = fitCell(cell, blockW2D - cellPad * 2, baseCellPx);
      ctx.font = cellFont(px);
      ctx.fillStyle = tone === "good" ? GOOD : tone === "danger" ? DANGER : row.highlight || isCurrent ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(cell, p.x, p.y + px * 0.36);
      ctx.restore();
    });
  });

  if (scene.caption) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(enterT(env, 420, 650));
    ctx.font = `500 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    const cap = wrapText(ctx, scene.caption, contentW * 0.9)[0] ?? scene.caption;
    ctx.fillText(cap, contentX + contentW / 2, availTop + availH + unit * 1.1);
    ctx.restore();
  }
  ctx.textAlign = "start";
}
