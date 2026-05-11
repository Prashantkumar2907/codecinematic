"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { detectImportantLines } from "@/lib/render/smart-focus";
import { buildEditorDraft, type EditorDraft, useEditorStore } from "@/lib/editor-store";
import { NEW_PROJECT_ID } from "@/lib/project-ids";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";
import { validateCodePayload } from "@/lib/quotas/limits";
import { BG_PRESETS } from "@/components/editor/shared/canvas-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Textarea } from "@/components/ui/textarea";

const languageOptions = [
  "typescript", "javascript", "python", "go", "java", "rust",
  "php", "csharp", "ruby", "kotlin", "swift", "cpp", "c",
  "dart", "sql", "bash", "r", "scala"
];
const aspectOptions = [
  { value: "9:16", label: "Vertical 9:16" },
  { value: "16:9", label: "Landscape 16:9" }
] as const;
type AspectValue = (typeof aspectOptions)[number]["value"];
const soundOptions = [
  { value: "off",        label: "Sound off" },
  { value: "soft",       label: "Soft keys" },
  { value: "typewriter", label: "Typewriter" },
  { value: "keyboard",   label: "Mech keyboard" },
  { value: "chime",      label: "Chime / piano" },
] as const;
type SoundValue = (typeof soundOptions)[number]["value"];
const themeOptions = [
  { value: "vscode",      label: "VS Code Dark", accent: "#2dd4bf" },
  { value: "dracula",     label: "Dracula",      accent: "#bd93f9" },
  { value: "monokai",     label: "Monokai",      accent: "#f92672" },
  { value: "nord",        label: "Nord",         accent: "#88c0d0" },
  { value: "github-dark", label: "GitHub Dark",  accent: "#58a6ff" },
] as const;
const codeFontOptions = [
  { value: "ui-monospace",    label: "System Mono" },
  { value: "JetBrains Mono",  label: "JetBrains Mono" },
  { value: "Courier New",     label: "Courier New" },
  { value: "monospace",       label: "Generic Mono" },
] as const;

const FOCUS_LINES_PER_PAGE = 8;

export function ProjectEditor({
  plan = "free",
  projectId,
  initialDraft,
}: {
  plan?: PlanCode;
  projectId: string;
  initialDraft?: Partial<EditorDraft>;
}) {
  const router = useRouter();
  const limits = PLAN_CONFIG[plan];
  const storedDraft = useEditorStore((state) => state.drafts[projectId]);
  const setDraft = useEditorStore((state) => state.setDraft);
  const createProject = useEditorStore((state) => state.createProject);
  const ensureProject = useEditorStore((state) => state.ensureProject);
  const touchProject = useEditorStore((state) => state.touchProject);
  const [focusPage, setFocusPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fallbackDraft = useMemo(() => buildEditorDraft(initialDraft), [initialDraft]);
  const draft = storedDraft ?? fallbackDraft;
  const title = draft.title;
  const language = draft.language;
  const aspectRatioMode = draft.aspect;
  const normalSpeed = draft.normalSpeed;
  const focusSpeed = draft.focusSpeed;
  const sound = draft.sound;
  const soundVolume = draft.soundVolume;
  const code = draft.code;
  const bgPresetId = draft.bgPresetId ?? "cosmic";
  const theme = draft.theme ?? "vscode";
  const codeFont = draft.codeFont ?? "ui-monospace";
  const cursorBlink = draft.cursorBlink ?? true;
  const focusFlash = draft.focusFlash ?? true;

  useEffect(() => {
    if (projectId !== NEW_PROJECT_ID && !storedDraft) {
      ensureProject(projectId, draft);
    }
  }, [draft, ensureProject, projectId, storedDraft]);

  const focusLines = useMemo(() => detectImportantLines(code), [code]);
  const allLines = useMemo(
    () =>
      code
        .split("\n")
        .map((content, index) => ({ lineNumber: index + 1, content }))
        .filter((line) => line.content.trim().length > 0),
    [code]
  );
  const focusPageCount = Math.max(1, Math.ceil(allLines.length / FOCUS_LINES_PER_PAGE));
  const currentFocusPage = Math.min(Math.max(focusPage, 1), focusPageCount);
  const paginatedLines = useMemo(() => {
    const start = (currentFocusPage - 1) * FOCUS_LINES_PER_PAGE;
    return allLines.slice(start, start + FOCUS_LINES_PER_PAGE);
  }, [allLines, currentFocusPage]);
  const focusLineMap = useMemo(() => new Map(focusLines.map((line) => [line.line, line])), [focusLines]);
  const validation = useMemo(() => validateCodePayload(plan, code), [plan, code]);
  const suggestedFocusLines = useMemo(() => {
    const detected = focusLines.map((line) => line.line);
    return detected.length > 0 ? detected : allLines.slice(0, 1).map((line) => line.lineNumber);
  }, [allLines, focusLines]);
  const enabledFocusLines = useMemo(
    () => (draft.focus.length > 0 ? draft.focus : suggestedFocusLines),
    [draft.focus, suggestedFocusLines]
  );

  useEffect(() => {
    if (focusPage !== currentFocusPage) {
      setFocusPage(currentFocusPage);
    }
  }, [currentFocusPage, focusPage]);

  useEffect(() => {
    const nextFocus = (() => {
      const available = new Set(allLines.map((line) => line.lineNumber));
      const kept = enabledFocusLines.filter((line) => available.has(line));
      return kept.length > 0 ? kept : suggestedFocusLines;
    })();

    if (JSON.stringify(nextFocus) !== JSON.stringify(draft.focus)) {
      setDraft(projectId, { focus: nextFocus });
    }
  }, [allLines, draft.focus, enabledFocusLines, projectId, setDraft, suggestedFocusLines]);

  const normalizedEnabledFocusLines = useMemo(() => {
    const available = new Set(allLines.map((line) => line.lineNumber));
    return enabledFocusLines.filter((line) => available.has(line));
  }, [allLines, enabledFocusLines]);
  const visibleLineNumbers = useMemo(() => (code.trim().length > 0 ? code.split("\n") : []), [code]);

  const canContinue = validation.ok && title.trim().length > 1 && normalizedEnabledFocusLines.length > 0;

  function handleToggleFocusLine(lineNumber: number) {
    const nextFocus = enabledFocusLines.includes(lineNumber)
      ? enabledFocusLines.filter((line) => line !== lineNumber)
      : [...enabledFocusLines, lineNumber].sort((a, b) => a - b);

    setDraft(projectId, { focus: nextFocus });
  }

  function updateDraftField<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setSaveError(null);
    setDraft(projectId, { [key]: value } as Partial<typeof draft>);
  }

  async function persistProject() {
    const payload = {
      title,
      language,
      aspectRatioMode: aspectRatioMode,
      contentRaw: code,
      normalSpeed,
      focusSpeed,
      sound,
      soundVolume,
      focus: normalizedEnabledFocusLines,
      narration: draft.narration,
      bgPresetId,
      theme,
      codeFont,
      cursorBlink,
      focusFlash,
      workflowTab: "editor",
    };

    const response = projectId === NEW_PROJECT_ID
      ? await fetch("/api/create-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: { projectId?: string; mode?: "supabase" | "demo" };
      error?: { message?: string } | string;
    } | null;

    if (!response.ok || !data?.ok) {
      const message = typeof data?.error === "string" ? data.error : data?.error?.message;
      throw new Error(message ?? "Could not save project.");
    }

    return {
      projectId: data.data?.projectId ?? projectId,
      mode: data.data?.mode ?? "demo",
    };
  }

  async function handleContinue() {
    if (!canContinue || saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    let savedProjectId = projectId;
    let savedMode: "supabase" | "demo" = "demo";
    try {
      const savedProject = await persistProject();
      savedProjectId = savedProject.projectId;
      savedMode = savedProject.mode;
      if (projectId === NEW_PROJECT_ID) {
        createProject({ ...draft, focus: normalizedEnabledFocusLines }, savedProjectId, {
          workflowTab: "editor",
          storageMode: savedMode === "supabase" ? "cloud" : "demo",
        });
      } else {
        touchProject(projectId, draft, {
          workflowTab: "editor",
          storageMode: savedMode === "supabase" ? "cloud" : "demo",
        });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save project.");
      setSaving(false);
      return;
    }

    const createVideoPath = `/projects/${savedProjectId}/create-video` as Route;
    if (projectId === NEW_PROJECT_ID) {
      router.replace(createVideoPath);
      return;
    }

    router.push(createVideoPath);
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col space-y-2 overflow-y-auto app-scroll xl:overflow-hidden">
      <h1 className="sr-only">Code Studio editor</h1>
      <div className="grid min-h-0 min-w-0 gap-2 xl:h-[calc(100vh-5rem)] xl:flex-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        
        {/* LEFT COLUMN: Settings + Code */}
        <div className="flex min-h-0 min-w-0 flex-col space-y-2 xl:overflow-hidden">
          
          <Card className="min-w-0 shrink-0 overflow-hidden border-border/40 bg-card shadow-sm">
            <CardHeader className="mb-2 flex flex-col items-start gap-2 border-b border-border/30 px-3 py-2 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
              <CardTitle className="text-sm font-semibold">Project settings</CardTitle>
              <div className="flex w-full flex-wrap items-center gap-2 min-[360px]:w-auto min-[360px]:justify-end">
                <MetricBadge label="Lines" value={`${validation.lineCount}/${limits.maxCodeLines}`} status={validation.lineCount > limits.maxCodeLines ? "danger" : "default"} />
                <MetricBadge label="Max Char" value={`${validation.longestLine}/${limits.maxLineLength}`} status={validation.longestLine > limits.maxLineLength ? "danger" : "default"} />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">
              <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0 space-y-1 lg:col-span-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">Title</span>
                  <Input value={title} onChange={(e) => updateDraftField("title", e.target.value)} aria-label="Project title" className="h-8 min-w-0 text-xs border-input shadow-sm focus-visible:ring-1" placeholder="Project title" />
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Language</span>
                  <select value={language} onChange={(e) => updateDraftField("language", e.target.value)} aria-label="Programming language" className="flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {languageOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Ratio</span>
                  <select value={aspectRatioMode} onChange={(e) => updateDraftField("aspect", e.target.value as AspectValue)} aria-label="Aspect ratio" className="flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {aspectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-2 pt-1 md:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Normal speed</span>
                  <SpeedSlider label="Normal typing speed" value={normalSpeed} onChange={(v) => updateDraftField("normalSpeed", v)} min="0.25" max="3.00" step="0.05" />
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Focus speed</span>
                  <SpeedSlider label="Focused line typing speed" value={focusSpeed} onChange={(v) => updateDraftField("focusSpeed", v)} min="0.25" max="3.00" step="0.05" />
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Sound pattern</span>
                  <select value={sound} onChange={(e) => updateDraftField("sound", e.target.value as SoundValue)} aria-label="Typing sound pattern" className="flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {soundOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Volume</span>
                  <Slider label="Typing sound volume" value={soundVolume} onChange={(v) => updateDraftField("soundVolume", v)} min="0.00" max="1.00" step="0.05" formatter={(val) => `${Math.round(Number(val) * 100)}%`} />
                </div>
              </div>

              {/* Row 3: Theme + Font + Effects */}
              <div className="grid min-w-0 grid-cols-1 gap-2 pt-1 min-[360px]:grid-cols-2 md:grid-cols-4">
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Color theme</span>
                  <select value={theme} onChange={(e) => updateDraftField("theme", e.target.value)} aria-label="Code color theme" className="flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {themeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Code font</span>
                  <select value={codeFont} onChange={(e) => updateDraftField("codeFont", e.target.value)} aria-label="Code font" className="flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors">
                    {codeFontOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Cursor blink</span>
                  <button
                    type="button"
                    onClick={() => updateDraftField("cursorBlink", !cursorBlink)}
                    aria-label="Toggle cursor blink"
                    aria-pressed={cursorBlink}
                    className={`flex h-8 w-full min-w-0 items-center justify-center rounded-md border text-[11px] font-medium transition-colors ${cursorBlink ? "border-primary bg-primary/10 text-primary" : "border-input bg-background text-muted-foreground"}`}
                  >
                    {cursorBlink ? "On" : "Off"}
                  </button>
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Focus flash</span>
                  <button
                    type="button"
                    onClick={() => updateDraftField("focusFlash", !focusFlash)}
                    aria-label="Toggle focus flash"
                    aria-pressed={focusFlash}
                    className={`flex h-8 w-full min-w-0 items-center justify-center rounded-md border text-[11px] font-medium transition-colors ${focusFlash ? "border-primary bg-primary/10 text-primary" : "border-input bg-background text-muted-foreground"}`}
                  >
                    {focusFlash ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* Row 4: Background presets */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">Background</span>
                  <span className="text-[9px] text-muted-foreground/60">{BG_PRESETS.find(p => p.id === bgPresetId)?.label ?? ""}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BG_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.label}
                      aria-label={`Use ${preset.label} background`}
                      aria-pressed={bgPresetId === preset.id}
                      onClick={() => updateDraftField("bgPresetId", preset.id)}
                      className={`h-8 w-8 rounded-md border-2 transition-all ${bgPresetId === preset.id ? "border-primary shadow-md scale-105" : "border-transparent hover:border-white/30"}`}
                      style={{ background: preset.preview }}
                    />
                  ))}
                </div>
              </div>

              {!validation.ok ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs font-medium text-destructive-foreground">
                  Exceeds plan limits. Reduce line count or shorten lines.
                </div>
              ) : null}
              {saveError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs font-medium text-destructive-foreground">
                  {saveError}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="flex min-h-[300px] min-w-0 flex-1 flex-col overflow-hidden border-border/40 bg-card shadow-sm xl:min-h-0">
            <div className="bg-muted/30 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b border-border/30 flex items-center justify-between">
              <span className="text-muted-foreground font-mono tracking-widest">// code input</span>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-auto app-scroll">
              <div id="line-numbers" className="w-10 shrink-0 bg-muted/20 text-muted-foreground border-r border-white/5 text-[11px] leading-[1.5rem] font-mono text-right pt-2 pb-8 pr-2 select-none overflow-hidden" suppressHydrationWarning>
                {visibleLineNumbers.map((_, i) => <div key={i} className="h-6 flex items-center justify-end">{i + 1}</div>)}
              </div>
              <Textarea
                aria-label="Code input"
                value={code}
                onChange={(event) => updateDraftField("code", event.target.value)}
                onScroll={(e) => {
                  const el = document.getElementById("line-numbers");
                  if (el) el.scrollTop = e.currentTarget.scrollTop;
                }}
                className="h-full min-h-0 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-2 pb-8 pt-2 font-mono text-[11px] leading-6 focus-visible:ring-0"
                spellCheck={false}
              />
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Focus Map */}
        <div className="flex min-h-0 min-w-0 flex-col space-y-2 xl:overflow-hidden">
          <Card className="flex min-h-[250px] min-w-0 flex-1 flex-col overflow-hidden border-border/40 bg-card shadow-sm xl:min-h-0">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b border-border/30 mb-2">
              <CardTitle className="text-sm font-semibold">Focus map</CardTitle>
              <Badge className="text-[9px] px-1.5 py-0 bg-secondary/50 text-secondary-foreground">{normalizedEnabledFocusLines.length} active</Badge>
            </CardHeader>
            <CardContent className="flex-1 min-w-0 overflow-y-auto app-scroll space-y-2 px-3 pb-3">
              {allLines.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Add code to build a focus map.
                </div>
              ) : null}
              {paginatedLines.map(({ lineNumber, content }) => {
                const detected = focusLineMap.get(lineNumber);
                const active = normalizedEnabledFocusLines.includes(lineNumber);
                const preview = content.trim();

                return (
                  <button
                    key={lineNumber}
                    type="button"
                    onClick={() => handleToggleFocusLine(lineNumber)}
                    className={`group relative w-full min-w-0 overflow-hidden rounded-md border p-2 text-left transition hover:border-primary/50 ${
                      active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card"
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
                    {active && <div className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium pl-2">Line {lineNumber}</span>
                      <div className="flex items-center gap-1">
                        <Badge className="max-w-[9rem] truncate px-1.5 py-0 text-[9px] bg-secondary/50 text-secondary-foreground">{detected ? detected.rule : "manual"}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate pl-2">{preview}</p>
                  </button>
                );
              })}
              <PaginationControls
                page={currentFocusPage}
                pageCount={focusPageCount}
                onPageChange={setFocusPage}
                itemLabel={`${allLines.length} lines`}
              />
            </CardContent>
          </Card>

          <Card className="min-w-0 shrink-0 border-border/40 bg-card shadow-sm">
            <CardContent className="py-2 px-3 space-y-2">
              <Button
                className="w-full h-9 text-xs font-semibold glow-primary-sm hover:glow-primary transition-all"
                onClick={handleContinue}
                disabled={!canContinue || saving}
              >
                {saving ? "Saving project..." : "Continue to create video"}
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
    <div className={`flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${status === "danger" ? "border-destructive/50 bg-destructive/10 text-destructive-foreground" : "border-border bg-secondary/20 text-muted-foreground shadow-sm"}`}>
      <span className="uppercase tracking-wider opacity-60">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatter = formatMultiplier
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  step: string;
  formatter?: (val: string) => string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative flex h-8 min-w-0 flex-1 flex-col justify-center rounded-md border border-border bg-card p-1.5 shadow-sm transition-colors hover:border-primary/50">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="h-[4px] w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100}%` }} />
        </div>
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-bold text-primary">{formatter(value)}</div>
    </div>
  );
}

/** SpeedSlider wraps Slider with +/- step buttons. */
function SpeedSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  nudge = "0.5",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  step: string;
  nudge?: string;
}) {
  function adjust(delta: number) {
    const next = Math.round((Number(value) + delta) * 100) / 100;
    const clamped = Math.min(Number(max), Math.max(Number(min), next));
    onChange(String(clamped.toFixed(2)));
  }
  return (
    <div className="space-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-Number(nudge))}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-[13px] font-bold leading-none transition-colors hover:border-primary/50 hover:bg-primary/20"
        >-</button>
        <div className="relative flex h-8 min-w-0 flex-1 flex-col justify-center rounded-md border border-border bg-card p-1.5 shadow-sm transition-colors hover:border-primary/50">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => adjust(Number(nudge))}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-[13px] font-bold leading-none transition-colors hover:border-primary/50 hover:bg-primary/20"
        >+</button>
        <div className="w-10 shrink-0 text-right text-[11px] font-bold text-primary">{Number(value).toFixed(2)}x</div>
      </div>
    </div>
  );
}

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}
