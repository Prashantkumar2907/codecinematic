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
    <main className="flex-1 overflow-y-auto w-full">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Welcome, {session.name}</h1>
              <Badge className="text-[10px] bg-secondary/50 text-secondary-foreground">{session.plan} plan</Badge>
            </div>
            <p className="text-sm text-muted-foreground">This dashboard reflects the current plan limits that the app and SQL schema are designed to enforce.</p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs">
                Logout
              </Button>
            </form>
            <Link href="/projects/demo-project">
              <Button size="sm" className="h-8 text-xs">Open editor</Button>
            </Link>
          </div>
        </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Stored exports" value={`${plan.maxStoredExports}`} />
        <Metric title="Daily downloads" value={`${plan.maxDailyDownloads}`} />
        <Metric title="Max code lines" value={`${plan.maxCodeLines}`} />
        <Metric title="Max chars / line" value={`${plan.maxLineLength}`} />
      </div>

      <PlanGrid />

      <Card className="border-white/5 bg-background shadow-sm dark:bg-card">
        <CardHeader className="py-4">
          <CardTitle className="text-lg">Application modules</CardTitle>
          <CardDescription className="text-xs">The scaffold includes the product surface you asked for, with browser-first rendering and Supabase-backed data design.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {["Landing page", "Social login", "Demo plan auth", "Supabase SQL bootstrap"].map((item) => (
            <div key={item} className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground shadow-sm">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
