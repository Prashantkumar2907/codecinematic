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
    <div className="flex-1 flex flex-col min-h-0 space-y-2">
      <div className="flex-1 min-h-0 grid gap-2 xl:grid-cols-[1.3fr_0.7fr]">
        
        {/* LEFT COLUMN: Settings + Code */}
        <div className="flex flex-col min-h-0 space-y-2">
          
          <Card className="shrink-0 border-white/5 bg-background shadow-lg dark:bg-card">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b border-white/5 mb-2">
              <CardTitle className="text-sm font-semibold">Project settings</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <MetricBadge label="Lines" value={`${validation.lineCount}/${limits.maxCodeLines}`} status={validation.lineCount > limits.maxCodeLines ? "danger" : "default"} />
                <MetricBadge label="Max Char" value={`${validation.longestLine}/${limits.maxLineLength}`} status={validation.longestLine > limits.maxLineLength ? "danger" : "default"} />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 lg:col-span-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">Title</span>
                  <Input value={title} onChange={(e) => updateDraftField("title", e.target.value)} className="h-7 text-xs border-input shadow-sm focus-visible:ring-1" placeholder="Project title" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Language</span>
                  <select value={language} onChange={(e) => updateDraftField("language", e.target.value)} className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {languageOptions.map(o => <option key={o} value={o} className="dark:bg-slate-950">{o}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Ratio</span>
                  <select value={aspectRatioMode} onChange={(e) => updateDraftField("aspect", e.target.value as any)} className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {aspectOptions.map(o => <option key={o.value} value={o.value} className="dark:bg-slate-950">{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 pt-1">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Normal speed</span>
                  <Slider value={normalSpeed} onChange={(v) => updateDraftField("normalSpeed", v)} min="0.05" max="1.50" step="0.05" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Focus speed</span>
                  <Slider value={focusSpeed} onChange={(v) => updateDraftField("focusSpeed", v)} min="0.05" max="1.50" step="0.05" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Sound pattern</span>
                  <select value={sound} onChange={(e) => updateDraftField("sound", e.target.value as any)} className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {soundOptions.map(o => <option key={o.value} value={o.value} className="dark:bg-slate-950">{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Volume</span>
                  <Slider value={soundVolume} onChange={(v) => updateDraftField("soundVolume", v)} min="0.00" max="1.00" step="0.05" formatter={(val) => `${Math.round(Number(val) * 100)}%`} />
                </div>
              </div>

              {!validation.ok ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs font-medium text-destructive-foreground">
                  Exceeds plan limits. Reduce line count or shorten lines.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col min-h-0 border-white/5 bg-background shadow-lg dark:bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b flex items-center justify-between">
              <span className="text-muted-foreground ml-1">Code Input</span>
            </div>
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div id="line-numbers" className="w-10 shrink-0 bg-muted/20 text-muted-foreground border-r border-white/5 text-[11px] font-mono text-right py-2 pr-2 select-none overflow-hidden" suppressHydrationWarning>
                {code.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <Textarea
                value={code}
                onChange={(event) => updateDraftField("code", event.target.value)}
                onScroll={(e) => {
                  const el = document.getElementById("line-numbers");
                  if (el) el.scrollTop = e.currentTarget.scrollTop;
                }}
                className="flex-1 h-full min-h-0 font-mono text-[11px] leading-6 border-0 focus-visible:ring-0 rounded-none bg-transparent resize-none p-2 whitespace-pre"
                spellCheck={false}
              />
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Focus Map */}
        <div className="flex flex-col min-h-0 space-y-2">
          <Card className="flex-1 flex flex-col min-h-0 border-white/5 bg-background shadow-lg dark:bg-card">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b border-white/5 mb-2">
              <CardTitle className="text-sm font-semibold">Focus map</CardTitle>
              <Badge className="text-[9px] px-1.5 py-0 bg-secondary/50 text-secondary-foreground">{normalizedEnabledFocusLines.length} active</Badge>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2 px-3 pb-3">
              {allLines.map(({ lineNumber, content }) => {
                const detected = focusLineMap.get(lineNumber);
                const active = normalizedEnabledFocusLines.includes(lineNumber);
                const preview = content.trim();

                return (
                  <button
                    key={lineNumber}
                    type="button"
                    onClick={() => handleToggleFocusLine(lineNumber)}
                    className={`group w-full rounded-md border p-2 text-left transition hover:border-primary/50 relative overflow-hidden ${
                      active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card"
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
                    {active && <div className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium pl-2">Line {lineNumber}</span>
                      <div className="flex items-center gap-1">
                        <Badge className="text-[9px] px-1.5 py-0 bg-secondary/50 text-secondary-foreground">{detected ? detected.rule : "manual"}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate pl-2">{preview}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-background shadow-lg dark:bg-card shrink-0">
            <CardContent className="py-2 px-3">
              <Button className="w-full h-8 text-xs font-semibold hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0" onClick={handleContinue} disabled={!canContinue}>
                Continue to create video
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

function MetricBadge({ label, value, status = "default" }: { label: string; value: string; status?: "default" | "danger" }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${status === "danger" ? "border-destructive/50 bg-destructive/10 text-destructive-foreground" : "border-border bg-secondary/20 text-muted-foreground shadow-sm"}`}>
      <span className="uppercase tracking-wider opacity-60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  formatter = formatMultiplier
}: {
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  step: string;
  formatter?: (val: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-md border border-border bg-card p-1.5 flex flex-col justify-center h-7 relative shadow-sm hover:border-primary/50 transition-colors">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="h-[4px] w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100}%` }} />
        </div>
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-bold text-primary">{formatter(value)}</div>
    </div>
  );
}

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}
