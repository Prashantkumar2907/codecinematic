/**
 * How a scene is cut into narration beats, and how many of those beats play
 * before the first visual step.
 *
 * This is analysis over an already-validated scene, not schema, and it was 527
 * lines sitting in the middle of schema.ts's 4,078. It stays re-exported from
 * `schema.ts` on purpose: `introBeatCount` alone is imported by 97 painters and
 * `sceneBeats` by ten more modules, so moving the import sites would be a large
 * mechanical edit across exactly the files most likely to be open elsewhere,
 * for no benefit.
 *
 * The `Scene` import is deliberately `import type`: both tsc and Node's
 * type-stripping erase it, so there is no runtime cycle back to schema.ts.
 */
import type { Scene } from "./schema.ts";

/**
 * Ordered narration beats of a scene. Beat k's audio playing is what drives
 * the k-th visual step, so this order must match each painter's beat mapping.
 */
export function sceneBeats(scene: Scene): { beatId: string; text: string }[] {
  const beat = (index: number, text: string) => ({ beatId: `${scene.id}#${index}`, text });
  switch (scene.kind) {
    case "bigtext":
    case "terminal":
    case "question":
      return [beat(0, scene.narration)];
    case "bullets": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.items.map((i) => i.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "tree":
    case "mindmap":
    case "diagram": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "iso3d": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.stages.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "orbit": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.bodies.map((b) => b.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "compare": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        scene.left.say,
        scene.right.say,
        ...(scene.sayVerdict ? [scene.sayVerdict] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "code": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.segments.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "stat":
      return [beat(0, scene.narration)];
    case "timeline": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.events.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "steps": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "vocab": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.examples.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "quiz":
      return [beat(0, scene.sayQuestion), beat(1, scene.sayReveal)];
    case "chart": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.items.map((i) => i.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "quote":
      return [beat(0, scene.narration)];
    case "mythfact":
      return [beat(0, scene.sayMyth), beat(1, scene.sayFact)];
    case "table": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.rows.map((r) => r.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "trace":
    case "memgrid":
    case "callstack":
    case "bits":
    case "browserframe":
    case "statemachine":
    case "decision":
    case "schematic": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "lifeline":
    case "dialogue": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.messages.map((m) => m.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "cycle": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.nodes.map((n) => n.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "chain": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.links.map((l) => l.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "pipeline": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.stations.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "ledger": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.transfers.map((t) => t.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "sankey": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.branches.map((b) => b.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "gauge": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.readings.map((r) => r.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "pictogram": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.groups.map((g) => g.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "race": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.checkpoints.map((c) => c.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "terrain": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.features.map((f) => f.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "zoomladder": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.rungs.map((r) => r.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "graphwalk":
    case "matrix":
    case "threads":
    case "queueflow":
    case "cipher":
    case "circuit": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "formula": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.terms.map((t) => t.say),
        ...(scene.sayResult ? [scene.sayResult] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "curves": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.curves.map((c) => c.say),
        ...(scene.mark ? [scene.mark.say] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "buckets": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.pours.map((p) => p.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "probability": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.spins.map((s) => s.say),
        ...(scene.sayVerdict ? [scene.sayVerdict] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "basket": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.years.map((y) => y.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "radar": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.entities.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "bodymap": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.marks.map((m) => m.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "constellation": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.steps.map((s) => s.say),
        ...(scene.finale ? [scene.finale.say] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "dayclock": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.pins.map((p) => p.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "storyboard": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.panels.map((p) => p.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "bracket": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.matches.map((m) => m.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "showdown": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.rounds.map((r) => r.say),
        ...(scene.sayVerdict ? [scene.sayVerdict] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "skyline": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.eras.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "calendar": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.marks.map((m) => m.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "geomap":
    case "geometry": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "numberline": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.marks.map((m) => m.say ?? m.label)];
      return texts.map((t, k) => beat(k, t));
    }
    case "molecule": {
      if (scene.mode === "equation" && scene.equation) {
        const eq = scene.equation;
        return [beat(0, eq.sayLeft), beat(1, eq.sayReact), beat(2, eq.sayRight)];
      }
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...(scene.structure?.steps.map((s) => s.say) ?? [])];
      return texts.map((t, k) => beat(k, t));
    }
    case "layers": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.layers.map((l) => l.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "trafficflow":
    case "eventbus":
    case "globe3d":
    case "dp_table_fill": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "sysarch": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.tiers.map((t) => t.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "slidingwindow": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "trendgraph": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "topology": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "scroll": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.lines.map((l) => l.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "tactical_map": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "architecture_blueprint": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "packet_delivery": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "codediff": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "parliament_arc": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.factions.map((f) => f.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "server_rack": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "jigsaw_puzzle": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.pieces.map((p) => p.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "domino_cascade": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.dominoes.map((d) => d.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "sheet_music": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "canvas_reveal": {
  const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
  return texts.map((t, k) => beat(k, t));
}
case "scalecompare": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.items.map((i) => i.say),
        ...(scene.sayVerdict ? [scene.sayVerdict] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
case "fluidflow": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "ecosystem_web": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "turing_tape": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "grid_flood": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "hash_ring": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "recursion_tree": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "token_exchange": {
  const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
  return texts.map((t, k) => beat(k, t));
}
case "coin_stack": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "btree_index": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "lsm_compaction": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "vdom_diff": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "flamegraph": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.bars.map((b) => b.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "event_loop": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "dom_event_flow": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "commit_dag": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "partitioned_log": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "container_sandbox": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "control_loop": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "telemetry_trace": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        ...scene.spans.map((s) => s.say),
        ...(scene.verdict ? [scene.verdict.say] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
case "spatial_index": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "object_heap": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "vector_space": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "neural_network": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "matrix_convolution": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
case "consensus_quorum": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
  }
}

/** Number of leading beats that precede the first visual step (0 or 1). */
export function introBeatCount(scene: Scene): number {
  switch (scene.kind) {
    case "geomap":
    case "numberline":
    case "geometry":
    case "molecule":
    case "layers":
    case "trafficflow":
    case "eventbus":
    case "globe3d":
    case "dp_table_fill":
    case "sysarch":
    case "slidingwindow":
    case "trendgraph":
    case "topology":
    case "scroll":
    case "tactical_map":
    case "architecture_blueprint":
    case "packet_delivery":
    case "codediff":
    case "parliament_arc":
    case "server_rack":
    case "jigsaw_puzzle":
    case "domino_cascade":
    case "sheet_music":
    case "canvas_reveal":
    case "scalecompare":
    case "fluidflow":
    case "ecosystem_web":
    case "turing_tape":
    case "grid_flood":
    case "hash_ring":
    case "recursion_tree":
    case "token_exchange":
    case "coin_stack":
    case "btree_index":
    case "lsm_compaction":
    case "vdom_diff":
    case "flamegraph":
    case "event_loop":
    case "dom_event_flow":
    case "commit_dag":
    case "partitioned_log":
    case "container_sandbox":
    case "control_loop":
    case "telemetry_trace":
    case "spatial_index":
    case "object_heap":
    case "vector_space":
    case "neural_network":
    case "matrix_convolution":
    case "consensus_quorum":
      return scene.sayIntro ? 1 : 0;
    case "bullets":
    case "diagram":

    case "tree":
    case "mindmap":
    case "iso3d":
    case "orbit":
    case "code":
    case "compare":
    case "timeline":
    case "steps":
    case "vocab":
    case "chart":
    case "table":
    case "trace":
    case "memgrid":
    case "callstack":
    case "lifeline":
    case "bits":
    case "browserframe":
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
    case "zoomladder":
    case "dialogue":
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
      return scene.sayIntro ? 1 : 0;
    default:
      return 0;
  }
}