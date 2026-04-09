import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Download, FileCode2, Film, Layers, MessageSquareText, Ruler, Sparkles, Volume2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/plans";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const plan = PLAN_CONFIG[session.plan];

  const metrics = [
    { icon: Layers, label: "Stored exports", value: String(plan.maxStoredExports) },
    { icon: Download, label: "Daily downloads", value: String(plan.maxDailyDownloads) },
    { icon: FileCode2, label: "Max code lines", value: String(plan.maxCodeLines) },
    { icon: Ruler, label: "Max chars / line", value: String(plan.maxLineLength) },
  ];

  const quickLinks = [
    { label: "Code Studio", desc: "Write code in the editor and render a cinematic video", href: "/projects/new-project?tab=editor", icon: Film },
    { label: "AI Narration", desc: "Generate a voice-over script with Google Gemini", href: "/projects/new-project?tab=narration", icon: MessageSquareText },
    { label: "Audio Studio", desc: "Convert narration to speech with Sarvam AI", href: "/projects/new-project?tab=tts", icon: Volume2 },
    { label: "Auto Pipeline", desc: "Code → narration → audio → video in one click", href: "/projects/new-project?tab=pipeline", icon: Sparkles },
  ];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-4 sm:px-6 lg:px-10 py-10 space-y-10">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back, {session.name}</h1>
          <p className="text-xs text-muted-foreground mt-1">Pick a workflow or check your plan limits below.</p>
        </div>

        {/* Quick links */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((f) => (
            <Link key={f.label} href={f.href as Route}>
              <Card className="group h-full border-white/[0.06] bg-white/[0.02] hover:border-primary/30 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-primary/[0.03] transition-all duration-200 cursor-pointer">
                <CardContent className="p-5 space-y-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/[0.08] group-hover:bg-primary/[0.12] transition-colors">
                    <f.icon className="h-4 w-4 text-primary/80 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-semibold group-hover:text-foreground transition-colors">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Plan limits */}
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-4">Your plan limits</h2>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.label} className="border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-colors">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.06]">
                    <m.icon className="h-4 w-4 text-primary/70" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">{m.label}</p>
                    <p className="text-xl font-bold tabular-nums">{m.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
