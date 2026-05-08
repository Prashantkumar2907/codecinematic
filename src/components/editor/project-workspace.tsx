"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";

import { BollywoodPanel } from "@/components/editor/bollywood-panel";
import { DidYouKnowPanel } from "@/components/editor/did-you-know-panel";
import { FactsHindiPanel } from "@/components/editor/facts-hindi-panel";
import { ProjectEditor } from "@/components/editor/project-editor";
import { ShayariPanel } from "@/components/editor/shayari-panel";
import { SuvicharPanel } from "@/components/editor/suvichar-panel";
import { WordOfDayPanel } from "@/components/editor/word-of-day-panel";
import type { PlanCode } from "@/lib/plans";

const tabIds = ["editor", "wordofday", "didyouknow", "shayari", "suvichar", "bollywood", "factshindi"] as const;

type TabId = (typeof tabIds)[number];

export function ProjectWorkspace({ plan, projectId }: { plan: PlanCode; projectId: string }) {
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const initialTab = (searchParams.get("tab") as TabId) || "editor";
  const [activeTab, setActiveTab] = useState<TabId>(
    tabIds.includes(initialTab) ? initialTab : "editor",
  );

  useEffect(() => {
    const tab = searchParams.get("tab") as TabId;
    if (tab && tabIds.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const content = {
    editor: <ProjectEditor plan={plan} projectId={projectId} />,
    wordofday: <WordOfDayPanel projectId={projectId} />,
    didyouknow: <DidYouKnowPanel projectId={projectId} />,
    shayari: <ShayariPanel projectId={projectId} />,
    suvichar: <SuvicharPanel projectId={projectId} />,
    bollywood: <BollywoodPanel projectId={projectId} />,
    factshindi: <FactsHindiPanel projectId={projectId} />,
  } satisfies Record<TabId, ReactNode>;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            className="h-full min-h-0"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {content[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
