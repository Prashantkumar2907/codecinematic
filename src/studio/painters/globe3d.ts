import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeInOutCubic,
  easeOutCubic,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  enterT,
  departT,
  rgba,
  STROKE,
} from "./common";
import { render3D, projectToRect, studioLights, color3, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type Globe3dScene = Extract<Scene, { kind: "globe3d" }>;
type Marker = Globe3dScene["markers"][number];

const R = 2.0; // globe radius in world units

/** lon/lat (degrees) → point on a sphere of radius r. */
function lonLatToVec3(lon: number, lat: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Yaw that rotates `lon` to face the camera (+Z front). */
function yawFor(lon: number): number {
  return Math.PI / 2 - ((lon + 180) * Math.PI) / 180;
}

/** Per-scene beat state read by the cached three.js update(). */
type GlobeState = {
  revealed: Set<string>;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  ease: number;
  arcs: Set<number>;
};
const globeState = new Map<string, GlobeState>();

const markerColor = (kind: Marker["kind"], accent: string, secondary: string) =>
  kind === "wind" || kind === "current" ? secondary : accent;

/**
 * A real 3-D rotating Earth (three.js) for planetary-scale phenomena: jet
 * streams, ocean currents, pressure belts, climate zones. A stylized graticule
 * globe with glowing lon/lat pins and great-circle arcs; each beat reveals pins,
 * draws arcs, and eases the globe so the focused region faces the camera. Labels
 * are projected from the 3-D pin positions. Falls back to a 2-D orthographic disc
 * if WebGL is unavailable.
 */
export function paintGlobe3d(ctx: CanvasRenderingContext2D, scene: Globe3dScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const key = scene.id;
  const enter = easeOutCubic(enterT(env, 380));
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;

  const byId = new Map(scene.markers.map((m) => [m.id, m] as const));
  const revealed = new Set<string>();
  const arcSet = new Set<number>();
  for (let k = 0; k <= activeStep; k++) {
    scene.steps[k].reveal.forEach((idv) => revealed.add(idv));
    scene.steps[k].arcs.forEach((a) => arcSet.add(a));
  }
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const curStep = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const prevStep = activeStep > 0 ? scene.steps[activeStep - 1] : undefined;

  const focusOf = (s?: Globe3dScene["steps"][number]): { lon: number; lat: number } | null => {
    if (!s) return null;
    if (s.focus) return s.focus;
    const idv = s.highlight[0] ?? s.reveal[s.reveal.length - 1];
    const m = idv ? byId.get(idv) : undefined;
    return m ? { lon: m.lon, lat: m.lat } : null;
  };
  const to = focusOf(curStep) ?? { lon: scene.markers[0].lon, lat: scene.markers[0].lat };
  const from = focusOf(prevStep) ?? to;

  globeState.set(key, {
    revealed,
    fromLon: from.lon,
    fromLat: from.lat,
    toLon: to.lon,
    toLat: to.lat,
    ease: easeInOutCubic(clamp01(stepT * 1.3)),
    arcs: arcSet,
  });

  const rect = { x: contentX, y: contentY + band, w: contentW, h: contentH - band };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 40 : 34, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 8.4 : 7.4);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const globe = new THREE.Group();
    s.add(globe);

    // Ocean sphere.
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 48),
      new THREE.MeshStandardMaterial({
        color: color3(accent),
        emissive: color3(accent),
        emissiveIntensity: 0.12,
        metalness: 0.3,
        roughness: 0.65,
        transparent: true,
        opacity: 0.92,
      })
    );
    globe.add(sphere);

    // Graticule (lat/lon grid) as bright accent lines just above the surface.
    const gratMat = new THREE.LineBasicMaterial({ color: color3(accent), transparent: true, opacity: 0.4 });
    for (let latD = -60; latD <= 60; latD += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lonD = -180; lonD <= 180; lonD += 6) pts.push(lonLatToVec3(lonD, latD, R * 1.004));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }
    for (let lonD = -180; lonD < 180; lonD += 30) {
      const pts: THREE.Vector3[] = [];
      for (let latD = -90; latD <= 90; latD += 6) pts.push(lonLatToVec3(lonD, latD, R * 1.004));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
    }

    // Atmosphere halo.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.08, 32, 32),
      new THREE.MeshBasicMaterial({ color: color3(accent), transparent: true, opacity: 0.06, side: THREE.BackSide })
    );
    s.add(halo);

    // Markers.
    const markerMeshes = scene.markers.map((m) => {
      const col = markerColor(m.kind, accent, secondary);
      const g = new THREE.Group();
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 16),
        new THREE.MeshBasicMaterial({ color: color3(col) })
      );
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.17, 24),
        new THREE.MeshBasicMaterial({ color: color3(col), transparent: true, opacity: 0.8, side: THREE.DoubleSide })
      );
      const p = lonLatToVec3(m.lon, m.lat, R * 1.02);
      g.position.copy(p);
      g.lookAt(p.clone().multiplyScalar(2));
      g.add(dot);
      g.add(ringMesh);
      g.userData.id = m.id;
      globe.add(g);
      return g;
    });

    // Arcs — great-circle-ish curves lifted above the surface.
    const arcLines = scene.arcs.map((a) => {
      const col = a.style === "current" ? secondary : accent;
      const p0 = lonLatToVec3(a.fromLon, a.fromLat, R);
      const p1 = lonLatToVec3(a.toLon, a.toLat, R);
      const mid = p0.clone().add(p1).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.35);
      const curve = new THREE.QuadraticBezierCurve3(p0.clone().multiplyScalar(1.02), mid, p1.clone().multiplyScalar(1.02));
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.035, 8, false),
        new THREE.MeshBasicMaterial({ color: color3(col), transparent: true, opacity: 0.9 })
      );
      globe.add(tube);
      return tube;
    });

    const update = (elapsedMs: number) => {
      const stt = globeState.get(key);
      const yawFrom = stt ? yawFor(stt.fromLon) : yawFor(0);
      const yawTo = stt ? yawFor(stt.toLon) : yawFor(0);
      const e = stt?.ease ?? 1;
      globe.rotation.y = yawFrom + (yawTo - yawFrom) * e + Math.sin(elapsedMs / 9000) * 0.04;
      const tiltFrom = stt ? (stt.fromLat * Math.PI) / 180 : 0;
      const tiltTo = stt ? (stt.toLat * Math.PI) / 180 : 0;
      globe.rotation.x = (tiltFrom + (tiltTo - tiltFrom) * e) * 0.6;

      markerMeshes.forEach((g) => {
        const shown = stt?.revealed.has(g.userData.id as string) ?? false;
        const sc = shown ? 1 : 0.001;
        const pulse = shown ? 1 + 0.15 * Math.sin(elapsedMs / 600) : 0;
        g.scale.setScalar(sc);
        g.visible = shown;
        const ring = g.children[1] as THREE.Mesh;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.5 * Math.abs(Math.sin(elapsedMs / 700)) * (shown ? 1 : 0);
        ring.scale.setScalar(1 + pulse * 0.4);
      });
      arcLines.forEach((tube, i) => {
        tube.visible = stt?.arcs.has(i) ?? false;
      });
    };
    return { scene: s, camera, update };
  };

  ctx.save();
  ctx.globalAlpha = enter * leave;
  const cam = render3D(ctx, key, rect, build, env.elapsedMs);
  ctx.restore();

  if (cam) {
    ctx.save();
    ctx.globalAlpha = enter * leave;
    // Labels projected from each revealed marker's world position.
    const stt = globeState.get(key);
    const groupRotY = stt ? yawFor(stt.fromLon) + (yawFor(stt.toLon) - yawFor(stt.fromLon)) * stt.ease : 0;
    const groupRotX = stt ? ((stt.fromLat + (stt.toLat - stt.fromLat) * stt.ease) * Math.PI) / 180 * 0.6 : 0;
    const rotM = new THREE.Matrix4().makeRotationY(groupRotY).premultiply(new THREE.Matrix4().makeRotationX(groupRotX));

    // Two markers can project close together on screen (adjacent lon/lat, or
    // just the current rotation) and their chips — always offset the same
    // fixed way off the leader dot — would otherwise stack right on top of
    // each other. Greedy vertical nudge, same algorithm as orbit.ts's
    // resolveChipY; the active marker is placed first so it keeps its spot.
    const placedChips: { x: number; y: number; w: number; h: number }[] = [];
    const resolveChipY = (x: number, y: number, w: number, h: number): number => {
      const overlaps = (yy: number) => placedChips.some((p) => Math.abs(x - p.x) * 2 < w + p.w && Math.abs(yy - p.y) * 2 < h + p.h);
      let ny = y;
      let guard = 0;
      let dir = 1;
      while (overlaps(ny) && guard < 10) {
        guard++;
        ny = y + dir * h * 0.95 * Math.ceil(guard / 2);
        dir *= -1;
      }
      placedChips.push({ x, y: ny, w, h });
      return ny;
    };

    const visibleMarkers = scene.markers
      .filter((m) => revealed.has(m.id))
      .map((m) => {
        const world = lonLatToVec3(m.lon, m.lat, R * 1.02).applyMatrix4(rotM);
        const isActive = curStep?.highlight.includes(m.id) ?? false;
        return { m, world, isActive };
      })
      .filter(({ world }) => world.z >= -R * 0.2) // on the far side — hide the label
      .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1));

    visibleMarkers.forEach(({ m, world, isActive }) => {
      const sp = projectToRect(cam, world, rect);
      ctx.font = `${isActive ? 800 : 600} ${unit * 0.66}px ${FONT_SANS}`;
      const chipW = ctx.measureText(m.label).width + unit * 0.45 * 2;
      const chipH = unit * 1.2;
      const chipCx = sp.x + unit * 0.4 + chipW / 2;
      const resolvedY = resolveChipY(chipCx, sp.y, chipW, chipH);
      drawMarkerLabel(ctx, m.label, sp.x, sp.y, unit, accent, isActive, resolvedY);
    });
    // Arc labels near the arc apex.
    scene.arcs.forEach((a, i) => {
      if (!arcSet.has(i) || !a.label) return;
      const mid = lonLatToVec3((a.fromLon + a.toLon) / 2, (a.fromLat + a.toLat) / 2, R * 1.35).applyMatrix4(rotM);
      if (mid.z < 0) return;
      const sp = projectToRect(cam, mid, rect);
      ctx.save();
      ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
      ctx.fillStyle = a.style === "current" ? secondary : accent;
      ctx.textAlign = "center";
      ctx.fillText(a.label, sp.x, sp.y);
      ctx.restore();
    });
    ctx.restore();
  } else {
    drawGlobeFallback(ctx, scene, rect, revealed, curStep?.highlight ?? [], unit, accent, secondary, accentGlow, enter * leave);
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawMarkerLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  unit: number,
  accent: string,
  isActive: boolean,
  chipY: number = y
) {
  ctx.save();
  ctx.font = `${isActive ? 800 : 600} ${unit * 0.66}px ${FONT_SANS}`;
  const tw = ctx.measureText(label).width;
  const padX = unit * 0.45;
  const chipW = tw + padX * 2;
  const chipH = unit * 1.2;
  const bx = x + unit * 0.4;
  const by = chipY - chipH / 2;
  // The dot marks the marker's true position; when a collision nudge moved
  // the chip away from it, a short leader keeps the two connected.
  if (Math.abs(chipY - y) > 0.5) {
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * STROKE.hair;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx, chipY);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(THEME.bgBottom, 0.85);
  roundRect(ctx, bx, by, chipW, chipH, unit * 0.3);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, isActive ? 0.95 : 0.45);
  ctx.lineWidth = unit * (isActive ? STROKE.base : STROKE.hair);
  ctx.stroke();
  // Leader dot.
  ctx.beginPath();
  ctx.arc(x, y, unit * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + padX, by + chipH / 2);
  ctx.restore();
}

function drawGlobeFallback(
  ctx: CanvasRenderingContext2D,
  scene: Globe3dScene,
  rect: { x: number; y: number; w: number; h: number },
  revealed: Set<string>,
  highlight: string[],
  unit: number,
  accent: string,
  secondary: string,
  accentGlow: string,
  alpha: number
) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const rad = Math.min(rect.w, rect.h) * 0.4;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
  g.addColorStop(0, rgba(accent, 0.3));
  g.addColorStop(1, rgba(accent, 0.08));
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = unit * STROKE.base;
  ctx.stroke();
  // Graticule ellipses.
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad, rad * (i / 4), 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accent, 0.18);
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad * (i / 4), rad, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  scene.markers.forEach((m) => {
    if (!revealed.has(m.id)) return;
    const px = cx + (m.lon / 180) * rad * 0.9;
    const py = cy - (m.lat / 90) * rad * 0.9;
    const isActive = highlight.includes(m.id);
    const col = markerColor(m.kind, accent, secondary);
    ctx.beginPath();
    ctx.arc(px, py, unit * (isActive ? 0.26 : 0.18), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = isActive ? unit : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    drawMarkerLabel(ctx, m.label, px, py, unit, accent, isActive);
  });
  ctx.restore();
}
