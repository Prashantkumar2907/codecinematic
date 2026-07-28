import * as THREE from "three";
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
  roundRect,
  fitFontSize,
  wrapText,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type DayclockScene = Extract<Scene, { kind: "dayclock" }>;
type Pin = DayclockScene["pins"][number];

/** Hour-hand fraction (0-1 around the dial) for "HH:MM" on the given face. */
function pinFrac(at: string, face: DayclockScene["face"]): number {
  const [hh, mm] = at.split(":").map((n) => parseInt(n, 10));
  const span = face === "12h" ? 12 : 24;
  const hours = (face === "12h" ? hh % 12 : hh) + mm / 60;
  return hours / span;
}

export function paintDayclock(ctx: CanvasRenderingContext2D, scene: DayclockScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.pins.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const key = scene.id + "-dayclock3d";

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + titleBand;
  const availH = contentH - titleBand;

  // 3D Scene setup
  const R = 4.0;
  const rect = { x: contentX, y: areaY, w: contentW, h: availH };

  const faceIn = easeOutCubic(enterT(env, 380));
  if (faceIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  // Pre-calculate state for update loop
  const cycles = scene.face === "12h" ? 12 : 24;
  const angleOf = (frac: number) => -Math.PI / 2 + frac * Math.PI * 2;

  const k = Math.min(active - offset, scene.pins.length - 1);
  const t = k >= 0 ? beatT(env.beats, offset + k, totalBeats, env.p) : 0;
  const prevFrac = k <= 0 ? 0 : pinFrac(scene.pins[k - 1].at, scene.face);
  const curFrac = k >= 0 ? pinFrac(scene.pins[k].at, scene.face) : 0;
  let delta = curFrac - prevFrac;
  if (delta < 0) delta += 1;
  if (delta === 0 && k > 0) delta = 1;
  const sweepE = easeInOutCubic(clamp01(t / 0.55));
  const master = prevFrac + delta * sweepE;
  const settled = k < 0 || t > 0.6;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 10, 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(16, 16, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Clock Face Base
    const base = makeCylinder(R, 0.2, "#1e293b", "#31435a");
    s.add(base);

    // Inner Rim
    const rimGeo = new THREE.TorusGeometry(R * 0.9, 0.05, 16, 64);
    const rimMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#31435a"),
      metalness: 0.2, roughness: 0.5, clearcoat: 0.8
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.15;
    s.add(rim);

    // Ticks
    const nTicks = scene.face === "12h" ? 12 : 24;
    const majorEvery = scene.face === "12h" ? 3 : 6;
    for (let i = 0; i < nTicks; i++) {
      const frac = i / nTicks;
      const major = i % majorEvery === 0;
      const angle = angleOf(frac);
      const tickL = major ? 0.6 : 0.3;
      const tickW = major ? 0.1 : 0.05;
      const tick = makeBlock(tickW, 0.05, tickL, major ? "#94a3b8" : "#475569", "#000000");
      tick.position.set(Math.cos(angle) * (R - tickL/2 - 0.1), 0.15, Math.sin(angle) * (R - tickL/2 - 0.1));
      tick.rotation.y = -angle;
      s.add(tick);
    }

    // Hands
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.4, 32),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(accent), metalness: 0.3, roughness: 0.2 })
    );
    hub.position.y = 0.2;
    s.add(hub);

    // makeBlock centres its box on its own origin, so a hand rotated about that
    // origin would sweep through the hub. Offset the arm inside a pivot group by
    // half its length instead — translating the geometry would leave the baked
    // EdgesGeometry behind.
    const handOnPivot = (w: number, h: number, len: number, y: number) => {
      const pivot = new THREE.Group();
      const arm = makeBlock(w, h, len, accent, accent);
      arm.position.z = -len / 2;
      pivot.add(arm);
      pivot.position.y = y;
      s.add(pivot);
      return pivot;
    };

    const minuteHand = handOnPivot(0.1, 0.1, R * 0.78, 0.3);
    const hourHand = handOnPivot(0.2, 0.15, R * 0.52, 0.4);

    // Pins
    const pinMeshes: THREE.Group[] = [];
    scene.pins.forEach((pin, i) => {
      const frac = pinFrac(pin.at, scene.face);
      const angle = angleOf(frac);
      
      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(angle) * R, 0.3, Math.sin(angle) * R);
      
      // The pin body
      const pinBody = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 24, 24),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(accent), emissive: new THREE.Color(accent), emissiveIntensity: 0.2,
          metalness: 0.2, roughness: 0.3, clearcoat: 0.8
        })
      );
      pGroup.add(pinBody);
      s.add(pGroup);
      pinMeshes.push(pGroup);
    });

    const update = (elapsedMs: number, ctxData: { faceIn: number, master: number, settled: boolean, k: number, t: number }) => {
      const { faceIn, master, settled, k, t } = ctxData;
      
      base.scale.setScalar(Math.max(0.001, faceIn));
      base.position.y = -0.5 * (1 - faceIn);

      const tremor = settled ? 0.0012 * Math.sin(elapsedMs / 320) : 0;
      const hourFrac = (master % 1) + tremor;
      const minuteFrac = ((master * cycles) % 1) + tremor;

      hourHand.rotation.y = -hourFrac * Math.PI * 2;
      minuteHand.rotation.y = -minuteFrac * Math.PI * 2;

      // Update pins
      scene.pins.forEach((pin, i) => {
        const mesh = pinMeshes[i];
        if (i < k) {
          // Past pin
          mesh.scale.setScalar(0.5);
          mesh.position.y = 0.2;
          mesh.visible = true;
          (mesh.children[0] as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#475569") });
        } else if (i === k && (offset + i === active && !inTail)) {
          // Active pin dropping in
          const drop = easeOutBack(clamp01((t - 0.4) / 0.4));
          mesh.scale.setScalar(Math.max(0.001, drop));
          mesh.position.y = 0.3 + (1 - drop) * 2; // Drops from above
          mesh.visible = drop > 0;
          const hot = active === offset + k && !inTail;
          const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
          mat.color.setStyle(accent);
          mat.emissive.setStyle(accent);
          mat.emissiveIntensity = hot ? 0.5 + 0.3 * Math.sin(elapsedMs / 260) : 0.2;
        } else {
          // Future pin
          mesh.visible = false;
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { faceIn, master, settled, k, t });

  if (!cam) return;

  // 2D Overlays
  const get2D = (worldX: number, worldY: number, worldZ: number) => projectToRect(cam, new THREE.Vector3(worldX, worldY, worldZ), rect);
  const cx2D = get2D(0, 0, 0).x;
  
  // Numbers on face
  const numbers = scene.face === "12h" ? ["12", "3", "6", "9"] : ["0", "6", "12", "18"];
  ctx.save();
  ctx.globalAlpha = faceIn;
  ctx.font = `700 ${unit * 0.7}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  numbers.forEach((num, i) => {
    const angle = angleOf(i / 4);
    const np = get2D(Math.cos(angle) * (R * 0.7), 0.2, Math.sin(angle) * (R * 0.7));
    ctx.fillText(num, np.x, np.y + unit * 0.25);
  });
  ctx.restore();

  // Active pin label & icon
  if (k >= 0) {
    const pin = scene.pins[k];
    const frac = pinFrac(pin.at, scene.face);
    const angle = angleOf(frac);
    const drop = easeOutBack(clamp01((t - 0.4) / 0.4));
    const hot = active === offset + k && !inTail;

    if (drop > 0) {
      if (pin.icon) {
        const ip = get2D(Math.cos(angle) * (R + 0.8), 0.3, Math.sin(angle) * (R + 0.8));
        ctx.save();
        ctx.globalAlpha = faceIn * drop;
        ctx.font = `${unit * 1.1}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.fillText(pin.icon, ip.x, ip.y + unit * 0.32);
        ctx.textAlign = "start";
        ctx.restore();
      }

      const chipT = easeOutCubic(clamp01((t - 0.5) / 0.4));
      if (chipT > 0) {
        const anchor = get2D(Math.cos(angle) * (R + (pin.icon ? 1.6 : 1.0)), 0.3, Math.sin(angle) * (R + (pin.icon ? 1.6 : 1.0)));
        ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
        const maxTextW = unit * 6;
        const px = fitFontSize(ctx, pin.label, { maxW: maxTextW, startPx: unit * 0.66, minPx: unit * 0.46, weight: 700 });
        ctx.font = `700 ${px}px ${FONT_SANS}`;
        let lines = [pin.label];
        if (ctx.measureText(pin.label).width > maxTextW) lines = wrapText(ctx, pin.label, maxTextW).slice(0, 2);
        const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const lineH = px * 1.2;
        const chipW = tw + unit * 0.8;
        const chipH = lines.length * lineH + unit * 0.4;
        
        // Very basic layout
        const c = Math.cos(angle);
        const side: -1 | 0 | 1 = Math.abs(c) < 0.35 ? 0 : c > 0 ? 1 : -1;
        let chipX = side === 1 ? anchor.x : side === -1 ? anchor.x - chipW : anchor.x - chipW / 2;
        let chipY = anchor.y - chipH / 2;
        chipX = Math.min(Math.max(chipX, contentX), contentX + contentW - chipW);
        chipY = Math.min(Math.max(chipY, areaY), areaY + availH - chipH);
        
        ctx.save();
        ctx.globalAlpha = faceIn * chipT;
        if (hot) {
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.5;
        }
        roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
        ctx.fillStyle = "#0a0e13";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(accent, 0.7);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        const y0 = chipY + chipH / 2 - ((lines.length - 1) * lineH) / 2 + px * 0.35;
        lines.forEach((line, i) => ctx.fillText(line, chipX + chipW / 2, y0 + i * lineH));
        ctx.textAlign = "start";
        ctx.restore();
      }
    }
  }

  // Digital readout
  const readoutY = get2D(0, 0, R + 2.5).y; // Position below clock in 2D
  const drawTime = (text: string, alpha: number, dy = 0) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = faceIn * alpha;
    ctx.font = `800 ${unit * 1.5}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(text, cx2D, readoutY + dy);
    ctx.textAlign = "start";
    ctx.restore();
  };
  if (k >= 0) {
    const cross = easeOutCubic(clamp01(t / 0.55));
    if (k > 0 && cross < 1) drawTime(scene.pins[k - 1].at, 1 - cross, -cross * unit * 0.7);
    drawTime(scene.pins[k].at, k > 0 ? cross : easeOutCubic(clamp01(t / 0.4)), k > 0 ? (1 - cross) * unit * 0.7 : 0);
  } else {
    drawTime(scene.face === "12h" ? "12:00" : "0:00", 0.5);
  }
}
