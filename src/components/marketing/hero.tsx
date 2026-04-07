import Link from "next/link";
import { CheckCircle2, PlayCircle, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const features = [
  "Any programming language with syntax-themed rendering",
  "Comment-driven explanations embedded directly in the code",
  "Vertical and landscape exports from one project",
  "Rule-based highlighting of important lines with cinematic focus"
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(12,163,176,0.22),transparent_40%),linear-gradient(180deg,rgba(4,10,16,0.94),rgba(4,10,16,1))]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <Badge className="border-primary/30 bg-primary/10 text-primary">Deterministic code videos, not expensive AI video</Badge>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
              Turn code, comments, and technical explanations into cinematic videos.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Paste code in any language, write explanations as comments right in the codebase, and generate crisp editor-style motion in `9:16` and `16:9`.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/login">
              <Button size="lg">Start with a demo plan</Button>
            </Link>
            <Link href="/projects/demo-project">
              <Button size="lg" variant="outline">
                <PlayCircle className="mr-2 h-4 w-4" />
                Open demo editor
              </Button>
            </Link>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/5 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[#07111b] p-5 shadow-glow">
          <div className="rounded-[24px] border border-white/10 bg-[#0b1622] p-5">
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-muted-foreground">
              <span>Preview Frame</span>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#081018]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
                <span className="h-3 w-3 rounded-full bg-[#ffd166]" />
                <span className="h-3 w-3 rounded-full bg-[#06d6a0]" />
              </div>
              <div className="space-y-2 p-5 font-mono text-sm leading-7">
                <p className="text-[#67e8f9]"># What API Gateway is?</p>
                <p className="text-[#d6deeb]"># Central entry point for auth, routing and rate limits.</p>
                <p className="rounded-lg bg-primary/10 px-3 py-1 text-[#f8fafc]">
                  <span className="text-[#7dd3fc]">const</span> <span className="text-[#f8fafc]">gateway</span> ={" "}
                  <span className="text-[#facc15]">createGateway</span>()
                </p>
                <p className="text-[#f8fafc]">app.use(</p>
                <p className="pl-6 text-[#fda4af]">"/api",</p>
                <p className="pl-6 text-[#86efac]">gateway.middleware()</p>
                <p className="text-[#f8fafc]">)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
