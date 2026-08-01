/**
 * Pure formatting helpers lifted out of `app/page.tsx`. Same inputs, same
 * output, no React and no state — which is what makes them safe to read in
 * isolation, and why they were the first thing worth moving out of a
 * 1,616-line file.
 *
 * These stay out of `lib/` deliberately: `descriptionWithChapters` needs
 * `introOutroMs` from the engine, and the engine pulls in canvas, so a server
 * route importing it from `lib/` would break.
 */
import { introOutroMs } from "@/studio/engine";
import type { Scene, SceneScript, SceneTiming } from "@/studio/schema";

/** YouTube ignores chapters closer together than ~10 s, and needs 3 to show any. */
const MIN_CHAPTER_GAP_S = 10;
const MIN_CHAPTERS = 3;

export function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function descriptionWithChapters(script: SceneScript, timings: SceneTiming[]): string {
  const base = script.meta.description.split("\n\nChapters:")[0].trimEnd();
  const { introMs } = introOutroMs(script.format);
  const marks: { atS: number; label: string }[] = [];
  const atS = (i: number) => Math.floor((introMs + timings[i].startMs) / 1000);
  if (script.sections?.length) {
    // Declared sections win: a chapter can now start on a real teaching scene, so
    // the video no longer needs a title card in front of every chapter just to get
    // one. See the `sections` field in schema.ts.
    for (const section of script.sections) {
      const i = script.scenes.findIndex((s) => s.id === section.atSceneId);
      if (i >= 0 && timings[i]) marks.push({ atS: atS(i), label: section.title.slice(0, 50) });
    }
    marks.sort((a, b) => a.atS - b.atS);
  } else {
    // Fallback for scripts written before `sections` existed.
    script.scenes.forEach((scene, i) => {
      if (scene.kind === "bigtext" && timings[i]) {
        marks.push({ atS: atS(i), label: scene.text.slice(0, 50) });
      }
    });
  }
  const chapters: { atS: number; label: string }[] = [];
  for (const mark of marks) {
    const last = chapters[chapters.length - 1];
    if (!last || mark.atS - last.atS >= MIN_CHAPTER_GAP_S) chapters.push(mark);
  }
  if (chapters.length === 0 || chapters[0].atS !== 0) chapters.unshift({ atS: 0, label: "Intro" });
  if (chapters.length < MIN_CHAPTERS) return base;
  return `${base}\n\nChapters:\n${chapters.map((c) => `${fmtTime(c.atS)} ${c.label}`).join("\n")}`;
}

export function fileUrl(slug: string, name: string) {
  return `/api/studio/file?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name)}`;
}

/** Gemini 429 bodies carry a retryDelay ("retry in 38s" / `"retryDelay": "38s"`). */
export function parseRetrySeconds(message: string): number | null {
  const m = message.match(/retry(?:Delay|\s+in)[^0-9]*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export function describeScene(scene: Scene): string {
  switch (scene.kind) {
    case "bigtext":
      return scene.text;
    case "bullets":
    case "diagram":
    case "tree":
    case "mindmap":
    case "iso3d":
    case "orbit":
    case "compare":
    case "timeline":
    case "steps":
    case "chart":
    case "table":
      return scene.title;
    case "code":
      return `${scene.title} (${scene.lang})`;
    case "terminal":
      return scene.lines[0] ?? "";
    case "question":
    case "quote":
      return scene.text;
    case "stat":
      return `${scene.value} — ${scene.label}`;
    case "quiz":
      return scene.question;
    case "vocab":
      return scene.word;
    case "mythfact":
      return scene.myth;
    case "trace":
    case "memgrid":
    case "callstack":
    case "lifeline":
    case "bits":
    case "cycle":
    case "statemachine":
    case "decision":
    case "chain":
    case "pipeline":
    case "ledger":
    case "sankey":
    case "gauge":
    case "pictogram":
    case "race":
    case "schematic":
    case "terrain":
    case "graphwalk":
    case "matrix":
    case "threads":
    case "queueflow":
    case "cipher":
    case "circuit":
    case "formula":
    case "curves":
    case "buckets":
    case "probability":
    case "basket":
    case "radar":
    case "bodymap":
    case "constellation":
    case "dayclock":
    case "storyboard":
    case "bracket":
    case "showdown":
    case "skyline":
    case "calendar":
    case "geomap":
    case "numberline":
    case "geometry":
    case "molecule":
    case "layers":
    case "trafficflow":
    case "eventbus":
      return scene.title;
    case "browserframe":
      return scene.url;
    case "zoomladder":
      return scene.title ?? scene.rungs[0]?.label ?? "zoom";
    case "dialogue":
      return scene.title ?? `${scene.left.name} ↔ ${scene.right.name}`;
  }
  return (scene as { title?: string }).title ?? "scene";
}

