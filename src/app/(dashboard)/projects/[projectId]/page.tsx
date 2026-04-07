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
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8 space-y-3">
        <Badge>{session.plan} demo workspace</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Cinematic project editor</h1>
        <p className="max-w-3xl text-muted-foreground">
          This editor assumes users can choose any language, write explanations in comments, and rely on line-based constraints so the UI and exported video stay readable.
        </p>
      </div>
      <ProjectEditor plan={session.plan} projectId={projectId} />
    </main>
  );
}
