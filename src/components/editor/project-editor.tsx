"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { detectImportantLines } from "@/lib/render/smart-focus";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";
import { validateCodePayload } from "@/lib/quotas/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const languageOptions = ["typescript", "javascript", "python", "go", "java", "rust", "php", "csharp", "ruby", "kotlin"];
const aspectOptions = [
  { value: "9:16", label: "Vertical 9:16" },
  { value: "16:9", label: "Landscape 16:9" }
] as const;
const soundOptions = [
  { value: "off", label: "Sound off" },
  { value: "soft", label: "Soft keys" },
  { value: "typewriter", label: "Typewriter" }
] as const;

export function ProjectEditor({ plan = "free", projectId }: { plan?: PlanCode; projectId: string }) {
  const router = useRouter();
  const limits = PLAN_CONFIG[plan];
  const storedDraft = useEditorStore((state) => state.drafts[projectId]);
  const setDraft = useEditorStore((state) => state.setDraft);

  const draft = storedDraft ?? defaultEditorDraft;
  const title = draft.title;
  const language = draft.language;
  const aspectRatioMode = draft.aspect;
  const normalSpeed = draft.normalSpeed;
  const focusSpeed = draft.focusSpeed;
  const sound = draft.sound;
  const soundVolume = draft.soundVolume;
  const code = draft.code;

  const focusLines = useMemo(() => detectImportantLines(code), [code]);
  const allLines = useMemo(
    () =>
      code
        .split("\n")
        .map((content, index) => ({ lineNumber: index + 1, content }))
        .filter((line) => line.content.trim().length > 0),
    [code]
  );
  const focusLineMap = useMemo(() => new Map(focusLines.map((line) => [line.line, line])), [focusLines]);
  const validation = useMemo(() => validateCodePayload(plan, code), [plan, code]);
  const enabledFocusLines = draft.focus.length > 0 ? draft.focus : focusLines.map((line) => line.line);

  useEffect(() => {
    const nextFocus = (() => {
      const available = new Set(focusLines.map((line) => line.line));
      const kept = enabledFocusLines.filter((line) => available.has(line));
      return kept.length > 0 ? kept : focusLines.map((line) => line.line);
    })();

    if (JSON.stringify(nextFocus) !== JSON.stringify(draft.focus)) {
      setDraft(projectId, { focus: nextFocus });
    }
  }, [draft.focus, enabledFocusLines, focusLines, projectId, setDraft]);

  const normalizedEnabledFocusLines = useMemo(() => {
    const available = new Set(focusLines.map((line) => line.line));
    return enabledFocusLines.filter((line) => available.has(line));
  }, [enabledFocusLines, focusLines]);

  const canContinue = validation.ok && title.trim().length > 1 && normalizedEnabledFocusLines.length > 0;

  function handleToggleFocusLine(lineNumber: number) {
    const nextFocus = enabledFocusLines.includes(lineNumber)
      ? enabledFocusLines.filter((line) => line !== lineNumber)
      : [...enabledFocusLines, lineNumber].sort((a, b) => a - b);

    setDraft(projectId, { focus: nextFocus });
  }

  function updateDraftField<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft(projectId, { [key]: value } as Partial<typeof draft>);
  }

  function handleContinue() {
    if (!canContinue) {
      return;
    }

    const params = new URLSearchParams({
      title,
      language,
      aspect: aspectRatioMode,
      normalSpeed,
      focusSpeed,
      sound,
      soundVolume,
      focus: normalizedEnabledFocusLines.join(",")
    });

    router.push(`/projects/${projectId}/create-video?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>Project editor</CardTitle>
            <CardDescription>
              Choose a language, keep explanations inside comments, and shape the export for vertical, landscape, or both.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Project title</label>
                <Input value={title} onChange={(event) => updateDraftField("title", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Language</label>
                <select
                  value={language}
                  onChange={(event) => updateDraftField("language", event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-black/10 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {languageOptions.map((option) => (
                    <option key={option} value={option} className="bg-slate-950">
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Normal line speed</label>
                <Slider value={normalSpeed} onChange={(value) => updateDraftField("normalSpeed", value)} min="0.05" max="1.50" step="0.05" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Focused line speed</label>
                <Slider value={focusSpeed} onChange={(value) => updateDraftField("focusSpeed", value)} min="0.05" max="1.50" step="0.05" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Typing sound</label>
                <div className="grid gap-3 md:grid-cols-3">
                  {soundOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateDraftField("sound", option.value)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        sound === option.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"
                      }`}
                    >
                      <p className="font-medium">{option.label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Insertion volume</label>
                <Slider value={soundVolume} onChange={(value) => updateDraftField("soundVolume", value)} min="0.00" max="1.00" step="0.05" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm text-muted-foreground">Aspect ratio</label>
              <div className="grid gap-3 md:grid-cols-2">
                {aspectOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateDraftField("aspect", option.value)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      aspectRatioMode === option.value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-white/10 bg-black/20 text-muted-foreground hover:border-white/20"
                    }`}
                  >
                    <p className="font-medium">{option.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Code and inline explanation comments</label>
              <Textarea
                value={code}
                onChange={(event) => updateDraftField("code", event.target.value)}
                className="min-h-[360px] font-mono text-sm leading-7"
                spellCheck={false}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Plan" value={plan.toUpperCase()} />
              <Metric label="Line count" value={`${validation.lineCount}/${limits.maxCodeLines}`} status={validation.lineCount > limits.maxCodeLines ? "danger" : "default"} />
              <Metric
                label="Longest line"
                value={`${validation.longestLine}/${limits.maxLineLength}`}
                status={validation.longestLine > limits.maxLineLength ? "danger" : "default"}
              />
              <Metric label="Selected focus lines" value={`${normalizedEnabledFocusLines.length}`} />
            </div>

            {!validation.ok ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                This project exceeds the current plan display limits. Reduce line count or shorten long lines before continuing.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-white/5">
            <CardHeader>
              <CardTitle>Focus map</CardTitle>
              <CardDescription>Every line is visible here. Important lines are auto-detected, but you can enable or disable emphasis manually for any line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {allLines.map(({ lineNumber, content }) => {
                const detected = focusLineMap.get(lineNumber);
                const active = normalizedEnabledFocusLines.includes(lineNumber);
                const preview = content.trim();

                return (
                  <button
                    key={lineNumber}
                    type="button"
                    onClick={() => handleToggleFocusLine(lineNumber)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      active ? "border-primary bg-primary/10" : "border-white/10 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">Line {lineNumber}</span>
                      <div className="flex items-center gap-2">
                        <Badge>{detected ? detected.rule : "normal"}</Badge>
                        <Badge className={active ? "border-primary/30 bg-primary/10 text-primary" : ""}>{active ? "enabled" : "off"}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 font-mono text-sm text-muted-foreground">{preview}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detected ? `Score ${detected.score}${detected.caption ? ` • ${detected.caption}` : ""}` : "No automatic focus detected"}
                    </p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-white/5">
            <CardHeader>
              <CardTitle>Workflow summary</CardTitle>
              <CardDescription>These choices carry into the next step where the demo app creates export jobs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{language}</Badge>
                <Badge>{aspectRatioMode}</Badge>
                <Badge>{formatMultiplier(normalSpeed)} normal</Badge>
                <Badge>{formatMultiplier(focusSpeed)} focus</Badge>
                <Badge>{sound} sound</Badge>
                <Badge>{Math.round(Number(soundVolume) * 100)}% volume</Badge>
                <Badge>{normalizedEnabledFocusLines.length} focus moments</Badge>
              </div>
              <Button className="w-full" onClick={handleContinue} disabled={!canContinue}>
                Continue to create video
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, status = "default" }: { label: string; value: string; status?: "default" | "danger" }) {
  return (
    <div className={`rounded-2xl border p-4 ${status === "danger" ? "border-rose-400/30 bg-rose-500/10" : "border-white/10 bg-black/20"}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step
}: {
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  step: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[hsl(var(--primary))]"
      />
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span className="font-medium text-foreground">{formatMultiplier(value)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}
