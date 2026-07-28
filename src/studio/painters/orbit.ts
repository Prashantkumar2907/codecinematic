import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, enterT, clamp01, roundRect, drawSceneTitle, beatT, activeBeatIndex, rgba } from "./common";
import { render3D, projectToRect, studioLights, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type OrbitScene = Extract<Scene, { kind: "orbit" }>;

/** Beat state the cached three.js `update` reads each frame (build runs once). */
const orbitState = new Map<string, { revealed: number }>();

/**
 * Real-3-D orbital system (three.js): a central body with bodies orbiting on
 * tilted concentric rings, revealed inner→outer per beat, spinning forever.
 * For the solar system, electron shells, moon phases, satellite missions.
 * Falls back to a 2-D ring diagram if WebGL is unavailable.
 */
export function paintOrbit(ctx: CanvasRenderingContext2D, scene: OrbitScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const n = scene.bodies.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const key = scene.id;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;
  const flowT = activeIdx >= 0 ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  orbitState.set(key, { revealed: activeIdx < 0 ? 0 : activeIdx + easeOutCubic(clamp01(flowT * 1.4)) });

  const rect = { x: contentX, y: contentY + band, w: contentW, h: (contentH - band) * (vertical ? 0.9 : 0.95) };
  const R0 = 1.6; // innermost ring radius (world units)
  const dR = 1.15; // spacing between rings
  const ringR = (i: number) => R0 + i * dR;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 46 : 40, 1, 0.1, 100);
    const maxR = ringR(n - 1);
    const dist = (maxR + 2.2) * (vertical ? 2.75 : 1.7);
    camera.position.set(0, dist * 0.62, dist * 0.78);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(dist * 2.5, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -1.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(dist * 4, dist * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Central body (glowing).
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(secondary),
        emissive: new THREE.Color(secondary),
        emissiveIntensity: 0.6,
        metalness: 0.2,
        roughness: 0.3,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
      })
    );
    center.castShadow = true;
    center.receiveShadow = true;
    s.add(center);

    // Rings + orbiting bodies.
    const rings: THREE.Line[] = [];
    const bodies: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const r = ringR(i);
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r)); }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.32 }));
      s.add(ring);
      rings.push(ring);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 24, 24),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(accent),
          emissive: new THREE.Color(accent),
          emissiveIntensity: 0.2,
          metalness: 0.2,
          roughness: 0.3,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
        })
      );
      body.castShadow = true;
      body.receiveShadow = true;
      s.add(body);
      bodies.push(body);
    }

    const update = (elapsedMs: number) => {
      const revealed = orbitState.get(key)?.revealed ?? 0;
      center.rotation.y = elapsedMs / 3000;
      const cs = easeOutCubic(clamp01(revealed + 1));
      center.scale.setScalar(Math.max(0.001, cs));
      for (let i = 0; i < n; i++) {
        const local = clamp01(revealed - i);
        const sc = easeOutCubic(local);
        rings[i].scale.setScalar(Math.max(0.001, sc));
        (rings[i].material as THREE.LineBasicMaterial).opacity = 0.32 * sc;
        const r = ringR(i);
        const ang = elapsedMs / (1600 + i * 700) + i * 1.7; // outer orbits slower
        bodies[i].position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        bodies[i].scale.setScalar(Math.max(0.001, sc));
        bodies[i].visible = sc > 0.01;
      }
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs);

  const drawChip = (sx: number, sy: number, text: string, activeChip: boolean, revealed: number) => {
    if (revealed <= 0) return;
    ctx.save();
    ctx.globalAlpha = easeOutCubic(clamp01(revealed));
    ctx.font = `${activeChip ? 800 : 600} ${unit * 0.72}px ${FONT_SANS}`;
    const tw = ctx.measureText(text).width;
    const cw = tw + unit;
    // Keep the chip fully inside the frame even when its body orbits near the edge.
    sx = Math.max(rect.x + cw / 2 + unit * 0.2, Math.min(rect.x + rect.w - cw / 2 - unit * 0.2, sx));
    roundRect(ctx, sx - cw / 2, sy - unit * 0.65, cw, unit * 1.3, unit * 0.32);
    ctx.fillStyle = "rgba(10,16,22,0.82)";
    ctx.fill();
    ctx.strokeStyle = rgba(activeChip ? accent : "#94a3b8", activeChip ? 0.9 : 0.4);
    ctx.lineWidth = activeChip ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx, sy);
    ctx.restore();
  };

  if (cam) {
    const revealed = orbitState.get(key)?.revealed ?? 0;
    // Centre label under the central body.
    const cp = projectToRect(cam, new THREE.Vector3(0, -1.3, 0), rect);
    drawChip(cp.x, cp.y, scene.center, false, 1);
    // Body labels track their orbiting spheres.
    for (let i = 0; i < n; i++) {
      const local = clamp01(revealed - i);
      if (local <= 0) continue;
      const r = ringR(i);
      const ang = env.elapsedMs / (1600 + i * 700) + i * 1.7;
      const wp = projectToRect(cam, new THREE.Vector3(Math.cos(ang) * r, 0.7, Math.sin(ang) * r), rect);
      drawChip(wp.x, wp.y, scene.bodies[i].label, i === activeIdx, local);
    }
  } else {
    // 2-D fallback: concentric rings with a dot + label per body.
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const maxPx = Math.min(rect.w, rect.h) * 0.42;
    const revealed = orbitState.get(key)?.revealed ?? 0;
    ctx.save();
    ctx.fillStyle = secondary;
    ctx.beginPath(); ctx.arc(cx, cy, unit * 1.1, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < n; i++) {
      const local = clamp01(revealed - i);
      if (local <= 0) continue;
      const rr = maxPx * ((i + 1) / n);
      ctx.globalAlpha = easeOutCubic(local);
      ctx.strokeStyle = rgba(accent, 0.35); ctx.lineWidth = unit * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      const ang = env.elapsedMs / (1600 + i * 700) + i * 1.7;
      const bx = cx + Math.cos(ang) * rr, by = cy + Math.sin(ang) * rr;
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx, by, unit * 0.4, 0, Math.PI * 2); ctx.fill();
      drawChip(bx, by - unit * 1.1, scene.bodies[i].label, i === activeIdx, local);
    }
    ctx.restore();
    drawChip(cx, cy + unit * 1.9, scene.center, false, 1);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
