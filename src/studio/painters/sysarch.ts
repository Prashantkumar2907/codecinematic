import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  isoBox3D,
  flowDots,
  roundedCorners,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type SysarchScene = Extract<Scene, { kind: "sysarch" }>;
type Tier = SysarchScene["tiers"][number];

/** Tier kind → vector-icon name understood by drawIcon. */
const ICON: Record<Tier["kind"], string> = {
  client: "client",
  cdn: "cloud",
  gateway: "api",
  lb: "loadbalancer",
  app: "server",
  worker: "gear",
  cache: "cache",
  queue: "queue",
  db: "database",
  storage: "harddrive",
};

/**
 * A cloud-native tiered architecture diagram (client → CDN → gateway → LB → app
 * tier → cache/db). Tiers reveal one per beat as extruded depth cards; a tier
 * with count>1 shows stacked replica cards behind it (horizontal scaling). Flows
 * connect tiers with animated packets. The row lays left→right in 16:9 and
 * top→bottom in 9:16 so it never overflows the narrow frame.
 */
export function paintSysarch(ctx: CanvasRenderingContext2D, scene: SysarchScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const n = scene.tiers.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // How many tiers are revealed (fractional for the incoming one).
  const stepT = activeIdx >= 0 ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  const revealed = activeIdx < 0 ? 0 : activeIdx + easeOutCubic(clamp01(stepT * 1.5));

  // Card geometry + centre points, laid along the main axis.
  const depth = unit * 0.55;
  const gapMain = vertical ? areaH / n : contentW / n;
  const cardW = vertical ? Math.min(contentW * 0.62, unit * 9) : Math.min(gapMain * 0.72, unit * 6.5);
  const cardH = vertical ? Math.min(gapMain * 0.62, unit * 3.4) : Math.min(areaH * 0.42, unit * 4.2);
  const pos = (i: number) => {
    const t = (i + 0.5) / n;
    return vertical
      ? { x: contentX + contentW / 2, y: areaY + t * areaH }
      : { x: contentX + t * contentW, y: areaY + areaH * 0.44 };
  };

  // Flow connectors between revealed tiers (drawn behind the cards).
  const idxOf = new Map(scene.tiers.map((t, i) => [t.id, i] as const));
  scene.flows.forEach((f) => {
    const ai = idxOf.get(f.from);
    const bi = idxOf.get(f.to);
    if (ai == null || bi == null) return;
    const aIn = clamp01(revealed - ai);
    const bIn = clamp01(revealed - bi);
    if (aIn <= 0) return;
    const a = pos(ai);
    const b = pos(bi);
    // Route to the near edges of the cards.
    const a2 = { x: a.x, y: a.y };
    const b2 = { x: b.x, y: b.y };
    if (!vertical) {
      a2.x += cardW / 2;
      b2.x -= cardW / 2;
    } else {
      a2.y += cardH / 2;
      b2.y -= cardH / 2;
    }
    const grow = clamp01(bIn > 0 ? 1 : aIn);
    const end = { x: a2.x + (b2.x - a2.x) * grow, y: a2.y + (b2.y - a2.y) * grow };
    const pts = roundedCorners([a2, end], unit * 0.4);
    ctx.save();
    ctx.globalAlpha = introIn * (0.4 + 0.5 * grow);
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * 0.09;
    ctx.lineCap = "round";
    if (f.style === "dashed") ctx.setLineDash([unit * 0.4, unit * 0.3]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (grow > 0.4) flowDots(ctx, [a2, end], env, { count: 2, speedMs: 1500, r: unit * 0.15, color: accent });
    if (f.label && grow > 0.6) {
      ctx.save();
      ctx.globalAlpha = introIn * grow;
      ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      const mid = { x: (a2.x + end.x) / 2, y: (a2.y + end.y) / 2 };
      const tw = ctx.measureText(f.label).width;
      ctx.fillStyle = "rgba(10,16,22,0.8)";
      roundRect(ctx, mid.x - tw / 2 - unit * 0.3, mid.y - unit * 0.55, tw + unit * 0.6, unit * 0.95, unit * 0.25);
      ctx.fill();
      ctx.fillStyle = THEME.textDim;
      ctx.textBaseline = "middle";
      ctx.fillText(f.label, mid.x, mid.y);
      ctx.restore();
    }
  });

  // Tier cards.
  scene.tiers.forEach((tier, i) => {
    const local = clamp01(revealed - i);
    if (local <= 0) return;
    const { x, y } = pos(i);
    const isActive = i === activeIdx;
    const appear = easeOutBack(clamp01(local * 1.1));
    const scale = 0.6 + 0.4 * appear;
    const w = cardW * scale;
    const hgt = cardH * scale;
    const bx = x - w / 2;
    const by = y - hgt / 2;
    const face = isActive ? accent : secondary;

    ctx.save();
    ctx.globalAlpha = introIn * clamp01(local * 1.4);

    // Replica stack behind the primary card (horizontal scaling).
    const reps = Math.min(tier.count, 5);
    for (let k = reps - 1; k >= 1; k--) {
      const dx = k * unit * 0.35;
      const dy = -k * unit * 0.32;
      ctx.globalAlpha = introIn * clamp01(local * 1.4) * (0.35 + 0.12 * (reps - k));
      isoBox3D(ctx, bx + dx, by + dy, w, hgt, depth, face.toString());
    }
    ctx.globalAlpha = introIn * clamp01(local * 1.4);
    isoBox3D(ctx, bx, by, w, hgt, depth, face.toString(), isActive ? accentGlow : undefined);

    // Glyph + label.
    const bob = isActive ? Math.sin(env.elapsedMs / 1300) * unit * 0.06 : 0;
    drawIcon(ctx, ICON[tier.kind], x, by + hgt * 0.36 + bob, hgt * 0.44, env, "#eaf3ff");
    const labelPx = fitFontSize(ctx, tier.label, { maxW: w * 0.86, startPx: unit * 0.82, minPx: unit * 0.55, weight: 700 });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tier.label, x, by + hgt * 0.78);

    // Replica count badge.
    if (tier.count > 1) {
      const badge = `×${tier.count}`;
      ctx.font = `800 ${unit * 0.6}px ${FONT_SANS}`;
      const tw = ctx.measureText(badge).width;
      const bxr = bx + w - unit * 0.2;
      const byr = by - unit * 0.2;
      ctx.fillStyle = accent;
      roundRect(ctx, bxr - tw - unit * 0.5, byr - unit * 0.1, tw + unit * 0.7, unit * 1.0, unit * 0.3);
      ctx.fill();
      ctx.fillStyle = "#08131f";
      ctx.fillText(badge, bxr - tw / 2 - unit * 0.15, byr + unit * 0.42);
    }

    if (isActive) {
      const g = 0.5 + 0.5 * idle(env, 1600);
      ctx.globalAlpha = introIn * g * 0.7;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.1;
      roundRect(ctx, bx - unit * 0.2, by - unit * 0.2, w + unit * 0.4, hgt + unit * 0.4, unit * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
