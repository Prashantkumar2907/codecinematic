/**
 * Shared canvas utilities for word/fact video panels.
 */

/** Word-wrap text to fit within maxWidth on a canvas context. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draw a background on the canvas: either an ImageBitmap or a gradient preset. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgPreset: BgPreset,
  bgImage: ImageBitmap | null
) {
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, w, h);
    // Darkening overlay so text stays readable
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, w, h);
  } else {
    const { stops } = bgPreset;
    const grad = ctx.createLinearGradient(
      stops.x0 * w,
      stops.y0 * h,
      stops.x1 * w,
      stops.y1 * h
    );
    stops.colors.forEach(([pos, color]) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

export type BgPreset = {
  id: string;
  label: string;
  stops: {
    x0: number; y0: number;
    x1: number; y1: number;
    colors: [number, string][];
  };
  preview: string; // CSS gradient string for the swatch
};

export const BG_PRESETS: BgPreset[] = [
  {
    id: "cosmic",
    label: "Dark Cosmic",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0f0c29"], [0.5, "#302b63"], [1, "#24243e"]] },
    preview: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
  },
  {
    id: "midnight",
    label: "Midnight Blue",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#0d1b2a"], [0.6, "#1b2a4a"], [1, "#0a0e1a"]] },
    preview: "linear-gradient(180deg, #0d1b2a, #1b2a4a, #0a0e1a)",
  },
  {
    id: "ember",
    label: "Warm Ember",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a0000"], [0.5, "#3d0c02"], [1, "#1a0a00"]] },
    preview: "linear-gradient(135deg, #1a0000, #3d0c02, #1a0a00)",
  },
  {
    id: "forest",
    label: "Forest Dark",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0a1a0f"], [0.5, "#122a1a"], [1, "#071208"]] },
    preview: "linear-gradient(135deg, #0a1a0f, #122a1a, #071208)",
  },
  {
    id: "slate",
    label: "Slate Storm",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#1c1c2e"], [0.5, "#2a2a3e"], [1, "#111120"]] },
    preview: "linear-gradient(180deg, #1c1c2e, #2a2a3e, #111120)",
  },
  {
    id: "aurora",
    label: "Aurora Borealis",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0a1628"], [0.4, "#0d3b2e"], [0.7, "#0a2040"], [1, "#07101e"]] },
    preview: "linear-gradient(135deg, #0a1628, #0d3b2e, #0a2040)",
  },
  {
    id: "plum",
    label: "Deep Plum",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a0a2e"], [0.5, "#2d1b4e"], [1, "#0f0520"]] },
    preview: "linear-gradient(135deg, #1a0a2e, #2d1b4e, #0f0520)",
  },
  {
    id: "ocean",
    label: "Deep Ocean",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#000d1a"], [0.5, "#001a33"], [1, "#000810"]] },
    preview: "linear-gradient(135deg, #000d1a, #001a33, #000810)",
  },
  {
    id: "nebula",
    label: "Nebula",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0a0020"], [0.3, "#200040"], [0.6, "#0a1530"], [1, "#050010"]] },
    preview: "linear-gradient(135deg, #0a0020, #200040, #0a1530)",
  },
  {
    id: "ashen",
    label: "Ashen",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#111111"], [0.5, "#1f1f1f"], [1, "#0a0a0a"]] },
    preview: "linear-gradient(180deg, #111111, #1f1f1f, #0a0a0a)",
  },
  {
    id: "rose_dark",
    label: "Crimson Dark",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a0010"], [0.5, "#2e0020"], [1, "#0f0008"]] },
    preview: "linear-gradient(135deg, #1a0010, #2e0020, #0f0008)",
  },
  {
    id: "teal_dark",
    label: "Teal Abyss",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#001a1a"], [0.5, "#003333"], [1, "#000d0d"]] },
    preview: "linear-gradient(135deg, #001a1a, #003333, #000d0d)",
  },
  {
    id: "gold_dark",
    label: "Gilded Dark",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a1200"], [0.5, "#2e2000"], [1, "#100c00"]] },
    preview: "linear-gradient(135deg, #1a1200, #2e2000, #100c00)",
  },
  {
    id: "indigo",
    label: "Indigo Night",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0d0d2b"], [0.5, "#1a1a4a"], [1, "#070718"]] },
    preview: "linear-gradient(135deg, #0d0d2b, #1a1a4a, #070718)",
  },
  {
    id: "obsidian",
    label: "Obsidian",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#080808"], [0.5, "#141414"], [1, "#040404"]] },
    preview: "linear-gradient(135deg, #080808, #141414, #040404)",
  },
];
