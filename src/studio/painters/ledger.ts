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
  clamp01,
  sub,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  drawArrowhead,
  pointAlongPolyline,
  strokePolylineProgress,
  beatT,
  activeBeatIndex,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type LedgerScene = Extract<Scene, { kind: "ledger" }>;
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Pt = { x: number; y: number };

const COINS = 6;
const COIN_STAGGER = 0.09;
const COIN_SPEED = 1 + (COINS - 1) * COIN_STAGGER;
const SETTLED_ARC_ALPHA = 0.13;
const ARC_SAMPLES = 24;
const CAPTION_SAFE_Y = 0.86;

function transferArc(a: Rect, b: Rect, unit: number): Pt[] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  let p0: Pt;
  let p1: Pt;
  if (Math.abs(dx) >= Math.abs(dy)) {
    p0 = { x: dx >= 0 ? a.x + a.w : a.x, y: a.cy };
    p1 = { x: dx >= 0 ? b.x : b.x + b.w, y: b.cy };
  } else {
    p0 = { x: a.cx, y: dy >= 0 ? a.y + a.h : a.y };
    p1 = { x: b.cx, y: dy >= 0 ? b.y : b.y + b.h };
  }
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const nx = -(p1.y - p0.y) / len;
  const ny = (p1.x - p0.x) / len;
  const c: Pt = { x: (p0.x + p1.x) / 2 + nx * unit * 2, y: (p0.y + p1.y) / 2 + ny * unit * 2 };
  const pts: Pt[] = [];
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const f = i / (ARC_SAMPLES - 1);
    const mf = 1 - f;
    pts.push({
      x: mf * mf * p0.x + 2 * mf * f * c.x + f * f * p1.x,
      y: mf * mf * p0.y + 2 * mf * f * c.y + f * f * p1.y,
    });
  }
  return pts;
}

function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, unit: number, alpha: number, color: string) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  roundRect(ctx, x - tw / 2 - unit * 0.4, y - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.32);
  ctx.fillStyle = "#0a0e13";
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + unit * 0.23);
  ctx.textAlign = "start";
  ctx.restore();
}

export function paintLedger(ctx: CanvasRenderingContext2D, scene: LedgerScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.transfers.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-ldgr3d";

  const band = drawSceneTitle(ctx, scene.title, layout, enterT(env, 360) * 0.12, accent) + unit * 0.3;

  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;
  const rect = { x: ax, y: ay, w: aw, h: ah };
  
  const nParties = scene.parties.length;
  const spreadX = vertical ? 3.0 : 5.0;
  const spreadZ = vertical ? 5.0 : 3.0;

  const worldPos = (i: number) => {
    if (nParties === 2) return vertical 
        ? new THREE.Vector3(0, 0, i === 0 ? -spreadZ : spreadZ) 
        : new THREE.Vector3(i === 0 ? -spreadX : spreadX, 0, 0);
    if (nParties === 3) {
        if (i === 0) return new THREE.Vector3(0, 0, -spreadZ);
        if (i === 1) return new THREE.Vector3(-spreadX, 0, spreadZ);
        if (i === 2) return new THREE.Vector3(spreadX, 0, spreadZ);
    }
    // 4 parties
    if (i === 0) return new THREE.Vector3(-spreadX, 0, -spreadZ);
    if (i === 1) return new THREE.Vector3(spreadX, 0, -spreadZ);
    if (i === 2) return new THREE.Vector3(-spreadX, 0, spreadZ);
    return new THREE.Vector3(spreadX, 0, spreadZ);
  };

  const blockW = (spreadX * 2.0) / 2 * 0.9;
  const blockD = (spreadZ * 2.0) / 2 * 0.9;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 15 : 12, vertical ? 12 : 10);
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

    const models: { mesh: THREE.Group, idx: number, pid: string }[] = [];
    scene.parties.forEach((p, i) => {
        const g = makeBlock(blockW, 0.6, blockD, "#1e293b", "#31435a");
        g.position.copy(worldPos(i));
        s.add(g);
        models.push({ mesh: g, idx: i, pid: p.id });
    });

    const update = (elapsedMs: number, ctxData: { p: number, active: number, tints: Record<string, string>, pulses: Record<string, number> }) => {
      const enterAll = enterT(env, 350, 0);
      models.forEach(({ mesh, idx, pid }) => {
        const enter = enterT(env, 350, idx * 70);
        const appear = easeOutCubic(clamp01(enter * 1.5));
        const pop = Math.max(0.001, appear * (ctxData.pulses[pid] || 1));
        
        mesh.scale.setScalar(pop);
        mesh.visible = appear > 0.01;
        
        const base = worldPos(idx);
        const bob = Math.sin(elapsedMs / 1200 + idx * 0.5) * 0.1;
        mesh.position.y = base.y + bob;

        const involved = !!ctxData.tints[pid];
        const tint = ctxData.tints[pid];

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = appear * 0.9;
                
                if (involved && tint) {
                    mat.color.setStyle(tint);
                    mat.emissive.setStyle(tint);
                    mat.emissiveIntensity = 0.2;
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

  const wholes = scene.parties.every((p) => Number.isInteger(p.start)) && scene.transfers.every((t) => Number.isInteger(t.amount));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const sign = v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = wholes ? Math.round(abs).toLocaleString(locale) : abs.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${sign}${u}${text}`;
    return u ? `${sign}${text} ${u}` : `${sign}${text}`;
  };

  const balances = new Map(scene.parties.map((p) => [p.id, p.start]));
  const pulses: Record<string, number> = {};
  const tints: Record<string, string> = {};
  let glowParty: string | null = null;
  let lastSettled = -1;
  
  scene.transfers.forEach((tr, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const e = easeInOutCubic(sub(t, 0.2, 0.6));
    balances.set(tr.from, (balances.get(tr.from) ?? 0) - tr.amount * e);
    balances.set(tr.to, (balances.get(tr.to) ?? 0) + tr.amount * e);
    if (t >= 1) lastSettled = k;
    if (active === offset + k && t < 1) {
      tints[tr.from] = THEME.warn;
      tints[tr.to] = THEME.good;
      glowParty = tr.to;
      const tt = sub(t, 0.15, 0.65);
      let bump = 0;
      for (let j = 0; j < COINS; j++) {
        const land = (1 + j * COIN_STAGGER) / COIN_SPEED;
        const since = tt - land;
        if (since >= 0 && since <= 0.14) bump = Math.max(bump, Math.sin((Math.PI * since) / 0.14));
      }
      pulses[tr.to] = 1 + 0.02 * easeOutBack(bump);
    }
  });

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { p: env.p, active, tints, pulses }, env);
  if (!cam) return;

  const centers = scene.parties.map((p, i) => projectToRect(cam, worldPos(i), rect));
  const cw = vertical ? contentW * 0.44 : unit * 6.4;
  const ch = vertical ? unit * 4.4 : unit * 4;
  const rects = new Map<string, Rect>();
  scene.parties.forEach((party, i) => {
    const c = centers[i];
    rects.set(party.id, { x: c.x - cw / 2, y: c.y - ch / 2, w: cw, h: ch, cx: c.x, cy: c.y });
  });

  let activeArc: { pts: Pt[]; tr: LedgerScene["transfers"][number]; t: number } | null = null;

  scene.transfers.forEach((tr, k) => {
    const a = rects.get(tr.from);
    const b = rects.get(tr.to);
    if (!a || !b) return;
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const pts = transferArc(a, b, unit);
    const isActive = active === offset + k && t < 1;
    ctx.save();
    ctx.lineCap = "round";
    if (isActive) {
      activeArc = { pts, tr, t };
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      strokePolylineProgress(ctx, pts, easeOutCubic(clamp01(t / 0.15)));
    } else {
      ctx.globalAlpha = SETTLED_ARC_ALPHA;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.beginPath();
      pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
      const tip = pts[ARC_SAMPLES - 1];
      const prev = pts[ARC_SAMPLES - 2];
      drawArrowhead(ctx, tip.x, tip.y, Math.atan2(tip.y - prev.y, tip.x - prev.x), unit * 0.4);
      if (k === lastSettled) {
        const f = (env.elapsedMs % 2200) / 2200;
        const dot = pointAlongPolyline(pts, f);
        ctx.globalAlpha = 0.45 * Math.sin(Math.PI * f);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });

  scene.parties.forEach((party, i) => {
    const r = rects.get(party.id);
    if (!r) return;
    const enter = enterT(env, 350, i * 70);
    if (enter <= 0) return;
    const appear = easeOutCubic(clamp01(enter * 1.5));
    const involved = !!tints[party.id];
    const bob = Math.sin(env.elapsedMs / 1200 + i * 0.5) * unit * 1.5;

    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(r.cx, r.cy - bob);
    
    if (party.id === glowParty) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.9 + 0.35 * Math.sin(env.elapsedMs / 260));
    }

    ctx.textAlign = "center";
    const header = party.icon ? `${party.icon} ${party.label}` : party.label;
    const hpx = fitFontSize(ctx, header, { maxW: r.w - unit * 0.7, startPx: unit * 0.82, minPx: unit * 0.55, weight: 700 });
    ctx.font = `700 ${hpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(header, 0, -unit * 0.2);

    const balText = fmt(balances.get(party.id) ?? party.start);
    const bpx = fitFontSize(ctx, balText, { maxW: r.w - unit * 0.8, startPx: unit * 1.05, minPx: unit * 0.6, weight: 800, family: FONT_MONO });
    ctx.font = `800 ${bpx}px ${FONT_MONO}`;
    ctx.fillStyle = tints[party.id] ?? THEME.text;
    ctx.fillText(balText, 0, unit * 1.0);
    ctx.textAlign = "start";
    ctx.restore();
  });

  if (activeArc) {
    const { pts, tr, t } = activeArc as { pts: Pt[]; tr: LedgerScene["transfers"][number]; t: number };
    const tt = sub(t, 0.15, 0.65);
    if (tt > 0) {
      ctx.save();
      for (let j = 0; j < COINS; j++) {
        const f = clamp01(tt * COIN_SPEED - j * COIN_STAGGER);
        if (f <= 0 || f >= 1) continue;
        const dot = pointAlongPolyline(pts, f);
        ctx.globalAlpha = Math.sin(Math.PI * f);
        ctx.fillStyle = accent;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.7;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const minusA = easeOutCubic(sub(t, 0.05, 0.1)) * (1 - sub(t, 0.32, 0.16));
    if (minusA > 0) {
      const at = pointAlongPolyline(pts, 0.07);
      drawChip(ctx, at.x, at.y - unit * 0.85, fmt(-tr.amount), unit, minusA, THEME.warn);
    }
    const fc = clamp01(tt * COIN_SPEED - (COIN_STAGGER * (COINS - 1)) / 2);
    if (fc > 0 && fc < 1) {
      const at = pointAlongPolyline(pts, fc);
      const alpha = Math.min(1, fc * 6, (1 - fc) * 6);
      drawChip(ctx, at.x, at.y - unit * 0.85, tr.label ?? `+${fmt(tr.amount)}`, unit, alpha, THEME.good);
    }
  }
  ctx.textAlign = "start";
}
