"use client";

import { ErrorState } from "@/components/ui/feedback-state";

export default function CreateVideoError({ reset }: { reset: () => void }) {
  return (
    <main className="flex-1 flex min-h-0 w-full max-w-[100rem] mx-auto">
      <ErrorState
        title="Renderer could not start"
        description="The video creation step failed before rendering controls were ready."
        onRetry={reset}
        className="min-h-[calc(100vh-4rem)] flex-1"
      />
    </main>
  );
}
