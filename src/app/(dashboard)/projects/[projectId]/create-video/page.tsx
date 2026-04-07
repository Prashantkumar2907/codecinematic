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
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto p-4 gap-2">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Create video</h1>
            <Badge className="text-[10px] py-0 bg-secondary/50 text-secondary-foreground">{session.plan} demo workflow</Badge>
          </div>
          <p className="max-w-3xl text-xs text-muted-foreground">
            This step turns the editor choices into export jobs. The response is plan-aware.
          </p>
        </div>
        <Link href={`/projects/${projectId}`}>
          <Button variant="secondary" size="sm" className="h-8 text-xs">Back to editor</Button>
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
