import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BasketScene = Extract<Scene, { kind: "basket" }>;

const RISE = 0.6;

export function paintBasket(ctx: CanvasRenderingContext2D, scene: BasketScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nYears = scene.years.length;
  const totalBeats = offset + nYears;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-bskt3d";

  const wholes = scene.items.every((it) => it.prices.every((p) => Number.isInteger(p)));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = wholes
      ? Math.round(v).toLocaleString(locale)
      : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${u}${body}`;
    return u ? `${body} ${u}` : body;
  };

  const yearRaw = active - offset;
  const ghost = yearRaw < 0;
  const yi = Math.min(Math.max(yearRaw, 0), nYears - 1);
  const t = ghost ? 0 : beatT(env.beats, offset + yi, totalBeats, env.p);
  const mv = ghost ? 0 : easeInOutCubic(clamp01(t / RISE));
  const priceOf = (it: BasketScene["items"][number]): number => {
    if (ghost || yi === 0) return it.prices[0];
    return it.prices[yi - 1] + (it.prices[yi] - it.prices[yi - 1]) * mv;
  };
  const roseOf = (it: BasketScene["items"][number]): boolean => !ghost && yi >= 1 && it.prices[yi] > it.prices[yi - 1];
  const liveBeat = !ghost && t < 1;

  const total = scene.items.reduce((s, it) => s + priceOf(it), 0);
  const base0 = scene.items.reduce((s, it) => s + it.prices[0], 0);
  const pctSince = base0 > 0 ? ((total - base0) / base0) * 100 : 0;

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = contentH - band;

  const yearW = scene.years[yi].when;
  const prevWhen = !ghost && yi > 0 ? scene.years[yi - 1].when : null;
  const yearIn = ghost ? ghostIn : easeOutCubic(clamp01(t / 0.25));
  {
    const cxc = ax + aw / 2;
    const yb = ay + unit * 0.2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${unit * 1.9}px ${FONT_MONO}`;
    if (prevWhen && yearIn < 1) {
      ctx.globalAlpha = 0.2 * (1 - yearIn);
      ctx.fillStyle = THEME.text;
      ctx.fillText(prevWhen, cxc, yb + unit * 1.4 - unit * 0.8 * yearIn);
    }
    const pop = ghost ? 1 : 0.86 + 0.14 * easeOutBack(yearIn);
    ctx.globalAlpha = ghost ? 0.55 * ghostIn : 1;
    ctx.translate(cxc, yb + unit * 1.4);
    ctx.scale(pop, pop);
    ctx.translate(-cxc, -(yb + unit * 1.4));
    ctx.fillStyle = THEME.text;
    ctx.fillText(yearW, cxc, yb + unit * 1.4);
    ctx.textAlign = "start";
    ctx.restore();
  }
  const yearBandH = unit * 2.4;

  const totalBandH = unit * (vertical ? 4.0 : 3.6);
  const totalTop = ay + ah - totalBandH;

  const gridTop = ay + yearBandH + unit * 0.3;
  const gridH = totalTop - gridTop - unit * 0.4;
  const n = scene.items.length;
  const cols = Math.min(n, vertical ? 2 : 3);
  const rows = Math.ceil(n / cols);
  
  const rect = { x: ax, y: gridTop, w: aw, h: gridH };

  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 4.5 : 3.5;

  const worldPos = (c: number, r: number) => {
    const x = cols === 1 ? 0 : (c / (cols - 1) - 0.5) * spreadX * 2;
    const z = rows === 1 ? 0 : (r / (rows - 1) - 0.5) * spreadZ * 2;
    return new THREE.Vector3(x, 0, z);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
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

    const blockW = (spreadX * 2.0) / cols * 0.8;
    const blockD = (spreadZ * 2.0) / rows * 0.8;

    const models: { mesh: THREE.Group, r: number, c: number, item: any, idx: number }[] = [];
    scene.items.forEach((it, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const g = makeBlock(blockW, 0.4, blockD, "#1e293b", "#31435a");
        g.position.copy(worldPos(c, r));
        s.add(g);
        models.push({ mesh: g, r, c, item: it, idx: i });
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, t: number, ghost: boolean, yi: number, mv: number, liveBeat: boolean }) => {
      const { gIn, t, ghost, yi, mv, liveBeat } = ctxData;
      
      models.forEach(({ mesh, r, c, item, idx }) => {
        mesh.visible = gIn > 0;
        mesh.scale.setScalar(Math.max(0.001, 0.9 * gIn));
        
        const isRose = !ghost && yi >= 1 && item.prices[yi] > item.prices[yi - 1];
        const flash = isRose && liveBeat ? easeOutCubic(clamp01(t / RISE)) * (1 - clamp01((t - RISE) / 0.3)) : 0;

        const baseP = worldPos(c, r);
        const bob = Math.sin(elapsedMs / 1200 + idx) * 0.05;
        const pop = flash * 0.4;
        mesh.position.y = baseP.y + bob + pop;

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * 0.9;
                if (flash > 0) {
                    mat.color.setStyle(THEME.warn);
                    mat.emissive.setStyle(THEME.warn);
                    mat.emissiveIntensity = 0.5 * flash;
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

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: ghostIn, t, ghost, yi, mv, liveBeat });
  if (!cam) return;

  const get2D = (c: number, r: number) => projectToRect(cam, worldPos(c, r), rect);
  
  const blockW2D = contentW / cols * 0.8;
  const blockH2D = gridH / rows * 0.8;

  // Items Overlays
  scene.items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rose = roseOf(it);
    const flash = rose && liveBeat ? easeOutCubic(clamp01(t / RISE)) * (1 - clamp01((t - RISE) / 0.3)) : 0;
    
    const p = get2D(col, row);
    // Add same bob to 2D
    const bob = Math.sin(env.elapsedMs / 1200 + i) * unit * 1.5;
    const pop = flash * unit * 6.0;
    const cy = p.y - bob - pop;

    ctx.save();
    ctx.globalAlpha = ghost ? 0.6 * ghostIn : ghostIn;

    ctx.textAlign = "center";
    const cxc = p.x;
    let cursorY = cy - blockH2D * 0.2;
    if (it.icon) {
      ctx.font = `${blockH2D * 0.3}px ${FONT_SANS}`;
      ctx.fillText(it.icon, cxc, cursorY);
      cursorY += blockH2D * 0.15;
    }
    const lpx = fitFontSize(ctx, it.label, { maxW: blockW2D * 0.8, startPx: unit * 0.66, minPx: unit * 0.46, weight: 600 });
    ctx.font = `600 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(it.label, cxc, cursorY + blockH2D * 0.1);

    // Price tag pill
    const priceTxt = fmt(priceOf(it));
    ctx.font = `800 ${unit * (vertical ? 0.78 : 0.72)}px ${FONT_MONO}`;
    const arrow = rose ? " ↑" : "";
    const pw = ctx.measureText(priceTxt + arrow).width + unit * 0.8;
    const tagY = cy + blockH2D * 0.25;
    if (flash > 0) {
      ctx.shadowColor = rgba(THEME.warn, 0.6);
      ctx.shadowBlur = unit * 0.5 * flash;
    }
    roundRect(ctx, cxc - pw / 2, tagY, pw, unit * 1.0, unit * 0.28);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = flash > 0 ? THEME.warn : rgba(accent, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = flash > 0 ? THEME.warn : THEME.text;
    ctx.fillText(priceTxt, cxc - (arrow ? ctx.measureText(arrow).width / 2 : 0), tagY + unit * 0.72);
    if (arrow) {
      ctx.fillStyle = THEME.warn;
      ctx.fillText(arrow, cxc + ctx.measureText(priceTxt).width / 2, tagY + unit * 0.72);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // TOTAL
  ctx.save();
  ctx.globalAlpha = ghost ? 0.7 * ghostIn : 1;
  ctx.textAlign = "center";
  const cxc = ax + aw / 2;
  const labelY = totalTop + unit * 0.7;
  ctx.font = `700 ${unit * 0.66}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText("BASKET TOTAL", cxc, labelY);
  const totalTxt = fmt(total);
  const bigPx = fitFontSize(ctx, totalTxt, { maxW: aw * 0.7, startPx: unit * 1.4, minPx: unit * 0.95, weight: 800, family: FONT_MONO });
  ctx.font = `800 ${bigPx}px ${FONT_MONO}`;
  if (liveBeat) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.3 + 0.7 * idle(env, 1600));
  } else if (!ghost) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.2 + 0.3 * idle(env, 2800));
  }
  ctx.fillStyle = accent;
  const numBaseline = labelY + unit * 0.45 + bigPx;
  ctx.fillText(totalTxt, cxc, numBaseline);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (!ghost && yi >= 1) {
    const pctIn = easeOutCubic(clamp01(t / 0.4));
    ctx.save();
    ctx.globalAlpha = pctIn;
    ctx.font = `800 ${unit * 0.62}px ${FONT_MONO}`;
    const pctTxt = `+${pctSince.toFixed(pctSince >= 100 ? 0 : 1)}% since ${scene.years[0].when}`;
    const pw = ctx.measureText(pctTxt).width + unit * 0.9;
    const py = numBaseline + unit * 0.75;
    roundRect(ctx, cxc - pw / 2, py - unit * 0.5, pw, unit * 0.95, unit * 0.26);
    ctx.fillStyle = rgba(THEME.warn, 0.14);
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.warn, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(pctTxt, cxc, py + unit * 0.22);
    ctx.textAlign = "start";
    ctx.restore();
  }
  ctx.textAlign = "start";
}
