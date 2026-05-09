"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  Trash2,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";

const workflows = [
  { label: "Code Studio", desc: "Write code and render a cinematic typing video", tab: "editor", icon: Film },
  { label: "Word of Day", desc: "Create beautiful word definition reveal videos", tab: "wordofday", icon: BookOpen },
  { label: "Did You Know?", desc: "Animate facts and quotes into engaging shorts", tab: "didyouknow", icon: Wand2 },
  { label: "Shayari", desc: "Reveal Hindi and Urdu poetry with ornate motion", tab: "shayari", icon: Quote },
  { label: "Suvichar", desc: "Build motivational Hindi thought-of-day videos", tab: "suvichar", icon: MessageSquareQuote },
  { label: "Bollywood", desc: "Turn dialogue lines into cinematic quote clips", tab: "bollywood", icon: Clapperboard },
  { label: "Facts Hindi", desc: "Create multi-fact Hindi explainer shorts", tab: "factshindi", icon: Lightbulb },
] as const;

export function DashboardWorkspace({
  userName,
  planCode,
}: {
  userName: string;
  planCode: PlanCode;
}) {
  const router = useRouter();
  const plan = PLAN_CONFIG[planCode];
  const projects = useEditorStore((state) => state.projects);
  const projectOrder = useEditorStore((state) => state.projectOrder);
  const createProject = useEditorStore((state) => state.createProject);
  const deleteProject = useEditorStore((state) => state.deleteProject);
  const [mounted, setMounted] = useState(false);
  const recentProjects = projectOrder.map((id) => projects[id]).filter(Boolean).slice(0, 6);

  const metrics = [
    { icon: Layers, label: "Stored exports", value: String(plan.maxStoredExports) },
    { icon: Download, label: "Daily downloads", value: String(plan.maxDailyDownloads) },
    { icon: FileCode2, label: "Max code lines", value: String(plan.maxCodeLines) },
    { icon: Ruler, label: "Max chars / line", value: String(plan.maxLineLength) },
  ];

  function startWorkflow(tab: (typeof workflows)[number]["tab"], label: string) {
    const projectId = createProject({
      ...defaultEditorDraft,
      title: tab === "editor" ? defaultEditorDraft.title : `${label} video`,
    });

    router.push(`/projects/${projectId}?tab=${tab}`);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="flex-1 overflow-y-auto app-scroll">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-6 sm:px-8 sm:py-8 lg:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Welcome back, <span className="text-primary">{userName}</span>
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Loading your workspace.</p>
            </div>
            <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
              {plan.name} plan
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-xl border border-border/50 bg-card/35" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-8 sm:py-8 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Welcome back, <span className="text-primary">{userName}</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick a workflow below to get started.</p>
          </div>
          <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
            {plan.name} plan
          </span>
        </div>

        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Workflows</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {workflows.map((workflow, index) => (
              <button
                key={workflow.label}
                type="button"
                onClick={() => startWorkflow(workflow.tab, workflow.label)}
                className="animate-surface-in group h-full rounded-xl border border-border/50 bg-card/50 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 transition-colors group-hover:bg-primary/12">
                  <workflow.icon className="h-3.5 w-3.5 text-primary/70 transition-colors group-hover:text-primary" />
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold leading-tight transition-colors group-hover:text-foreground">{workflow.label}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/60">{workflow.desc}</p>
                </div>
                <ArrowRight className="mt-3 h-3 w-3 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary/60" />
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Recent projects</h2>
            <Button
              type="button"
              size="sm"
              className="h-8 w-fit text-xs"
              onClick={() => startWorkflow("editor", "Code Studio")}
            >
              New code project
            </Button>
          </div>

          {recentProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-card/30 p-4 text-sm text-muted-foreground">
              No saved projects yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {recentProjects.map((project) => (
                <div key={project.id} className="rounded-lg border border-border/50 bg-card/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{project.title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {project.language} - {project.aspect} - Updated {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${project.title}`}
                      onClick={() => deleteProject(project.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Link
                    href={`/projects/${project.id}?tab=editor`}
                    className="mt-3 inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-xs font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/10"
                  >
                    Open project
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Plan limits - {plan.name}
            </h2>
            <Link href="/pricing" className="text-[11px] text-primary/70 transition-colors hover:text-primary">
              Upgrade plan -&gt;
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className="animate-surface-in flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-4 transition-colors hover:border-border"
                style={{ animationDelay: `${(workflows.length + index) * 45}ms` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/8 bg-primary/6">
                  <metric.icon className="h-4 w-4 text-primary/60" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase leading-tight tracking-wider text-muted-foreground/50">{metric.label}</p>
                  <p className="mt-0.5 text-xl font-bold leading-tight tabular-nums">{metric.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
