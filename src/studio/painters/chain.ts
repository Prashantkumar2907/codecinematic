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
  sub,
  clamp01,
  enterT,
  wrapText,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  beatT,
  beatWindow,
  activeBeatIndex,
} from "./common";
import type { PaintEnv } from "./index";

type ChainScene = Extract<Scene, { kind: "chain" }>;
type Card = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const DEG = Math.PI / 180;
const TIP_ANGLE = 12;
const LEAN_ANGLE = 4;
const FALL_ANGLE = 14;

export function paintChain(ctx: CanvasRenderingContext2D, scene: ChainScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.links.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const ghostIn = easeOutCubic(enterT(env, 420));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, Math.max(env.p, enterT(env, 380) * 0.12), accent) + unit * 0.4;
  let availH = contentH - titleBand;
  if (vertical) availH = Math.min(availH, layout.h * 0.86 - (contentY + titleBand));

  const rects: Card[] = [];
  if (!vertical) {
    const gap = unit * 0.9;
    const cardW = Math.min(unit * 5.2, (contentW - (n - 1) * gap) / n);
    const cardH = unit * 3;
    const totalW = n * cardW + (n - 1) * gap;
    const startX = contentX + (contentW - totalW) / 2;
    const baseY = contentY + titleBand + (availH - cardH) / 2;
    for (let i = 0; i < n; i++) {
      const x = startX + i * (cardW + gap);
      const y = baseY + (i % 2 === 0 ? -1 : 1) * unit * 1.2;
      rects.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2, cy: y + cardH / 2 });
    }
  } else {
    const gap = unit * 0.7;
    const cardW = contentW * 0.72;
    const cardH = Math.min(unit * 3, (availH - (n - 1) * gap) / n);
    const totalH = n * cardH + (n - 1) * gap;
    const startY = contentY + titleBand + (availH - totalH) / 2;
    const baseX = contentX + (contentW - cardW) / 2;
    for (let i = 0; i < n; i++) {
      const x = baseX + (i % 2 === 0 ? -1 : 1) * unit * 1.5;
      const y = startY + i * (cardH + gap);
      rects.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2, cy: y + cardH / 2 });
    }
  }

  const sideOf = (from: number, to: number) => (Math.sign(rects[to].cx - rects[from].cx) || 1) as 1 | -1;
  const edgeTowards = (a: Card, b: Card) => {
    if (!vertical) return { x: b.cx > a.cx ? a.x + a.w : a.x, y: a.cy };
    return { x: a.cx, y: b.cy > a.cy ? a.y + a.h : a.y };
  };

  // 2D Connector arrows + impact rings
  for (let k = 1; k < n; k++) {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) continue;
    const pts = [edgeTowards(rects[k - 1], rects[k]), edgeTowards(rects[k], rects[k - 1])];
    const progress = easeInOutCubic(sub(t, 0.04, 0.3));
    const isCurrent = active === offset + k;
    ctx.save();
    ctx.globalAlpha = isCurrent ? 0.9 : 0.4;
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = unit * 0.18;
    ctx.lineCap = "round";
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.4;
    }
    const tip = strokePolylineProgress(ctx, pts, progress);
    ctx.shadowBlur = 0;
    if (progress > 0.25) drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.5);
    ctx.restore();

    const rt = sub(t, 0.15, 0.28);
    if (rt > 0 && rt < 1) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      ctx.save();
      ctx.globalAlpha = (1 - rt) * 0.85;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.14;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, unit * 0.4 + unit * 1.0 * easeOutCubic(rt), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const scale = vertical ? 9 / availH : 11 / contentW;
  const worldPos = (px: number, py: number) => {
     const cx = (px - (contentX + contentW/2)) * scale;
     const cy = (py - (contentY + titleBand + availH/2)) * scale;
     return new THREE.Vector3(cx, 0, cy);
  };

  const key = scene.id + "-chain3d";
  const rect3d = { x: contentX, y: contentY + titleBand, w: contentW, h: availH };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 9, vertical ? 10 : 7.5);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, "rgba(148,163,184,0.5)");
    
    const spreadMax = vertical ? 5 : 6;
    const grid = new THREE.GridHelper(spreadMax * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadMax * 4, spreadMax * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Make dominoes
    const models = scene.links.map((link, i) => {
      const g = new THREE.Group(); // Pivot group
      // 2D cards were w, h. Let's make them 3D blocks.
      const cw = rects[i].w * scale;
      const ch = rects[i].h * scale;
      const blockColor = "#1e293b";
      const edgeColor = accent;
      
      const mesh = makeBlock(cw, ch, 0.4, blockColor, edgeColor);
      mesh.position.y = ch / 2; // Move up so pivot is at bottom
      g.add(mesh);
      s.add(g);
      return { id: i, group: g, mesh, ch, cw };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ id, group, mesh, ch, cw }) => {
        const t = beatT(env.beats, offset + id, totalBeats, env.p);
        const isActive = active === offset + id;
        const isLast = id === n - 1;
        
        group.visible = ghostIn > 0;
        
        const wp = worldPos(rects[id].cx, rects[id].cy);
        // Base position at bottom center
        group.position.set(wp.x, -0.5, wp.z);
        group.rotation.set(0, 0, 0);
        
        if (t <= 0) {
          group.scale.setScalar(Math.max(0.001, 0.9 * ghostIn));
          mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.Material;
                mat.transparent = true;
                mat.opacity = 0.2 * ghostIn;
            }
          });
          return;
        }

        const appear = easeOutCubic(clamp01(t / 0.35));
        const alpha = isActive || (isLast && inTail) ? 1 : active > offset + id ? 0.62 : 1;
        
        mesh.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.Material;
              mat.transparent = true;
              mat.opacity = appear * alpha;
          }
        });

        const signIn = id === 0 ? 1 : sideOf(id, id - 1) * -1;
        const entrance = signIn * FALL_ANGLE * (1 - easeOutBack(clamp01(t / 0.35)));
        
        let rotZ = 0;
        let rotX = 0;

        if (entrance !== 0) {
           if (vertical) {
             rotX = -entrance * DEG;
           } else {
             rotZ = entrance * DEG;
           }
        }

        if (id < n - 1) {
          const t2 = beatT(env.beats, offset + id + 1, totalBeats, env.p);
          if (t2 > 0) {
            let tipAngle = 0;
            if (t2 <= 0.18) {
              tipAngle = TIP_ANGLE * easeInOutCubic(t2 / 0.18);
            } else {
              tipAngle = TIP_ANGLE + (LEAN_ANGLE - TIP_ANGLE) * easeOutCubic(sub(t2, 0.18, 0.2));
            }
            const st = vertical ? Math.sign(rects[id+1].cy - rects[id].cy) : sideOf(id, id + 1);
            if (vertical) {
              rotX = -st * tipAngle * DEG;
            } else {
              rotZ = -st * tipAngle * DEG;
            }
          }
        }

        if (isActive && !inTail && t > 0.5) {
          const wob = Math.sin(elapsedMs / 700) * 0.6 * DEG;
          if (vertical) rotZ += wob; // wobble opposite to fall axis
          else rotX += wob;
        }
        
        group.rotation.set(rotX, 0, rotZ);
        
        let pulse = 1;
        if (isLast && inTail) {
          pulse = 1 + 0.015 * (0.5 + 0.5 * Math.sin(elapsedMs / 500));
        }
        group.scale.setScalar(Math.max(0.001, appear * pulse));
        
        if (isActive || (isLast && inTail)) {
          // Add a glow effect natively? No, 2D handles glows over it better, but we can't cleanly glow 3D from 2D easily unless we trace.
          // The edges are already bright.
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect3d, build, env.elapsedMs, null, env);
  if (!cam) return;

  const drawNumberChip = (rect: Card, i: number, hot: boolean, ghost: boolean) => {
    const chipR = unit * 0.42;
    const chipX = rect.x + unit * 0.62;
    const chipY = rect.y + unit * 0.62;
    ctx.beginPath();
    ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
    ctx.fillStyle = hot ? accent : "rgba(148,163,184,0.16)";
    if (ghost) ctx.fillStyle = "rgba(148,163,184,0.1)";
    ctx.fill();
    ctx.fillStyle = hot ? "#06121a" : accent;
    if (ghost) ctx.fillStyle = THEME.textDim;
    ctx.font = `700 \${unit * 0.5}px \${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), chipX, chipY + unit * 0.18);
    ctx.textAlign = "start";
  };

  scene.links.forEach((link, i) => {
    const rect = rects[i];
    const t = beatT(env.beats, offset + i, totalBeats, env.p);

    if (t <= 0) {
      if (ghostIn <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.2 * ghostIn;
      
      const wp = worldPos(rect.cx, rect.cy);
      const projCenter = projectToRect(cam, new THREE.Vector3(wp.x, 0, wp.z), rect3d);
      
      // Rough projection for text chip
      drawNumberChip({ ...rect, x: projCenter.x - rect.w/2, y: projCenter.y - rect.h/2 }, i, false, true);
      ctx.restore();
      return;
    }

    const isActive = active === offset + i;
    const appear = easeOutCubic(clamp01(t / 0.35));
    const isLast = i === n - 1;
    const alpha = isActive || (isLast && inTail) ? 1 : active > offset + i ? 0.62 : 1;

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    
    // Compute 2D position for overlay text by projecting the center of the 3D block
    const wp = worldPos(rect.cx, rect.cy);
    
    // We must apply the same rotations to find the center face
    const signIn = i === 0 ? 1 : sideOf(i, i - 1) * -1;
    const entrance = signIn * FALL_ANGLE * (1 - easeOutBack(clamp01(t / 0.35)));
    let rotZ = 0;
    let rotX = 0;
    if (entrance !== 0) {
       if (vertical) rotX = -entrance * DEG;
       else rotZ = entrance * DEG;
    }

    if (i < n - 1) {
      const t2 = beatT(env.beats, offset + i + 1, totalBeats, env.p);
      if (t2 > 0) {
        let tipAngle = t2 <= 0.18 ? TIP_ANGLE * easeInOutCubic(t2 / 0.18) : TIP_ANGLE + (LEAN_ANGLE - TIP_ANGLE) * easeOutCubic(sub(t2, 0.18, 0.2));
        const st = vertical ? Math.sign(rects[i+1].cy - rects[i].cy) : sideOf(i, i + 1);
        if (vertical) rotX = -st * tipAngle * DEG;
        else rotZ = -st * tipAngle * DEG;
      }
    }

    if (isActive && !inTail && t > 0.5) {
      const wob = Math.sin(env.elapsedMs / 700) * 0.6 * DEG;
      if (vertical) rotZ += wob;
      else rotX += wob;
    }
    
    // 3D math to find center of the front face
    const ch = rect.h * scale;
    const centerPoint = new THREE.Vector3(0, ch/2, 0.21); // slightly in front of the block
    const euler = new THREE.Euler(rotX, 0, rotZ, 'XYZ');
    centerPoint.applyEuler(euler);
    centerPoint.add(new THREE.Vector3(wp.x, -0.5, wp.z));
    
    const projCenter = projectToRect(cam, centerPoint, rect3d);

    const projectedRect = {
      ...rect,
      x: projCenter.x - rect.w/2,
      y: projCenter.y - rect.h/2,
      cx: projCenter.x,
      cy: projCenter.y
    };

    drawNumberChip(projectedRect, i, isActive, false);

    const maxTextW = rect.w - unit * 1.1;
    let px = unit * (vertical ? 0.8 : 0.72);
    ctx.font = `600 \${px}px \${FONT_SANS}`;
    const maxLines = link.icon ? 2 : 3;
    let lines = wrapText(ctx, link.text, maxTextW);
    if (lines.length > maxLines) {
      px = unit * (vertical ? 0.64 : 0.6);
      ctx.font = `600 \${px}px \${FONT_SANS}`;
      lines = wrapText(ctx, link.text, maxTextW).slice(0, maxLines);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = THEME.text;
    const lineH = px * 1.25;
    if (link.icon) {
      const iconPx = Math.min(rect.h * 0.3, unit * 0.9);
      const blockH = iconPx * 1.3 + lines.length * lineH;
      const top = projectedRect.cy - blockH / 2;
      ctx.font = `\${iconPx}px \${FONT_SANS}`;
      ctx.fillText(link.icon, projectedRect.cx, top + iconPx * 0.95);
      ctx.font = `600 \${px}px \${FONT_SANS}`;
      lines.forEach((line, li) => ctx.fillText(line, projectedRect.cx, top + iconPx * 1.3 + px * 0.85 + li * lineH));
    } else {
      const y0 = projectedRect.cy - ((lines.length - 1) * lineH) / 2 + px * 0.35;
      lines.forEach((line, li) => ctx.fillText(line, projectedRect.cx, y0 + li * lineH));
    }
    ctx.textAlign = "start";
    ctx.restore();
  });
  ctx.textAlign = "start";
}
