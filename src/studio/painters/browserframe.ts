import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  enterT,
  clamp01,
  roundRect,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
  type Palette,
} from "./common";
import type { PaintEnv } from "./index";

type BrowserframeScene = Extract<Scene, { kind: "browserframe" }>;
type BlockRole = BrowserframeScene["blocks"][number]["role"];
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;
const SKELETON_FILL = "rgba(148,163,184,0.06)";
const CARET_MS = 530;
const SHIMMER_MS = 900;

function roleFill(role: BlockRole, palette: Palette): string | null {
  switch (role) {
    case "hero":
    case "card":
      return palette.accentSoft;
    case "image":
      return rgba(palette.secondary, 0.14);
    case "header":
    case "button":
      return rgba(palette.accent, 0.2);
    case "text":
      return null;
  }
}

function roleBorder(role: BlockRole, palette: Palette): string {
  switch (role) {
    case "image":
      return rgba(palette.secondary, 0.55);
    case "text":
      return "rgba(148,163,184,0.55)";
    default:
      return rgba(palette.accent, 0.55);
  }
}

function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  role: BlockRole,
  r: Rect,
  unit: number,
  painted: boolean,
  elapsedMs: number,
  palette: Palette
) {
  const ink = painted ? THEME.textDim : THEME.textFaint;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(unit * 0.06, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const dash = (x: number, y: number, w: number, h: number) => {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
  };
  const dh = Math.max(Math.min(unit * 0.16, r.h * 0.08), 2);

  switch (role) {
    case "header": {
      const dr = Math.min(r.h * 0.22, unit * 0.28);
      ctx.beginPath();
      ctx.arc(r.x + Math.min(r.h * 0.6, unit), r.cy, dr, 0, Math.PI * 2);
      ctx.fill();
      const navW = Math.min(unit * 0.9, r.w * 0.08);
      for (let i = 0; i < 3; i++) {
        dash(r.x + r.w - (3 - i) * (navW + unit * 0.3), r.cy - dh / 2, navW, dh);
      }
      break;
    }
    case "hero": {
      dash(r.x + r.w * 0.08, r.y + r.h * 0.28, r.w * 0.55, dh * 1.3);
      dash(r.x + r.w * 0.08, r.y + r.h * 0.45, r.w * 0.38, dh);
      const pw = Math.min(unit * 2.4, r.w * 0.3);
      const ph = Math.min(unit * 0.75, r.h * 0.2);
      const pcx = r.x + r.w * 0.08 + pw / 2;
      const pcy = r.y + r.h * 0.68 + ph / 2;
      const scale = painted ? 1 + 0.05 * Math.sin(elapsedMs / 450) : 1;
      ctx.save();
      ctx.translate(pcx, pcy);
      ctx.scale(scale, scale);
      ctx.translate(-pcx, -pcy);
      roundRect(ctx, pcx - pw / 2, pcy - ph / 2, pw, ph, ph / 2);
      if (painted) {
        ctx.fillStyle = palette.accent;
        ctx.fill();
      } else {
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case "text": {
      const widths = [0.92, 0.78, 0.85, 0.55];
      const count = r.h > unit * 2.5 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const y = r.y + r.h * ((i + 1) / (count + 1)) - dh / 2;
        dash(r.x + r.w * 0.06, y, r.w * 0.88 * widths[i], dh);
      }
      break;
    }
    case "image": {
      const baseY = r.y + r.h * 0.78;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.1, baseY);
      ctx.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.32);
      ctx.lineTo(r.x + r.w * 0.58, baseY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.46, baseY);
      ctx.lineTo(r.x + r.w * 0.68, r.y + r.h * 0.48);
      ctx.lineTo(r.x + r.w * 0.9, baseY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.78, r.y + r.h * 0.24, Math.min(unit * 0.24, r.h * 0.12), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "button": {
      const bw = Math.min(r.w * 0.72, unit * 3);
      const bh = Math.min(r.h * 0.6, unit * 1.1);
      roundRect(ctx, r.cx - bw / 2, r.cy - bh / 2, bw, bh, bh / 2);
      if (painted) {
        ctx.fillStyle = palette.accent;
        ctx.fill();
        ctx.fillStyle = "#06121a";
      } else {
        ctx.stroke();
      }
      dash(r.cx - bw * 0.22, r.cy - dh / 2, bw * 0.44, dh);
      break;
    }
    case "card": {
      const pad = Math.min(unit * 0.2, r.w * 0.06);
      ctx.save();
      ctx.fillStyle = painted ? rgba(palette.secondary, 0.16) : "rgba(148,163,184,0.08)";
      roundRect(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h * 0.42, unit * 0.15);
      ctx.fill();
      ctx.restore();
      dash(r.x + r.w * 0.08, r.y + r.h * 0.58, r.w * 0.7, dh);
      dash(r.x + r.w * 0.08, r.y + r.h * 0.72, r.w * 0.5, dh);
      break;
    }
  }
  ctx.restore();
}

export function paintBrowserframe(ctx: CanvasRenderingContext2D, scene: BrowserframeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const palette = env.palette;
  const { accent, accentGlow, secondary } = palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-browser3d";

  const base = easeOutCubic(enterT(env, 380));
  if (base <= 0) return;

  const rect = { x: contentX, y: contentY, w: contentW, h: contentH };
  
  type Anim = { show: number | null; paint: number | null; shifts: { beat: number; y: number }[] };
  const anims = new Map<string, Anim>(scene.blocks.map((b) => [b.id, { show: null, paint: null, shifts: [] }]));
  scene.steps.forEach((st, k) => {
    const beat = offset + k;
    for (const id of st.show) {
      const a = anims.get(id);
      if (a && a.show === null) a.show = beat;
    }
    for (const id of st.paint) {
      const a = anims.get(id);
      if (a && a.paint === null) a.paint = beat;
    }
    if (st.shift) anims.get(st.shift.block)?.shifts.push({ beat, y: st.shift.y });
  });

  const spreadX = vertical ? 3.5 : 5.5;
  const spreadY = vertical ? 5.5 : 3.5;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);
    
    // Grid floor
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -1.0;
    // Rotate grid for vertical so it matches the stack
    if (vertical) grid.rotation.x = Math.PI / 2;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadY * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    if (vertical) shadowPlane.rotation.x = 0;
    shadowPlane.position.y = -1.0;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Browser back window
    const browserGroup = makeBlock(spreadX * 2.0, spreadY * 2.0, 0.3, "#06121a", "#31435a");
    s.add(browserGroup);

    const models: { mesh: THREE.Group, block: typeof scene.blocks[0] }[] = [];
    
    for (const b of scene.blocks) {
        // Grid is 12x12 inside the browser block
        const bw = (b.w / GRID) * (spreadX * 2.0 * 0.95);
        const bh = (b.h / GRID) * (spreadY * 2.0 * 0.85); // leaves room for header
        const cx = (b.x / GRID - 0.5) * (spreadX * 2.0 * 0.95) + bw / 2;
        const cy = (0.5 - b.y / GRID) * (spreadY * 2.0 * 0.85) - bh / 2 - (spreadY * 2.0 * 0.05); // shift down
        
        const g = makeBlock(bw, bh, 0.15, THEME.panel, accent);
        g.position.set(cx, cy, 0.2); // stick out slightly from browser
        s.add(g);
        models.push({ mesh: g, block: b });
    }

    const update = (elapsedMs: number) => {
      const gIn = easeOutCubic(enterT(env, 600));
      
      // Floating animation for the whole browser
      const bBob = Math.sin(elapsedMs / 2000) * 0.15;
      const bRotX = Math.sin(elapsedMs / 2500) * 0.04;
      const bRotY = Math.cos(elapsedMs / 2200) * 0.04;
      
      browserGroup.position.y = bBob;
      browserGroup.rotation.x = bRotX;
      browserGroup.rotation.y = bRotY;
      
      browserGroup.scale.setScalar(Math.max(0.001, easeOutBack(enterT(env, 500))));
      
      models.forEach(({ mesh, block }) => {
        const a = anims.get(block.id)!;
        const showBeat = a.show ?? a.paint ?? offset;
        const ts = beatT(env.beats, showBeat, totalBeats, env.p);
        
        let gy = block.y;
        for (const sh of a.shifts) {
            const t = beatT(env.beats, sh.beat, totalBeats, env.p);
            if (t <= 0) continue;
            gy = gy + (sh.y - gy) * easeInOutCubic(clamp01((t - 0.2) / 0.55));
        }

        const bw = (block.w / GRID) * (spreadX * 2.0 * 0.95);
        const bh = (block.h / GRID) * (spreadY * 2.0 * 0.85);
        const cx = (block.x / GRID - 0.5) * (spreadX * 2.0 * 0.95) + bw / 2;
        const cy = (0.5 - gy / GRID) * (spreadY * 2.0 * 0.85) - bh / 2 - (spreadY * 2.0 * 0.05);

        mesh.visible = ts > 0 || gIn > 0; // if skeleton, it's visible but faint
        const pop = ts > 0 ? easeOutBack(clamp01(ts / 0.3)) : 0;
        
        const tp = a.paint !== null ? beatT(env.beats, a.paint, totalBeats, env.p) : 0;
        const painted = tp > 0;
        const hydrate = easeOutCubic(clamp01(tp / 0.4));
        const isActivePaint = a.paint !== null && active === a.paint;
        
        // Follow browser parent transforms roughly
        mesh.position.set(cx, cy + bBob, 0.2 + (isActivePaint ? 0.1 : 0));
        
        // Convert to local scale of the block
        mesh.scale.setScalar(Math.max(0.001, ts > 0 ? (0.9 + 0.1 * pop) : 0.9 * gIn));

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                if (!painted && ts <= 0) {
                    mat.opacity = 0.1 * gIn;
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
                } else if (!painted && ts > 0) {
                    mat.opacity = 0.4 * gIn;
                    mat.color.setStyle(THEME.panel);
                    mat.emissive.setStyle(THEME.panel);
                } else {
                    mat.opacity = 0.95 * gIn;
                    const fill = roleFill(block.role, palette);
                    if (fill) {
                        mat.color.setStyle(fill);
                        mat.emissive.setStyle(fill);
                    } else {
                        mat.color.setStyle(THEME.panel);
                        mat.emissive.setStyle(THEME.panel);
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

  const browserBob = Math.sin(env.elapsedMs / 2000) * 0.15;
  const get2D = (x: number, y: number, z: number) => projectToRect(cam, new THREE.Vector3(x, y + browserBob, z), rect);
  
  // 2D overlays
  ctx.save();
  ctx.globalAlpha = base;

  // URL Bar overlaid on top
  const barTopL = get2D(-spreadX, spreadY, 0.2);
  const barBotR = get2D(spreadX, spreadY * 0.85, 0.2);
  const px0 = barTopL.x;
  const pw = barBotR.x - barTopL.x;
  const py0 = barBotR.y;
  const barH = barBotR.y - barTopL.y;

  const lights = ["#f87171", THEME.warn, THEME.good] as const;
  lights.forEach((c, i) => {
    ctx.fillStyle = rgba(c, 0.5);
    ctx.beginPath();
    ctx.arc(px0 + unit * 0.8 + i * unit * 0.6, py0 - Math.abs(barH) / 2, unit * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });

  const fx = px0 + unit * 2.8;
  const fw = pw - unit * 2.8 - unit * 0.6;
  const fh = unit * 1.05;
  const fy = py0 - Math.abs(barH) / 2 - fh / 2;
  
  roundRect(ctx, fx, fy, fw, fh, fh / 2);
  ctx.fillStyle = "rgba(10,14,19,0.7)";
  ctx.fill();
  roundRect(ctx, fx, fy, fw, fh, fh / 2);
  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const t0 = beatT(env.beats, 0, totalBeats, env.p);
  const typed = Math.round(clamp01(t0 / 0.85) * scene.url.length);
  const urlPx = fitFontSize(ctx, scene.url, {
    maxW: fw - unit * 2.0,
    startPx: unit * 0.6,
    minPx: unit * 0.36,
    weight: 500,
    family: FONT_MONO,
  });
  ctx.font = `500 ${urlPx}px ${FONT_MONO}`;
  const shown = scene.url.slice(0, typed);
  const textX = fx + unit * 1.05;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(shown, textX, fy + fh / 2 + urlPx * 0.35);
  if (Math.floor(env.elapsedMs / CARET_MS) % 2 === 0) {
    const cw2 = ctx.measureText(shown).width;
    ctx.fillStyle = accent;
    ctx.fillRect(textX + cw2 + unit * 0.08, fy + fh * 0.22, unit * 0.07, fh * 0.56);
  }

  // Badges
  const badges: { text: string; beat: number }[] = [];
  scene.steps.forEach((st, k) => {
    if (st.badge) badges.push({ text: st.badge, beat: offset + k });
  });
  const shownBadges = badges.filter((b) => beatT(env.beats, b.beat, totalBeats, env.p) > 0);
  let bx = fx + fw - unit * 0.25;
  for (let i = shownBadges.length - 1; i >= 0; i--) {
    const b = shownBadges[i];
    const bt = beatT(env.beats, b.beat, totalBeats, env.p);
    const pop = easeOutBack(clamp01(bt / 0.25));
    const newest = i === shownBadges.length - 1;
    ctx.font = `600 ${unit * 0.5}px ${FONT_MONO}`;
    const tw = ctx.measureText(b.text).width;
    const bw = tw + unit * 0.55;
    const bh = unit * 0.78;
    bx -= bw;
    const by = fy + (fh - bh) / 2;
    ctx.save();
    ctx.globalAlpha = base * (newest ? 1 : 0.5) * clamp01(bt * 4);
    ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.strokeStyle = rgba(accent, newest ? 0.9 : 0.5);
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.fillStyle = newest ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(b.text, bx + bw / 2, by + bh / 2 + unit * 0.18);
    ctx.restore();
    bx -= unit * 0.2;
  }

  // 2D overlays on blocks (glyphs)
  for (const b of scene.blocks) {
    const a = anims.get(b.id)!;
    const showBeat = a.show ?? a.paint ?? offset;
    const ts = beatT(env.beats, showBeat, totalBeats, env.p);
    if (ts <= 0) continue;

    let gy = b.y;
    for (const sh of a.shifts) {
      const t = beatT(env.beats, sh.beat, totalBeats, env.p);
      if (t <= 0) continue;
      gy = gy + (sh.y - gy) * easeInOutCubic(clamp01((t - 0.2) / 0.55));
    }

    const bw3 = (b.w / GRID) * (spreadX * 2.0 * 0.95);
    const bh3 = (b.h / GRID) * (spreadY * 2.0 * 0.85);
    const cx3 = (b.x / GRID - 0.5) * (spreadX * 2.0 * 0.95) + bw3 / 2;
    const cy3 = (0.5 - gy / GRID) * (spreadY * 2.0 * 0.85) - bh3 / 2 - (spreadY * 2.0 * 0.05);

    const tl = get2D(cx3 - bw3 / 2, cy3 + bh3 / 2, 0.2);
    const br = get2D(cx3 + bw3 / 2, cy3 - bh3 / 2, 0.2);
    
    const rRect: Rect = {
      x: tl.x,
      y: tl.y,
      w: br.x - tl.x,
      h: br.y - tl.y,
      cx: (tl.x + br.x) / 2,
      cy: (tl.y + br.y) / 2,
    };

    const tp = a.paint !== null ? beatT(env.beats, a.paint, totalBeats, env.p) : 0;
    const painted = tp > 0;
    const pop = easeOutBack(clamp01(ts / 0.3));

    ctx.save();
    ctx.globalAlpha = base * clamp01(ts * 4);
    ctx.translate(rRect.cx, rRect.cy);
    ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
    ctx.translate(-rRect.cx, -rRect.cy);
    
    drawGlyphs(ctx, b.role, rRect, unit, painted, env.elapsedMs, palette);
    ctx.restore();
  }

  ctx.restore();
  ctx.textAlign = "start";
}
