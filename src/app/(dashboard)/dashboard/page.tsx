import { redirect } from "next/navigation";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { getSession } from "@/lib/auth";
import { mergeProjectDraft } from "@/lib/editor-projects";
import type { ProjectSummary } from "@/lib/editor-store";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cloudProjects = await loadCloudProjects();

  return (
    <DashboardWorkspace
      userName={session.name}
      planCode={session.plan}
      seedDemoProject={session.isAdmin}
      cloudProjects={cloudProjects}
    />
  );
}

async function loadCloudProjects(): Promise<ProjectSummary[]> {
  const context = await getSupabaseUserContext();
  if (!context) return [];

  const { data, error } = await context.supabase
    .from("projects")
    .select("id, title, primary_language, aspect_ratio_mode, content_raw, content_structured, created_at, updated_at, last_opened_at")
    .eq("user_id", context.user.id)
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error || !data) {
    return [];
  }

  return data.map((project) => {
    const structured = mergeProjectDraft(
      {
        title: project.title,
        language: project.primary_language,
        code: project.content_raw,
        aspect: project.aspect_ratio_mode === "16:9" ? "16:9" : "9:16",
      },
      project.content_structured,
    );

    return {
      id: project.id,
      title: structured.draft.title ?? project.title,
      language: structured.draft.language ?? project.primary_language,
      aspect: structured.draft.aspect ?? (project.aspect_ratio_mode === "16:9" ? "16:9" : "9:16"),
      workflowTab: structured.workflowTab,
      storageMode: "cloud",
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      lastOpenedAt: project.last_opened_at ?? project.updated_at,
    };
  });
}
