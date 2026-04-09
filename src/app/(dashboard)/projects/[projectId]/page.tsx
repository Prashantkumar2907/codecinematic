import { redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/editor/project-workspace";
import { getSession } from "@/lib/auth";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const { projectId } = await params;

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto">
      <ProjectWorkspace plan={session.plan} projectId={projectId} />
    </main>
  );
}
