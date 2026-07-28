import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, sub, clamp01, wrapText, roundRect, drawSceneTitle, beatWindow, beatT, activeBeatIndex, rgba, variantOf } from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type CompareScene = Extract<Scene, { kind: "compare" }>;

const DIM_ALPHA = 0.85;

export function paintCompare(ctx: CanvasRenderingContext2D, scene: CompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + 2 + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const verdictBeat = scene.sayVerdict ? offset + 2 : -1;
  const variant = variantOf(scene.id, 3);
  const divider = !vertical && variant === 1;
  const key = scene.id + "-comp3d";

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent, { centered: true });
  const panelsTop = contentY + band + unit * 0.3;
  const verdictBand = scene.verdict ? unit * (vertical ? 4.8 : 3.2) : unit * 0.5;
  const gap = unit * (vertical ? 1.6 : 2.2);

  const stacked = vertical || variant === 2;
  const pw = stacked ? contentW : (contentW - gap) / 2;
  const availH = contentH - (panelsTop - contentY) - verdictBand;

  const panelContentH = (items: string[]): number => {
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    let h = unit * 4.0;
    for (const item of items) {
      const lines = Math.min(wrapText(ctx, item, pw - unit * 2.8).length, 2);
      h += unit * 1.35 * lines + unit * 0.7;
    }
    return h + unit * 0.8;
  };

  let ph: number;
  let blockTop = panelsTop;
  if (stacked) {
    const need = Math.max(panelContentH(scene.left.items), panelContentH(scene.right.items));
    ph = Math.min(need, (availH - gap) / 2);
    blockTop = panelsTop + Math.max(0, (availH - (ph * 2 + gap)) / 2);
  } else {
    ph = availH;
  }

  const rect = { x: contentX, y: blockTop, w: contentW, h: stacked ? (ph * 2 + gap) : ph };

  // Setup 3D representation
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 14 : 11);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);
    
    // Add grid/baseline
    const spreadX = vertical ? 3.0 : 6.0;
    const spreadY = vertical ? 5.5 : 3.0;
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    // Rotate grid for vertical so it matches the stack
    if (vertical) grid.rotation.x = Math.PI / 2;
    
    s.add(grid);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadY * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    if (vertical) shadowPlane.rotation.x = 0;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const blockW = stacked ? spreadX * 2.8 : spreadX * 1.5;
    const blockH = stacked ? spreadY * 1.0 : spreadY * 2.0;

    const leftGroup = makeBlock(blockW, blockH, 0.2, accent, accentGlow);
    const rightGroup = makeBlock(blockW, blockH, 0.2, secondary, secondaryGlow);
    
    s.add(leftGroup);
    s.add(rightGroup);

    const update = (elapsedMs: number) => {
      const gIn = easeOutCubic(enterT(env, 600));

      const panels = [
        { group: leftGroup, beatIdx: offset, color: accent },
        { group: rightGroup, beatIdx: offset + 1, color: secondary },
      ];

      panels.forEach(({ group, beatIdx, color }, i) => {
        const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
        const appear = easeOutCubic(Math.min(1, bt * 2.5));
        const isCurrent = active === beatIdx;
        const pop = easeOutBack(Math.min(1, Math.max(0, bt * 2.5)));

        group.scale.setScalar(Math.max(0.001, pop));
        group.visible = bt > 0.01;

        // Position
        const dir = stacked ? (i === 0 ? 1 : -1) : (i === 0 ? -1 : 1);
        const slide = (1 - appear) * dir * 2.0;
        
        if (stacked) {
            group.position.set(0, dir * spreadY * 0.65 + slide, 0);
        } else {
            group.position.set(dir * spreadX * 0.8 + slide, 0, 0);
        }

        // Bobbing
        group.position.y += Math.sin(elapsedMs / 1200 + i) * 0.08;
        group.position.z = isCurrent ? 0.3 : 0;

        group.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                const alpha = isCurrent || (active >= verdictBeat && verdictBeat > 0) ? 1 : active > beatIdx ? DIM_ALPHA : 1;
                mat.opacity = gIn * alpha * 0.95;
                if (!divider) {
                   mat.color.setStyle("#0b0f15");
                   mat.emissive.setStyle("#0b0f15");
                }
            }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const get2D = (i: number, stacked: boolean, spreadX: number, spreadY: number) => {
      const dir = stacked ? (i === 0 ? 1 : -1) : (i === 0 ? -1 : 1);
      const bob = Math.sin(env.elapsedMs / 1200 + i) * 0.08;
      const x = stacked ? 0 : dir * spreadX * 0.5;
      const y = (stacked ? dir * spreadY * 0.5 : 0) + bob;
      return projectToRect(cam, new THREE.Vector3(x, y, 0), rect);
  };

  const panels = [
    { side: scene.left, x: contentX, y: blockTop, dir: -1, color: accent, glow: accentGlow, beatIdx: offset, idx: 0 },
    {
      side: scene.right,
      x: stacked ? contentX : contentX + pw + gap,
      y: stacked ? blockTop + ph + gap : panelsTop,
      dir: 1,
      color: secondary,
      glow: secondaryGlow,
      beatIdx: offset + 1,
      idx: 1,
    },
  ];

  panels.forEach(({ side, x, y, dir, color, glow, beatIdx, idx }) => {
    const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (bt <= 0) {
      const ghostIn = easeOutCubic(enterT(env, 400));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18 * ghostIn;
        if (!divider) {
          roundRect(ctx, x, y, pw, ph, unit * 0.7);
          ctx.strokeStyle = color;
          ctx.lineWidth = unit * 0.05;
          ctx.setLineDash([unit * 0.35, unit * 0.3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
        ctx.fillStyle = color;
        ctx.fillText(side.title, x + unit, y + unit * 1.5);
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, bt * 2.5));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent || active >= verdictBeat && verdictBeat > 0 ? 1 : active > beatIdx ? DIM_ALPHA : 1;
    const panelPop = easeOutBack(Math.min(1, bt * 2.5));

    // For 3D, we'll draw the text directly relative to the 2D layout since we 
    // approximated the 3D block to match this 2D bounding box `x, y, pw, ph`.
    ctx.save();
    ctx.globalAlpha = appear * alpha;
    
    // Scale and translate text overlay similar to the block
    ctx.translate(x + pw / 2, y + ph / 2);
    ctx.scale(0.95 + 0.05 * panelPop, 0.95 + 0.05 * panelPop);
    ctx.translate(-(x + pw / 2) + dir * (1 - appear) * unit * 1.6, -(y + ph / 2));

    if (isCurrent && divider) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = unit * (0.45 + 0.6 * idle(env, 1600));
    }
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    if (divider) {
      roundRect(ctx, x, y, unit * 3, unit * 0.26, unit * 0.13);
      ctx.fill();
    } else {
      ctx.save();
      roundRect(ctx, x, y, pw, ph, unit * 0.7);
      ctx.clip();
      ctx.fillRect(x, y, pw, unit * 0.34);
      ctx.restore();
    }

    let titleX = x + unit * 1.0;
    if (side.icon) {
      const iconPop = easeOutBack(clamp01((bt - 0.1) * 3));
      const popS = Math.max(0, iconPop);
      
      if (isVectorIcon(side.icon)) {
        const iconS = unit * 1.5;
        ctx.save();
        ctx.translate(titleX + iconS / 2, y + unit * 1.1);
        ctx.scale(popS, popS);
        drawIcon(ctx, side.icon, 0, 0, iconS, env, color);
        ctx.restore();
        titleX += iconS + unit * 0.4;
      } else {
        ctx.font = `${unit * 1.3}px ${FONT_SANS}`;
        const tW = ctx.measureText(side.icon).width;
        ctx.save();
        ctx.translate(titleX + tW / 2, y + unit * 1.15);
        ctx.scale(popS, popS);
        ctx.fillText(side.icon, -tW / 2, unit * 0.45);
        ctx.restore();
        titleX += tW + unit * 0.45;
      }
    }
    ctx.font = `800 ${unit * 1.15}px ${FONT_SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(side.title, titleX, y + unit * 1.6);

    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    let iy = y + unit * 4.0;
    side.items.forEach((item, i) => {
      const it = clamp01(bt * side.items.length - i * 0.5);
      if (it <= 0) return;
      const ease = easeOutCubic(it);
      const slide = (1 - ease) * unit * 1.4 * dir;
      const pop = easeOutBack(clamp01(it * 1.6));
      const lift = (1 - pop) * unit * 0.8;
      
      ctx.save();
      ctx.translate(slide, lift);
      ctx.globalAlpha = appear * alpha * ease;
      const popSize = Math.max(0.01, pop);
      const bx = x + unit * 1.2;
      const by = iy - unit * 0.32;

      ctx.fillStyle = rgba(color, 0.25);
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.26 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.14 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.text;
      const lines = wrapText(ctx, item, pw - unit * 2.8);
      lines.slice(0, 2).forEach((line, li) => ctx.fillText(line, x + unit * 1.9, iy + li * unit * 1.35));
      ctx.restore();
      iy += unit * 1.35 * Math.min(lines.length, 2) + unit * 0.7;
    });
    ctx.restore();
  });

  if (divider) {
    const dx = contentX + pw + gap / 2;
    const dIn = easeOutCubic(enterT(env, 500));
    ctx.save();
    
    const spineGrad = ctx.createLinearGradient(dx, panelsTop, dx, panelsTop + ph);
    spineGrad.addColorStop(0, rgba(accent, 0.8));
    spineGrad.addColorStop(0.5, rgba(secondary, 0.8));
    spineGrad.addColorStop(1, rgba(accent, 0.1));
    
    ctx.strokeStyle = spineGrad;
    ctx.lineWidth = unit * 0.12;
    ctx.setLineDash([unit * 0.5, unit * 0.4]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(dx, panelsTop);
    ctx.lineTo(dx, panelsTop + ph * dIn);
    ctx.stroke();
    ctx.restore();
  }

  const rightWin = beatWindow(env.beats, offset + 1, totalBeats);
  const vsIn = easeOutBack(sub(env.p, rightWin.start, 0.1));
  if (vsIn > 0) {
    const vx = stacked ? contentX + contentW / 2 : contentX + pw + gap / 2;
    const vy = stacked ? blockTop + ph + gap / 2 : panelsTop + ph / 2;
    const vsPulse = 1 + 0.05 * Math.sin(idle(env, 1900) * Math.PI * 2);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vsIn * vsPulse, vsIn * vsPulse);
    
    const badgeGrad = ctx.createLinearGradient(0, -unit * 1.05, 0, unit * 1.05);
    badgeGrad.addColorStop(0, rgba(accent, 0.25));
    badgeGrad.addColorStop(1, "#06121a");

    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.8 + 0.4 * Math.sin(idle(env, 2100) * Math.PI));
    ctx.beginPath();
    ctx.arc(0, 0, unit * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * 0.04;
    ctx.stroke();

    ctx.font = `900 italic ${unit * 0.75}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, unit * 0.26);
    ctx.restore();
  }

  if (scene.verdict) {
    const t = scene.sayVerdict
      ? easeOutCubic(Math.min(1, beatT(env.beats, verdictBeat, totalBeats, env.p) * 3))
      : easeOutCubic(sub(env.p, 0.78, 0.15));
    if (t > 0) {
      const vPop = easeOutBack(t);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      
      const ty = contentY + contentH - unit * (vertical ? 3.0 : 0.8);
      const lines = wrapText(ctx, scene.verdict, contentW * 0.9);
      const lineH = unit * 1.3;
      const totalH = lines.length * lineH;
      const startY = ty - (lines.length - 1) * lineH;
      
      ctx.translate(w / 2, startY + totalH / 2 - lineH * 0.4);
      ctx.scale(0.85 + 0.15 * vPop, 0.85 + 0.15 * vPop);
      ctx.translate(-w / 2, -(startY + totalH / 2 - lineH * 0.4));

      const maxW = Math.max(...lines.map(l => ctx.measureText(`✓ ${l}`).width));
      const padX = unit * 1.5;
      const padY = unit * 0.8;
      
      ctx.fillStyle = rgba(THEME.good, 0.1);
      ctx.strokeStyle = rgba(THEME.good, 0.3);
      ctx.lineWidth = unit * 0.08;
      roundRect(ctx, w / 2 - maxW / 2 - padX, startY - lineH * 0.8 - padY / 2, maxW + padX * 2, totalH + padY * 1.5, unit * 0.8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = THEME.good;
      ctx.shadowColor = rgba(THEME.good, 0.5);
      ctx.shadowBlur = unit * (0.2 + 0.4 * idle(env, 2400));
      lines.forEach((line, i) => ctx.fillText(`✓ ${line}`, w / 2, startY + i * lineH));
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
