"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";
import { cn } from "@/lib/cn";

const planOrder: PlanCode[] = ["free", "basic", "medium", "high"];

function planFeatures(code: PlanCode): string[] {
  const p = PLAN_CONFIG[code];
  const list: string[] = [];
  list.push(`${p.maxCodeLines} max lines / project`);
  list.push(`${p.maxLineLength} max chars / line`);
  list.push(`${p.maxDailyDownloads} downloads / day`);
  list.push(`${p.maxStoredExports} stored exports`);
  if (p.watermark) list.push("Watermark on exports");
  else list.push("No watermark");
  if (code !== "free") list.push("Priority support");
  return list;
}

export default function PricingPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Start free, upgrade when you need more exports, storage, and higher limits.</p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {planOrder.map((code, index) => {
            const plan = PLAN_CONFIG[code];
            const popular = code === "medium";
            return (
              <motion.div key={code} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08, duration: 0.4 }}>
                <Card className={cn(
                  "relative h-full flex flex-col border-white/[0.06] bg-white/[0.02] hover:border-primary/20 transition-all duration-300",
                  popular && "border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10"
                )}>
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-primary-foreground">
                        <Sparkles className="h-3 w-3" />Popular
                      </span>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {code !== "free" && <span className="text-sm text-muted-foreground"> / mo</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{plan.badge}</p>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2.5 flex-1">
                      {planFeatures(code).map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link href={(code === "free" ? "/login" : "/api/billing/checkout?plan=" + code) as Route} className="mt-6 block">
                      <Button variant={popular ? "default" : "outline"} className="w-full h-9 text-xs font-semibold">
                        {code === "free" ? "Start free" : "Subscribe"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
