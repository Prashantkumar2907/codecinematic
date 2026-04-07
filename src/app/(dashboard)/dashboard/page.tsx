import Link from "next/link";
import { redirect } from "next/navigation";

import { PlanGrid } from "@/components/dashboard/plan-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDemoSession } from "@/lib/demo-auth";
import { PLAN_CONFIG } from "@/lib/plans";

export default async function DashboardPage() {
  const session = await getDemoSession();
  if (!session) {
    redirect("/login");
  }

  const plan = PLAN_CONFIG[session.plan];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge>{session.plan} plan</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Welcome, {session.name}</h1>
          <p className="text-muted-foreground">This dashboard reflects the current plan limits that the app and SQL schema are designed to enforce.</p>
        </div>
        <div className="flex items-center gap-3">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="secondary">
              Logout
            </Button>
          </form>
          <Link href="/projects/demo-project">
            <Button>Open editor</Button>
          </Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Metric title="Stored exports" value={`${plan.maxStoredExports}`} />
        <Metric title="Daily downloads" value={`${plan.maxDailyDownloads}`} />
        <Metric title="Max code lines" value={`${plan.maxCodeLines}`} />
        <Metric title="Max chars / line" value={`${plan.maxLineLength}`} />
      </div>

      <PlanGrid />

      <Card className="mt-8 bg-white/5">
        <CardHeader>
          <CardTitle>Application modules</CardTitle>
          <CardDescription>The scaffold includes the product surface you asked for, with browser-first rendering and Supabase-backed data design.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {["Landing page", "Social login", "Demo plan auth", "Supabase SQL bootstrap"].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card className="bg-white/5">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
