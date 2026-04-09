"use client";

import { useState } from "react";
import { Check, ChevronRight, Download, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditorStore, defaultEditorDraft } from "@/lib/editor-store";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";
import { validateCodePayload } from "@/lib/quotas/limits";
import type { Narration } from "@/lib/narration";

type PipelineStep = "idle" | "video" | "narration" | "tts" | "merge" | "done";

export function PipelinePanel({
  plan,
  projectId,
}: {
  plan: PlanCode;
  projectId: string;
}) {
  const storedDraft = useEditorStore((s) => s.drafts[projectId]);
  const setDraft = useEditorStore((s) => s.setDraft);
  const draft = storedDraft ?? defaultEditorDraft;
  const limits = PLAN_CONFIG[plan];
  const validation = validateCodePayload(plan, draft.code);

  const [step, setStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState("output.webm");

  const hasCode = draft.code.trim().length > 0;
  const hasTitle = draft.title.trim().length > 0;
  const canStart = hasCode && hasTitle && validation.ok;

  /* ── run the full pipeline ── */
  async function runPipeline() {
    setStep("video");
    setError(null);
    setVideoUrl(null);

    // ── Step 1 : Render silent video from code ──
    let videoBlob: Blob;
    try {
      const exportRes = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          aspectRatios: [draft.aspect],
          format: "mp4",
        }),
      });
      const exportData = (await exportRes.json()) as {
        jobs?: Array<{
          exportId: string;
          aspectRatio: string;
          watermarked: boolean;
        }>;
        error?: string;
      };

      if (!exportRes.ok || !exportData.jobs?.length) {
        setError(exportData.error ?? "Failed to create export job");
        setStep("idle");
        return;
      }

      const job = exportData.jobs[0];

      const { renderVideoBlobFromPipeline } = await import(
        "@/components/editor/render-utils"
      );
      videoBlob = await renderVideoBlobFromPipeline({
        title: draft.title,
        language: draft.language,
        aspectRatio: job.aspectRatio,
        code: draft.code,
        focusLines: draft.focus,
        watermarked: job.watermarked,
        normalSpeed: draft.normalSpeed,
        focusSpeed: draft.focusSpeed,
        sound: draft.sound,
        soundVolume: draft.soundVolume,
        narration: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video rendering failed");
      setStep("idle");
      return;
    }

    // ── Step 2 : Generate AI narration from code ──
    setStep("narration");
    let narrationData: Narration | null = null;
    try {
      const commentaryRes = await fetch("/api/ai/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          language: draft.language,
          title: draft.title,
        }),
      });
      const cData = (await commentaryRes.json()) as {
        ok?: boolean;
        narration?: Narration;
        error?: string;
      };
      if (cData.ok && cData.narration) {
        narrationData = cData.narration;
        setDraft(projectId, { narration: narrationData });
      } else {
        console.warn("Narration generation failed:", cData.error);
      }
    } catch {
      console.warn("Narration generation failed, continuing without audio");
    }

    if (!narrationData) {
      // No narration => deliver silent video
      const url = URL.createObjectURL(videoBlob);
      setVideoUrl(url);
      setVideoFilename(
        slugify(draft.title) +
          "-" +
          draft.aspect.replace(":", "x") +
          ".webm",
      );
      setStep("done");
      return;
    }

    // ── Step 3 : Convert narration text to speech via Sarvam AI ──
    setStep("tts");
    const allTexts = [
      narrationData.intro,
      ...narrationData.segments.map((s) => s.text),
      narrationData.outro,
    ];

    const audioChunks: Blob[] = [];
    for (const text of allTexts) {
      try {
        const ttsRes = await fetch("/api/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            language: "en-IN",
            speaker: "meera",
            pace: 1.0,
          }),
        });
        const ttsData = (await ttsRes.json()) as {
          ok?: boolean;
          audioBase64?: string;
          error?: string;
        };
        if (ttsData.ok && ttsData.audioBase64) {
          const binaryStr = atob(ttsData.audioBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          audioChunks.push(new Blob([bytes], { type: "audio/wav" }));
        }
      } catch {
        console.warn("TTS failed for a segment, skipping");
      }
    }

    // ── Step 4 : Merge video + audio ──
    setStep("merge");

    if (audioChunks.length === 0) {
      // No audio => silent video
      const url = URL.createObjectURL(videoBlob);
      setVideoUrl(url);
      setVideoFilename(
        slugify(draft.title) +
          "-" +
          draft.aspect.replace(":", "x") +
          ".webm",
      );
      setStep("done");
      return;
    }

    try {
      const mergedBlob = await mergeVideoWithAudioChunks(videoBlob, audioChunks);
      const url = URL.createObjectURL(mergedBlob);
      setVideoUrl(url);
      setVideoFilename(
        slugify(draft.title) +
          "-" +
          draft.aspect.replace(":", "x") +
          "-narrated.webm",
      );
      setStep("done");
    } catch (err) {
      console.warn("Merge failed, delivering silent video:", err);
      const url = URL.createObjectURL(videoBlob);
      setVideoUrl(url);
      setVideoFilename(
        slugify(draft.title) +
          "-" +
          draft.aspect.replace(":", "x") +
          ".webm",
      );
      setStep("done");
    }
  }

  /* ── step config ── */
  const steps = [
    { id: "video" as const, label: "Render Video" },
    { id: "narration" as const, label: "AI Narration" },
    { id: "tts" as const, label: "Generate Audio" },
    { id: "merge" as const, label: "Merge A/V" },
    { id: "done" as const, label: "Complete" },
  ];
  const stepOrder: PipelineStep[] = [
    "video",
    "narration",
    "tts",
    "merge",
    "done",
  ];

  /* ── render ── */
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto">
      <Card className="border-white/[0.06] bg-white/[0.02] shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Auto Pipeline
          </CardTitle>
          <CardDescription className="text-xs">
            Code &rarr; Video &rarr; AI Narration &rarr; Speech Audio &rarr;
            Final narrated video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* step indicators */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {steps.map((s, i) => {
              const sIdx = stepOrder.indexOf(s.id);
              const curIdx = stepOrder.indexOf(step);
              const done = step !== "idle" && sIdx < curIdx;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div
                    className={
                      "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-all " +
                      (done
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-white/[0.06] text-muted-foreground/50")
                    }
                  >
                    {done ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : active ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : null}
                    {s.label}
                  </div>
                  {i < steps.length - 1 && (
                    <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/30" />
                  )}
                </div>
              );
            })}
          </div>

          {/* start button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={runPipeline}
              disabled={!canStart || (step !== "idle" && step !== "done")}
              className="h-10 px-6 text-sm font-semibold gap-2"
            >
              {step === "idle" || step === "done" ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {step === "done" ? "Run Again" : "Start Pipeline"}
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing&hellip;
                </>
              )}
            </Button>
            {!canStart && (
              <span className="text-xs text-muted-foreground">
                {!hasTitle
                  ? "Set a title in Code Studio"
                  : !hasCode
                  ? "Write code in Code Studio first"
                  : "Code exceeds plan limits"}
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive-foreground">
              {error}
            </div>
          )}

          {/* project summary */}
          <div className="grid gap-2 sm:grid-cols-4 text-xs">
            <SummaryCell label="Title" value={draft.title || "\u2014"} />
            <SummaryCell label="Language" value={draft.language} />
            <SummaryCell label="Aspect" value={draft.aspect} />
            <SummaryCell
              label="Lines"
              value={
                draft.code.split("\n").filter((l: string) => l.trim()).length +
                " / " +
                limits.maxCodeLines
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* video result */}
      {videoUrl && (
        <Card className="border-primary/20 bg-primary/[0.03] shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-primary flex items-center gap-2">
              <Check className="h-4 w-4" /> Video Ready
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[60vh] object-contain rounded-lg border border-white/[0.06] bg-black shadow-lg"
            />
            <a href={videoUrl} download={videoFilename}>
              <Button className="h-9 text-xs font-semibold gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download {videoFilename}
              </Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── helpers ── */

function SummaryCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/[0.04] bg-white/[0.01] p-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}

/** Decode each WAV blob, concatenate into one AudioBuffer, then merge with video. */
async function mergeVideoWithAudioChunks(
  videoBlob: Blob,
  audioChunks: Blob[],
): Promise<Blob> {
  const audioCtx = new AudioContext();

  // Decode each WAV chunk individually
  const decoded: AudioBuffer[] = [];
  for (const chunk of audioChunks) {
    try {
      const buf = await audioCtx.decodeAudioData(await chunk.arrayBuffer());
      decoded.push(buf);
    } catch {
      console.warn("Skipping undecodable audio chunk");
    }
  }

  if (decoded.length === 0) {
    audioCtx.close();
    return videoBlob; // Return silent video
  }

  // Concatenate AudioBuffers
  const sampleRate = decoded[0].sampleRate;
  const numChannels = decoded[0].numberOfChannels;
  const totalLength = decoded.reduce((sum, b) => sum + b.length, 0);
  const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);

  let offset = 0;
  for (const buf of decoded) {
    for (let ch = 0; ch < numChannels; ch++) {
      combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
    }
    offset += buf.length;
  }

  // Set up video element
  const video = document.createElement("video");
  video.src = URL.createObjectURL(videoBlob);
  video.muted = true;
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;
  const ctx2d = canvas.getContext("2d")!;

  // Create audio source from combined buffer
  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = combined;
  const audioDest = audioCtx.createMediaStreamDestination();
  audioSource.connect(audioDest);

  // Combine canvas video + audio streams
  const canvasStream = canvas.captureStream(30);
  for (const track of audioDest.stream.getAudioTracks()) {
    canvasStream.addTrack(track);
  }

  const recorder = new MediaRecorder(canvasStream, {
    mimeType: "video/webm;codecs=vp8,opus",
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      audioCtx.close();
      URL.revokeObjectURL(video.src);
      resolve(new Blob(chunks, { type: "video/webm" }));
    };

    recorder.start();
    audioSource.start();
    video.play();

    function drawFrame() {
      if (video.ended || video.paused) {
        setTimeout(() => recorder.stop(), 200);
        return;
      }
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    }
    drawFrame();

    video.onended = () => {
      setTimeout(() => recorder.stop(), 200);
    };
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
