import { LoadingState } from "@/components/ui/feedback-state";

export default function CreateVideoLoading() {
  return (
    <main className="flex-1 flex min-h-0 w-full max-w-[100rem] mx-auto">
      <LoadingState
        title="Preparing renderer"
        description="Loading export settings and browser rendering controls."
        className="min-h-[calc(100vh-4rem)] flex-1"
      />
    </main>
  );
}
