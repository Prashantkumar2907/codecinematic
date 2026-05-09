import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/editor/project-workspace";
import { getSession } from "@/lib/auth";
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

  const context = await getSupabaseUserContext();
  if (context && isUuid(projectId)) {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error || !data) {
      notFound();
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto">
      <ProjectWorkspace plan={session.plan} projectId={projectId} />
    </main>
  );
}
