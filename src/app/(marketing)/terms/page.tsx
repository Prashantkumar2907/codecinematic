import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const terms = [
  {
    title: "Use of the product",
    body: "CodeCinematic helps you create browser-rendered videos from code, text, and creator templates. You are responsible for the content you paste, render, upload, or share.",
  },
  {
    title: "Account access",
    body: "Keep your credentials secure. Demo credentials are for local evaluation and should be replaced before any production launch.",
  },
  {
    title: "Exports and ownership",
    body: "You retain ownership of your source material and generated exports. Do not use the service to create or distribute content you do not have rights to use.",
  },
  {
    title: "Service availability",
    body: "Browser rendering depends on local device capability, supported media APIs, and configured third-party services such as Supabase, Stripe, or Resend.",
  },
];

export default function TermsPage() {
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
            Legal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            These lightweight terms describe the expected use of CodeCinematic while the product is in active development.
          </p>
        </div>

        <div className="mt-10 space-y-5">
          {terms.map((term) => (
            <section key={term.title} className="rounded-lg border border-border/50 bg-card/45 p-5">
              <h2 className="text-sm font-semibold">{term.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{term.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-muted-foreground/70">
          For production use, replace this page with counsel-reviewed legal terms matched to your billing, data retention, and support model.
        </p>
      </section>
    </main>
  );
}
