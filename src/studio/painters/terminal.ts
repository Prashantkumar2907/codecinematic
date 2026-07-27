import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_MONO, FONT_SANS, easeOutCubic, enterT, idle, clamp01, roundRect, rgba, shade } from "./common";
import type { PaintEnv } from "./index";

type TerminalScene = Extract<Scene, { kind: "terminal" }>;

/** Upright window facing an axis-aligned camera. A tilted camera keystones the slab
 *  while the window chrome below is drawn as an axis-aligned pixel rect, so the title
 *  bar overhung the slab's top-right corner into empty space. */
const CAM_DIST = 9;
const WIN_DEPTH = 0.6;
/** Fraction of the visible frustum the window fills. */
const FILL = 0.96;
/** Traffic lights are a macOS reference, not palette colours — deliberately literal. */
const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"] as const;
const GLASS_INSET = 0.98;
const CHROME_ALPHA = 0.9;
/** Lowest usable baseline as a fraction of frame height (Shorts UI band on 9:16). */
const SAFE_BOTTOM_SHORT = 0.75;
const SAFE_BOTTOM_LONG = 0.94;
/** Floor on the window height as a fraction of the usable band. */
const MIN_HEIGHT_FRAC = 0.78;

const isCmd = (l: string) => l.trimStart().startsWith("$");
const cmdBody = (l: string) => l.trimStart().replace(/^\$\s*/, "");

type TerminalContext = {
  env: PaintEnv;
};

export function paintTerminal(ctx: CanvasRenderingContext2D, scene: TerminalScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const good = THEME.good;

  const frameIn = easeOutCubic(enterT(env, 420));
  if (frameIn <= 0) return;

  const key = scene.id + "-terminal3d";

  // Type metrics first: they depend only on the window WIDTH, so the window can then
  // be sized to its own content instead of always filling the band and running its
  // bottom edge under the Shorts UI.
  const fw = contentW * FILL;
  const cwd = "~/studio";
  const promptText = `\u276f ${cwd} `;
  const measureChars = (l: string) => (isCmd(l) ? promptText.length + cmdBody(l).length : l.length);
  const longestChars = Math.max(12, ...scene.lines.map(measureChars));
  const textAvailW = fw - unit * 2.4;
  const MONO_ADVANCE = 0.6;
  const fontPx = Math.min(vertical ? unit * 0.95 : unit * 0.8, textAvailW / (longestChars * MONO_ADVANCE));
  const charW = fontPx * MONO_ADVANCE;
  const lineH = fontPx * 1.85;
  const barH = unit * 1.5;
  const radius = unit * 0.5;

  // +1 line: the resting prompt drawn after the last output line.
  const needH = barH + (scene.lines.length + 1) * lineH + unit * 1.2;
  const bandTop = contentY;
  const bandBottom = Math.min(contentY + contentH, (vertical ? SAFE_BOTTOM_SHORT : SAFE_BOTTOM_LONG) * layout.h);
  // A terminal window with a couple of blank rows below the prompt reads as a real
  // window; one cropped to its last line reads as a snippet floating in a void.
  const bandH = (bandBottom - bandTop) * FILL;
  const fh = Math.min(bandH, Math.max(bandH * MIN_HEIGHT_FRAC, needH));
  const rectH = fh / FILL;
  const rect = {
    x: contentX,
    y: bandTop + Math.max(0, (bandBottom - bandTop - rectH) / 2),
    w: contentW,
    h: rectH,
  };

  // ── 3D layer ───────────────────────────────────────────────────────────────
  // The window chrome below is an axis-aligned pixel rect, so the slab must project
  // to one: axis-aligned camera, upright window, front face sized from the frustum.
  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle<TerminalContext> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, WIN_DEPTH / 2);
    const blockW = (rect.w * FILL) / m.sx;
    const blockH = (rect.h * FILL) / m.sy;

    const g = makeBlock(blockW, blockH, WIN_DEPTH, THEME.bgBottom, accent);

    // Glass sheet on the face we are looking at, not on top of a flat slab.
    const glassGeo = new THREE.BoxGeometry(blockW * GLASS_INSET, blockH * GLASS_INSET, 0.05);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      roughness: 0.1,
      metalness: 0.8,
      clearcoat: 1.0,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.z = WIN_DEPTH / 2 + 0.025;
    g.add(glass);

    s.add(g);

    const update = (elapsedMs: number, ctxData: TerminalContext) => {
      // No scale or bob: both would move the slab out from under the pixel-pinned
      // chrome. The idle life is in the emissive breath instead.
      const alpha = easeOutCubic(enterT(ctxData.env, 420));
      g.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mat = child.material as THREE.MeshPhysicalMaterial;
        mat.transparent = true;
        if (mat.emissive) mat.emissiveIntensity = 0.15 + 0.06 * idle({ elapsedMs }, 1400);
        if (child.geometry.type !== "EdgesGeometry") mat.opacity = 0.8 * alpha;
      });
    };

    return { scene: s, camera, update };
  };

  const contextData: TerminalContext = { env };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, contextData, env);
  if (!cam) return;

  // The window chrome sits exactly on the projected front face.
  const faceM = mappingAt(cam, WIN_DEPTH / 2);
  const fx = faceM.o.x - fw / 2;
  const fy = faceM.o.y - fh / 2;

  const CPS = 26;
  const CMD_TAIL_MS = 260;
  const OUT_MS = 200;
  const rawDur = scene.lines.map((l) => (isCmd(l) ? (cmdBody(l).length / CPS) * 1000 + CMD_TAIL_MS : OUT_MS));
  const rawTotal = rawDur.reduce((a, b) => a + b, 0) || 1;
  const budget = Math.max(1200, Math.min(rawTotal, env.durationMs * 0.62));
  const speed = rawTotal / budget;
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < scene.lines.length; i++) {
    starts.push(acc);
    acc += rawDur[i] / speed;
  }

  ctx.save();
  ctx.globalAlpha = frameIn;

  // Title bar
  roundRect(ctx, fx, fy, fw, barH + radius, radius);
  ctx.clip();
  const barGrad = ctx.createLinearGradient(0, fy, 0, fy + barH);
  barGrad.addColorStop(0, rgba(shade(THEME.panel, 0.22), CHROME_ALPHA));
  barGrad.addColorStop(1, rgba(shade(THEME.panel, 0.1), CHROME_ALPHA));
  ctx.fillStyle = barGrad;
  ctx.fillRect(fx, fy, fw, barH);
  ctx.fillStyle = rgba(THEME.text, 0.1);
  ctx.fillRect(fx, fy, fw, Math.max(1, unit * 0.06));
  ctx.restore();
  
  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.strokeStyle = rgba(THEME.bgBottom, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, fy + barH);
  ctx.lineTo(fx + fw, fy + barH);
  ctx.stroke();

  // Traffic lights
  const lightY = fy + barH / 2;
  const lightR = unit * 0.2;
  TRAFFIC_LIGHTS.forEach((c, i) => {
    const lx = fx + unit * (0.8 + i * 0.8);
    ctx.beginPath();
    ctx.arc(lx, lightY, lightR, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    const sheen = ctx.createRadialGradient(lx - lightR * 0.3, lightY - lightR * 0.4, 0, lx, lightY, lightR);
    sheen.addColorStop(0, rgba(THEME.text, 0.5));
    sheen.addColorStop(0.6, rgba(THEME.text, 0));
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(lx, lightY, lightR, 0, Math.PI * 2);
    ctx.fill();
  });

  // Title
  ctx.fillStyle = rgba(THEME.text, 0.66);
  ctx.font = `600 ${unit * 0.55}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(`zsh — ${cwd}`, fx + fw / 2, lightY + unit * 0.2);
  ctx.textAlign = "start";

  // Lines
  const textX = fx + unit * 0.8;
  const firstY = fy + barH + lineH * 0.95;
  const promptWidth = charW * promptText.length;
  ctx.textBaseline = "alphabetic";

  const drawPrompt = (y: number) => {
    ctx.font = `600 ${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle = accent;
    ctx.fillText("❯", textX, y);
    ctx.fillStyle = rgba(good, 0.85);
    ctx.fillText(cwd, textX + charW * 2, y);
  };

  let typingCursor: { x: number; y: number } | null = null;
  let lastCmdEnd: { x: number; y: number } | null = null;
  const lastLine = scene.lines.length - 1;
  const allDone = env.elapsedMs >= starts[lastLine] + rawDur[lastLine] / speed;

  scene.lines.forEach((line, i) => {
    const start = starts[i];
    const y = firstY + i * lineH;
    if (env.elapsedMs < start) return;
    const local = env.elapsedMs - start;

    if (isCmd(line)) {
      const body = cmdBody(line);
      const shown = Math.min(body.length, Math.floor((local / 1000) * CPS * speed));
      drawPrompt(y);
      ctx.font = `600 ${fontPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      const cmdX = textX + promptWidth;
      ctx.fillText(body.slice(0, shown), cmdX, y);
      const end = { x: cmdX + shown * charW, y };
      if (shown < body.length) typingCursor = end;
      lastCmdEnd = end;
    } else {
      ctx.globalAlpha = frameIn * clamp01(local / 180);
      ctx.font = `500 ${fontPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(line, textX, y);
      ctx.globalAlpha = frameIn;
    }
  });

  const restY = firstY + scene.lines.length * lineH;
  if (allDone && !typingCursor && restY < fy + fh - unit * 0.35) {
    drawPrompt(restY);
    typingCursor = { x: textX + promptWidth, y: restY };
  }

  const cursor = typingCursor ?? lastCmdEnd;
  if (cursor) {
    const c = cursor as { x: number; y: number };
    const blink = typingCursor ? 1 : 0.3 + 0.7 * idle(env, 900);
    ctx.globalAlpha = frameIn * blink;
    ctx.fillStyle = accent;
    ctx.fillRect(c.x + charW * 0.1, c.y - fontPx * 0.82, charW * 0.6, fontPx * 0.98);
  }
  ctx.restore();
}
