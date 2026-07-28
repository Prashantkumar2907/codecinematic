"use client";

// Painter QA probe. Two ways in:
//   1. Query params (back-compat, one static frame):
//      /probe?demo=2&scene=t-ledger&p=0.9&ms=4000&aspect=short
//   2. window hooks driven by scripts/filmstrip.mjs — __PROBE_RENDER for one
//      full-res frame, __PROBE_FILMSTRIP for a whole-timeline contact sheet.
// No TTS, no recorder, deterministic.
import { useEffect, useRef } from "react";
import * as DEMO from "@/studio/demo";
import { ASPECTS, sceneBeats, type Scene, type SceneKind, type SceneScript } from "@/studio/schema";
import { ALL_SCENE_KINDS, paintScene } from "@/studio/painters";
import { drawBackground, makeLayout, paletteForSubject } from "@/studio/painters/common";
import { resetThree3D } from "@/studio/painters/three3d";
import { ensureStudioFonts } from "@/studio/fonts";

const DEMOS: Record<string, SceneScript> = {
  "geometry": DEMO.DEMO_GEOMETRY,
  "formula": DEMO.DEMO_FORMULA,
  "curves": DEMO.DEMO_CURVES,
  "schematic": DEMO.DEMO_SCHEMATIC,
  "bigtext": DEMO.DEMO_BIGTEXT,
  "stat": DEMO.DEMO_STAT,
  "steps": DEMO.DEMO_STEPS,
  "dayclock": DEMO.DEMO_DAYCLOCK,
  "zoomladder": DEMO.DEMO_ZOOMLADDER,
  "bodymap": DEMO.DEMO_BODYMAP,
  "constellation": DEMO.DEMO_CONSTELLATION,
  "terrain": DEMO.DEMO_TERRAIN,
  "molecule": DEMO.DEMO_MOLECULE,
  "orbit": DEMO.DEMO_ORBIT,
  "terminal": DEMO.DEMO_TERMINAL,
  "storyboard": DEMO.DEMO_STORYBOARD,
  "skyline": DEMO.DEMO_SKYLINE,
  "showdown": DEMO.DEMO_SHOWDOWN,
  "bracket": DEMO.DEMO_BRACKET,
  "layers": DEMO.DEMO_LAYERS,
  "geomap": DEMO.DEMO_GEOMAP,
  "statemachine": DEMO.DEMO_STATEMACHINE,
  "basket": DEMO.DEMO_BASKET,
  "buckets": DEMO.DEMO_BUCKETS,
  "browser": DEMO.DEMO_BROWSERFRAME,
  "compare": DEMO.DEMO_COMPARE,
  "matrix": DEMO.DEMO_MATRIX,
  "callstack": DEMO.DEMO_CALLSTACK,
  "table": DEMO.DEMO_TABLE,
  "diagram": DEMO.DEMO_DIAGRAM,
  "memgrid": DEMO.DEMO_MEMGRID,
  "quote": DEMO.DEMO_QUOTE,
  "bullets": DEMO.DEMO_BULLETS,
  "tree": DEMO.DEMO_TREE,
  "chart": DEMO.DEMO_CHART,
  "timeline": DEMO.DEMO_TIMELINE,
  "sankey": DEMO.DEMO_SANKEY,
  "gauge": DEMO.DEMO_GAUGE,
  "pictogram": DEMO.DEMO_PICTOGRAM,
  "bits": DEMO.DEMO_BITS,
  "threads": DEMO.DEMO_THREADS,
  "cipher": DEMO.DEMO_CIPHER,
  "circuit": DEMO.DEMO_CIRCUIT,
  "trafficflow": DEMO.DEMO_TRAFFICFLOW,
  "eventbus": DEMO.DEMO_EVENTBUS,
  "code": DEMO.DEMO_CODE,
  "trace": DEMO.DEMO_TRACE,
  "vocab": DEMO.DEMO_VOCAB,
  "1": DEMO.DEMO_SCRIPT,
  "2": DEMO.DEMO_KINDS_LONG,
  "3": DEMO.DEMO_KINDS_SHORT,
  "4": DEMO.DEMO_KINDS2_LONG,
  "5": DEMO.DEMO_KINDS2_SHORT,
  "6": DEMO.DEMO_WAVE1,
  "7": DEMO.DEMO_WAVE2,
  "8": DEMO.DEMO_WAVE3,
  "9": DEMO.DEMO_WAVE3B,
  "10": DEMO.DEMO_WAVE3C,
  "11": DEMO.DEMO_WAVE3D,
  "12": DEMO.DEMO_WAVE3E,
  "13": DEMO.DEMO_WAVE3F,
};

/** Matches the probe's synthetic beat pacing to a plausible narration length. */
const MS_PER_BEAT = 8000;
const DEFAULT_CELL_W = 360;
const GUTTER = 1;
const GUTTER_COLOR = "#4b5563";
const SHEET_BG = "#1f2937";
/** Border ring sampled by the edge-bleed audit, in px. */
const BLEED_BAND = 3;
/** Per-channel difference from the bare background that counts as painted content. */
const BLEED_DELTA = 18;
/** A difference this large is solid geometry or type, not a soft full-bleed glow. */
const BLEED_HARD_DELTA = 70;

type KindEntry = { scene: Scene; script: SceneScript; richness: number };

/**
 * How hard a scene stresses the painter's layout: a two-item demo hides bugs a
 * six-item demo exposes, so the kind index always prefers the fullest scene.
 */
function richness(scene: Scene): number {
  let n = 0;
  for (const v of Object.values(scene)) if (Array.isArray(v)) n += v.length;
  try {
    n += sceneBeats(scene).length;
  } catch {
    // A demo scene malformed enough to break sceneBeats still counts by its arrays.
  }
  return n;
}

function buildKindIndex(): Partial<Record<SceneKind, KindEntry>> {
  const index: Partial<Record<SceneKind, KindEntry>> = {};
  for (const [name, value] of Object.entries(DEMO)) {
    if (!name.startsWith("DEMO_")) continue;
    const script = value as SceneScript;
    if (!Array.isArray(script?.scenes)) continue;
    for (const scene of script.scenes) {
      const r = richness(scene);
      const current = index[scene.kind];
      if (!current || r > current.richness) index[scene.kind] = { scene, script, richness: r };
    }
  }
  return index;
}

const KIND_INDEX = buildKindIndex();

/**
 * Every demo scene addressable by its own id. The kind index deliberately holds
 * one scene per kind, which hides variant-seeded painters: `variantOf(scene.id, n)`
 * means a painter's other entrance styles are unreachable unless QA can name a
 * specific scene. Duplicate ids across demo scripts resolve to the richest.
 */
function buildSceneIndex(): Record<string, KindEntry> {
  const index: Record<string, KindEntry> = {};
  for (const [name, value] of Object.entries(DEMO)) {
    if (!name.startsWith("DEMO_")) continue;
    const script = value as SceneScript;
    if (!Array.isArray(script?.scenes)) continue;
    for (const scene of script.scenes) {
      const r = richness(scene);
      const current = index[scene.id];
      if (!current || r > current.richness) index[scene.id] = { scene, script, richness: r };
    }
  }
  return index;
}

const SCENE_INDEX = buildSceneIndex();

const MISSING_KINDS = ALL_SCENE_KINDS.filter((k) => !KIND_INDEX[k]);
if (typeof window !== "undefined" && MISSING_KINDS.length > 0) {
  console.error(
    `[probe] KIND_INDEX covers ${ALL_SCENE_KINDS.length - MISSING_KINDS.length}/${ALL_SCENE_KINDS.length} kinds. ` +
      `Missing: ${MISSING_KINDS.join(", ")} — author a DEMO_* scene for each in src/studio/demo.ts.`
  );
}

type AspectName = keyof typeof ASPECTS;

function paintInto(
  ctx: CanvasRenderingContext2D,
  entry: KindEntry,
  dims: { width: number; height: number },
  p: number,
  elapsedMs: number
) {
  const { scene, script } = entry;
  const layout = makeLayout(dims.width, dims.height);
  const palette = paletteForSubject(script.subject);
  const total = Math.max(sceneBeats(scene).length, 1);
  const beats = Array.from({ length: total }, (_, k) => ({
    start: (0.9 * k) / total + 0.05,
    end: (0.9 * (k + 1)) / total + 0.05,
  }));
  drawBackground(ctx, dims.width, dims.height, elapsedMs, palette, 0);
  paintScene(ctx, scene, {
    layout,
    p,
    elapsedMs,
    durationMs: MS_PER_BEAT * total,
    beats,
    sceneIndex: 0,
    sceneCount: script.scenes.length,
    palette,
  });
}

function sceneDurationMs(entry: KindEntry): number {
  return MS_PER_BEAT * Math.max(sceneBeats(entry.scene).length, 1);
}

function drawCellLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, cellW: number) {
  const px = Math.max(10, Math.round(cellW * 0.038));
  ctx.save();
  ctx.font = `700 ${px}px ui-monospace, Menlo, monospace`;
  const padX = px * 0.5;
  const boxW = ctx.measureText(text).width + padX * 2;
  const boxH = px * 1.7;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = "#e6edf3";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + boxH / 2);
  ctx.restore();
}

function drawCellError(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, message: string) {
  ctx.save();
  ctx.fillStyle = "#3f1416";
  ctx.fillRect(x, y, w, h);
  const px = Math.max(9, Math.round(w * 0.034));
  ctx.font = `600 ${px}px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = "#fca5a5";
  ctx.textBaseline = "top";
  const words = message.split(/\s+/);
  let line = "";
  let ly = y + px;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > w - px && line) {
      ctx.fillText(line, x + px * 0.6, ly);
      ly += px * 1.3;
      line = word;
      if (ly > y + h - px) break;
    } else {
      line = candidate;
    }
  }
  if (ly <= y + h - px) ctx.fillText(line, x + px * 0.6, ly);
  ctx.restore();
}

type ProbeWindow = Window & {
  __PROBE_DONE?: boolean;
  __PROBE_ERRORS?: string[];
  __PROBE_KINDS?: SceneKind[];
  __PROBE_MISSING_KINDS?: SceneKind[];
  __PROBE_SCENES?: { id: string; kind: SceneKind }[];
  __PROBE_RENDER?: (a: {
    kind: SceneKind;
    sceneId?: string;
    p?: number;
    ms?: number;
    aspect?: AspectName;
  }) => Promise<boolean>;
  __PROBE_EDGEBLEED?: (a: {
    kind: SceneKind;
    sceneId?: string;
    aspect?: AspectName;
    ps?: number[];
  }) => Promise<{ top: number; bottom: number; left: number; right: number; worstP: number } | null>;
  __PROBE_FILMSTRIP?: (a: {
    kind: SceneKind;
    sceneId?: string;
    aspect?: AspectName;
    cols?: number;
    rows?: number;
    cellW?: number;
    fromMs?: number;
    toMs?: number;
  }) => Promise<boolean>;
};

export default function Probe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const win = window as ProbeWindow;
    win.__PROBE_ERRORS = [];
    win.__PROBE_KINDS = ALL_SCENE_KINDS.filter((k) => !!KIND_INDEX[k]);
    win.__PROBE_MISSING_KINDS = MISSING_KINDS;
    win.__PROBE_SCENES = Object.entries(SCENE_INDEX).map(([id, e]) => ({ id, kind: e.scene.kind }));

    /** `sceneId` addresses one exact scene; without it the kind's richest demo is used. */
    const lookup = (kind: SceneKind, sceneId?: string) => (sceneId ? SCENE_INDEX[sceneId] : KIND_INDEX[kind]);

    const noteError = (kind: string, where: string, err: unknown) => {
      const msg = `${kind} ${where}: ${err instanceof Error ? err.message : String(err)}`;
      win.__PROBE_ERRORS!.push(msg);
      return msg;
    };

    win.__PROBE_RENDER = async ({ kind, sceneId, p = 0.9, ms, aspect = "short" }) => {
      win.__PROBE_DONE = false;
      await ensureStudioFonts();
      resetThree3D();
      const entry = lookup(kind, sceneId);
      const canvas = canvasRef.current!;
      const dims = ASPECTS[aspect];
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext("2d")!;
      let ok = true;
      if (!entry) {
        drawCellError(ctx, 0, 0, dims.width, dims.height, noteError(kind, "render", "no demo scene in KIND_INDEX"));
        ok = false;
      } else {
        const elapsedMs = ms ?? p * sceneDurationMs(entry);
        try {
          paintInto(ctx, entry, dims, p, elapsedMs);
        } catch (err) {
          drawCellError(ctx, 0, 0, dims.width, dims.height, noteError(kind, `render p=${p.toFixed(2)}`, err));
          ok = false;
        }
      }
      document.title = `probe:${kind}@${p}`;
      win.__PROBE_DONE = true;
      return ok;
    };


    /**
     * Fraction of each border band that carries painted content. Renders the scene
     * and the bare background separately and diffs a BLEED_BAND-px ring: any pixel
     * that differs is something the painter drew hard against the frame edge, i.e.
     * almost certainly clipped. Measures rubric section 1 instead of eyeballing it.
     */
    win.__PROBE_EDGEBLEED = async ({ kind, sceneId, aspect = "short", ps = [0.5, 0.9] }) => {
      await ensureStudioFonts();
      const entry = lookup(kind, sceneId);
      if (!entry) return null;
      const dims = ASPECTS[aspect];
      const mk = () => {
        const c = document.createElement("canvas");
        c.width = dims.width;
        c.height = dims.height;
        return c;
      };
      const a = mk();
      const b = mk();
      const actx = a.getContext("2d", { willReadFrequently: true })!;
      const bctx = b.getContext("2d", { willReadFrequently: true })!;
      const palette = paletteForSubject(entry.script.subject);
      const bands = {
        top: [0, 0, dims.width, BLEED_BAND],
        bottom: [0, dims.height - BLEED_BAND, dims.width, BLEED_BAND],
        left: [0, 0, BLEED_BAND, dims.height],
        right: [dims.width - BLEED_BAND, 0, BLEED_BAND, dims.height],
      } as const;
      const worst = { top: 0, bottom: 0, left: 0, right: 0, worstP: 0 };
      for (const p of ps) {
        resetThree3D();
        const ms = p * sceneDurationMs(entry);
        actx.clearRect(0, 0, dims.width, dims.height);
        bctx.clearRect(0, 0, dims.width, dims.height);
        drawBackground(bctx, dims.width, dims.height, ms, palette, 0);
        try {
          paintInto(actx, entry, dims, p, ms);
        } catch {
          continue;
        }
        let any = false;
        let soft = 0;
        for (const [name, [bx, by, bw, bh]] of Object.entries(bands)) {
          const pa = actx.getImageData(bx, by, bw, bh).data;
          const pb = bctx.getImageData(bx, by, bw, bh).data;
          let hit = 0;
          for (let i = 0; i < pa.length; i += 4) {
            const d = Math.max(
              Math.abs(pa[i] - pb[i]),
              Math.abs(pa[i + 1] - pb[i + 1]),
              Math.abs(pa[i + 2] - pb[i + 2])
            );
            // Only hard-contrast pixels count: a soft aura washing to the frame edge
            // is a deliberate backdrop, not clipped content.
            if (d > BLEED_HARD_DELTA) hit++;
            else if (d > BLEED_DELTA) soft++;
          }
          const frac = hit / (pa.length / 4);
          if (frac > worst[name as keyof typeof bands]) {
            worst[name as keyof typeof bands] = frac;
            any = true;
          }
        }
        if (any) worst.worstP = p;
      }
      return worst;
    };
    win.__PROBE_FILMSTRIP = async ({ kind, sceneId, aspect = "short", cols = 4, rows = 4, cellW = DEFAULT_CELL_W, fromMs, toMs }) => {
      win.__PROBE_DONE = false;
      await ensureStudioFonts();
      resetThree3D();
      const dims = ASPECTS[aspect];
      const cellH = Math.round((cellW * dims.height) / dims.width);
      const canvas = canvasRef.current!;
      canvas.width = cols * cellW + (cols - 1) * GUTTER;
      canvas.height = rows * cellH + (rows - 1) * GUTTER;
      const ctx = canvas.getContext("2d")!;
      // Painted first so the 1px gaps between cells read as a hairline: clipping
      // at a cell edge then looks different from clipping at the scene edge.
      ctx.fillStyle = GUTTER_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const entry = lookup(kind, sceneId);
      if (!entry) {
        ctx.fillStyle = SHEET_BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawCellError(ctx, 0, 0, canvas.width, canvas.height, noteError(kind, "filmstrip", "no demo scene in KIND_INDEX"));
        win.__PROBE_DONE = true;
        return false;
      }

      // Full-resolution offscreen render per frame, downscaled into the cell:
      // painting straight into a 360px cell would change every layout unit and
      // QA a scene that never ships.
      const frame = document.createElement("canvas");
      frame.width = dims.width;
      frame.height = dims.height;
      const fctx = frame.getContext("2d")!;
      const durationMs = sceneDurationMs(entry);
      const n = cols * rows;
      let ok = true;
      // Windowed mode samples absolute time, not p. Entrances run on enterT(),
      // which keys off elapsedMs — a 380ms entrance is shorter than one cell of
      // a p=0..1 strip on every scene, so it is only visible sampled in ms.
      const windowed = typeof fromMs === "number" && typeof toMs === "number";

      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 1 : i / (n - 1);
        const elapsedMs = windowed ? fromMs + (toMs - fromMs) * f : f * durationMs;
        const p = windowed ? Math.min(1, elapsedMs / durationMs) : f;
        const cx = (i % cols) * (cellW + GUTTER);
        const cy = Math.floor(i / cols) * (cellH + GUTTER);
        fctx.clearRect(0, 0, dims.width, dims.height);
        let err: string | null = null;
        try {
          paintInto(fctx, entry, dims, p, elapsedMs);
        } catch (e) {
          err = noteError(kind, `filmstrip frame ${i} p=${p.toFixed(3)}`, e);
          ok = false;
        }
        if (err) {
          drawCellError(ctx, cx, cy, cellW, cellH, err);
        } else {
          ctx.drawImage(frame, cx, cy, cellW, cellH);
        }
        const stamp = windowed ? `${Math.round(elapsedMs)}ms` : `p=${p.toFixed(2)}`;
        drawCellLabel(ctx, cx, cy, `${String(i).padStart(2, "0")} ${stamp}`, cellW);
      }

      document.title = `probe:${kind}:${aspect}:strip`;
      win.__PROBE_DONE = true;
      return ok;
    };

    // Back-compat: the original query-param single-frame render.
    const params = new URLSearchParams(window.location.search);
    const script: SceneScript = DEMOS[params.get("demo") ?? "2"] ?? DEMO.DEMO_KINDS_LONG;
    const sceneId = params.get("scene");
    const scene = script.scenes.find((s) => s.id === sceneId) ?? script.scenes[0];
    const p = Math.min(1, Math.max(0, Number(params.get("p") ?? 0.9)));
    const elapsedMs = Number(params.get("ms") ?? 4000);
    const aspectParam = params.get("aspect");
    const aspect: AspectName = aspectParam === "short" || aspectParam === "long" ? aspectParam : script.format;
    const dims = ASPECTS[aspect];
    const canvas = canvasRef.current!;
    canvas.width = dims.width;
    canvas.height = dims.height;
    paintInto(canvas.getContext("2d")!, { scene, script, richness: 0 }, dims, p, elapsedMs);
    document.title = `probe:${scene.id}@${p}`;
    win.__PROBE_DONE = true;
  }, []);

  return (
    <main style={{ background: "#000", minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <canvas ref={canvasRef} style={{ maxWidth: "96vw", maxHeight: "96vh" }} />
    </main>
  );
}
