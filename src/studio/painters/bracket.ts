import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BracketScene = Extract<Scene, { kind: "bracket" }>;
type Pt = { x: number; y: number };

type MatchMeta = {
  beat: number;
  col: number;
  winnerSlot: number;
  loserSlot: number;
};

export function paintBracket(ctx: CanvasRenderingContext2D, scene: BracketScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.matches.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent) + unit * 0.4;
  const ghostIn = easeOutCubic(enterT(env, 400));

  const n = scene.contenders.length;

  const roundMatchCount: number[] = [];
  {
    let field = n;
    while (field > 1) {
      const m = Math.floor(field / 2);
      roundMatchCount.push(m);
      field = m + (field % 2);
    }
  }
  const nRounds = roundMatchCount.length;

  const cols: number[][] = [];
  const producedBy: number[][] = [];
  const feeders: number[][][] = [];
  cols[0] = scene.contenders.map((_, i) => i);
  producedBy[0] = scene.contenders.map(() => -1);
  feeders[0] = scene.contenders.map(() => []);

  const matchMeta: MatchMeta[] = [];
  let g = 0;
  for (let c = 0; c < nRounds; c++) {
    const partic = cols[c];
    const next: number[] = [];
    const nextProd: number[] = [];
    const nextFeed: number[][] = [];
    let slot = 0;
    for (let mm = 0; mm < roundMatchCount[c]; mm++) {
      const topSlot = slot;
      const botSlot = slot + 1;
      const wi = Math.max(0, Math.min(1, scene.matches[g].winner));
      const winnerSlot = wi === 0 ? topSlot : botSlot;
      const loserSlot = wi === 0 ? botSlot : topSlot;
      next.push(partic[winnerSlot]);
      nextProd.push(g);
      nextFeed.push([topSlot, botSlot]);
      matchMeta.push({ beat: offset + g, col: c, winnerSlot, loserSlot });
      slot += 2;
      g++;
    }
    while (slot < partic.length) {
      next.push(partic[slot]);
      nextProd.push(-1);
      nextFeed.push([slot]);
      slot++;
    }
    cols[c + 1] = next;
    producedBy[c + 1] = nextProd;
    feeders[c + 1] = nextFeed;
  }

  const totalCols = cols.length;
  const colSpacing = contentW / totalCols;
  const chipW = Math.min(colSpacing * 0.86, unit * (vertical ? 3.4 : 5.2));
  const rowGap = (contentH - band - (vertical ? unit * 1.2 : 0)) / n;
  const chipH = Math.min(rowGap * 0.66, unit * (vertical ? 1.3 : 1.5));
  const top = contentY + band;
  const colCenterX = (c: number) => contentX + colSpacing * (c + 0.5);

  const yPos: number[][] = [];
  yPos[0] = cols[0].map((_, s) => top + rowGap * (s + 0.5));
  for (let c = 1; c < totalCols; c++) {
    yPos[c] = cols[c].map((_, s) => {
      const fs = feeders[c][s];
      return fs.reduce((acc, f) => acc + yPos[c - 1][f], 0) / fs.length;
    });
  }

  const roleOf = new Map<string, { m: MatchMeta; win: boolean }>();
  for (const m of matchMeta) {
    roleOf.set(`${m.col}:${m.winnerSlot}`, { m, win: true });
    roleOf.set(`${m.col}:${m.loserSlot}`, { m, win: false });
  }

  const fillOf = (c: number, s: number): number => {
    if (c === 0) return 1;
    const gm = producedBy[c][s];
    if (gm < 0) return 1;
    const bw = beatWindow(env.beats, offset + gm, totalBeats);
    const span = Math.max(bw.end - bw.start, 0.001);
    return clamp01((env.p - (bw.start + 0.42 * span)) / (0.4 * span));
  };

  const finalBeatEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const championDecided = env.p >= finalBeatEnd;

  // --- 3D Context ---
  const areaX = contentX;
  const areaY = top;
  const areaW = contentW;
  const areaH = contentH - band;
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  const spreadX = 5.5;
  const spreadZ = 3.5;
  const worldPos = (px: number, py: number) => {
    const nx = (px - areaX) / areaW - 0.5;
    const nz = (py - areaY) / areaH - 0.5;
    return new THREE.Vector3(nx * spreadX * 2, 0, nz * spreadZ * 2);
  };

  const key = scene.id + "-bracket3d";

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 10, 7);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, "rgba(148,163,184,0.5)");

    const grid = new THREE.GridHelper(16, 16, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: any[] = [];
    
    const w3d = (chipW / areaW) * spreadX * 2 * 1.1;
    const d3d = (chipH / areaH) * spreadZ * 2 * 1.5;

    for (let c = 0; c < totalCols; c++) {
      for (let sIdx = 0; sIdx < cols[c].length; sIdx++) {
        const mesh = makeBlock(w3d, 0.5, d3d, "#0b0f15", accent);
        s.add(mesh);
        models.push({ c, s: sIdx, mesh });
      }
    }

    const update = (elapsedMs: number) => {
      models.forEach(({ c, s: sIdx, mesh }) => {
        const cx = colCenterX(c);
        const cy = yPos[c][sIdx];
        const fill = fillOf(c, sIdx);
        
        if (fill <= 0) {
            mesh.visible = false;
            return;
        }
        mesh.visible = true;

        const role = roleOf.get(`${c}:${sIdx}`);
        const isActive = role ? active === role.m.beat : false;
        const isChampion = c === totalCols - 1;
        
        const beatWin = role ? beatWindow(env.beats, role.m.beat, totalBeats) : null;
        const past = role && beatWin ? env.p >= beatWin.end : false;
        const isLoser = role ? !role.win : false;
        const isWinner = role ? role.win : false;
        
        let flash = 0;
        if (isActive && role && beatWin && isWinner) {
          const span = Math.max(beatWin.end - beatWin.start, 0.001);
          flash = easeOutCubic(clamp01((env.p - (beatWin.start + 0.6 * span)) / (0.3 * span)));
        }

        const goldBorder = flash > 0 || (isChampion && championDecided);
        const borderColorHex = goldBorder
          ? THEME.warn
          : isActive
            ? accent
            : isWinner && past
              ? rgba(accent, 0.55)
              : isLoser && past
                ? "#4a5568"
                : rgba(secondary, 0.55);
        
        const faceColorHex = goldBorder ? "#1f1807" : isActive ? "#0e2433" : THEME.panel;

        mesh.children.forEach((child: any) => {
            if (child.type === "LineSegments") {
                child.material.color.set(borderColorHex);
            } else if (child.type === "Mesh") {
                child.material.color.set(faceColorHex);
                child.material.emissive.set(faceColorHex);
            }
        });

        const pop = fill < 1 ? easeOutBack(fill) : 1;
        let scale = pop;
        if (isActive) {
          scale = pop * (1 + 0.04 * (idle(env, 1600) - 0.5));
        }
        if (isChampion && championDecided) {
          scale = pop * (1 + 0.06 * (idle(env, 3100) - 0.5));
        }

        mesh.scale.setScalar(Math.max(0.001, scale));
        
        const wp = worldPos(cx, cy);
        const bob = Math.sin(elapsedMs / 1000 + c * 0.5 + sIdx) * 0.05;
        mesh.position.copy(wp);
        mesh.position.y = (isActive ? 0.2 : 0) + bob;
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  // Recompute 2D projection logic for drawing lines + text
  const proj2d = (px: number, py: number, yOffset = 0) => {
    const wp = worldPos(px, py);
    wp.y += yOffset;
    return projectToRect(cam, wp, rect);
  };

  const drawElbow = (fx: number, fy: number, kx: number, ky: number): Pt[] => {
    const f2 = proj2d(fx, fy);
    const k2 = proj2d(kx, ky);
    const mx = (fx + kx) / 2;
    const m1 = proj2d(mx, fy);
    const m2 = proj2d(mx, ky);
    return [f2, m1, m2, k2];
  };

  const strokePts = (pts: Pt[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let c = 1; c < totalCols; c++) {
    for (let s = 0; s < cols[c].length; s++) {
      const gm = producedBy[c][s];
      if (gm < 0) continue; 
      const kx = colCenterX(c) - chipW / 2;
      const ky = yPos[c][s];
      const bw = beatWindow(env.beats, offset + gm, totalBeats);
      const decided = env.p >= bw.start;
      for (const f of feeders[c][s]) {
        const fx = colCenterX(c - 1) + chipW / 2;
        const fy = yPos[c - 1][f];
        const pts = drawElbow(fx, fy, kx, ky);
        const role = roleOf.get(`${c - 1}:${f}`);
        const isWinnerLine = role?.win ?? false;
        ctx.save();
        if (decided && isWinnerLine) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rgba(accent, 0.8);
          ctx.lineWidth = unit * 0.08;
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.3;
        } else {
          ctx.globalAlpha = 0.28 * (env.p > 0 ? 1 : ghostIn);
          ctx.strokeStyle = "rgba(148,163,184,0.5)";
          ctx.lineWidth = unit * 0.05;
        }
        strokePts(pts);
        ctx.restore();
      }
    }
  }

  for (let c = 0; c < totalCols; c++) {
    for (let s = 0; s < cols[c].length; s++) {
      const cx = colCenterX(c);
      const cy = yPos[c][s];
      const isChampion = c === totalCols - 1;
      const fill = fillOf(c, s);

      if (fill <= 0) {
        const gi = env.p > 0 ? 1 : ghostIn;
        if (gi <= 0) continue;
        const x = cx - chipW / 2;
        const y = cy - chipH / 2;
        ctx.save();
        ctx.globalAlpha = 0.16 * gi;
        roundRect(ctx, x, y, chipW, chipH, unit * 0.28);
        ctx.strokeStyle = "rgba(148,163,184,0.7)";
        ctx.lineWidth = unit * 0.045;
        ctx.setLineDash([unit * 0.3, unit * 0.25]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }

      const role = roleOf.get(`${c}:${s}`);
      const isActive = role ? active === role.m.beat : false;
      const beatWin = role ? beatWindow(env.beats, role.m.beat, totalBeats) : null;
      const past = role && beatWin ? env.p >= beatWin.end : false;
      const isLoser = role ? !role.win : false;
      const isWinner = role ? role.win : false;

      let flash = 0;
      if (isActive && role && beatWin && isWinner) {
        const span = Math.max(beatWin.end - beatWin.start, 0.001);
        flash = easeOutCubic(clamp01((env.p - (beatWin.start + 0.6 * span)) / (0.3 * span)));
      }

      let alpha = 1;
      if (isLoser && past) alpha = 0.35;
      else if (isWinner && past && !isChampion) alpha = 0.72;

      const goldBorder = flash > 0 || (isChampion && championDecided);
      
      const bob = Math.sin(env.elapsedMs / 1000 + c * 0.5 + s) * 0.05;
      const yOffset = (isActive ? 0.2 : 0) + bob + 0.28; // place text above block
      const spCenter = proj2d(cx, cy, yOffset);
      const spLeft = proj2d(cx - chipW/2 + unit*0.45, cy, yOffset);
      const spRight = proj2d(cx + chipW/2 - unit*0.3, cy, yOffset);

      ctx.save();
      ctx.globalAlpha = alpha;

      const cont = scene.contenders[cols[c][s]];
      const availW = chipW - unit * 0.9;
      let iconW = 0;
      if (cont.icon) {
        const ip = Math.min(chipH * 0.5, unit * 0.75);
        ctx.font = `${ip}px ${FONT_SANS}`;
        iconW = ctx.measureText(cont.icon).width + unit * 0.2;
      }
      const px = fitFontSize(ctx, cont.label, {
        maxW: availW - iconW,
        startPx: chipH * 0.44,
        minPx: unit * 0.4,
        weight: 700,
      });
      
      let labelX = spLeft.x;
      if (cont.icon) {
        ctx.font = `${Math.min(chipH * 0.5, unit * 0.75)}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.text;
        ctx.fillText(cont.icon, labelX, spCenter.y + px * 0.36);
        labelX += iconW;
      }
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = isLoser && past ? THEME.textDim : goldBorder ? THEME.warn : THEME.text;
      ctx.fillText(cont.label, labelX, spCenter.y + px * 0.36);

      if (goldBorder) {
        ctx.fillStyle = THEME.warn;
        ctx.font = `800 ${chipH * 0.5}px ${FONT_SANS}`;
        ctx.textAlign = "right";
        ctx.fillText(isChampion && championDecided ? "▲" : "✓", spRight.x, spCenter.y + chipH * 0.18);
        ctx.textAlign = "start";
      }
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
