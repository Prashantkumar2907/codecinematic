"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";
import { cn } from "@/lib/cn";

const planOrder: PlanCode[] = ["free", "basic", "medium", "high"];

function planFeatures(code: PlanCode): string[] {
  const p = PLAN_CONFIG[code];
  return [
    `${p.maxCodeLines} max lines / project`,
    `${p.maxLineLength} max chars / line`,
    `${p.maxDailyDownloads} downloads / day`,
    `${p.maxStoredExports} stored exports`,
    p.watermark ? "Watermark on exports" : "No watermark",
    ...(code !== "free" ? ["Priority support"] : []),
  ];
}

const planGradients: Record<PlanCode, string> = {
  free: "from-slate-500/10 to-slate-500/5",
  basic: "from-cyan-500/8 to-teal-500/5",
  medium: "from-primary/12 to-primary/6",
  high: "from-violet-500/10 to-violet-500/5",
};

export default function PricingPage() {
  return (
    <main className="flex-1 overflow-y-auto app-scroll">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(45,212,191,0.04),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,72px_72px]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 space-y-3"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold mb-2">
            <Zap className="h-3 w-3" />
            Simple pricing
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Start free, scale when ready
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Free stays generous for previewing. Paid tiers unlock higher limits, stored exports, and priority support.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {planOrder.map((code, index) => {
            const plan = PLAN_CONFIG[code];
            const popular = code === "medium";
            return (
              <motion.div
                key={code}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07, duration: 0.4 }}
                className="relative"
              >
                {popular && (
                  <div className="absolute -top-3 inset-x-0 flex justify-center z-10">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-primary-foreground shadow-lg shadow-primary/25">
                      <Sparkles className="h-2.5 w-2.5" />Popular
                    </span>
                  </div>
                )}
                <div className={cn(
                  "relative h-full flex flex-col rounded-xl border p-5 bg-gradient-to-b transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
                  planGradients[code],
                  popular
                    ? "border-primary/40 shadow-lg shadow-primary/8 hover:shadow-primary/15 bg-card"
                    : "border-border/50 bg-card hover:border-border"
                )}>
                  {/* Header */}
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{plan.name}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {code !== "free" && <span className="text-xs text-muted-foreground">/ mo</span>}
                    </div>
                    {code === "free" && <p className="text-xs text-muted-foreground mt-1">Forever free</p>}
                    {plan.badge && code !== "free" && <p className="text-xs text-muted-foreground mt-1">{plan.badge}</p>}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 flex-1 mb-5">
                    {planFeatures(code).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", popular ? "text-primary" : "text-primary/70")} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {code === "free" ? (
                    <Link
                      href="/login"
                      prefetch={false}
                      className={cn(
                        buttonVariants({ variant: popular ? "default" : "outline" }),
                        "w-full h-9 text-xs font-semibold transition-all",
                        popular ? "glow-primary-sm hover:glow-primary" : "border-border/60 hover:border-border",
                      )}
                    >
                      Start free
                    </Link>
                  ) : (
                    <form action="/api/billing/checkout" method="POST" className="w-full">
                      <input type="hidden" name="plan" value={code} />
                      <button
                        type="submit"
                        className={cn(
                          buttonVariants({ variant: popular ? "default" : "outline" }),
                          "w-full h-9 text-xs font-semibold transition-all",
                          popular ? "glow-primary-sm hover:glow-primary" : "border-border/60 hover:border-border",
                        )}
                      >
                        Subscribe
                      </button>
                    </form>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-[11px] text-muted-foreground/50 mt-10"
        >
          All plans include unlimited preview renders. Downloads count against your daily limit.
        </motion.p>
      </div>
    </main>
  );
}
