import * as THREE from "three";
import * as d3Geo from "d3-geo";
import { render3D, projectToRect, studioLights, makeCylinder, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";
import {
  FONT_SANS,
  THEME,
  drawBackground,
  enterT,
  flowDots,
  glowRing,
  rgba,
  roundRect,
  strokePolylineProgress,
  sub,
  easeOutBack,
} from "./common";

export type GeomapScene = {
  kind: "geomap";
  id: string;
  sayIntro?: string;
  title: string;
  base: "india" | "world" | "asia" | "subcontinent" | "europe";
  markers?: {
    id: string;
    label: string;
    lon: number;
    lat: number;
    kind?: "city" | "battle" | "capital" | "port" | "peak" | "dot";
    icon?: string;
  }[];
  routes?: {
    id: string;
    points: { lon: number; lat: number }[];
    label?: string;
    style?: "route" | "river" | "wind" | "front";
  }[];
  regions?: {
    id: string;
    name: string;
    bounds?: { lon: number; lat: number }[];
  }[];
  steps: {
    reveal?: string[];
    highlight?: string[];
    focus?: { lon: number; lat: number; zoom?: number };
    say: string;
  }[];
};

const MAP_BOUNDS: Record<string, { center: [number, number]; scale: number }> = {
  india: { center: [78.9, 22.5], scale: 1200 },
  subcontinent: { center: [76.0, 20.0], scale: 1000 },
  asia: { center: [90.0, 30.0], scale: 500 },
  europe: { center: [15.0, 50.0], scale: 700 },
  world: { center: [0.0, 10.0], scale: 240 },
};

export function paintGeomap(ctx: CanvasRenderingContext2D, scene: GeomapScene, env: PaintEnv) {
  const { layout, palette } = env;
  drawBackground(ctx, layout.w, layout.h, env.elapsedMs, palette, scene.id ? 0 : 1);

  const tEnt = enterT(env, 380);
  ctx.save();
  ctx.globalAlpha = tEnt;

  const titleY = layout.contentY + layout.unit * 0.8;
  ctx.font = `700 ${Math.round(layout.unit * 1.05)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(scene.title, layout.w / 2, layout.contentY);

  const mapY = titleY + layout.unit * 1.5;
  const mapW = layout.contentW;
  const mapH = layout.contentH - layout.unit * 2.8;
  const mapX = layout.contentX;
  const rect = { x: mapX, y: mapY, w: mapW, h: mapH };

  roundRect(ctx, mapX, mapY, mapW, mapH, layout.unit * 0.5);
  ctx.fillStyle = rgba(THEME.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const activeStepIdx = Math.min(
    scene.steps.length - 1,
    Math.floor((env.p * (scene.sayIntro ? scene.steps.length + 0.5 : scene.steps.length)))
  );
  const activeStep = scene.steps[Math.max(0, activeStepIdx)];

  const baseConfig = MAP_BOUNDS[scene.base] ?? MAP_BOUNDS.india;
  let centerLon = baseConfig.center[0];
  let centerLat = baseConfig.center[1];
  let scale = baseConfig.scale * (layout.w / 1280);

  if (activeStep?.focus) {
    centerLon = activeStep.focus.lon;
    centerLat = activeStep.focus.lat;
    scale *= activeStep.focus.zoom ?? 1.5;
  }

  const projection = d3Geo
    .geoEquirectangular()
    .center([centerLon, centerLat])
    .translate([mapX + mapW / 2, mapY + mapH / 2])
    .scale(scale);

  const spreadX = 5.5;
  const spreadZ = 3.5;
  
  const worldPos = (mx: number, my: number) => {
    const cx = (mx - mapX) / mapW - 0.5;
    const cy = (my - mapY) / mapH - 0.5;
    return new THREE.Vector3(cx * spreadX * 2, 0, cy * spreadZ * 2);
  };

  const key = scene.id + "-geo3d";
  
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 10, 7);
    camera.lookAt(0, 0, 0);
    studioLights(s, palette.accent, "rgba(148,163,184,0.5)");
    
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(palette.accent), new THREE.Color("#31435a"));
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

    const models = (scene.markers || []).map((m, mIdx) => {
      const color = m.kind === "battle" ? "#ef4444" : m.kind === "capital" ? palette.accent : palette.secondary;
      const g = makeCylinder(0.15, 0.4, color, palette.accent);
      s.add(g);
      return { m, mIdx, mesh: g };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ m, mIdx, mesh }) => {
        const isHighlight = activeStep?.highlight?.includes(m.id);
        const isRevealed = activeStep?.reveal?.includes(m.id) || isHighlight || activeStepIdx >= mIdx;
        
        const pt = projection([m.lon, m.lat]);
        if (!pt || !isRevealed) {
            mesh.visible = false;
            return;
        }
        mesh.visible = true;

        const popT = easeOutBack(sub(env.p, mIdx * 0.1, 0.15));
        mesh.scale.setScalar(Math.max(0.001, popT));
        
        const wp = worldPos(pt[0], pt[1]);
        mesh.position.copy(wp);
        mesh.position.y = (popT <= 0 ? -0.4 : 0) + (isHighlight ? 0.2 : 0) + Math.sin(elapsedMs / 1500 + pt[0]) * 0.05;
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) { ctx.restore(); return; }

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, mapX, mapY, mapW, mapH, layout.unit * 0.5);
  ctx.clip();

  // Map Graticule mapped to 3D
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const graticule = d3Geo.geoGraticule().step([10, 10]);
  const lines = graticule.lines();
  ctx.beginPath();
  lines.forEach(line => {
      let first = true;
      line.coordinates.forEach(coord => {
          const pt = projection(coord);
          if(pt) {
              const wp = worldPos(pt[0], pt[1]);
              const sp = projectToRect(cam, wp, rect);
              if(first) { ctx.moveTo(sp.x, sp.y); first = false; }
              else ctx.lineTo(sp.x, sp.y);
          }
      });
  });
  ctx.stroke();

  if (scene.regions) {
    scene.regions.forEach((reg) => {
      const isRevealed = activeStep?.reveal?.includes(reg.id) || activeStep?.highlight?.includes(reg.id);
      if (isRevealed && reg.bounds && reg.bounds.length > 2) {
        ctx.beginPath();
        let first = true;
        reg.bounds.forEach(b => {
            const pt = projection([b.lon, b.lat]);
            if(pt) {
                const sp = projectToRect(cam, worldPos(pt[0], pt[1]), rect);
                if(first) { ctx.moveTo(sp.x, sp.y); first = false; }
                else ctx.lineTo(sp.x, sp.y);
            }
        });
        ctx.closePath();
        ctx.fillStyle = palette.accentSoft;
        ctx.fill();
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }

  if (scene.routes) {
    scene.routes.forEach((route, rIdx) => {
      const isRevealed = !activeStep || activeStep.reveal?.includes(route.id) || activeStep.highlight?.includes(route.id) || true;
      if (!isRevealed) return;

      const screenPts = route.points
        .map((p) => projection([p.lon, p.lat]))
        .filter((pt): pt is [number, number] => pt !== null)
        .map(([x, y]) => projectToRect(cam, worldPos(x, y), rect));

      if (screenPts.length < 2) return;

      let color = palette.accent;
      if (route.style === "river") color = "#38bdf8";
      else if (route.style === "wind") color = "#a855f7";
      else if (route.style === "front") color = "#ef4444";

      ctx.strokeStyle = color;
      ctx.lineWidth = route.style === "river" ? 3 : 2;
      ctx.setLineDash(route.style === "wind" ? [6, 4] : []);
      
      const tip = strokePolylineProgress(ctx, screenPts, Math.min(1, env.p * 1.5));
      ctx.setLineDash([]);

      if (tip.done) {
        flowDots(ctx, screenPts, env, {
          count: route.style === "wind" ? 4 : 2,
          speedMs: 2200,
          r: route.style === "river" ? 3.5 : 2.5,
          color,
        });
      }
    });
  }

  if (scene.markers) {
    scene.markers.forEach((m, mIdx) => {
      const isHighlight = activeStep?.highlight?.includes(m.id);
      const isRevealed = activeStep?.reveal?.includes(m.id) || isHighlight || activeStepIdx >= mIdx;
      if (!isRevealed) return;

      const pt = projection([m.lon, m.lat]);
      if (!pt) return;
      const [mx, my] = pt;
      const wp = worldPos(mx, my);
      const popT = easeOutBack(sub(env.p, mIdx * 0.1, 0.15));
      // incorporate the bobbing from update
      wp.y = (popT <= 0 ? -0.4 : 0) + (isHighlight ? 0.2 : 0) + Math.sin(env.elapsedMs / 1500 + mx) * 0.05;
      
      // We want the label to be placed near the top of the cylinder.
      // cylinder height is 0.4, let's offset it up by 0.3
      wp.y += 0.3;
      const sp = projectToRect(cam, wp, rect);

      if (isHighlight) {
        const radius = Math.max(4, Math.round(layout.unit * 0.45 * popT));
        glowRing(ctx, sp.x, sp.y, radius, palette.accent, env);
      }

      ctx.font = `600 ${Math.round(layout.unit * 0.55)}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(m.label, sp.x, sp.y - 4);
    });
  }

  ctx.restore();

  if (activeStep?.say) {
    const bannerH = layout.unit * 1.8;
    const bannerY = mapY + mapH - bannerH - layout.unit * 0.3;
    const bannerW = mapW - layout.unit * 1.2;
    const bannerX = mapX + layout.unit * 0.6;

    roundRect(ctx, bannerX, bannerY, bannerW, bannerH, layout.unit * 0.3);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = palette.accentGlow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `600 ${Math.round(layout.unit * 0.6)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(activeStep.say, bannerX + bannerW / 2, bannerY + bannerH / 2, bannerW - 20);
  }

  ctx.restore();
}
