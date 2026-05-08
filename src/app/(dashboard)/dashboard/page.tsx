import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Download,
  FileCode2,
  Film,
  Layers,
  Lightbulb,
  MessageSquareQuote,
  Quote,
  Ruler,
  Wand2,
} from "lucide-react";

import { getSession } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/plans";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const plan = PLAN_CONFIG[session.plan];

  const metrics = [
    { icon: Layers, label: "Stored exports", value: String(plan.maxStoredExports) },
    { icon: Download, label: "Daily downloads", value: String(plan.maxDailyDownloads) },
    { icon: FileCode2, label: "Max code lines", value: String(plan.maxCodeLines) },
    { icon: Ruler, label: "Max chars / line", value: String(plan.maxLineLength) },
  ];

  const quickLinks = [
    { label: "Code Studio", desc: "Write code and render a cinematic typing video", href: "/projects/new-project?tab=editor", icon: Film, color: "primary" },
    { label: "Word of Day", desc: "Create beautiful word definition reveal videos", href: "/projects/new-project?tab=wordofday", icon: BookOpen, color: "primary" },
    { label: "Did You Know?", desc: "Animate facts and quotes into engaging shorts", href: "/projects/new-project?tab=didyouknow", icon: Wand2, color: "primary" },
    { label: "Shayari", desc: "Reveal Hindi and Urdu poetry with ornate motion", href: "/projects/new-project?tab=shayari", icon: Quote, color: "primary" },
    { label: "Suvichar", desc: "Build motivational Hindi thought-of-day videos", href: "/projects/new-project?tab=suvichar", icon: MessageSquareQuote, color: "primary" },
    { label: "Bollywood", desc: "Turn dialogue lines into cinematic quote clips", href: "/projects/new-project?tab=bollywood", icon: Clapperboard, color: "primary" },
    { label: "Facts Hindi", desc: "Create multi-fact Hindi explainer shorts", href: "/projects/new-project?tab=factshindi", icon: Lightbulb, color: "primary" },
  ];

  const planLabel = PLAN_CONFIG[session.plan].name;

  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-8 sm:py-8 lg:px-10">

        {/* Greeting */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Welcome back, <span className="text-primary">{session.name}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Pick a workflow below to get started.</p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {planLabel} plan
          </span>
        </div>

        {/* Workflows grid */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Workflows</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {quickLinks.map((f) => (
              <Link key={f.label} href={f.href as Route}>
                <div className="group h-full rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5 p-4 space-y-3 transition-all duration-200 cursor-pointer">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 group-hover:bg-primary/12 transition-colors">
                    <f.icon className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold leading-tight group-hover:text-foreground transition-colors">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground/60 leading-snug mt-0.5">{f.desc}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Plan limits */}
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Plan limits — {planLabel}
            </h2>
            <Link href="/pricing" className="text-[11px] text-primary/70 hover:text-primary transition-colors">
              Upgrade plan →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-border/50 bg-card/40 hover:border-border transition-colors p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/6 border border-primary/8">
                  <m.icon className="h-4 w-4 text-primary/60" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 leading-tight">{m.label}</p>
                  <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{m.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
