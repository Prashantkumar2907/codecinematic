import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type FormulaScene = Extract<Scene, { kind: "formula" }>;

const INK_PANEL = "#0a0e13";

/** Count-up of a numeric result; keeps a trailing non-numeric suffix intact. */
function fmtCount(target: string, t: number): string {
  const m = target.match(/^(-?\d[\d,]*\.?\d*)(.*)$/);
  if (!m) return target;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return target;
  const suffix = m[2];
  const v = num * t;
  const shown = Number.isInteger(num) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
  return `${shown}${suffix}`;
}

export function paintFormula(ctx: CanvasRenderingContext2D, scene: FormulaScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.terms.length + (scene.sayResult ? 1 : 0);
  const resultBeat = scene.sayResult ? totalBeats - 1 : -1;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const frameIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-frmla3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Full equation as a token list: lhs symbol, "=", then op+symbol per term.
  const tokens: { text: string; kind: "lhs" | "eq" | "op" | "term"; termIndex?: number }[] = [
    { text: scene.lhs.symbol, kind: "lhs" },
    { text: "=", kind: "eq" },
  ];
  scene.terms.forEach((t, i) => {
    if (t.op) tokens.push({ text: t.op, kind: "op", termIndex: i });
    tokens.push({ text: t.symbol, kind: "term", termIndex: i });
  });

  const termBeatFrac = (i: number) => {
    const win = beatWindow(env.beats, offset + i, totalBeats);
    return { started: env.p >= win.start, t: clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001)) };
  };

  const nBlocks = tokens.filter(tk => tk.kind === "lhs" || tk.kind === "term").length;
  const rect = { x: contentX, y: areaY, w: contentW, h: areaH * 0.7 };
  const spreadX = vertical ? 2.5 * nBlocks : 3.0 * nBlocks;

  const worldPos = (idx: number) => {
    const x = nBlocks === 1 ? 0 : (idx / (nBlocks - 1) - 0.5) * spreadX;
    return new THREE.Vector3(x, 0, 0);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX * 1.5, 10), 10, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 2, 10),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const blockW = Math.min((spreadX) / nBlocks * 0.8, 2.5);
    const blockD = blockW;

    const models: { mesh: THREE.Group, kind: string, idx: number, termIndex?: number }[] = [];
    let bIdx = 0;
    tokens.forEach((tk) => {
      if (tk.kind === "lhs" || tk.kind === "term") {
        const g = makeBlock(blockW, 0.4, blockD, "#1e293b", "#31435a");
        g.position.copy(worldPos(bIdx));
        s.add(g);
        models.push({ mesh: g, kind: tk.kind, idx: bIdx, termIndex: tk.termIndex });
        bIdx++;
      }
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, activeIdx: number, p: number }) => {
      const { gIn, activeIdx, p } = ctxData;
      
      models.forEach(({ mesh, kind, idx, termIndex }) => {
        mesh.visible = gIn > 0;
        
        let t = 1;
        let isActive = false;
        if (kind === "term" && termIndex !== undefined) {
           const win = beatWindow(env.beats, offset + termIndex, totalBeats);
           t = p >= win.start ? clamp01((p - win.start) / Math.max(win.end - win.start, 0.001)) : 0;
           isActive = activeIdx === offset + termIndex;
        } else if (kind === "lhs") {
           t = 1;
           isActive = activeIdx >= (resultBeat >= 0 ? resultBeat : -1);
        }
        
        const scale = kind === "lhs" ? 1 : easeOutBack(clamp01(t / 0.42));
        mesh.scale.setScalar(Math.max(0.001, scale * gIn));
        
        const baseP = worldPos(idx);
        const bob = Math.sin(elapsedMs / 1200 + idx) * 0.05;
        const pop = isActive ? 0.3 : 0;
        mesh.position.y = baseP.y + bob + pop;

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * 0.9;
                if (isActive) {
                    mat.color.setStyle(accent);
                    mat.emissive.setStyle(accent);
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

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, activeIdx: active, p: env.p }, env);
  if (!cam) return;

  const eqText = tokens.map((tk) => tk.text).join(" ");
  const eqPx = fitFontSize(ctx, eqText, {
    maxW: contentW * 0.94,
    startPx: vertical ? unit * 1.9 : unit * 2.3,
    minPx: unit * 1.0,
    weight: 800,
  });

  const eqPulse = 1 + 0.06 * (idle(env, 2500) - 0.5);

  ctx.textAlign = "center";
  
  let bIdx = 0;
  const blockPositions: { x: number, y: number, kind: string, termIndex?: number }[] = [];
  
  tokens.forEach((tk) => {
    if (tk.kind === "lhs" || tk.kind === "term") {
        const wp = worldPos(bIdx);
        // Add same bob to 2D
        const bob = Math.sin(env.elapsedMs / 1200 + bIdx) * unit * 1.5;
        let isActive = false;
        if (tk.kind === "term" && tk.termIndex !== undefined) {
           isActive = active === offset + tk.termIndex;
        } else if (tk.kind === "lhs") {
           isActive = resultBeat >= 0 && active >= resultBeat;
        }
        const pop = isActive ? unit * 4.0 : 0;
        const p2d = projectToRect(cam, wp, rect);
        p2d.y = p2d.y - bob - pop;
        blockPositions.push({ ...p2d, kind: tk.kind, termIndex: tk.termIndex });
        bIdx++;
    }
  });

  const xs: number[] = [];
  const widths: number[] = [];
  let blockIter = 0;
  
  tokens.forEach((tk, ti) => {
    ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
    const w = ctx.measureText(tk.text).width;
    widths.push(w);
    
    if (tk.kind === "lhs" || tk.kind === "term") {
      const pos = blockPositions[blockIter];
      xs.push(pos.x - w/2);
      blockIter++;
    } else {
      // interpolate for ops and eq
      if (blockIter > 0 && blockIter < blockPositions.length) {
         const p1 = blockPositions[blockIter - 1];
         const p2 = blockPositions[blockIter];
         // center between p1 and p2
         const cx = (p1.x + p2.x) / 2;
         xs.push(cx - w/2);
      } else {
         xs.push(contentX + contentW/2);
      }
    }
  });

  tokens.forEach((tk, ti) => {
    const w = widths[ti];
    const cx = xs[ti] + w / 2;
    // For operators, use the interpolated position.
    let cy = rect.y + rect.h / 2; // Default for eq/op
    if (tk.kind === "lhs" || tk.kind === "term") {
        const bPos = blockPositions.find(bp => bp.kind === tk.kind && bp.termIndex === tk.termIndex);
        if (bPos) {
           cy = bPos.y - unit * 1.0;
        }
    } else {
        // interpolate Y as well for op/eq based on surrounding blocks
        if (tk.kind === "eq" && blockPositions.length > 1) {
             const p1 = blockPositions[0];
             const p2 = blockPositions[1];
             cy = (p1.y + p2.y) / 2 - unit * 1.0;
        } else if (tk.kind === "op" && tk.termIndex !== undefined) {
             const p2 = blockPositions.find(bp => bp.kind === "term" && bp.termIndex === tk.termIndex);
             const p1Index = blockPositions.findIndex(bp => bp.kind === "term" && bp.termIndex === tk.termIndex) - 1;
             if (p2 && p1Index >= 0) {
                 const p1 = blockPositions[p1Index];
                 cy = (p1.y + p2.y) / 2 - unit * 1.0;
             }
        }
    }

    if (tk.kind === "lhs" || tk.kind === "eq") {
      const scale = tk.kind === "eq" ? eqPulse : 1;
      const onResult = resultBeat >= 0 && active >= resultBeat;
      ctx.save();
      ctx.globalAlpha = frameIn;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
      if (tk.kind === "lhs" && onResult) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.6;
      }
      ctx.fillStyle = tk.kind === "lhs" ? THEME.text : THEME.textDim;
      ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
      ctx.shadowBlur = 0;
      ctx.restore();
      if (tk.kind === "lhs" && onResult) {
        ctx.save();
        ctx.globalAlpha = frameIn * easeOutCubic(sub(env.p, beatWindow(env.beats, resultBeat, totalBeats).start, 0.2));
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.12;
        ctx.beginPath();
        ctx.moveTo(xs[ti], cy + eqPx * 0.55);
        ctx.lineTo(xs[ti] + w, cy + eqPx * 0.55);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (tk.kind === "op") {
       ctx.save();
       ctx.globalAlpha = frameIn;
       ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
       ctx.fillStyle = THEME.textDim;
       ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
       ctx.restore();
       return;
    }

    const i = tk.termIndex!;
    const { started, t } = termBeatFrac(i);
    const isActive = active === offset + i;
    if (!started) {
      // Ghost placeholder: dim symbol + dashed underline so the shape shows.
      ctx.save();
      ctx.globalAlpha = frameIn * 0.32;
      ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = unit * 0.06;
      ctx.setLineDash([unit * 0.3, unit * 0.25]);
      ctx.beginPath();
      ctx.moveTo(xs[ti], cy + eqPx * 0.5);
      ctx.lineTo(xs[ti] + w, cy + eqPx * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    // Slide up from below + overshoot settle.
    const e = easeOutBack(clamp01(t / 0.42));
    const breathe = isActive ? 1 + 0.04 * (idle(env, 1900, i) - 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = frameIn * clamp01(t * 2.2);
    ctx.translate(cx, cy);
    ctx.scale(e * breathe, e * breathe);
    ctx.translate(-cx, -cy);
    ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.fillStyle = accent;
    } else {
      ctx.fillStyle = THEME.text;
    }
    ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
    ctx.shadowBlur = 0;
    ctx.restore();
  });
  ctx.textAlign = "start";

  // Active term's gloss chip (only the active one, to stay clean).
  const activeTermIndex = active - offset;
  if (activeTermIndex >= 0 && activeTermIndex < scene.terms.length) {
    const term = scene.terms[activeTermIndex];
    const { t } = termBeatFrac(activeTermIndex);
    // Find the token x for this term's symbol.
    const symTok = tokens.findIndex((tk) => tk.kind === "term" && tk.termIndex === activeTermIndex);
    const w = widths[symTok];
    const anchorX = xs[symTok] + w / 2;
    const bPos = blockPositions.find(bp => bp.kind === "term" && bp.termIndex === activeTermIndex);
    const topY = bPos ? bPos.y + unit * 1.5 : rect.y + rect.h / 2 + eqPx * 0.6;
    drawGloss(ctx, `${term.symbol} — ${term.gloss}`, anchorX, topY, layout, easeOutCubic(sub(t, 0.25, 0.3)), frameIn, env, {
      accent,
      accentGlow,
    });
  }

  // Result line.
  if (resultBeat >= 0 && active >= resultBeat) {
    const win = beatWindow(env.beats, resultBeat, totalBeats);
    const rt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
    const hasValues = scene.terms.every((tm) => tm.value && tm.value.trim());
    const lineY = areaY + areaH - unit * 2;
    ctx.save();
    ctx.globalAlpha = frameIn * easeOutCubic(clamp01(rt / 0.3));
    ctx.textAlign = "center";
    if (hasValues && scene.resultValue) {
      const subst = scene.terms.map((tm, i) => (i === 0 ? tm.value! : `${tm.op || "·"} ${tm.value!}`)).join(" ");
      const rpx = fitFontSize(ctx, `${subst} = ${scene.resultValue}`, {
        maxW: contentW * 0.9,
        startPx: eqPx * 0.78,
        minPx: unit * 0.75,
        weight: 700,
      });
      ctx.font = `700 ${rpx}px ${FONT_SANS}`;
      const counted = fmtCount(scene.resultValue, easeOutCubic(clamp01((rt - 0.15) / 0.6)));
      // Substitution dim, counting result bright.
      const substW = ctx.measureText(`${subst} = `).width;
      const resW = ctx.measureText(counted).width;
      const lx = contentX + contentW / 2 - (substW + resW) / 2;
      ctx.textAlign = "start";
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`${subst} = `, lx, lineY);
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.fillText(counted, lx + substW, lineY);
    } else if (scene.resultValue) {
      const rpx = fitFontSize(ctx, scene.resultValue, { maxW: contentW * 0.9, startPx: eqPx * 0.8, minPx: unit * 0.8, weight: 800 });
      ctx.font = `800 ${rpx}px ${FONT_SANS}`;
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.fillText(fmtCount(scene.resultValue, easeOutCubic(clamp01((rt - 0.15) / 0.6))), contentX + contentW / 2, lineY);
    }
    ctx.restore();
    ctx.textAlign = "start";
  }

  ctx.textAlign = "start";
}

function drawGloss(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  topY: number,
  layout: PaintEnv["layout"],
  reveal: number,
  frameIn: number,
  env: PaintEnv,
  colors: { accent: string; accentGlow: string }
) {
  if (reveal <= 0) return;
  const { unit, contentX, contentW } = layout;
  const breathe = 1 + 0.06 * (idle(env, 2100) - 0.5);
  ctx.save();
  ctx.font = `600 ${unit * (layout.vertical ? 0.74 : 0.66)}px ${FONT_SANS}`;
  const tw = Math.min(ctx.measureText(text).width, contentW * 0.85);
  const cw = tw + unit * 1.0;
  const chH = unit * 1.25;
  const tickH = unit * 0.9;
  const chY = topY + tickH;
  let chX = anchorX - cw / 2;
  chX = Math.min(Math.max(chX, contentX), contentX + contentW - cw);
  // Leader tick from the term down to the chip.
  ctx.globalAlpha = frameIn * reveal;
  ctx.strokeStyle = rgba(colors.accent, 0.5);
  ctx.lineWidth = unit * 0.05;
  ctx.beginPath();
  ctx.moveTo(anchorX, topY);
  ctx.lineTo(anchorX, chY);
  ctx.stroke();
  ctx.save();
  ctx.translate(anchorX, (chY + topY) / 2);
  ctx.scale(breathe, breathe);
  ctx.translate(-anchorX, -(chY + topY) / 2);
  ctx.shadowColor = colors.accentGlow;
  ctx.shadowBlur = unit * 0.4;
  roundRect(ctx, chX, chY, cw, chH, unit * 0.32);
  ctx.fillStyle = INK_PANEL;
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, chX, chY, cw, chH, unit * 0.32);
  ctx.strokeStyle = rgba(colors.accent, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  const clipped = clipToWidth(ctx, text, tw);
  ctx.fillText(clipped, chX + cw / 2, chY + chH * 0.66);
  ctx.textAlign = "start";
  ctx.restore();
  ctx.restore();
}

function clipToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}
