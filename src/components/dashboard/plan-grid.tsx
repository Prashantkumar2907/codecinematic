import { PLAN_CONFIG } from "@/lib/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PlanGrid() {
  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {Object.entries(PLAN_CONFIG).map(([code, plan]) => (
        <Card key={code} className="bg-white/5">
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <CardDescription>{plan.price} / month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{plan.badge}</p>
            <p>{plan.maxCodeLines} max lines per project</p>
            <p>{plan.maxLineLength} max chars per line</p>
            <p>{plan.watermark ? "Watermark on exports" : "No watermark"}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
