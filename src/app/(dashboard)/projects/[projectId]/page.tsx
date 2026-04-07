import { redirect } from "next/navigation";

import { ProjectEditor } from "@/components/editor/project-editor";
import { Badge } from "@/components/ui/badge";
import { getDemoSession } from "@/lib/demo-auth";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getDemoSession();
  if (!session) {
    redirect("/login");
  }
  const { projectId } = await params;

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto p-4 gap-2">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cinematic project editor</h1>
          <p className="max-w-3xl text-xs text-muted-foreground mt-1">
            Build syntax-aware videos using deterministic line scrolling.
          </p>
        </div>
        <Badge className="text-[10px] py-0 bg-secondary/50 text-secondary-foreground">{session.plan} demo workspace</Badge>
      </div>
      <ProjectEditor plan={session.plan} projectId={projectId} />
    </main>
  );
}
