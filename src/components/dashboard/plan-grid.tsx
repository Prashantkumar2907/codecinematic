import { PLAN_CONFIG } from "@/lib/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PlanGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(PLAN_CONFIG).map(([code, plan]) => (
        <Card key={code} className="border-white/[0.06] bg-white/[0.02] hover:border-primary/15 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{plan.name}</CardTitle>
            <CardDescription className="text-xs">{plan.price}{code !== "free" ? " / mo" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs text-muted-foreground">
            <p>{plan.badge}</p>
            <p>{plan.maxCodeLines} max lines</p>
            <p>{plan.maxLineLength} max chars / line</p>
            <p>{plan.watermark ? "Watermark" : "No watermark"}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
