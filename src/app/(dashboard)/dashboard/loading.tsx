import { LoadingState } from "@/components/ui/feedback-state";

export default function DashboardLoading() {
  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <LoadingState
        title="Loading dashboard"
        description="Preparing your plan limits and creator workflows."
        className="min-h-[calc(100vh-4rem)]"
      />
    </main>
  );
}
