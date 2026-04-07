import { PlanGrid } from "@/components/dashboard/plan-grid";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="max-w-3xl text-muted-foreground">
          Plans scale by storage, line limits, and export capacity. The free plan always stays watermarked and limited to one final download every 24 hours.
        </p>
      </div>
      <PlanGrid />
    </main>
  );
}
