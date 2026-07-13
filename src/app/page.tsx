"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type SceneScript, type Scene, type SceneTiming, type VerifyResult, ASPECTS, sceneScriptSchema } from "@/studio/schema";
import { computeTimings, runPlan, type RenderHandle, type BeatAudio } from "@/studio/engine";
import { fetchNarration, verifyScript } from "@/studio/pipeline";
import { renderThumbnail } from "@/studio/thumbnail";
import { DEMO_SCRIPT } from "@/studio/demo";
import NewsView from "@/components/NewsView";

type Format = "short" | "long";
type View = "create" | "library" | "news";
type Stage = "idle" | "topics" | "generating" | "scripted" | "voicing" | "rendering" | "rendered" | "saving" | "uploading" | "uploaded";
type GenStage = "writing" | "validating" | "repairing" | "optimizing";

type Submodule = { id: string; label: string };
type Module = { id: string; label: string; submodules: Submodule[] };
type Subject = { id: string; label: string; audience: string; style: string; modules: Module[] };
type TopicSuggestion = { title: string; angle?: string };
type GenerateFailure = { message: string; details?: string[]; raw?: string };
type Quota = { used: number; limit: number; perModel: { model: string; used: number; limit: number }[] };
type DraftInfo = {
  slug: string;
  hasVideo: boolean;
  hasThumbnail: boolean;
  videoBytes: number;
  savedAt: string;
  format: string;
  subject: string;
  module: string;
  submodule: string;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  videoId?: string;
};

const BRAND = process.env.NEXT_PUBLIC_BRAND || "DevStudio";
const MIN_CHAPTER_GAP_S = 10;
const MIN_CHAPTERS = 3;
const TOAST_MS = 4000;

function descriptionWithChapters(script: SceneScript, timings: SceneTiming[]): string {
  const base = script.meta.description.split("\n\nChapters:")[0].trimEnd();
  const marks: { atS: number; label: string }[] = [];
  script.scenes.forEach((scene, i) => {
    if (scene.kind === "bigtext" && timings[i]) {
      marks.push({ atS: Math.floor(timings[i].startMs / 1000), label: scene.text.slice(0, 50) });
    }
  });
  const chapters: { atS: number; label: string }[] = [];
  for (const mark of marks) {
    const last = chapters[chapters.length - 1];
    if (!last || mark.atS - last.atS >= MIN_CHAPTER_GAP_S) chapters.push(mark);
  }
  if (chapters.length === 0 || chapters[0].atS !== 0) chapters.unshift({ atS: 0, label: "Intro" });
  if (chapters.length < MIN_CHAPTERS) return base;
  return `${base}\n\nChapters:\n${chapters.map((c) => `${fmtTime(c.atS)} ${c.label}`).join("\n")}`;
}

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function describeScene(scene: Scene): string {
  switch (scene.kind) {
    case "bigtext":
      return scene.text;
    case "bullets":
    case "diagram":
    case "compare":
    case "timeline":
    case "steps":
    case "chart":
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
  }
}

function fileUrl(slug: string, name: string) {
  return `/api/studio/file?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name)}`;
}

/** Gemini 429 bodies carry a retryDelay ("retry in 38s" / `"retryDelay": "38s"`). */
function parseRetrySeconds(message: string): number | null {
  const m = message.match(/retry(?:Delay|\s+in)[^0-9]*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export default function Studio() {
  const [view, setView] = useState<View>("create");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [submoduleId, setSubmoduleId] = useState("");
  const [format, setFormat] = useState<Format>("short");
  const [topics, setTopics] = useState<TopicSuggestion[] | null>(null);
  const [coveredCount, setCoveredCount] = useState<number | null>(null);
  const [chosenTopic, setChosenTopic] = useState<TopicSuggestion | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [topicsExpanded, setTopicsExpanded] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicsErrorAt, setTopicsErrorAt] = useState(0);
  const [generateError, setGenerateError] = useState<GenerateFailure | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [genStage, setGenStage] = useState<GenStage | null>(null);
  const [genRound, setGenRound] = useState(0);
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyingSceneId, setVerifyingSceneId] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<{ done: number; total: number } | null>(null);
  const [script, setScript] = useState<SceneScript | null>(null);
  const [verifyResults, setVerifyResults] = useState<VerifyResult[]>([]);
  const [audio, setAudio] = useState<BeatAudio[] | null>(null);
  const [timings, setTimings] = useState<SceneTiming[] | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("public");
  const [scheduleAt, setScheduleAt] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderLabel, setRenderLabel] = useState("");
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wasHidden, setWasHidden] = useState(false);

  const [drafts, setDrafts] = useState<DraftInfo[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DraftInfo | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderHandle = useRef<RenderHandle | null>(null);

  const busy = ["topics", "generating", "voicing", "rendering", "saving", "uploading"].includes(stage) || verifying;
  const pipelineLocked = ["voicing", "rendering", "saving", "uploading"].includes(stage);
  const aspect = ASPECTS[format];
  const subject = subjects.find((s) => s.id === subjectId);
  const module_ = subject?.modules.find((m) => m.id === moduleId);
  const submodule = module_?.submodules.find((s) => s.id === submoduleId);
  const effectiveTopic = customTopic.trim() || chosenTopic?.title || "";
  const error = topicsError ?? generateError?.message ?? stageError;

  const ticking = stage === "generating" || stage === "rendering" || topicsError !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [ticking]);

  const refreshSubjects = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/state");
      const data = await res.json();
      if (res.ok) {
        setSubjects(data.subjects);
        if (data.quota) setQuota(data.quota as Quota);
      }
    } catch {
      /* retry on next mount; create flow shows empty pickers meanwhile */
    }
  }, []);

  const refreshDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/drafts");
      const data = await res.json();
      if (res.ok) setDrafts(data.drafts);
    } catch {
      /* library shows last known list */
    }
  }, []);

  useEffect(() => {
    void refreshSubjects();
    void refreshDrafts();
  }, [refreshSubjects, refreshDrafts]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (stage !== "rendering") {
      setWasHidden(false);
      return;
    }
    const onVis = () => {
      if (document.hidden) setWasHidden(true);
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stage]);

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  const resetOutputs = () => {
    setAudio(null);
    setTimings(null);
    setVideoBlob(null);
    setSavedSlug(null);
    setUploadUrl(null);
    setRenderProgress(0);
    setRenderLabel("");
    setVideoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };

  const clearTopicSuggestions = () => {
    setTopics(null);
    setCoveredCount(null);
    setChosenTopic(null);
    setTopicsExpanded(true);
    setTopicsError(null);
  };

  const suggestTopics = async () => {
    if (!subjectId || !moduleId || !submoduleId) return;
    setTopicsError(null);
    setTopics(null);
    setCoveredCount(null);
    setChosenTopic(null);
    setTopicsExpanded(true);
    setStage("topics");
    try {
      const res = await fetch("/api/studio/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectId, module: moduleId, submodule: submoduleId }),
      });
      const data = await res.json();
      if (data.quota) setQuota(data.quota as Quota);
      if (!res.ok) throw new Error(data.error);
      setTopics(data.topics);
      setCoveredCount(typeof data.covered === "number" ? data.covered : null);
      setStage(script ? "scripted" : "idle");
    } catch (err) {
      setTopicsError(err instanceof Error ? err.message : String(err));
      setTopicsErrorAt(Date.now());
      setStage(script ? "scripted" : "idle");
    }
  };

  const adoptScript = useCallback(async (raw: SceneScript) => {
    setScript(raw);
    setVerifyResults([]);
    setVerifying(true);
    try {
      const { script: patched, results } = await verifyScript(raw, (sceneId, resultsSoFar) => {
        setVerifyingSceneId(sceneId);
        setVerifyResults(resultsSoFar);
      });
      setScript(patched);
      setVerifyResults(results);
      setJsonDraft(JSON.stringify(patched, null, 2));
    } finally {
      setVerifying(false);
      setVerifyingSceneId(null);
    }
    setTopicsExpanded(false);
    setStage("scripted");
  }, []);

  const runGenerate = useCallback(
    async (body: { subject: string; module: string; submodule: string; format: Format; topic: string; angle?: string }) => {
      setTopicsError(null);
      setGenerateError(null);
      setStageError(null);
      resetOutputs();
      setScript(null);
      setVerifyResults([]);
      setShowJson(false);
      setGenStage(null);
      setGenRound(0);
      setGenStartedAt(Date.now());
      setStage("generating");
      try {
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({ error: `generate failed (${res.status})` }));
          throw new Error(data.error ?? `generate failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        const handleEvent = async (event: Record<string, unknown>) => {
          if (event.quota && typeof event.quota === "object") setQuota(event.quota as Quota);
          if (
            event.stage === "writing" ||
            event.stage === "validating" ||
            event.stage === "repairing" ||
            event.stage === "optimizing"
          ) {
            setGenStage(event.stage);
            if (event.stage === "repairing" && typeof event.round === "number") setGenRound(event.round);
            return;
          }
          if (event.done && event.script) {
            finished = true;
            await adoptScript(event.script as SceneScript);
            return;
          }
          if (typeof event.error === "string") {
            finished = true;
            const failure: GenerateFailure = {
              message: event.error,
              details: Array.isArray(event.details) ? (event.details as string[]) : undefined,
              raw: typeof event.raw === "string" ? event.raw : undefined,
            };
            if (failure.raw) setJsonDraft(failure.raw);
            setGenerateError(failure);
            setStage("idle");
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) await handleEvent(JSON.parse(line) as Record<string, unknown>);
          }
        }
        if (!finished) throw new Error("generation stream ended without a result");
      } catch (err) {
        setGenerateError({ message: err instanceof Error ? err.message : String(err) });
        setStage("idle");
      } finally {
        setGenStage(null);
        setGenStartedAt(null);
      }
    },
    [adoptScript]
  );

  const generate = async () => {
    if (!effectiveTopic || !subjectId || !moduleId || !submoduleId) return;
    await runGenerate({
      subject: subjectId,
      module: moduleId,
      submodule: submoduleId,
      format,
      topic: effectiveTopic,
      angle: customTopic.trim() ? undefined : chosenTopic?.angle,
    });
  };

  const loadDemo = async () => {
    setTopicsError(null);
    setGenerateError(null);
    setStageError(null);
    resetOutputs();
    setStage("generating");
    try {
      await adoptScript(structuredClone(DEMO_SCRIPT));
    } catch (err) {
      setStageError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  };

  const render = useCallback(async () => {
    if (!script || !canvasRef.current) return;
    // Create the AudioContext NOW, synchronously inside the click gesture. One
    // created after voicing's long awaits starts "suspended" in real browsers
    // and its resume() never settles — the render then hangs at 0% forever.
    const audioCtx = new AudioContext();
    void audioCtx.resume().catch(() => {});
    let ctxHandedOff = false;
    setStageError(null);
    resetOutputs();
    setStage("voicing");
    setVoiceProgress(null);
    try {
      const narration =
        audio ?? (await fetchNarration(script, undefined, (done, total) => setVoiceProgress({ done, total })));
      setAudio(narration);
      const sceneTimings = computeTimings(script, narration);
      setTimings(sceneTimings);
      setStage("rendering");
      setRenderStartedAt(Date.now());
      setRenderLabel(`scene 1/${script.scenes.length}`);
      const dims = ASPECTS[script.format];
      let lastShownPct = -1;
      let lastShownLabel = "";
      const handle = runPlan(
        canvasRef.current,
        { script, timings: sceneTimings, audio: narration, width: dims.width, height: dims.height, brand: BRAND },
        {
          record: true,
          audioCtx,
          onProgress: (p, label) => {
            // Called every painted frame; committing state 30–60×/s re-renders the
            // whole page and steals frames from the recording. Update at 0.5% steps.
            const pct = Math.round(p * 200);
            if (pct === lastShownPct && label === lastShownLabel) return;
            lastShownPct = pct;
            lastShownLabel = label;
            setRenderProgress(p);
            setRenderLabel(label);
          },
        }
      );
      ctxHandedOff = true;
      renderHandle.current = handle;
      const blob = await handle.done;
      renderHandle.current = null;
      setRenderStartedAt(null);
      if (!blob) {
        setStage("scripted");
        return;
      }
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setStage("rendered");
    } catch (err) {
      setStageError(err instanceof Error ? err.message : String(err));
      setStage(script ? "scripted" : "idle");
      setRenderStartedAt(null);
    } finally {
      if (!ctxHandedOff) void audioCtx.close().catch(() => {});
      setVoiceProgress(null);
    }
  }, [script, audio]);

  const save = useCallback(async (): Promise<string | null> => {
    if (!script || !videoBlob) return null;
    setStage("saving");
    try {
      const withChapters =
        script.format === "long" && timings
          ? { ...script, meta: { ...script.meta, description: descriptionWithChapters(script, timings) } }
          : script;
      const form = new FormData();
      form.append("video", new File([videoBlob], "video.webm", { type: "video/webm" }));
      form.append("script", JSON.stringify(withChapters));
      try {
        const thumb = await renderThumbnail(script, BRAND);
        form.append("thumbnail", new File([thumb], "thumbnail.png", { type: "image/png" }));
      } catch {
        /* thumbnail is best-effort; the draft still saves */
      }
      const res = await fetch("/api/studio/save", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedSlug(data.slug);
      setStage("rendered");
      setToast(
        script.format === "long"
          ? "Saved to library — thumbnail generated, chapters added"
          : "Saved to library — thumbnail generated"
      );
      void refreshDrafts();
      return data.slug as string;
    } catch (err) {
      setStageError(err instanceof Error ? err.message : String(err));
      setStage("rendered");
      return null;
    }
  }, [script, videoBlob, timings, refreshDrafts]);

  const upload = async (slugArg?: string) => {
    setStageError(null);
    const slug = slugArg ?? savedSlug ?? (await save());
    if (!slug) return;
    setStage("uploading");
    try {
      const scheduled = new Date(scheduleAt);
      const publishAt = scheduleAt && !isNaN(scheduled.getTime()) ? scheduled.toISOString() : undefined;
      const res = await fetch("/api/studio/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, privacy, publishAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploadUrl(data.url);
      setStage("uploaded");
      void refreshDrafts();
    } catch (err) {
      setStageError(err instanceof Error ? err.message : String(err));
      setStage(videoBlob ? "rendered" : "idle");
    }
  };

  const deleteDraft = async (slug: string) => {
    const res = await fetch("/api/studio/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", slug }),
    });
    setConfirmDelete(null);
    if (res.ok) {
      if (selectedSlug === slug) setSelectedSlug(null);
      void refreshDrafts();
    }
  };

  const applyJson = async () => {
    setGenerateError(null);
    setStageError(null);
    try {
      const parsed = sceneScriptSchema.safeParse(JSON.parse(jsonDraft));
      if (!parsed.success) {
        throw new Error(parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      }
      resetOutputs();
      await adoptScript(parsed.data);
      setShowJson(false);
    } catch (err) {
      setGenerateError({ message: err instanceof Error ? err.message : String(err) });
    }
  };

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1" && stage === "idle" && !script) {
      void loadDemo();
      return;
    }
    if (params.get("gen") === "1" && stage === "idle" && !script && subjects.length) {
      const s = params.get("subject") ?? subjects[0].id;
      const subjectDef = subjects.find((x) => x.id === s) ?? subjects[0];
      const m = params.get("module") || subjectDef.modules[0]?.id || "";
      const moduleDef = subjectDef.modules.find((x) => x.id === m);
      const sub = params.get("sub") || moduleDef?.submodules[0]?.id || "";
      const f = params.get("format") === "long" ? "long" : "short";
      setSubjectId(s);
      setModuleId(m);
      setSubmoduleId(sub);
      setFormat(f);
      const topicParam = params.get("topic");
      void (async () => {
        let topic = topicParam;
        let angle: string | undefined;
        if (!topic) {
          const res = await fetch("/api/studio/topics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: s, module: m, submodule: sub }),
          });
          const data = await res.json();
          if (!res.ok) {
            setTopicsError(data.error);
            return;
          }
          setTopics(data.topics);
          topic = data.topics[0]?.title;
          angle = data.topics[0]?.angle;
        }
        if (topic) {
          setCustomTopic(topic);
          await runGenerate({ subject: s, module: m, submodule: sub, format: f, topic, angle });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") !== "1" || error) return;
    if (stage === "scripted" && !videoBlob) void render();
    if (stage === "rendered" && videoBlob && !savedSlug) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, videoBlob, savedSlug, error]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__STUDIO_STATE = {
      stage,
      error,
      savedSlug,
      renderProgress,
      videoBytes: videoBlob?.size ?? 0,
      topic: script?.topic ?? null,
      sceneKinds: script?.scenes.map((s) => s.kind) ?? [],
      verify: verifyResults.map((r) => `${r.sceneId}:${r.status}`),
      topicsCount: topics?.length ?? 0,
      draftsCount: drafts.length,
    };
  }, [stage, error, savedSlug, renderProgress, videoBlob, script, verifyResults, topics, drafts]);

  const verifyBySceneId = new Map(verifyResults.map((r) => [r.sceneId, r]));
  const selectedDraft = drafts.find((d) => d.slug === selectedSlug) ?? null;

  const codeScenes = script?.scenes.filter((s) => s.kind === "code") ?? [];
  const okCount = verifyResults.filter((r) => r.status === "verified" || r.status === "patched").length;
  const failedCount = verifyResults.filter((r) => r.status === "failed").length;
  const retrySeconds = topicsError ? parseRetrySeconds(topicsError) : null;
  const retryLeftS = retrySeconds !== null ? Math.max(0, Math.ceil(retrySeconds - (now - topicsErrorAt) / 1000)) : null;
  const totalMs = timings?.length ? timings[timings.length - 1].startMs + timings[timings.length - 1].durationMs : null;
  const renderElapsedS = renderStartedAt ? (now - renderStartedAt) / 1000 : 0;
  const renderRemainingS = totalMs ? Math.max(0, (totalMs / 1000) * (1 - renderProgress)) : null;
  const genElapsedS = genStartedAt ? (now - genStartedAt) / 1000 : 0;

  const stepDone = {
    teach: Boolean(submoduleId),
    format: Boolean(submoduleId),
    topic: Boolean(effectiveTopic),
    script: Boolean(script),
    meta: Boolean(script),
  };

  const stageStatus = (() => {
    switch (stage) {
      case "voicing":
        return voiceProgress ? `synthesizing narration… ${voiceProgress.done}/${voiceProgress.total} beats` : "synthesizing narration…";
      case "rendering":
        return `recording ${renderLabel} — ${(renderProgress * 100).toFixed(0)}% · elapsed ${fmtTime(renderElapsedS)}${
          renderRemainingS !== null ? ` · ~${fmtTime(renderRemainingS)} left` : ""
        }`;
      case "rendered":
        return videoBlob ? `done — ${(videoBlob.size / 1e6).toFixed(1)} MB webm` : "";
      case "saving":
        return "saving draft…";
      case "uploading":
        return "uploading to YouTube…";
      case "uploaded":
        return "uploaded — review in YouTube Studio, then publish";
      default:
        if (verifying) return "verifying code scenes…";
        if (script) return videoBlob ? `done — ${((videoBlob.size ?? 0) / 1e6).toFixed(1)} MB webm` : "script ready — not rendered yet";
        return "generate a script to unlock rendering";
    }
  })();

  const genChecklist: { key: GenStage; label: string; state: "done" | "current" | "pending" }[] = (() => {
    const order: GenStage[] = ["writing", "validating", "repairing", "optimizing"];
    const currentIdx = genStage ? order.indexOf(genStage) : -1;
    return order.map((key, i) => {
      const label =
        key === "writing"
          ? `writing scenes (${format === "short" ? "4–8" : "14–32"} planned)`
          : key === "validating"
            ? "validating structure"
            : key === "optimizing"
              ? "optimizing title, description & tags"
              : genRound > 0
                ? `repairing — round ${genRound}/2`
                : "repairing (only if needed)";
      const state: "done" | "current" | "pending" =
        i === currentIdx ? "current" : i < currentIdx || (key === "repairing" && genRound > 0 && genStage !== "repairing") ? "done" : "pending";
      return { key, label, state };
    });
  })();

  const privacySelect = (
    <>
      <select
        className="sel sel-inline"
        value={privacy}
        onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
        disabled={busy || Boolean(scheduleAt)}
        aria-label="Upload privacy"
      >
        <option value="public">public</option>
        <option value="unlisted">unlisted</option>
        <option value="private">private</option>
      </select>
      <input
        className="sel sel-inline"
        type="datetime-local"
        value={scheduleAt}
        onChange={(e) => setScheduleAt(e.target.value)}
        disabled={busy}
        title="Schedule publish (optional) — uploads private, auto-publishes at this time"
        aria-label="Schedule publish time"
      />
    </>
  );

  return (
    <main className="studio">
      <header className="masthead">
        <span className="logo" aria-hidden>{"</>"}</span>
        <span className="brand">{BRAND}</span>
        <span className="hint">pick → generate → verify → render → publish</span>
        {quota ? (
          <span
            className="quota"
            title={`Gemini free-tier requests today (resets midnight PT)\n${quota.perModel
              .map((m) => `${m.model}: ${m.used}/${m.limit}`)
              .join("\n")}`}
          >
            <span className="quota-label">Gemini today</span>
            <span className="quota-bar" aria-hidden>
              <span style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
            </span>
            <span className="quota-count">
              {quota.used}/{quota.limit}
            </span>
          </span>
        ) : null}
        <div className="view-tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "create"} onClick={() => setView("create")}>
            Create
          </button>
          <button role="tab" aria-selected={view === "library"} onClick={() => { setView("library"); void refreshDrafts(); }}>
            Library ({drafts.length})
          </button>
          <button role="tab" aria-selected={view === "news"} onClick={() => setView("news")}>
            News
          </button>
        </div>
      </header>

      {view === "create" ? (
        <div className="bod">
          <div className={`rail${pipelineLocked ? " locked" : ""}`}>
            {pipelineLocked ? (
              <div className="lock-note">All controls locked — one pipeline operation at a time, app-wide.</div>
            ) : null}

            <section className="step">
              <div className="step-head">
                <span className={`snum${stepDone.teach ? " done" : ""}`}>1</span>
                <span className="slab">Teach</span>
                <span className="smut push">resets topics if changed</span>
              </div>
              <select
                className="sel"
                value={subjectId}
                disabled={busy}
                aria-label="Subject"
                onChange={(e) => { setSubjectId(e.target.value); setModuleId(""); setSubmoduleId(""); clearTopicSuggestions(); }}
              >
                <option value="" disabled>Subject…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <div className="row">
                <select
                  className="sel"
                  value={moduleId}
                  disabled={busy || !subject}
                  aria-label="Module"
                  onChange={(e) => { setModuleId(e.target.value); setSubmoduleId(""); clearTopicSuggestions(); }}
                >
                  <option value="" disabled>Module…</option>
                  {subject?.modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <select
                  className="sel"
                  value={submoduleId}
                  disabled={busy || !module_}
                  aria-label="Sub-module"
                  onChange={(e) => { setSubmoduleId(e.target.value); clearTopicSuggestions(); }}
                >
                  <option value="" disabled>Sub-module…</option>
                  {module_?.submodules.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="step">
              <div className="step-head">
                <span className={`snum${stepDone.format ? " done" : ""}`}>2</span>
                <span className="slab">Format</span>
              </div>
              <div className="seg" role="tablist" aria-label="Video format">
                {(["short", "long"] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={format === f} onClick={() => setFormat(f)} disabled={busy}>
                    {f === "short" ? "Short · 9:16" : "Long · 16:9"}
                  </button>
                ))}
              </div>
            </section>

            <section className="step">
              <div className="step-head">
                <span className={`snum${stepDone.topic ? " done" : ""}`}>3</span>
                <span className="slab">Topic</span>
                {script && !topicsExpanded ? (
                  <button className="link push" onClick={() => setTopicsExpanded(true)} disabled={busy}>
                    change
                  </button>
                ) : null}
              </div>

              {script && !topicsExpanded ? (
                <div className="tcard on static">
                  <span className="tt">{script.topic}</span>
                  {chosenTopic?.angle ? <span className="ta">{chosenTopic.angle}</span> : null}
                </div>
              ) : (
                <>
                  <div className="row">
                    <button className="btn btn-primary" onClick={suggestTopics} disabled={busy || !submodule}>
                      {stage === "topics" ? <span className="spinner" aria-hidden /> : null}
                      {stage === "topics" ? "Asking Gemini…" : topics ? "⟳ Suggest 10 topics" : "Suggest 10 topics"}
                    </button>
                    <button className="btn" onClick={loadDemo} disabled={busy}>
                      Load demo
                    </button>
                  </div>

                  {stage === "topics" ? (
                    <div className="skeletons" aria-hidden>
                      <span className="sk" style={{ width: "88%" }} />
                      <span className="sk" style={{ width: "64%" }} />
                      <span className="sk" style={{ width: "80%" }} />
                      <span className="sk" style={{ width: "58%" }} />
                    </div>
                  ) : null}

                  {topicsError ? (
                    <div className="err" role="alert">
                      <strong>{topicsError.includes("429") || /quota/i.test(topicsError) ? "Gemini quota exceeded. " : ""}</strong>
                      {topicsError}
                      <div className="row row-center" style={{ marginTop: 8 }}>
                        <button className="btn btn-sm" onClick={suggestTopics} disabled={busy}>
                          Retry
                        </button>
                        {retryLeftS !== null ? (
                          <span className="err-retry">{retryLeftS > 0 ? `retry in ${retryLeftS}s` : "you can retry now"}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {topics ? (
                    <>
                      <div className="topic-list">
                        {topics.map((t) => (
                          <button
                            key={t.title}
                            className="tcard"
                            aria-pressed={chosenTopic?.title === t.title}
                            onClick={() => { setChosenTopic(t); setCustomTopic(""); }}
                            disabled={busy}
                          >
                            <span className="tt">{t.title}</span>
                            {t.angle ? <span className="ta">{t.angle}</span> : null}
                          </button>
                        ))}
                      </div>
                      {coveredCount !== null && coveredCount > 0 ? (
                        <span className="smut">
                          {topics.length} suggestions excluded {coveredCount} topic{coveredCount === 1 ? "" : "s"} already made for {submodule?.label}
                        </span>
                      ) : (
                        <span className="smut">ordered fundamental → advanced · single-select</span>
                      )}
                    </>
                  ) : null}

                  {submodule ? (
                    <>
                      <input
                        className="in"
                        type="text"
                        placeholder="Or type your own topic — overrides the selection above"
                        aria-label="Or type your own topic"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        disabled={busy}
                      />
                      <button className="btn btn-primary" onClick={() => void generate()} disabled={busy || !effectiveTopic}>
                        {stage === "generating" ? <span className="spinner" aria-hidden /> : null}
                        {stage === "generating" ? "Generating…" : `Generate ${format}`}
                      </button>
                    </>
                  ) : null}

                  {stage === "generating" && genStartedAt ? (
                    <div className="gen-stages">
                      {genChecklist.map((item) => (
                        <div key={item.key} className={`gen-row ${item.state}`}>
                          {item.state === "done" ? (
                            <span className="gen-mark done" aria-hidden>✓</span>
                          ) : item.state === "current" ? (
                            <span className="spinner" aria-hidden />
                          ) : (
                            <span className="gen-mark" aria-hidden>○</span>
                          )}
                          <span>{item.label}</span>
                        </div>
                      ))}
                      <div className="prog ind" aria-hidden>
                        <span />
                      </div>
                      <span className="stat">elapsed {fmtTime(genElapsedS)} · typically 0:30–3:00</span>
                    </div>
                  ) : null}

                  {generateError ? (
                    <div className="err" role="alert">
                      <strong>{generateError.message}</strong>
                      {generateError.details?.length ? (
                        <ul>
                          {generateError.details.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn btn-sm" onClick={() => void generate()} disabled={busy || !effectiveTopic}>
                          Retry generate
                        </button>
                        {generateError.raw ? (
                          <button className="btn btn-sm" onClick={() => setShowJson((s) => !s)} disabled={busy}>
                            {showJson ? "Hide JSON" : "Edit JSON"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {!script && showJson ? (
                    <>
                      <textarea rows={12} value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} spellCheck={false} />
                      <button className="btn btn-sm" onClick={applyJson} disabled={busy}>
                        Apply JSON
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </section>

            {script ? (
              <section className="step step-grow">
                <div className="step-head">
                  <span className={`snum${stepDone.script ? " done" : ""}`}>4</span>
                  <span className="slab">Script — {script.scenes.length} scenes</span>
                  {verifying ? (
                    <span className="smut push">
                      <span className="spinner spinner-muted" aria-hidden /> verifying code…
                    </span>
                  ) : codeScenes.length ? (
                    <span className="badge b-v push">
                      {okCount}/{codeScenes.length} code verified
                    </span>
                  ) : null}
                  <button className="link" onClick={() => setShowJson((s) => !s)} disabled={busy}>
                    {showJson ? "Hide JSON" : "Edit JSON"}
                  </button>
                </div>

                <div className="scene-list">
                  {script.scenes.map((scene, i) => {
                    const v = verifyBySceneId.get(scene.id);
                    return (
                      <div key={scene.id} className="scene">
                        <span className="sn">{String(i + 1).padStart(2, "0")}</span>
                        <span className="kind">{scene.kind}</span>
                        <span className="sd">{describeScene(scene)}</span>
                        {verifyingSceneId === scene.id ? (
                          <span className="spinner spinner-muted" aria-label="verifying" />
                        ) : v ? (
                          <span className={`badge b-${v.status[0]}`} title={v.detail}>{v.status}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {failedCount > 0 && !verifying ? (
                  <div className="err">
                    {failedCount} code scene{failedCount === 1 ? "" : "s"} failed verification — regenerate or fix via Edit JSON
                  </div>
                ) : null}

                {showJson ? (
                  <>
                    <textarea rows={14} value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} spellCheck={false} />
                    <button className="btn btn-sm" onClick={applyJson} disabled={busy}>
                      Apply JSON
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}

            {script ? (
              <section className="step">
                <div className="step-head">
                  <span className={`snum${stepDone.meta ? " done" : ""}`}>5</span>
                  <span className="slab">Metadata</span>
                  <span className="smut push">{script.meta.title.length}/100</span>
                </div>
                <input
                  className="in in-strong"
                  type="text"
                  aria-label="YouTube title"
                  value={script.meta.title}
                  onChange={(e) => setScript({ ...script, meta: { ...script.meta, title: e.target.value } })}
                  disabled={busy}
                />
                <textarea
                  rows={4}
                  aria-label="YouTube description"
                  value={script.meta.description}
                  onChange={(e) => setScript({ ...script, meta: { ...script.meta, description: e.target.value } })}
                  disabled={busy}
                />
                <span className="smut mono">
                  {script.meta.hashtags.join(" ")} <span className="dim">· read-only</span>
                </span>
              </section>
            ) : null}
          </div>

          <div className="stage">
            {stageError ? (
              <div className="err" role="alert">
                {stageError}
              </div>
            ) : null}

            <div className="stage-head">
              <span className="slab">Stage</span>
              <span className="stat" aria-live="polite">
                {stageStatus}
              </span>
            </div>

            <div className={`stage-frame ${aspect.width > aspect.height ? "horizontal" : "vertical"}`}>
              <canvas ref={canvasRef} style={{ display: videoUrl ? "none" : "block" }} width={aspect.width} height={aspect.height} />
              {videoUrl ? <video src={videoUrl} controls autoPlay={false} /> : null}
              {stage === "rendering" ? (
                <>
                  <span className="rec-pill">
                    <span className="rec-dot" aria-hidden />
                    REC · {renderLabel}
                  </span>
                  <span className="wave-tag" aria-hidden>
                    narration: live
                    <span className="wave">
                      <i /><i /><i /><i /><i /><i /><i />
                    </span>
                  </span>
                </>
              ) : null}
            </div>

            {stage === "rendering" ? (
              <div className="render-progress">
                <div
                  className="prog"
                  role="progressbar"
                  aria-valuenow={Math.round(renderProgress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${renderProgress * 100}%` }} />
                </div>
                <div className="row row-center">
                  <span className="stat">{stageStatus}</span>
                  <span className="note">true % — render is real-time, a 10-min video takes 10 min. Honest.</span>
                  <button className="btn btn-danger btn-sm push" onClick={() => renderHandle.current?.cancel()}>
                    Cancel render
                  </button>
                </div>
                {wasHidden ? (
                  <div className="warnb" role="status">
                    This tab went to the background — recording continues at a reduced frame rate there. Keep the tab
                    visible for smooth video.
                  </div>
                ) : null}
              </div>
            ) : stage === "voicing" ? (
              <div className="render-progress">
                <div
                  className={`prog${voiceProgress ? "" : " ind"}`}
                  role="progressbar"
                  aria-valuenow={voiceProgress ? Math.round((voiceProgress.done / Math.max(1, voiceProgress.total)) * 100) : undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={voiceProgress ? { width: `${(voiceProgress.done / Math.max(1, voiceProgress.total)) * 100}%` } : undefined} />
                </div>
                <div className="row row-center">
                  <span className="spinner spinner-muted" aria-hidden />
                  <span className="stat" aria-live="polite">
                    {voiceProgress
                      ? `synthesizing narration — ${voiceProgress.done}/${voiceProgress.total} beats`
                      : "synthesizing narration…"}
                  </span>
                  <span className="note">every narration beat voiced before recording starts — count is true</span>
                </div>
              </div>
            ) : (
              <div className="row row-center">
                <button className="btn btn-primary" onClick={() => void render()} disabled={busy || !script}>
                  {videoUrl ? "Re-render" : "Render video"}
                </button>
                {script && !videoUrl ? (
                  <span className="stat">
                    voicing (5–60s) → recording in real time ({script.format === "short" ? "~60–90s" : "~6–12 min"} for this{" "}
                    {script.format === "short" ? "Short" : "Long"})
                  </span>
                ) : null}
              </div>
            )}

            <div className="save-row">
              <button className="btn" onClick={() => void save()} disabled={busy || !videoBlob || !!savedSlug}>
                {savedSlug ? "✓ Saved to library" : "Save to library"}
              </button>
              {privacySelect}
              <button className="btn" onClick={() => void upload()} disabled={busy || !videoBlob || stage === "uploaded"}>
                {stage === "uploading" ? <span className="spinner" aria-hidden /> : null}
                {stage === "uploading" ? "Uploading…" : "Upload to YouTube"}
              </button>
              {!videoBlob ? <span className="note">← unlocks after render</span> : null}
            </div>

            {uploadUrl ? (
              <div className="okb">
                <strong>Uploaded ({privacy}).</strong>{" "}
                <a href={uploadUrl} target="_blank" rel="noreferrer">
                  {uploadUrl.replace("https://", "")}
                </a>{" "}
                — review in YouTube Studio, then publish.
              </div>
            ) : null}
          </div>
        </div>
      ) : view === "library" ? (
        <div className="bod library">
          <div className="lib-list">
            {drafts.length === 0 ? (
              <div className="empty">
                <span>No videos yet</span>
                <button className="btn btn-primary btn-sm" onClick={() => setView("create")}>
                  Go to Create
                </button>
              </div>
            ) : (
              drafts.map((d) => (
                <button key={d.slug} className="lrow" aria-pressed={selectedSlug === d.slug} onClick={() => setSelectedSlug(d.slug)}>
                  {d.hasThumbnail ? (
                    <img className="lthumb" src={fileUrl(d.slug, "thumbnail.png")} alt="" loading="lazy" />
                  ) : (
                    <span className="lthumb lthumb-fallback">{d.format}</span>
                  )}
                  <span className="lbody">
                    <span className="tt">{d.title}</span>
                    <span className="lmeta">
                      <span className="pill">{d.format}</span>
                      {d.subject ? <span className="pill">{d.subject}</span> : null}
                      <span className="smut">{(d.videoBytes / 1e6).toFixed(1)} MB</span>
                      {d.videoId ? (
                        <>
                          <span className="dot" aria-hidden />
                          <span className="smut">uploaded</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="detail">
            {stageError ? (
              <div className="err" role="alert">
                {stageError}
              </div>
            ) : null}
            {selectedDraft ? (
              <>
                {selectedDraft.hasVideo ? (
                  <video key={selectedDraft.slug} src={fileUrl(selectedDraft.slug, "video.webm")} controls />
                ) : null}

                <div className="row detail-copy-row">
                  <div className="copy-field grow">
                    <div className="cf-head">
                      <span className="cf-label">Title</span>
                      <button className={`btn btn-sm${copied === "title" ? " copied" : ""}`} onClick={() => copyText("title", selectedDraft.title)}>
                        {copied === "title" ? "✓ Copied" : "⧉ Copy"}
                      </button>
                    </div>
                    <div className="cf-value">{selectedDraft.title}</div>
                  </div>
                  <div className="copy-field tags">
                    <div className="cf-head">
                      <span className="cf-label">Tags</span>
                      <button className={`btn btn-sm${copied === "tags" ? " copied" : ""}`} onClick={() => copyText("tags", selectedDraft.tags.join(", "))}>
                        {copied === "tags" ? "✓ Copied" : "⧉ Copy"}
                      </button>
                    </div>
                    <div className="cf-value">{selectedDraft.tags.join(", ")}</div>
                  </div>
                </div>

                <div className="copy-field">
                  <div className="cf-head">
                    <span className="cf-label">Description</span>
                    <button
                      className={`btn btn-sm${copied === "desc" ? " copied" : ""}`}
                      onClick={() => copyText("desc", `${selectedDraft.description}\n\n${selectedDraft.hashtags.join(" ")}`)}
                    >
                      {copied === "desc" ? "✓ Copied" : "⧉ Copy with hashtags"}
                    </button>
                  </div>
                  <div className="cf-value">{selectedDraft.description}</div>
                </div>

                <div className="detail-actions">
                  {selectedDraft.hasThumbnail ? (
                    <img className="thumb-preview" src={fileUrl(selectedDraft.slug, "thumbnail.png")} alt="thumbnail" />
                  ) : null}
                  <div className="detail-actions-col">
                    <div className="row">
                      {selectedDraft.hasVideo ? (
                        <a className="btn btn-sm" href={fileUrl(selectedDraft.slug, "video.webm")} download={`${selectedDraft.slug}.webm`}>
                          ⬇ Download video (.webm)
                        </a>
                      ) : null}
                      {selectedDraft.hasThumbnail ? (
                        <a className="btn btn-sm" href={fileUrl(selectedDraft.slug, "thumbnail.png")} download={`${selectedDraft.slug}.png`}>
                          ⬇ Download thumbnail (.png)
                        </a>
                      ) : null}
                      {privacySelect}
                      <button
                        className="btn btn-sm"
                        onClick={() => void upload(selectedDraft.slug)}
                        disabled={busy || !!selectedDraft.videoId}
                      >
                        {stage === "uploading" ? <span className="spinner" aria-hidden /> : null}
                        {stage === "uploading" ? "Uploading…" : selectedDraft.videoId ? "Already uploaded" : "Upload to YouTube"}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selectedDraft)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                    {selectedDraft.videoId ? (
                      <div className="okb">
                        On YouTube —{" "}
                        <a href={`https://youtu.be/${selectedDraft.videoId}`} target="_blank" rel="noreferrer">
                          youtu.be/{selectedDraft.videoId}
                        </a>{" "}
                        · review in Studio, then publish
                      </div>
                    ) : uploadUrl && stage === "uploaded" ? (
                      <div className="okb">
                        <strong>Uploaded.</strong>{" "}
                        <a href={uploadUrl} target="_blank" rel="noreferrer">
                          {uploadUrl.replace("https://", "")}
                        </a>{" "}
                        — review in YouTube Studio, then publish.
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">Select a video on the left to see details, downloads and upload options.</div>
            )}
          </div>
        </div>
      ) : null}

      {view === "news" ? <NewsView onToast={setToast} /> : null}

      {confirmDelete ? (
        <div className="scrim" onClick={() => setConfirmDelete(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="del-title" onClick={(e) => e.stopPropagation()}>
            <span className="tt" id="del-title">
              Delete “{confirmDelete.title || confirmDelete.slug}”?
            </span>
            <span className="smut">
              The video and thumbnail files are removed permanently. The topic stays in history, so it will{" "}
              <strong>never be re-suggested</strong>.
            </span>
            <div className="row row-end">
              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)} autoFocus>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void deleteDraft(confirmDelete.slug)}>
                Delete video
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          ✓ {toast}
        </div>
      ) : null}
    </main>
  );
}
