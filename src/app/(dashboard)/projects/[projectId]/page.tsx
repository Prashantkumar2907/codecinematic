import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/editor/project-workspace";
import { getSession } from "@/lib/auth";
import { getDemoProject } from "@/lib/demo-project-store";
import { mergeProjectDraft, readProjectStructuredContent } from "@/lib/editor-projects";
import type { EditorDraft } from "@/lib/editor-store";
import { isRoutableProjectId, isUuid } from "@/lib/project-ids";
import { getSupabaseUserContext } from "@/lib/supabase/domain";
import type { WorkflowTab } from "@/lib/workflows";

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
  let initialWorkflowTab: WorkflowTab = "editor";
  const context = await getSupabaseUserContext();
  if (context && isUuid(projectId)) {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, title, primary_language, content_raw, aspect_ratio_mode, content_structured")
      .eq("id", projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error || !data) {
      notFound();
    }

    const structured = mergeProjectDraft(
      {
        title: data.title,
        language: data.primary_language,
        code: data.content_raw,
        aspect: data.aspect_ratio_mode === "16:9" ? "16:9" : "9:16",
      },
      data.content_structured,
    );
    initialDraft = structured.draft;
    initialWorkflowTab = structured.workflowTab;
  } else {
    const demoProject = getDemoProject(session.email, projectId);
    if (demoProject) {
      const structured = readProjectStructuredContent({
        workflowTab: demoProject.workflowTab,
        editorDraft: demoProject.editorDraft,
      });
      initialDraft = {
        title: demoProject.title,
        language: demoProject.language,
        code: demoProject.contentRaw,
        aspect: demoProject.aspectRatioMode === "16:9" ? "16:9" : "9:16",
        ...structured.editorDraft,
      };
      initialWorkflowTab = structured.workflowTab;
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto">
      <ProjectWorkspace
        plan={session.plan}
        projectId={projectId}
        initialDraft={initialDraft}
        initialWorkflowTab={initialWorkflowTab}
      />
    </main>
  );
}
