import type { Scene, SceneKind } from "../schema";
import type { Layout, Palette } from "./common";
import { paintBigtext } from "./bigtext";
import { paintBullets } from "./bullets";
import { paintCode } from "./code";
import { paintTerminal } from "./terminal";
import { paintDiagram } from "./diagram";
import { paintTree } from "./tree";
import { paintMindmap } from "./mindmap";
import { paintOrbit } from "./orbit";
import { paintIso3d } from "./iso3d";
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
import { paintTrace } from "./trace";
import { paintMemgrid } from "./memgrid";
import { paintCallstack } from "./callstack";
import { paintLifeline } from "./lifeline";
import { paintBits } from "./bits";
import { paintBrowserframe } from "./browserframe";
import { paintCycle } from "./cycle";
import { paintStatemachine } from "./statemachine";
import { paintDecision } from "./decision";
import { paintChain } from "./chain";
import { paintPipeline } from "./pipeline";
import { paintLedger } from "./ledger";
import { paintSankey } from "./sankey";
import { paintGauge } from "./gauge";
import { paintPictogram } from "./pictogram";
import { paintRace } from "./race";
import { paintSchematic } from "./schematic";
import { paintTerrain } from "./terrain";
import { paintZoomladder } from "./zoomladder";
import { paintDialogue } from "./dialogue";
import { paintGraphwalk } from "./graphwalk";
import { paintMatrix } from "./matrix";
import { paintThreads } from "./threads";
import { paintQueueflow } from "./queueflow";
import { paintCipher } from "./cipher";
import { paintCircuit } from "./circuit";
import { paintFormula } from "./formula";
import { paintCurves } from "./curves";
import { paintBuckets } from "./buckets";
import { paintProbability } from "./probability";
import { paintBasket } from "./basket";
import { paintRadar } from "./radar";
import { paintBodymap } from "./bodymap";
import { paintConstellation } from "./constellation";
import { paintDayclock } from "./dayclock";
import { paintStoryboard } from "./storyboard";
import { paintBracket } from "./bracket";
import { paintShowdown } from "./showdown";
import { paintSkyline } from "./skyline";
import { paintCalendar } from "./calendar";
import { paintGeomap } from "./geomap";
import { paintNumberline } from "./numberline";
import { paintGeometry } from "./geometry";
import { paintMolecule } from "./molecule";
import { paintLayers } from "./layers";
import { paintTrafficflow } from "./trafficflow";
import { paintEventbus } from "./eventbus";
import { paintGlobe3d } from "./globe3d";
import { paintDpTableFill } from "./dp_table_fill";
import { paintSysarch } from "./sysarch";
import { paintSlidingWindow } from "./sliding_window";
import { paintTrendgraph } from "./trendgraph";
import { paintTopology } from "./topology";
import { paintScroll } from "./scroll";
import { paintTacticalMap } from "./tactical_map";
import { paintArchitectureBlueprint } from "./architecture_blueprint";
import { paintPacketDelivery } from "./packet_delivery";
import { paintCodediff } from "./codediff";
import { paintParliamentArc } from "./parliament_arc";
import { paintServerRack } from "./server_rack";
import { paintJigsawPuzzle } from "./jigsaw_puzzle";
import { paintDominoCascade } from "./domino_cascade";
import { paintSheetMusic } from "./sheet_music";
import { paintCanvasReveal } from "./canvas_reveal";
import { paintScalecompare } from "./scalecompare";
import { paintFluidflow } from "./fluidflow";
import { paintEcosystemWeb } from "./ecosystem_web";
import { paintTuringTape } from "./turing_tape";
import { paintGridFlood } from "./grid_flood";
import { paintHashRing } from "./hash_ring";
import { paintRecursionTree } from "./recursion_tree";
import { paintTokenExchange } from "./token_exchange";
import { paintCoinStack } from "./coin_stack";
import { paintBtreeIndex } from "./btree_index";
import { paintLsmCompaction } from "./lsm_compaction";
import { paintVdomDiff } from "./vdom_diff";
import { paintFlamegraph } from "./flamegraph";
import { paintEventLoop } from "./event_loop";
import { paintDomEventFlow } from "./dom_event_flow";
import { paintCommitDag } from "./commit_dag";
import { paintPartitionedLog } from "./partitioned_log";
import { paintContainerSandbox } from "./container_sandbox";
import { paintControlLoop } from "./control_loop";
import { paintTelemetryTrace } from "./telemetry_trace";
import { paintSpatialIndex } from "./spatial_index";
import { paintObjectHeap } from "./object_heap";
import { paintVectorSpace } from "./vector_space";
import { paintNeuralNetwork } from "./neural_network";
import { paintMatrixConvolution } from "./matrix_convolution";
import { paintConsensusQuorum } from "./consensus_quorum";

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
  tree: paintTree as Painter,
  mindmap: paintMindmap as Painter,
  orbit: paintOrbit as Painter,
  iso3d: paintIso3d as Painter,
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
  trace: paintTrace as Painter,
  memgrid: paintMemgrid as Painter,
  callstack: paintCallstack as Painter,
  lifeline: paintLifeline as Painter,
  bits: paintBits as Painter,
  browserframe: paintBrowserframe as Painter,
  cycle: paintCycle as Painter,
  statemachine: paintStatemachine as Painter,
  decision: paintDecision as Painter,
  chain: paintChain as Painter,
  pipeline: paintPipeline as Painter,
  ledger: paintLedger as Painter,
  sankey: paintSankey as Painter,
  gauge: paintGauge as Painter,
  pictogram: paintPictogram as Painter,
  race: paintRace as Painter,
  schematic: paintSchematic as Painter,
  terrain: paintTerrain as Painter,
  zoomladder: paintZoomladder as Painter,
  dialogue: paintDialogue as Painter,
  graphwalk: paintGraphwalk as Painter,
  matrix: paintMatrix as Painter,
  threads: paintThreads as Painter,
  queueflow: paintQueueflow as Painter,
  cipher: paintCipher as Painter,
  circuit: paintCircuit as Painter,
  formula: paintFormula as Painter,
  curves: paintCurves as Painter,
  buckets: paintBuckets as Painter,
  probability: paintProbability as Painter,
  basket: paintBasket as Painter,
  radar: paintRadar as Painter,
  bodymap: paintBodymap as Painter,
  constellation: paintConstellation as Painter,
  dayclock: paintDayclock as Painter,
  storyboard: paintStoryboard as Painter,
  bracket: paintBracket as Painter,
  showdown: paintShowdown as Painter,
  skyline: paintSkyline as Painter,
  calendar: paintCalendar as Painter,
  geomap: paintGeomap as Painter,
  numberline: paintNumberline as Painter,
  geometry: paintGeometry as Painter,
  molecule: paintMolecule as Painter,
  layers: paintLayers as Painter,
  trafficflow: paintTrafficflow as Painter,
  eventbus: paintEventbus as Painter,
  globe3d: paintGlobe3d as Painter,
  dp_table_fill: paintDpTableFill as Painter,
  sysarch: paintSysarch as Painter,
  slidingwindow: paintSlidingWindow as Painter,
  trendgraph: paintTrendgraph as Painter,
  topology: paintTopology as Painter,
  scroll: paintScroll as Painter,
  tactical_map: paintTacticalMap as Painter,
  architecture_blueprint: paintArchitectureBlueprint as Painter,
  packet_delivery: paintPacketDelivery as Painter,
  codediff: paintCodediff as Painter,
  parliament_arc: paintParliamentArc as Painter,
  server_rack: paintServerRack as Painter,
  jigsaw_puzzle: paintJigsawPuzzle as Painter,
  domino_cascade: paintDominoCascade as Painter,
  sheet_music: paintSheetMusic as Painter,
  canvas_reveal: paintCanvasReveal as Painter,
  scalecompare: paintScalecompare as Painter,
  fluidflow: paintFluidflow as Painter,
  ecosystem_web: paintEcosystemWeb as Painter,
  turing_tape: paintTuringTape as Painter,
  grid_flood: paintGridFlood as Painter,
  hash_ring: paintHashRing as Painter,
  recursion_tree: paintRecursionTree as Painter,
  token_exchange: paintTokenExchange as Painter,
  coin_stack: paintCoinStack as Painter,
  btree_index: paintBtreeIndex as Painter,
  lsm_compaction: paintLsmCompaction as Painter,
  vdom_diff: paintVdomDiff as Painter,
  flamegraph: paintFlamegraph as Painter,
  event_loop: paintEventLoop as Painter,
  dom_event_flow: paintDomEventFlow as Painter,
  commit_dag: paintCommitDag as Painter,
  partitioned_log: paintPartitionedLog as Painter,
  container_sandbox: paintContainerSandbox as Painter,
  control_loop: paintControlLoop as Painter,
  telemetry_trace: paintTelemetryTrace as Painter,
  spatial_index: paintSpatialIndex as Painter,
  object_heap: paintObjectHeap as Painter,
  vector_space: paintVectorSpace as Painter,
  neural_network: paintNeuralNetwork as Painter,
  matrix_convolution: paintMatrixConvolution as Painter,
  consensus_quorum: paintConsensusQuorum as Painter,
};

/** Every kind that has a painter — the registry itself, so QA tooling cannot drift from it. */
export const ALL_SCENE_KINDS = Object.keys(painters) as SceneKind[];

export function paintScene(ctx: CanvasRenderingContext2D, scene: Scene, env: PaintEnv) {
  painters[scene.kind](ctx, scene as never, env);
}
