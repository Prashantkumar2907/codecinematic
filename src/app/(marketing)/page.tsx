import { ArrowRight, Layers3, Music4, Subtitles } from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import { PlanGrid } from "@/components/dashboard/plan-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const workflows = [
  {
    title: "Text to video",
    description: "Paste code or mixed script scenes and export typing animations in vertical or landscape."
  },
  {
    title: "Video to text timeline",
    description: "Upload a technical demo and generate a timestamped breakdown of what happened at each moment."
  },
  {
    title: "Text to audio",
    description: "Generate narration for each scene and later merge it with the code animation timeline."
  }
];

const standards = [
  "Any language is selectable per project or scene",
  "Explanation stays in comments inside the code itself",
  "Important lines receive structured coloring and focus metadata",
  "Line count and line-length limits protect UI and export quality"
];

export default function HomePage() {
  return (
    <main>
      <Hero />

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-3">
          {workflows.map((workflow, index) => {
            const icons = [Layers3, Subtitles, Music4] as const;
            const Icon = icons[index];
            return (
              <Card key={workflow.title} className="bg-white/5">
                <CardHeader>
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle>{workflow.title}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-white/5">
          <CardHeader>
            <CardTitle>Product standards</CardTitle>
            <CardDescription>The editor and renderer are designed around readability, not unlimited text blocks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {standards.map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <span className="text-sm text-muted-foreground">{item}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">Plans with built-in usage control</h2>
            <p className="max-w-2xl text-muted-foreground">
              Free stays generous for previews but strict on downloads and storage. Paid tiers scale by line limits, export retention, and usage windows.
            </p>
          </div>
          <PlanGrid />
        </div>
      </section>
    </main>
  );
}
