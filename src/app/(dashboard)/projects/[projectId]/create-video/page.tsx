import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CreateVideoPanel } from "@/components/editor/create-video-panel";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/cn";

export default async function CreateVideoPage({
  params,
  searchParams,
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
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { projectId } = await params;
  const query = await searchParams;
  const title = query.title ?? "Untitled project";
  const language = query.language ?? "typescript";
  const aspect = query.aspect ?? "9:16";
  const focus = query.focus ? query.focus.split(",").filter(Boolean) : [];
  const code = query.code ?? "";
  const normalSpeed = query.normalSpeed ?? "0.60";
  const focusSpeed = query.focusSpeed ?? "0.35";
  const sound = query.sound ?? "soft";
  const soundVolume = query.soundVolume ?? "0.30";

  return (
    <main className="flex-1 flex flex-col min-h-0 w-full max-w-[100rem] mx-auto p-3 gap-2">
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-8 text-xs gap-1.5",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />Back to editor
          </Link>
          <h1 className="text-base font-semibold">Create video</h1>
        </div>
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
