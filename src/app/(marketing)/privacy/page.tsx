import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const privacyNotes = [
  {
    title: "Local rendering",
    body: "Video rendering runs in the browser through Canvas and MediaRecorder. Draft editor state is stored in session storage so the workspace can recover within the current browser session.",
  },
  {
    title: "Account data",
    body: "When Supabase is configured, authentication data, projects, exports, and usage records are stored in Supabase tables protected by row-level security.",
  },
  {
    title: "Payments and email",
    body: "Stripe handles checkout and subscription events. Resend is used only for server-side email sends when configured by an administrator.",
  },
  {
    title: "Private routes",
    body: "The service worker intentionally avoids caching API, dashboard, and project routes so private workspace responses are not reused offline.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "mb-8 h-8 gap-1.5 text-xs",
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">
            Privacy
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            This page documents the current data behavior of CodeCinematic for development and demo deployments.
          </p>
        </div>

        <div className="mt-10 space-y-5">
          {privacyNotes.map((note) => (
            <section key={note.title} className="rounded-lg border border-border/50 bg-card/45 p-5">
              <h2 className="text-sm font-semibold">{note.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-muted-foreground/70">
          For production use, replace this page with a reviewed privacy policy that names subprocessors, retention periods, user rights, and contact details.
        </p>
      </section>
    </main>
  );
}
