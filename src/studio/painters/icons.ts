import { rgba, type Palette } from "./common";
import type { PaintEnv } from "./index";

/**
 * ByteByteGo-style concept icons, drawn as clean LINE-ART (crisp accent strokes,
 * minimal fill, rounded joins) — the look of their system-design diagrams: a
 * desktop for "client", a server stack for "server", a cloud for DNS, etc., NOT
 * emoji. Every "icon" field in a script is a free string; `drawIcon` upgrades
 * KNOWN concept names to these vector glyphs (with subtle deterministic idle
 * life — blinking LEDs, flowing packets, a spinning gear) and falls back to
 * emoji for anything else, so existing scripts keep working.
 *
 * Contract mirrors the painters: deterministic (motion only from env.elapsedMs),
 * colour from the subject palette, sized in px (icon fills a size×size box
 * centred on cx,cy).
 */

type Env = Pick<PaintEnv, "elapsedMs" | "palette">;

const ALIASES: Record<string, string> = {
  db: "database", datastore: "database", sql: "database", postgres: "database", mysql: "database",
  redis: "cache", memcached: "cache", lb: "loadbalancer", balancer: "loadbalancer",
  users: "client", person: "client", customer: "client", desktop: "client", pc: "client", computer: "client",
  phone: "mobile", app: "mobile", web: "browser", website: "browser", frontend: "browser",
  backend: "server", service: "server", host: "server", vm: "server", node: "server",
  internet: "cloud", cdn: "cloud", storage: "harddrive", hdd: "harddrive", ssd: "harddrive",
  bucket: "harddrive", volume: "harddrive", disk: "harddrive",
  auth: "shield", security: "shield", lock: "shield", firewall: "shield",
  processor: "cpu", compute: "cpu", world: "globe", earth: "globe", map: "globe",
  msg: "message", email: "message", mail: "message", topic: "queue", broker: "queue", kafka: "queue",
  settings: "gear", config: "gear", worker: "gear", router: "network", switch: "network",
  log: "logfile", logs: "document", file: "document", doc: "document", resolver: "dns", nameserver: "dns",
};

const DRAWERS = new Set([
  "server", "database", "cache", "queue", "client", "mobile", "browser", "cloud",
  "api", "loadbalancer", "cpu", "harddrive", "network", "shield", "gear", "globe",
  "message", "logfile", "document", "dns",
]);

function canonical(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  const mapped = ALIASES[k] ?? k;
  return DRAWERS.has(mapped) ? mapped : null;
}

/** True when `name` resolves to a vector icon (so callers can reserve layout). */
export function isVectorIcon(name: string | undefined): boolean {
  return !!name && canonical(name) !== null;
}

const idle = (env: Env, periodMs: number, phase = 0) =>
  0.5 + 0.5 * Math.sin((env.elapsedMs / periodMs) * Math.PI * 2 + phase);

/**
 * Draw `name` centred at (cx,cy) within a size×size box. Returns true if a
 * vector icon was drawn, false if it fell back to emoji.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  cy: number,
  size: number,
  env: Env,
  color?: string
): boolean {
  const key = canonical(name);
  if (!key) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${size * 0.82}px -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillText(name, cx, cy);
    ctx.restore();
    return false;
  }
  const accent = color ?? env.palette.accent;
  ctx.save();
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  (RENDER[key] as IconFn)(ctx, cx, cy, size, env, accent);
  ctx.restore();
  return true;
}

type IconFn = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, env: Env, accent: string) => void;

/** Soft translucent fill for an enclosed line-art shape (path already built). */
function tint(ctx: CanvasRenderingContext2D, accent: string, a = 0.08) {
  const prev = ctx.fillStyle;
  ctx.fillStyle = rgba(accent, a);
  ctx.fill();
  ctx.fillStyle = prev;
}

/** Rounded-rect path (no stroke/fill). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const RENDER: Record<string, IconFn> = {
  // Three stacked rack units with a blinking status LED — ByteByteGo's server.
  server(ctx, cx, cy, s, env, accent) {
    const w = s * 0.66, h = s * 0.2, gap = s * 0.07;
    const x = cx - w / 2;
    let y = cy - (h * 3 + gap * 2) / 2;
    for (let i = 0; i < 3; i++) {
      rr(ctx, x, y, w, h, s * 0.03);
      tint(ctx, accent, 0.06);
      ctx.stroke();
      // Vent slits.
      ctx.save();
      ctx.lineWidth = Math.max(1, s * 0.02);
      for (let v = 0; v < 3; v++) {
        const vx = x + s * 0.08 + v * s * 0.045;
        ctx.beginPath();
        ctx.moveTo(vx, y + h * 0.32);
        ctx.lineTo(vx, y + h * 0.68);
        ctx.stroke();
      }
      ctx.restore();
      // LED.
      const on = idle(env, 1100, i * 2.1) > 0.4;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.3;
      if (on) { ctx.shadowColor = accent; ctx.shadowBlur = s * 0.05; }
      ctx.beginPath();
      ctx.arc(x + w - s * 0.07, y + h / 2, s * 0.026, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      y += h + gap;
    }
  },

  // Cylinder — top ellipse, sides, bottom curve, two seam ellipses.
  database(ctx, cx, cy, s, env, accent) {
    const w = s * 0.54, rx = w / 2, ry = s * 0.11;
    const top = cy - s * 0.32, bot = cy + s * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx - rx, top);
    ctx.lineTo(cx - rx, bot);
    ctx.ellipse(cx, bot, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + rx, top);
    ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI, false);
    tint(ctx, accent, 0.06);
    ctx.stroke();
    // Top rim (pulses).
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * idle(env, 1800);
    ctx.beginPath();
    ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Seams.
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, top + (bot - top) * (i / 3), rx, ry, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  },

  // Chip outline + lightning bolt.
  cache(ctx, cx, cy, s, env, accent) {
    const w = s * 0.6;
    rr(ctx, cx - w / 2, cy - w / 2, w, w, s * 0.08);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    const flick = 0.6 + 0.4 * idle(env, 650);
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, cy - s * 0.2);
    ctx.lineTo(cx - s * 0.11, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.01, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.05, cy + s * 0.2);
    ctx.lineTo(cx + s * 0.13, cy - s * 0.04);
    ctx.lineTo(cx + s * 0.01, cy - s * 0.04);
    ctx.closePath();
    tint(ctx, accent, 0.85);
    ctx.stroke();
    ctx.restore();
  },

  // FIFO cells + arrow + a packet flowing through.
  queue(ctx, cx, cy, s, env, accent) {
    const n = 4, cw = s * 0.14, gap = s * 0.035, h = s * 0.32;
    const totalW = n * cw + (n - 1) * gap;
    const x0 = cx - totalW / 2, y = cy - h / 2 - s * 0.05;
    for (let i = 0; i < n; i++) {
      rr(ctx, x0 + i * (cw + gap), y, cw, h, s * 0.03);
      ctx.stroke();
    }
    const t = (env.elapsedMs / 1400) % 1;
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = s * 0.06;
    ctx.beginPath();
    ctx.arc(x0 + t * totalW, cy - s * 0.05, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Direction arrow beneath.
    const ay = y + h + s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x0, ay);
    ctx.lineTo(x0 + totalW, ay);
    ctx.moveTo(x0 + totalW - s * 0.05, ay - s * 0.045);
    ctx.lineTo(x0 + totalW, ay);
    ctx.lineTo(x0 + totalW - s * 0.05, ay + s * 0.045);
    ctx.stroke();
  },

  // Desktop monitor + stand + base — the "client" ByteByteGo uses.
  client(ctx, cx, cy, s, env, accent) {
    const w = s * 0.7, h = s * 0.5, x = cx - w / 2, y = cy - h / 2 - s * 0.08;
    rr(ctx, x, y, w, h, s * 0.05);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    // Stand.
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.09, y + h + s * 0.12);
    ctx.lineTo(cx - s * 0.03, y + h);
    ctx.lineTo(cx + s * 0.03, y + h);
    ctx.lineTo(cx + s * 0.09, y + h + s * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.16, y + h + s * 0.12);
    ctx.lineTo(cx + s * 0.16, y + h + s * 0.12);
    ctx.stroke();
    // Blinking content lines on screen.
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.globalAlpha = 0.4 + 0.4 * idle(env, 2000);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, y + h * (0.4 + i * 0.28));
      ctx.lineTo(x + w * (0.84 - i * 0.24), y + h * (0.4 + i * 0.28));
      ctx.stroke();
    }
    ctx.restore();
  },

  mobile(ctx, cx, cy, s, env, accent) {
    const w = s * 0.4, h = s * 0.66, x = cx - w / 2, y = cy - h / 2;
    rr(ctx, x, y, w, h, s * 0.07);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    // Speaker + home line.
    ctx.beginPath(); ctx.moveTo(cx - w * 0.14, y + h * 0.08); ctx.lineTo(cx + w * 0.14, y + h * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * 0.16, y + h * 0.92); ctx.lineTo(cx + w * 0.16, y + h * 0.92); ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.4 * idle(env, 2200);
    rr(ctx, x + w * 0.16, y + h * 0.2, w * 0.68, h * 0.52, s * 0.02);
    ctx.stroke();
    ctx.restore();
  },

  browser(ctx, cx, cy, s, env, accent) {
    const w = s * 0.72, h = s * 0.54, x = cx - w / 2, y = cy - h / 2;
    rr(ctx, x, y, w, h, s * 0.05);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.26); ctx.lineTo(x + w, y + h * 0.26); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + s * 0.07 + i * s * 0.055, y + h * 0.13, s * 0.02, 0, Math.PI * 2);
      ctx.stroke();
    }
    const t = (env.elapsedMs / 2600) % 1;
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.03);
    for (let i = 0; i < 3; i++) {
      const lw = w * (0.72 - i * 0.16) * Math.min(1, t * 3 - i);
      if (lw > 0) {
        ctx.beginPath();
        ctx.moveTo(x + s * 0.07, y + h * 0.46 + i * h * 0.16);
        ctx.lineTo(x + s * 0.07 + lw, y + h * 0.46 + i * h * 0.16);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  cloud(ctx, cx, cy, s, env, accent) {
    const drift = (idle(env, 3400) - 0.5) * s * 0.03;
    ctx.save();
    ctx.translate(drift, s * 0.04);
    ctx.beginPath();
    ctx.arc(cx - s * 0.2, cy, s * 0.15, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(cx - s * 0.04, cy - s * 0.13, s * 0.18, Math.PI * 0.98, Math.PI * 1.9);
    ctx.arc(cx + s * 0.2, cy - s * 0.05, s * 0.16, Math.PI * 1.35, Math.PI * 2.15);
    ctx.arc(cx + s * 0.22, cy, s * 0.12, Math.PI * 1.85, Math.PI * 0.5);
    ctx.closePath();
    tint(ctx, accent, 0.06);
    ctx.stroke();
    ctx.restore();
  },

  // DNS: a server stack tucked inside a cloud (as in the reference).
  dns(ctx, cx, cy, s, env, accent) {
    RENDER.cloud(ctx, cx, cy - s * 0.06, s * 1.08, env, accent);
    RENDER.server(ctx, cx, cy + s * 0.03, s * 0.66, env, accent);
  },

  api(ctx, cx, cy, s, env, accent) {
    ctx.lineWidth = Math.max(2, s * 0.055);
    const bh = s * 0.5;
    const brace = (dir: number) => {
      const bx = cx + dir * s * 0.14;
      ctx.beginPath();
      ctx.moveTo(bx, cy - bh / 2);
      ctx.quadraticCurveTo(bx + dir * s * 0.13, cy - bh / 2, bx + dir * s * 0.13, cy - bh * 0.18);
      ctx.quadraticCurveTo(bx + dir * s * 0.13, cy, bx + dir * s * 0.22, cy);
      ctx.quadraticCurveTo(bx + dir * s * 0.13, cy, bx + dir * s * 0.13, cy + bh * 0.18);
      ctx.quadraticCurveTo(bx + dir * s * 0.13, cy + bh / 2, bx, cy + bh / 2);
      ctx.stroke();
    };
    brace(-1); brace(1);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * idle(env, 1200);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  loadbalancer(ctx, cx, cy, s, env, accent) {
    const inX = cx - s * 0.3, outX = cx + s * 0.24;
    const ys = [cy - s * 0.22, cy, cy + s * 0.22];
    const active = Math.floor((env.elapsedMs / 700) % 3);
    ys.forEach((oy, i) => {
      ctx.save();
      ctx.globalAlpha = i === active ? 1 : 0.35;
      ctx.beginPath();
      ctx.moveTo(inX + s * 0.08, cy);
      ctx.quadraticCurveTo(cx, cy, outX, oy);
      ctx.stroke();
      ctx.restore();
    });
    ctx.beginPath(); ctx.arc(inX, cy, s * 0.08, 0, Math.PI * 2); tint(ctx, accent, 0.1); ctx.stroke();
    ys.forEach((oy, i) => {
      ctx.save();
      ctx.globalAlpha = i === active ? 1 : 0.4;
      if (i === active) { ctx.shadowColor = accent; ctx.shadowBlur = s * 0.06; }
      rr(ctx, outX, oy - s * 0.06, s * 0.14, s * 0.12, s * 0.02);
      ctx.stroke();
      ctx.restore();
    });
  },

  cpu(ctx, cx, cy, s, env, accent) {
    const w = s * 0.46, x = cx - w / 2, y = cy - w / 2;
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.03);
    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      ctx.beginPath(); ctx.moveTo(x + w * f, y - s * 0.08); ctx.lineTo(x + w * f, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * f, y + w); ctx.lineTo(x + w * f, y + w + s * 0.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - s * 0.08, y + w * f); ctx.lineTo(x, y + w * f); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w, y + w * f); ctx.lineTo(x + w + s * 0.08, y + w * f); ctx.stroke();
    }
    ctx.restore();
    rr(ctx, x, y, w, w, s * 0.05); tint(ctx, accent, 0.05); ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * idle(env, 1500);
    rr(ctx, x + w * 0.28, y + w * 0.28, w * 0.44, w * 0.44, s * 0.03);
    ctx.stroke();
    ctx.restore();
  },

  // Hard drive: body + platter circle + read arm (matches the reference).
  harddrive(ctx, cx, cy, s, env, accent) {
    const w = s * 0.72, h = s * 0.5, x = cx - w / 2, y = cy - h / 2;
    rr(ctx, x, y, w, h, s * 0.06);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    // Platter.
    ctx.beginPath(); ctx.arc(cx - w * 0.1, cy, h * 0.32, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - w * 0.1, cy, h * 0.12, 0, Math.PI * 2); ctx.stroke();
    // Read arm sweeps.
    const ang = -0.6 + 0.5 * idle(env, 2600);
    ctx.save();
    ctx.translate(cx + w * 0.28, y + h * 0.24);
    ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.36, h * 0.3); ctx.stroke();
    ctx.restore();
    // Corner mount screws.
    [[x + s * 0.06, y + s * 0.06], [x + w - s * 0.06, y + s * 0.06], [x + s * 0.06, y + h - s * 0.06], [x + w - s * 0.06, y + h - s * 0.06]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, s * 0.016, 0, Math.PI * 2); ctx.fill();
    });
  },

  network(ctx, cx, cy, s, env, accent) {
    const pts = [
      { x: cx, y: cy - s * 0.26 },
      { x: cx - s * 0.28, y: cy + s * 0.2 },
      { x: cx + s * 0.28, y: cy + s * 0.2 },
    ];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      ctx.save(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
      const t = (env.elapsedMs / 1600 + i / 3) % 1;
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, s * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.075, 0, Math.PI * 2); tint(ctx, accent, 0.1); ctx.stroke(); });
  },

  shield(ctx, cx, cy, s, env, accent) {
    const w = s * 0.5, h = s * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy - h / 2 + h * 0.2);
    ctx.lineTo(cx + w / 2, cy + h * 0.1);
    ctx.quadraticCurveTo(cx + w / 2, cy + h / 2, cx, cy + h / 2);
    ctx.quadraticCurveTo(cx - w / 2, cy + h / 2, cx - w / 2, cy + h * 0.1);
    ctx.lineTo(cx - w / 2, cy - h / 2 + h * 0.2);
    ctx.closePath();
    tint(ctx, accent, 0.08);
    ctx.stroke();
    ctx.save();
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.11, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.02, cy + s * 0.12);
    ctx.lineTo(cx + s * 0.13, cy - s * 0.11);
    ctx.stroke();
    ctx.restore();
  },

  gear(ctx, cx, cy, s, env, accent) {
    const teeth = 8, rOut = s * 0.28, rIn = s * 0.2;
    const rot = (env.elapsedMs / 4000) * Math.PI * 2;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const ang = rot + (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? rOut : rIn;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    tint(ctx, accent, 0.06);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.09, 0, Math.PI * 2); ctx.stroke();
  },

  globe(ctx, cx, cy, s, env, accent) {
    const r = s * 0.3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); tint(ctx, accent, 0.05); ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.7;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * Math.abs(0.35 + i * 0.3), 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    const ph = (env.elapsedMs / 5000) % 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * Math.abs(Math.cos(ph * Math.PI * 2)) + 1, r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },

  message(ctx, cx, cy, s, env, accent) {
    const w = s * 0.62, h = s * 0.44, x = cx - w / 2, y = cy - h / 2;
    rr(ctx, x, y, w, h, s * 0.05);
    tint(ctx, accent, 0.05);
    ctx.stroke();
    const open = 0.5 + 0.5 * idle(env, 2400);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.02, y + s * 0.02);
    ctx.lineTo(cx, y + h * (0.34 + 0.16 * open));
    ctx.lineTo(x + w - s * 0.02, y + s * 0.02);
    ctx.stroke();
  },

  // Document with a folded corner + text lines (log/file).
  document(ctx, cx, cy, s, env, accent) {
    const w = s * 0.5, h = s * 0.64, x = cx - w / 2, y = cy - h / 2, fold = s * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - fold, y);
    ctx.lineTo(x + w, y + fold);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    tint(ctx, accent, 0.05);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - fold, y); ctx.lineTo(x + w - fold, y + fold); ctx.lineTo(x + w, y + fold); ctx.stroke();
    ctx.save();
    ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.globalAlpha = 0.7;
    const rows = Math.round(2 + 2 * idle(env, 1800));
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = i < rows ? 0.75 : 0.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, y + h * 0.35 + i * h * 0.15);
      ctx.lineTo(x + w * (0.84 - (i % 2) * 0.2), y + h * 0.35 + i * h * 0.15);
      ctx.stroke();
    }
    ctx.restore();
  },

  logfile(ctx, cx, cy, s, env, accent) {
    RENDER.document(ctx, cx, cy, s, env, accent);
    ctx.save();
    ctx.font = `700 ${s * 0.16}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("LOG", cx, cy + s * 0.06);
    ctx.restore();
  },
};
