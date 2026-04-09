"use client";

import { motion } from "framer-motion";
import { ArrowRight, Layers3, Music4, Subtitles } from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import { PlanGrid } from "@/components/dashboard/plan-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const workflows = [
  { icon: Layers3, title: "Text to video", description: "Paste code or mixed script scenes and export typing animations in vertical or landscape." },
  { icon: Subtitles, title: "Video to text timeline", description: "Upload a technical demo and generate a timestamped breakdown of what happened." },
  { icon: Music4, title: "Text to audio", description: "Generate narration for each scene and merge it with the code animation timeline." },
];

const standards = [
  "Any language selectable per project or scene",
  "Explanation stays in comments inside the code",
  "Important lines receive structured coloring and focus",
  "Line count and line-length limits protect export quality",
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function HomePage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <Hero />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="grid gap-4 sm:grid-cols-3">
          {workflows.map((w) => (
            <motion.div key={w.title} variants={item}>
              <Card className="h-full border-white/[0.06] bg-white/[0.02] hover:border-primary/20 hover:bg-primary/[0.02] transition-all duration-300 group">
                <CardHeader className="pb-3">
                  <w.icon className="h-5 w-5 text-primary mb-1 group-hover:scale-110 transition-transform" />
                  <CardTitle className="text-base">{w.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{w.description}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <Card className="border-white/[0.06] bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-lg">Product standards</CardTitle>
                <CardDescription className="text-xs">The editor and renderer are designed around readability.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {standards.map((s) => (
                  <div key={s} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-3 hover:border-primary/20 transition-colors">
                    <span className="text-sm text-muted-foreground">{s}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-primary/60" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Plans with built-in usage control</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Free stays generous for previews but strict on downloads. Paid tiers scale by limits, exports, and usage windows.
                </p>
              </div>
              <PlanGrid />
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
