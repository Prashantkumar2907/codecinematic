import type { Scene, SceneKind } from "../schema";
import type { Layout, Palette } from "./common";
import { paintBigtext } from "./bigtext";
import { paintBullets } from "./bullets";
import { paintCode } from "./code";
import { paintTerminal } from "./terminal";
import { paintDiagram } from "./diagram";
import { paintCompare } from "./compare";
import { paintQuestion } from "./question";
import { paintTimeline } from "./timeline";
import { paintStat } from "./stat";
import { paintSteps } from "./steps";
import { paintQuiz } from "./quiz";
import { paintVocab } from "./vocab";
import { paintChart } from "./chart";
import { paintQuote } from "./quote";
import { paintMythfact } from "./mythfact";
import { paintTable } from "./table";

/** A narration beat's window within the scene, as fractions of scene duration. */
export type BeatWindow = { start: number; end: number };

export type PaintEnv = {
  layout: Layout;
  /** 0-1 progress within the scene. */
  p: number;
  elapsedMs: number;
  durationMs: number;
  /** Same order as sceneBeats(scene); drives visual steps. */
  beats: BeatWindow[];
  sceneIndex: number;
  sceneCount: number;
  /** Subject accent colours; every painter draws its accents from here. */
  palette: Palette;
};

type Painter = (ctx: CanvasRenderingContext2D, scene: never, env: PaintEnv) => void;

const painters: Record<SceneKind, Painter> = {
  bigtext: paintBigtext as Painter,
  bullets: paintBullets as Painter,
  code: paintCode as Painter,
  terminal: paintTerminal as Painter,
  diagram: paintDiagram as Painter,
  compare: paintCompare as Painter,
  question: paintQuestion as Painter,
  timeline: paintTimeline as Painter,
  stat: paintStat as Painter,
  steps: paintSteps as Painter,
  quiz: paintQuiz as Painter,
  vocab: paintVocab as Painter,
  chart: paintChart as Painter,
  quote: paintQuote as Painter,
  mythfact: paintMythfact as Painter,
  table: paintTable as Painter,
};

export function paintScene(ctx: CanvasRenderingContext2D, scene: Scene, env: PaintEnv) {
  painters[scene.kind](ctx, scene as never, env);
}
