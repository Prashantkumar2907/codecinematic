import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, isoCamera, type ThreeBundle } from "./three3d";
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
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type RaceScene = Extract<Scene, { kind: "race" }>;

const CURRENCY_RE = /^[₹$€£]$/;
// Captions sit in the bottom ~14% of vertical frames; keep lanes/values above.
const CAPTION_SAFE_Y = 0.86;

export function paintRace(ctx: CanvasRenderingContext2D, scene: RaceScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const tints = [accent, secondary, THEME.good, THEME.warn, "#f472b6"];
  const offset = introBeatCount(scene);
  const ncp = scene.checkpoints.length;
  const totalBeats = offset + ncp;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const ghostIn = easeOutCubic(enterT(env, 420));

  // drawSceneTitle finishes its fade at p=0.12; feed it absolute time so the title lands in ~360ms.
  let band = drawSceneTitle(ctx, scene.title, layout, enterT(env, 360) * 0.12, accent) + unit * 0.3;

  // Interpolated race state: values and lane ranks glide from checkpoint j-1
  // to checkpoint j over the first 60% of beat j.
  const jRaw = active - offset;
  const ghost = jRaw < 0;
  const j = Math.min(Math.max(jRaw, 0), ncp - 1);
  const t = ghost ? 0 : beatT(env.beats, offset + j, totalBeats, env.p);
  const mv = ghost ? 0 : easeInOutCubic(clamp01(t / 0.6));
  const prevVals = scene.checkpoints[Math.max(j - 1, 0)].values;
  const curVals = scene.checkpoints[j].values;
  const vals = scene.racers.map((_, i) => prevVals[i] + (curVals[i] - prevVals[i]) * mv);
  const ranksOf = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
    const ranks = new Array<number>(values.length).fill(0);
    order.forEach((o, r) => (ranks[o.i] = r));
    return ranks;
  };
  const prevRanks = ranksOf(prevVals);
  const curRanks = ranksOf(curVals);
  const leader = vals.indexOf(Math.max(...vals));

  const allInt = scene.checkpoints.every((c) => c.values.every((v) => Number.isInteger(v)));
  const u = scene.unit?.trim() ?? "";
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = allInt ? Math.round(v).toLocaleString(locale) : v.toFixed(1);
    if (CURRENCY_RE.test(u)) return `${u}${body}`;
    return u ? (u.startsWith("%") ? `${body}${u}` : `${body} ${u}`) : body;
  };

  // "when" chip row (vertical) sits under the title and consumes band height.
  if (vertical) {
    const rowY = contentY + band + unit * 0.2;
    let px = unit * 0.62;
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    const pad = unit * 0.7;
    const gap = unit * 0.35;
    let widths = scene.checkpoints.map((c) => ctx.measureText(c.when).width + pad);
    let total = widths.reduce((a, b) => a + b, 0) + gap * (ncp - 1);
    if (total > contentW) {
      px *= (contentW / total) * 0.95;
      ctx.font = `700 ${px}px ${FONT_MONO}`;
      widths = scene.checkpoints.map((c) => ctx.measureText(c.when).width + pad);
      total = widths.reduce((a, b) => a + b, 0) + gap * (ncp - 1);
    }
    const chipH = px * 1.9;
    let x = contentX + (contentW - total) / 2;
    scene.checkpoints.forEach((c, k) => {
      const isCur = !ghost && k === j;
      const alpha = ghost ? (k === 0 ? 0.5 : 0.3) * ghostIn : isCur ? 1 : k < j ? 0.7 : 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (isCur) {
        const pop = easeOutBack(clamp01(t / 0.25));
        ctx.translate(x + widths[k] / 2, rowY + chipH / 2);
        ctx.scale(pop, pop);
        ctx.translate(-(x + widths[k] / 2), -(rowY + chipH / 2));
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.4;
      }
      roundRect(ctx, x, rowY, widths[k], chipH, chipH / 2);
      ctx.fillStyle = isCur ? accent : "#0a0e13";
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!isCur) {
        ctx.strokeStyle = THEME.panelBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.font = `700 ${px}px ${FONT_MONO}`;
      ctx.fillStyle = isCur ? "#06121a" : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(c.when, x + widths[k] / 2, rowY + chipH / 2 + px * 0.36);
      ctx.textAlign = "start";
      ctx.restore();
      x += widths[k] + gap;
    });
    band += chipH + unit * 0.6;
  }

  
  const nRacers = scene.racers.length;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const availH = safeBottom - (contentY + band);
  const listTop = contentY + band;
  const rect = { x: contentX, y: listTop, w: contentW, h: availH };

  const gmax = Math.max(...scene.checkpoints.flatMap((c) => c.values), 1e-9);
  const ysRank = scene.racers.map((_, i) => prevRanks[i] + (curRanks[i] - prevRanks[i]) * mv);
  const revealA = ghost ? 0.35 * ghostIn : jRaw === 0 ? 0.35 + 0.65 * easeOutCubic(clamp01(t / 0.3)) : 1;

  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 4.5 : 3.5;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = isoCamera();
    if (vertical) {
      camera.position.set(8.5, 7.2, 9.5);
    }
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

    const models: { mesh: THREE.Group, racerIdx: number, baseColor: string }[] = [];
    const blockH = 0.5;
    const blockD = (spreadZ * 2.0) / Math.max(1, nRacers) * 0.6;

    scene.racers.forEach((r, i) => {
      const tint = tints[i % tints.length];
      const g = makeBlock(1, blockH, blockD, tint, tint);
      s.add(g);
      models.push({ mesh: g, racerIdx: i, baseColor: tint });
    });

    const update = (elapsedMs: number, ctxData: any) => {
      const { revealA, vals, ysRank, gmax, ghost, leader } = ctxData;
      
      models.forEach(({ mesh, racerIdx, baseColor }) => {
        mesh.visible = revealA > 0.01;
        
        const val = vals[racerIdx];
        const rank = ysRank[racerIdx];
        const isLeader = racerIdx === leader && !ghost;
        
        const z = nRacers === 1 ? 0 : (rank / (nRacers - 1) - 0.5) * spreadZ * 2;
        const len = Math.max(0.01, (val / gmax) * (spreadX * 2.0));
        const x = -spreadX + len / 2;
        
        const bob = Math.sin(elapsedMs / 1200 + racerIdx) * 0.05;
        const pop = isLeader ? 0.2 : 0;
        
        mesh.position.set(x, bob + pop, z);
        mesh.scale.set(len, Math.max(0.001, revealA), Math.max(0.001, revealA));

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = revealA * 0.9;
                
                if (isLeader) {
                    mat.color.setStyle(baseColor);
                    mat.emissive.setStyle(baseColor);
                    mat.emissiveIntensity = 0.5;
                } else {
                    mat.color.setStyle(baseColor);
                    mat.emissive.setStyle(baseColor);
                    mat.emissiveIntensity = 0.1;
                }
            }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const key = scene.id + "-race3d";
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { revealA, vals, ysRank, gmax, ghost, leader });
  if (!cam) return;

  const drawOrder = scene.racers.map((_, i) => i).sort((a, b) => curRanks[b] - curRanks[a] || b - a);

  for (const i of drawOrder) {
    const racer = scene.racers[i];
    const val = vals[i];
    const rank = ysRank[i];
    const isLeader = i === leader && !ghost;

    const z = nRacers === 1 ? 0 : (rank / (nRacers - 1) - 0.5) * spreadZ * 2;
    const len = Math.max(0.01, (val / gmax) * (spreadX * 2.0));
    
    // Front edge of the bar
    const frontEdge = new THREE.Vector3(-spreadX + len, 0.25, z + 0.3);
    const pFront = projectToRect(cam, frontEdge, rect);
    
    // Label area (start of bar)
    const backEdge = new THREE.Vector3(-spreadX, 0.25, z + 0.3);
    const pBack = projectToRect(cam, backEdge, rect);

    ctx.save();
    ctx.globalAlpha = revealA;

    // Label
    let lx = pBack.x - unit * 0.5;
    const labelY = pBack.y - unit * 0.3;
    
    ctx.textAlign = "right";
    ctx.font = `${isLeader ? 700 : 600} ${unit * 0.85}px ${FONT_SANS}`;
    ctx.fillStyle = isLeader ? THEME.text : THEME.textDim;
    ctx.fillText(racer.label, lx, labelY);
    
    if (racer.icon) {
      ctx.font = `${unit * 0.95}px ${FONT_SANS}`;
      lx -= ctx.measureText(racer.label).width + unit * 0.35;
      ctx.fillText(racer.icon, lx, labelY);
    }
    
    const labelEnd = lx; // for crown

    // Value
    const valueText = fmt(val);
    ctx.textAlign = "left";
    ctx.font = `${isLeader ? 800 : 700} ${unit * (vertical ? 0.85 : 0.78)}px ${FONT_MONO}`;
    ctx.fillStyle = isLeader ? THEME.text : THEME.textDim;
    ctx.fillText(valueText, pFront.x + unit * 0.5, pFront.y - unit * 0.3);

    if (inTail && isLeader) {
      const pop = easeOutBack(clamp01(sub(env.p, beatWindow(env.beats, totalBeats - 1, totalBeats).end, 0.04)));
      const bob = Math.sin(env.elapsedMs / 400) * unit * 0.06;
      const cwx = pFront.x + unit * 0.5 + ctx.measureText(valueText).width + unit * 1.5;
      const cwy = pFront.y - unit * 0.8 + bob;
      ctx.save();
      ctx.translate(cwx, cwy);
      ctx.scale(pop, pop);
      ctx.translate(-cwx, -cwy);
      roundRect(ctx, cwx - unit * 0.55, cwy - unit * 0.4, unit * 1.1, unit * 0.8, unit * 0.25);
      ctx.fillStyle = rgba(THEME.warn, 0.18);
      ctx.fill();
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.05;
      ctx.stroke();
      ctx.fillStyle = THEME.warn;
      ctx.font = `800 ${unit * 0.5}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("▲", cwx, cwy + unit * 0.18);
      ctx.restore();
    }
    ctx.restore();
  }

  // Big dim "when" (horizontal): oversized mono top-right, old slides up +
  // fades while the new one pops.
  if (!vertical) {
    const bigY = contentY + unit * 2.1;
    const rightX = contentX + contentW;
    const wIn = ghost ? 1 : easeOutCubic(clamp01(t / 0.25));
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = `800 ${unit * 2.4}px ${FONT_MONO}`;
    if (!ghost && j > 0 && wIn < 1) {
      ctx.globalAlpha = 0.18 * (1 - wIn);
      ctx.fillStyle = THEME.text;
      ctx.fillText(scene.checkpoints[j - 1].when, rightX, bigY - unit * 0.9 * wIn);
    }
    const pop = ghost ? 1 : 0.86 + 0.14 * easeOutBack(wIn);
    const when = scene.checkpoints[j].when;
    ctx.save();
    ctx.globalAlpha = 0.18 * (ghost ? ghostIn : 1);
    ctx.translate(rightX, bigY);
    ctx.scale(pop, pop);
    ctx.translate(-rightX, -bigY);
    ctx.fillStyle = THEME.text;
    ctx.fillText(when, rightX, bigY);
    ctx.restore();
    ctx.textAlign = "right";
    // Small crisp chip to the big number's left, in the same top-right band.
    const bigW = ctx.measureText(when).width * pop;
    ctx.globalAlpha = ghost ? 0.6 * ghostIn : 1;
    ctx.font = `700 ${unit * 0.62}px ${FONT_MONO}`;
    const cw = ctx.measureText(when).width + unit * 0.7;
    const chipX = rightX - bigW - unit * 0.8 - cw;
    const chipY = bigY - unit * 1.35;
    roundRect(ctx, chipX, chipY, cw, unit * 1.0, unit * 0.3);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.fillText(when, chipX + cw / 2, chipY + unit * 0.72);
    ctx.restore();
  }
  ctx.textAlign = "start";
}
