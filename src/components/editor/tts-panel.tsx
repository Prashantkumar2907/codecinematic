"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Play, Square, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditorStore, defaultEditorDraft } from "@/lib/editor-store";

const SPEAKERS = [
  { value: "meera", label: "Meera (Female)" },
  { value: "arvind", label: "Arvind (Male)" },
  { value: "amol", label: "Amol (Male)" },
  { value: "shubh", label: "Shubh (Male)" },
];

const LANGUAGES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "ta-IN", label: "Tamil" },
  { value: "te-IN", label: "Telugu" },
  { value: "kn-IN", label: "Kannada" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "mr-IN", label: "Marathi" },
  { value: "bn-IN", label: "Bengali" },
  { value: "gu-IN", label: "Gujarati" },
];

export function TtsPanel({ projectId }: { projectId: string }) {
  const storedDraft = useEditorStore((s) => s.drafts[projectId]);
  const draft = storedDraft ?? defaultEditorDraft;
  const narration = draft.narration;

  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(-1);
  const [speaker, setSpeaker] = useState("meera");
  const [language, setLanguage] = useState("en-IN");
  const [pace, setPace] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<(string | null)[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  if (!narration) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="border-white/[0.06] bg-white/[0.02] max-w-md">
          <CardContent className="p-6 text-center space-y-2">
            <Volume2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No narration available. Generate AI narration first, then come here to create audio.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allText = [
    narration.intro,
    ...narration.segments.map((s) => s.text),
    narration.outro,
  ];

  async function generateAudioForText(text: string): Promise<string | null> {
    try {
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, speaker, pace }),
      });
      const data = (await res.json()) as { ok?: boolean; audioBase64?: string; error?: string };
      if (data.ok && data.audioBase64) {
        const binaryStr = atob(data.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/wav" });
        return URL.createObjectURL(blob);
      }
      throw new Error(data.error ?? "TTS failed");
    } catch (err) {
      console.error("TTS error:", err);
      return null;
    }
  }

  async function handleGenerateAll() {
    setGenerating(true);
    setError(null);
    abortRef.current = false;
    audioUrls.forEach((url) => url && URL.revokeObjectURL(url));

    const urls: (string | null)[] = [];
    for (let i = 0; i < allText.length; i++) {
      if (abortRef.current) break;
      setCurrentSegment(i);
      const url = await generateAudioForText(allText[i]);
      urls.push(url);
    }

    if (urls.some((u) => !u)) {
      setError("Some segments failed to generate. Try again.");
    }

    setAudioUrls(urls);
    setCurrentSegment(-1);
    setGenerating(false);
  }

  async function handlePlayAll() {
    if (audioUrls.length === 0) return;
    setPlaying(true);
    abortRef.current = false;

    for (let i = 0; i < audioUrls.length; i++) {
      if (abortRef.current) break;
      const url = audioUrls[i];
      if (!url) continue;
      setCurrentSegment(i);
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }

    setPlaying(false);
    setCurrentSegment(-1);
    audioRef.current = null;
  }

  function handlePlaySegment(index: number) {
    const url = audioUrls[index];
    if (!url) return;
    if (audioRef.current) audioRef.current.pause();
    setPlaying(true);
    setCurrentSegment(index);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { setPlaying(false); setCurrentSegment(-1); };
    audio.play().catch(() => { setPlaying(false); setCurrentSegment(-1); });
  }

  function handleStop() {
    abortRef.current = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
    setGenerating(false);
    setCurrentSegment(-1);
  }

  function handleDownloadAll() {
    audioUrls.forEach((url, i) => {
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `narration-segment-${i}.wav`;
      a.click();
    });
  }

  const hasAudio = audioUrls.length > 0 && audioUrls.some(Boolean);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      <Card className="border-white/[0.06] bg-white/[0.02] shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary" />
            Audio Studio
          </CardTitle>
          <CardDescription className="text-xs">
            Generate audio from your narration script using Sarvam AI text-to-speech.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Speaker</span>
              <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {SPEAKERS.map((s) => (
                  <option key={s.value} value={s.value} className="dark:bg-slate-950">{s.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value} className="dark:bg-slate-950">{l.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Pace: {pace.toFixed(1)}x</span>
              <input type="range" min="0.5" max="2.0" step="0.1" value={pace}
                onChange={(e) => setPace(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-primary" />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleGenerateAll} disabled={generating || playing} className="h-8 text-xs font-semibold gap-1.5">
              {generating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating ({currentSegment + 1}/{allText.length})…</>
              ) : (
                <><Volume2 className="h-3.5 w-3.5" /> {hasAudio ? "Regenerate Audio" : "Generate Audio"}</>
              )}
            </Button>
            {hasAudio && (
              <>
                <Button onClick={handlePlayAll} disabled={generating || playing} variant="secondary" className="h-8 text-xs font-semibold gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Play All
                </Button>
                <Button onClick={handleStop} disabled={!playing && !generating} variant="outline" className="h-8 text-xs font-semibold gap-1.5">
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
                <Button onClick={handleDownloadAll} variant="ghost" className="h-8 text-xs font-semibold gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive-foreground">{error}</div>
          )}
        </CardContent>
      </Card>

      <Card className="flex-1 min-h-0 border-white/[0.06] bg-white/[0.02] flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm">Narration Segments</CardTitle>
          <CardDescription className="text-xs">
            Each segment is converted to audio individually for precise control.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-2">
          {allText.map((text, index) => {
            const isActive = currentSegment === index;
            const hasSegmentAudio = !!audioUrls[index];
            const label =
              index === 0 ? "Intro"
              : index === allText.length - 1 ? "Outro"
              : `Lines ${narration.segments[index - 1]?.lineStart}–${narration.segments[index - 1]?.lineEnd}`;

            return (
              <div key={index} className={`rounded-lg border p-3 transition-all ${
                isActive ? "border-primary bg-primary/10 shadow-sm" : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1]"
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-primary">{label}</span>
                    {hasSegmentAudio && (
                      <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-1.5 py-px">ready</span>
                    )}
                  </div>
                  <button type="button" onClick={() => handlePlaySegment(index)}
                    disabled={!hasSegmentAudio || (playing && currentSegment !== index)}
                    className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-30">
                    {isActive && playing ? (
                      <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
