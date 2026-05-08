import { LoadingState } from "@/components/ui/feedback-state";

export default function ProjectLoading() {
  return (
    <main className="flex-1 flex min-h-0 w-full max-w-[100rem] mx-auto">
      <LoadingState
        title="Opening editor"
        description="Restoring the workspace, focus map, and render settings."
        className="min-h-[calc(100vh-4rem)] flex-1"
      />
    </main>
  );
}
