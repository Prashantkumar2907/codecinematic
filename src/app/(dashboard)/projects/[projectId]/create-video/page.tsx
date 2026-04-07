import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateVideoPanel } from "@/components/editor/create-video-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDemoSession } from "@/lib/demo-auth";

export default async function CreateVideoPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    title?: string;
    language?: string;
    aspect?: string;
    focus?: string;
    code?: string;
    normalSpeed?: string;
    focusSpeed?: string;
    sound?: string;
    soundVolume?: string;
  }>;
}) {
  const session = await getDemoSession();
  if (!session) {
    redirect("/login");
  }

  const { projectId } = await params;
  const query = await searchParams;
  const title = query.title ?? "Untitled cinematic project";
  const language = query.language ?? "typescript";
  const aspect = query.aspect ?? "9:16";
  const focus = query.focus ? query.focus.split(",").filter(Boolean) : [];
  const code = query.code ?? "";
  const normalSpeed = query.normalSpeed ?? "0.60";
  const focusSpeed = query.focusSpeed ?? "0.35";
  const sound = query.sound ?? "soft";
  const soundVolume = query.soundVolume ?? "0.30";

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge>{session.plan} demo workflow</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Create video</h1>
          <p className="max-w-3xl text-muted-foreground">
            This step turns the editor choices into export jobs. The response is plan-aware, so free users stay watermarked while paid users can store eligible exports later.
          </p>
        </div>
        <Link href={`/projects/${projectId}`}>
          <Button variant="secondary">Back to editor</Button>
        </Link>
      </div>

      <CreateVideoPanel
        projectId={projectId}
        title={title}
        language={language}
        aspect={aspect}
        focus={focus}
        code={code}
        normalSpeed={normalSpeed}
        focusSpeed={focusSpeed}
        sound={sound}
        soundVolume={soundVolume}
      />
    </main>
  );
}
