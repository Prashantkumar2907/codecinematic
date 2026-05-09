"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Code2, Film, Zap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const features = [
  { icon: Code2, label: "Any language", desc: "TypeScript, Python, Go, Rust and more" },
  { icon: Film, label: "Cinematic export", desc: "9:16 vertical and 16:9 landscape" },
  { icon: Zap, label: "Browser-first", desc: "No server needed, render locally" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,163,176,0.10),transparent_44%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto max-w-5xl px-4 sm:px-6 py-24 sm:py-32 text-center"
      >
        <motion.div variants={item} className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Deterministic code videos - not AI-generated
          </span>
        </motion.div>

        <motion.h1 variants={item} className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] text-foreground">
          Turn code into
          <br />
          <span className="bg-gradient-to-r from-primary via-cyan-400 to-blue-500 bg-clip-text text-transparent">cinematic videos</span>
        </motion.h1>

        <motion.p variants={item} className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
          Paste code in any language, write explanations as inline comments, and export polished typing-animation videos for TikTok, YouTube Shorts, or presentations.
        </motion.p>

        <motion.div variants={item} className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className={cn(buttonVariants({ size: "lg" }), "group h-11 px-6 font-semibold")}
          >
            Get started free
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/projects/new-project"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "h-11 px-6 border-white/[0.08] hover:bg-white/[0.04]",
            )}
          >
            Try the editor
          </Link>
        </motion.div>

        <motion.div variants={item} className="mt-16 grid gap-4 sm:grid-cols-3 max-w-2xl mx-auto">
          {features.map((f) => (
            <div key={f.label} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left hover:border-primary/20 hover:bg-primary/[0.03] transition-all duration-300">
              <f.icon className="h-5 w-5 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-medium text-foreground">{f.label}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </motion.div>

        <motion.div variants={item} className="mt-20 rounded-2xl border border-white/[0.08] bg-[#07111b] p-4 sm:p-6 shadow-2xl max-w-3xl mx-auto">
          <div className="rounded-xl border border-white/[0.08] bg-[#0b1622] overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
              <span className="ml-4 text-[10px] text-muted-foreground/50 font-mono">gateway.ts</span>
            </div>
            <div className="p-5 font-mono text-sm leading-7 text-left">
              <p className="text-cyan-300/80">{"//"} What API Gateway is?</p>
              <p className="text-slate-400">{"//"} Central entry point for auth, routing and rate limits.</p>
              <p className="rounded-md bg-primary/[0.08] px-3 py-0.5 -mx-3 text-slate-100"><span className="text-sky-300">const</span> gateway = <span className="text-amber-300">createGateway</span>()</p>
              <p className="text-slate-200">app.<span className="text-amber-300">use</span>(<span className="text-rose-300">{'"'}/api{'"'}</span>, gateway.<span className="text-amber-300">middleware</span>())</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
