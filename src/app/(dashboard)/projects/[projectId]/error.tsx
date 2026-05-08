"use client";

import { ErrorState } from "@/components/ui/feedback-state";

export default function ProjectError({ reset }: { reset: () => void }) {
  return (
    <main className="flex-1 flex min-h-0 w-full max-w-[100rem] mx-auto">
      <ErrorState
        title="Editor could not load"
        description="The project workspace failed before the editor became interactive."
        onRetry={reset}
        className="min-h-[calc(100vh-4rem)] flex-1"
      />
    </main>
  );
}
