"use client";

import { ErrorState } from "@/components/ui/feedback-state";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <ErrorState
        title="Dashboard could not load"
        description="The workspace hit an unexpected error while preparing your account context."
        onRetry={reset}
        className="min-h-[calc(100vh-4rem)]"
      />
    </main>
  );
}
