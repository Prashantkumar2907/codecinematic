"use client";

import { useState } from "react";
import { AlertCircle, Code2, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditorStore, defaultEditorDraft } from "@/lib/editor-store";
import type { Narration } from "@/lib/narration";

export function NarrationPanel({ projectId }: { projectId: string }) {
  const storedDraft = useEditorStore((s) => s.drafts[projectId]);
  const setDraft = useEditorStore((s) => s.setDraft);
  const draft = storedDraft ?? defaultEditorDraft;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const narration = draft.narration;
  const hasCode = draft.code.trim().length > 0;
  const codeLineCount = hasCode ? draft.code.split("\n").length : 0;

  async function handleGenerate() {
    if (!hasCode) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          language: draft.language,
          title: draft.title,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; narration?: Narration; error?: string };
      if (data.ok && data.narration) {
        setDraft(projectId, { narration: data.narration });
      } else {
        setError(data.error ?? "Failed to generate narration");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleEditSegmentText(index: number, text: string) {
    if (!narration) return;
    const updated: Narration = {
      ...narration,
      segments: narration.segments.map((seg, i) => (i === index ? { ...seg, text } : seg)),
    };
    setDraft(projectId, { narration: updated });
  }

  function handleEditIntro(text: string) {
    if (!narration) return;
    setDraft(projectId, { narration: { ...narration, intro: text } });
  }

  function handleEditOutro(text: string) {
    if (!narration) return;
    setDraft(projectId, { narration: { ...narration, outro: text } });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      <Card className="border-white/[0.06] bg-white/[0.02] shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Narration Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Powered by Google Gemini — analyzes your code and generates a voice-over script for each section.
            The narration syncs with line-by-line typing in the video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasCode ? (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <Code2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-300">No code found</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Go to the <strong>Code Studio</strong> tab and write or paste your code first.
                  The AI will then analyze it and generate a narration script.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button onClick={handleGenerate} disabled={loading} className="h-9 text-xs font-semibold gap-2">
                {loading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : narration ? (
                  <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Generate Narration</>
                )}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {codeLineCount} lines of {draft.language} • &quot;{draft.title || "Untitled"}&quot;
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive-foreground">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {narration && (
        <Card className="flex-1 min-h-0 border-white/[0.06] bg-white/[0.02] flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-sm">Narration Script</CardTitle>
            <CardDescription className="text-xs">
              Edit any text to refine the narration. Changes are saved automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3">
            {/* Intro */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Intro</label>
              <textarea
                value={narration.intro}
                onChange={(e) => handleEditIntro(e.target.value)}
                className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={2}
              />
            </div>

            {/* Segments */}
            {narration.segments.map((seg, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary">
                    Lines {seg.lineStart}–{seg.lineEnd}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Segment {i + 1} of {narration.segments.length}
                  </span>
                </div>
                <textarea
                  value={seg.text}
                  onChange={(e) => handleEditSegmentText(i, e.target.value)}
                  className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                  rows={3}
                />
              </div>
            ))}

            {/* Outro */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outro</label>
              <textarea
                value={narration.outro}
                onChange={(e) => handleEditOutro(e.target.value)}
                className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
