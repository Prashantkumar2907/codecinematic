import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/editor/project-workspace";
import { getSession } from "@/lib/auth";
import { getDemoProject } from "@/lib/demo-project-store";
import type { EditorDraft } from "@/lib/editor-store";
import { isRoutableProjectId, isUuid } from "@/lib/project-ids";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const { projectId } = await params;
  if (!isRoutableProjectId(projectId)) {
    notFound();
  }

  let initialDraft: Partial<EditorDraft> | undefined;
  const context = await getSupabaseUserContext();
  if (context && isUuid(projectId)) {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, title, primary_language, content_raw, aspect_ratio_mode")
      .eq("id", projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error || !data) {
      notFound();
    }

    initialDraft = {
      title: data.title,
      language: data.primary_language,
      code: data.content_raw,
      aspect: data.aspect_ratio_mode === "16:9" ? "16:9" : "9:16",
    };
  } else {
    const demoProject = getDemoProject(session.email, projectId);
    if (demoProject) {
      initialDraft = {
        title: demoProject.title,
        language: demoProject.language,
        code: demoProject.contentRaw,
        aspect: demoProject.aspectRatioMode === "16:9" ? "16:9" : "9:16",
      };
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto">
      <ProjectWorkspace plan={session.plan} projectId={projectId} initialDraft={initialDraft} />
    </main>
  );
}
