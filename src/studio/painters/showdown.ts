import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  wrapText,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type ShowdownScene = Extract<Scene, { kind: "showdown" }>;

export function paintShowdown(ctx: CanvasRenderingContext2D, scene: ShowdownScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const nRounds = scene.rounds.length;
  const verdictBeat = scene.sayVerdict ? offset + nRounds : -1;
  const totalBeats = offset + nRounds + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 400));

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent, { centered: true }) + unit * 0.3;

  const roundLanded = (k: number): number => {
    const bw = beatWindow(env.beats, offset + k, totalBeats);
    const span = Math.max(bw.end - bw.start, 0.001);
    return clamp01((env.p - (bw.start + 0.35 * span)) / (0.25 * span));
  };
  let leftScore = 0;
  let rightScore = 0;
  scene.rounds.forEach((r, k) => {
    if (roundLanded(k) >= 1) {
      if (r.winner === "left") leftScore++;
      else if (r.winner === "right") rightScore++;
    }
  });

  const verdictActive = verdictBeat >= 0 && active >= verdictBeat;
  const verdictT = verdictBeat >= 0 ? easeOutCubic(clamp01(beatT(env.beats, verdictBeat, totalBeats, env.p) * 2.2)) : 0;
  const leftWins = leftScore > rightScore;
  const rightWins = rightScore > leftScore;

  const cardW = contentW * (vertical ? 0.44 : 0.3);
  const cardH = Math.min(unit * (vertical ? 4.6 : 4.2), contentH * 0.32);
  const cardTop = contentY + band;
  const leftX = contentX;
  const rightX = contentX + contentW - cardW;

  const activeRound = active >= offset && active < offset + nRounds ? active - offset : -1;
  const clashE = activeRound >= 0 ? easeOutCubic(clamp01((beatT(env.beats, offset + activeRound, totalBeats, env.p) - 0.15) / 0.35)) : 0;
  const activeWinner = activeRound >= 0 ? scene.rounds[activeRound].winner : null;

  const rowsTop = cardTop + cardH + unit * (vertical ? 1.1 : 0.9);
  const verdictSpace = scene.verdict || scene.sayVerdict ? unit * (vertical ? 5.2 : 2.4) : unit * 0.4;
  const rowsAvailH = contentY + contentH - rowsTop - verdictSpace;
  const rowGap = Math.min(rowsAvailH / nRounds, unit * (vertical ? 2.4 : 1.9));
  const rowsStart = rowsTop + Math.max(0, (rowsAvailH - nRounds * rowGap) / 2);
  const rowH = rowGap * 0.82;

  // --- 3D Context ---
  const areaX = contentX;
  const areaY = contentY + band;
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

  const key = scene.id + "-showdown3d";

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 10, 7);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

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

    const w3dCard = (cardW / areaW) * spreadX * 2 * 1.05;
    const d3dCard = (cardH / areaH) * spreadZ * 2 * 1.05;
    const leftCard = makeBlock(w3dCard, 0.5, d3dCard, "#0b0f15", accent);
    const rightCard = makeBlock(w3dCard, 0.5, d3dCard, "#0b0f15", secondary);
    s.add(leftCard);
    s.add(rightCard);

    const w3dRow = (contentW / areaW) * spreadX * 2 * 0.95;
    const d3dRow = (rowH / areaH) * spreadZ * 2 * 1.1;
    const rowBlocks: THREE.Group[] = [];
    for (let i = 0; i < nRounds; i++) {
        const rb = makeBlock(w3dRow, 0.3, d3dRow, THEME.panel, THEME.panelBorder);
        s.add(rb);
        rowBlocks.push(rb);
    }

    const update = (elapsedMs: number) => {
        const updateFighter = (side: "left" | "right", mesh: THREE.Group) => {
            const isLeft = side === "left";
            const x = isLeft ? leftX : rightX;
            const colorHex = isLeft ? accent : secondary;
            const isVictor = verdictActive && (isLeft ? leftWins : rightWins);
            const isDefeated = verdictActive && (isLeft ? rightWins : leftWins);
            
            const leanDir = isLeft ? 1 : -1;
            const leaning = activeWinner === side ? 1 : activeWinner === "tie" ? 0.5 : 0.35;
            const lean = clashE * leanDir * unit * 0.9 * leaning;
            
            let scale = 1;
            if (isVictor) scale = 1 + 0.12 * verdictT;
            const breathe = active === offset - 1 || activeRound >= 0 ? 1 + 0.03 * (idle(env, 1900) - 0.5) : 1;
            mesh.scale.setScalar(Math.max(0.001, scale * breathe));
            
            const ccx = x + cardW / 2 + lean;
            const ccy = cardTop + cardH / 2;
            const wp = worldPos(ccx, ccy);
            
            const bob = Math.sin(elapsedMs / 1000 + (isLeft ? 0 : 1)) * 0.05;
            mesh.position.copy(wp);
            mesh.position.y = (isVictor || activeWinner === side ? 0.2 : 0) + bob;
            
            mesh.rotation.z = -lean * 0.0015;

            const alpha = isDefeated ? 1 - 0.55 * verdictT : ghostIn > 0 ? 1 : ghostIn;
            const goldBorder = isVictor || activeWinner === side;
            const borderColorHex = isDefeated ? rgba(colorHex, 0.3) : colorHex;
            
            mesh.children.forEach((child: any) => {
                if (child.type === "LineSegments") {
                    child.material.color.set(borderColorHex);
                    child.material.transparent = true;
                    child.material.opacity = alpha;
                    if (goldBorder) child.material.linewidth = 2;
                } else if (child.type === "Mesh") {
                    child.material.transparent = true;
                    child.material.opacity = alpha;
                    child.material.emissive.set(THEME.panel);
                }
            });
        };

        updateFighter("left", leftCard);
        updateFighter("right", rightCard);

        rowBlocks.forEach((rb, k) => {
            const beat = offset + k;
            const bt = beatT(env.beats, beat, totalBeats, env.p);
            const isCurrent = active === beat;
            
            if (bt <= 0) {
                const gi = env.p > 0 ? 1 : ghostIn;
                if (gi <= 0) { rb.visible = false; return; }
                rb.visible = true;
                rb.scale.setScalar(1);
                const wp = worldPos(contentX + contentW / 2, rowsStart + k * rowGap + rowH / 2);
                rb.position.copy(wp);
                rb.position.y = 0;
                
                rb.children.forEach((child: any) => {
                    if (child.type === "LineSegments") {
                        child.material.color.set("rgba(148,163,184,0.6)");
                        child.material.opacity = 0.22 * gi;
                    } else if (child.type === "Mesh") {
                        child.material.opacity = 0.1 * gi;
                    }
                });
                return;
            }

            rb.visible = true;
            const appear = easeOutCubic(clamp01(bt * 3));
            const y = rowsStart + k * rowGap;
            const cx = contentX + contentW / 2 + (1 - appear) * unit * 1.2;
            const cy = y + rowH / 2;
            const wp = worldPos(cx, cy);
            
            rb.position.copy(wp);
            rb.position.y = isCurrent ? 0.2 : 0;
            rb.scale.setScalar(1);

            const borderColor = isCurrent ? rgba(accent, 0.6) : THEME.panelBorder;
            const faceColor = isCurrent ? "#0e2433" : THEME.panel;
            
            rb.children.forEach((child: any) => {
                if (child.type === "LineSegments") {
                    child.material.color.set(borderColor);
                    child.material.opacity = isCurrent ? 1 : 0.8;
                } else if (child.type === "Mesh") {
                    child.material.color.set(faceColor);
                    child.material.emissive.set(faceColor);
                    child.material.opacity = isCurrent ? 1 : 0.9;
                }
            });
        });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const proj2d = (px: number, py: number, yOffset = 0) => {
    const wp = worldPos(px, py);
    wp.y += yOffset;
    return projectToRect(cam, wp, rect);
  };

  // --- 2D Overlays ---
  const drawFighterText = (side: "left" | "right") => {
    const isLeft = side === "left";
    const x = isLeft ? leftX : rightX;
    const color = isLeft ? accent : secondary;
    const info = isLeft ? scene.left : scene.right;
    const score = isLeft ? leftScore : rightScore;
    const isVictor = verdictActive && (isLeft ? leftWins : rightWins);
    const isDefeated = verdictActive && (isLeft ? rightWins : leftWins);

    const leanDir = isLeft ? 1 : -1;
    const leaning = activeWinner === side ? 1 : activeWinner === "tie" ? 0.5 : 0.35;
    const lean = clashE * leanDir * unit * 0.9 * leaning;

    const ccx = x + cardW / 2 + lean;
    const ccy = cardTop + cardH / 2;
    const bob = Math.sin(env.elapsedMs / 1000 + (isLeft ? 0 : 1)) * 0.05;
    const yOffset = (isVictor || activeWinner === side ? 0.2 : 0) + bob + 0.26; // place text above block
    const sp = proj2d(ccx, ccy, yOffset);

    let scale = 1;
    if (isVictor) scale = 1 + 0.12 * verdictT;
    const breathe = active === offset - 1 || activeRound >= 0 ? 1 + 0.03 * (idle(env, 1900) - 0.5) : 1;

    ctx.save();
    ctx.globalAlpha = isDefeated ? 1 - 0.55 * verdictT : ghostIn > 0 ? 1 : ghostIn;
    
    ctx.translate(sp.x, sp.y);
    ctx.scale(scale * breathe, scale * breathe);
    ctx.translate(-sp.x, -sp.y);

    ctx.textAlign = "center";
    const iconPx = unit * 1.15;
    if (info.icon) {
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(info.icon, sp.x, sp.y - cardH * 0.2 + iconPx * 0.35);
    }
    const lpx = fitFontSize(ctx, info.label, { maxW: cardW - unit * 0.8, startPx: unit * 0.9, minPx: unit * 0.5, weight: 800 });
    ctx.font = `800 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = isDefeated ? THEME.textDim : THEME.text;
    ctx.fillText(info.label, sp.x, sp.y + cardH * 0.08);

    const scorePx = unit * 1.1;
    ctx.font = `900 ${scorePx}px ${FONT_MONO}`;
    ctx.fillStyle = color;
    const scorePop = 1 + 0.18 * easeOutBack(clamp01((activeWinner === side ? clashE : 0)));
    ctx.save();
    ctx.translate(sp.x, sp.y + cardH * 0.5 - unit * 0.55);
    ctx.scale(scorePop, scorePop);
    ctx.fillText(String(score), 0, scorePx * 0.35);
    ctx.restore();

    if (isVictor) {
      ctx.font = `800 ${unit * 1.1}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.warn;
      ctx.fillText("👑", sp.x, sp.y - cardH * 0.5 - unit * 0.35);
    }
    ctx.textAlign = "start";
    ctx.restore();
  };

  drawFighterText("left");
  drawFighterText("right");

  const vx = contentX + contentW / 2;
  const vy = cardTop + cardH / 2;
  const vsIn = easeOutBack(enterT(env, 450));
  if (vsIn > 0) {
    const spVS = proj2d(vx, vy, 0.2);
    const vsPulse = 1 + 0.1 * (idle(env, 1900) - 0.5);
    ctx.save();
    ctx.globalAlpha = ghostIn;
    ctx.translate(spVS.x, spVS.y);
    ctx.scale(vsIn * vsPulse, vsIn * vsPulse);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, unit * (vertical ? 0.95 : 1.0), 0, Math.PI * 2);
    ctx.fillStyle = "#06121a";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `900 ${unit * 0.78}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, unit * 0.28);
    ctx.textAlign = "start";
    ctx.restore();
  }

  scene.rounds.forEach((r, k) => {
    const beat = offset + k;
    const bt = beatT(env.beats, beat, totalBeats, env.p);
    const isCurrent = active === beat;
    const landed = roundLanded(k);
    const played = env.p >= beatWindow(env.beats, beat, totalBeats).start;

    if (bt <= 0) {
      const gi = env.p > 0 ? 1 : ghostIn;
      if (gi <= 0) return;
      const y = rowsStart + k * rowGap;
      const sp = proj2d(contentX + contentW / 2, y + rowH / 2, 0.16);
      ctx.save();
      ctx.globalAlpha = 0.22 * gi;
      ctx.font = `600 ${unit * 0.72}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(r.criterion, sp.x, sp.y + rowH * 0.14);
      ctx.textAlign = "start";
      ctx.restore();
      return;
    }

    const appear = easeOutCubic(clamp01(bt * 3));
    const y = rowsStart + k * rowGap;
    const cx = contentX + contentW / 2 + (1 - appear) * unit * 1.2;
    const cy = y + rowH / 2;
    const sp = proj2d(cx, cy, isCurrent ? 0.36 : 0.16);

    ctx.save();
    ctx.globalAlpha = isCurrent ? 1 : 0.9;
    
    const cpx = fitFontSize(ctx, r.criterion, { maxW: contentW * 0.44, startPx: unit * (vertical ? 0.9 : 0.82), minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${cpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(r.criterion, sp.x, sp.y - rowH * (r.note ? 0.06 : -0.12));
    if (r.note) {
      ctx.font = `500 ${unit * 0.55}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      const noteLine = wrapText(ctx, r.note, contentW * 0.5)[0] ?? r.note;
      ctx.fillText(noteLine, sp.x, sp.y + rowH * 0.28);
    }
    ctx.textAlign = "start";

    const markScale = easeOutBack(landed);
    const pill = (side: "left" | "right" | "tie") => {
      const isLeft = side === "left";
      const color = side === "tie" ? THEME.textDim : isLeft ? accent : secondary;
      const px = side === "tie" ? cx : isLeft ? contentX + rowH * 0.9 : contentX + contentW - rowH * 0.9;
      const spPill = proj2d(px, cy, isCurrent ? 0.36 : 0.16);
      
      ctx.save();
      ctx.globalAlpha = side === "tie" ? 0.7 : 1;
      ctx.translate(spPill.x, spPill.y);
      ctx.scale(Math.max(0.01, markScale), Math.max(0.01, markScale));
      ctx.beginPath();
      ctx.arc(0, 0, rowH * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, side === "tie" ? 0.2 : 0.9);
      ctx.fill();
      ctx.font = `800 ${rowH * 0.34}px ${FONT_SANS}`;
      ctx.fillStyle = side === "tie" ? THEME.textDim : "#06121a";
      ctx.textAlign = "center";
      ctx.fillText(side === "tie" ? "=" : "✓", 0, rowH * 0.12);
      ctx.textAlign = "start";
      ctx.restore();
    };
    if (landed > 0) {
      if (r.winner === "tie") pill("tie");
      else pill(r.winner);
    }
    ctx.restore();

    if (played && r.winner !== "tie" && landed > 0 && landed < 1) {
      const isLeft = r.winner === "left";
      const color = isLeft ? accent : secondary;
      const fromX = contentX + contentW / 2;
      const toX = isLeft ? leftX + cardW / 2 : rightX + cardW / 2;
      const fromY = y + rowH / 2;
      const toY = cardTop + cardH - unit * 0.9;
      const fx = fromX + (toX - fromX) * landed;
      const fy = fromY + (toY - fromY) * landed;
      
      const spPlus = proj2d(fx, fy, 0.4);
      const spCard = proj2d(toX, cardTop + cardH / 2, 0.2);

      ctx.save();
      ctx.globalAlpha = 1 - landed * 0.4;
      ctx.font = `900 ${unit * 0.9}px ${FONT_MONO}`;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText("+1", spPlus.x, spPlus.y);
      ctx.textAlign = "start";
      
      const ring = clamp01((landed - 0.55) / 0.45);
      if (ring > 0) {
        ctx.globalAlpha = (1 - ring) * 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * 0.08;
        ctx.beginPath();
        ctx.arc(spCard.x, spCard.y, unit * (0.6 + ring * 2.4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  if (scene.verdict && (verdictBeat < 0 ? env.p > 0.8 : verdictActive)) {
    const t = verdictBeat < 0 ? easeOutCubic(sub(env.p, 0.8, 0.15)) : verdictT;
    if (t > 0) {
      const isDraw = leftScore === rightScore;
      const by = contentY + contentH - unit * (vertical ? 3.4 : 1.5);
      ctx.save();
      ctx.globalAlpha = t;
      const bannerColor = isDraw ? THEME.warn : leftWins ? accent : secondary;
      ctx.font = `800 ${unit * 0.9}px ${FONT_SANS}`;
      const lines = wrapText(ctx, scene.verdict, contentW * 0.86).slice(0, 2);
      const bh = unit * 1.0 + lines.length * unit * 1.15;
      const bw2 = contentW * 0.9;
      const bx = w / 2 - bw2 / 2;
      
      const spBanner = proj2d(w / 2, by - bh / 2, 0.5);
      
      roundRect(ctx, spBanner.x - bw2/2, spBanner.y - bh/2, bw2, bh, unit * 0.4);
      ctx.fillStyle = rgba(bannerColor, 0.16);
      ctx.fill();
      roundRect(ctx, spBanner.x - bw2/2, spBanner.y - bh/2, bw2, bh, unit * 0.4);
      ctx.strokeStyle = bannerColor;
      ctx.lineWidth = unit * 0.05;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = isDraw ? THEME.warn : THEME.text;
      const startY = spBanner.y - bh/2 + unit * 0.9;
      lines.forEach((line, i) => ctx.fillText(line, spBanner.x, startY + i * unit * 1.15));
      ctx.textAlign = "start";
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
