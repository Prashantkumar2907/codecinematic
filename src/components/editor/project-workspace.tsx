"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";

import { ProjectEditor } from "@/components/editor/project-editor";
import { useEditorStore, type EditorDraft } from "@/lib/editor-store";
import type { PlanCode } from "@/lib/plans";
import { NEW_PROJECT_ID } from "@/lib/project-ids";
import { isWorkflowTab, type WorkflowTab } from "@/lib/workflows";

const BollywoodPanel = dynamic(() => import("@/components/editor/bollywood-panel").then((mod) => mod.BollywoodPanel));
const DidYouKnowPanel = dynamic(() => import("@/components/editor/did-you-know-panel").then((mod) => mod.DidYouKnowPanel));
const FactsHindiPanel = dynamic(() => import("@/components/editor/facts-hindi-panel").then((mod) => mod.FactsHindiPanel));
const ShayariPanel = dynamic(() => import("@/components/editor/shayari-panel").then((mod) => mod.ShayariPanel));
const SuvicharPanel = dynamic(() => import("@/components/editor/suvichar-panel").then((mod) => mod.SuvicharPanel));
const WordOfDayPanel = dynamic(() => import("@/components/editor/word-of-day-panel").then((mod) => mod.WordOfDayPanel));

export function ProjectWorkspace({
  plan,
  projectId,
  initialDraft,
  initialWorkflowTab = "editor",
}: {
  plan: PlanCode;
  projectId: string;
  initialDraft?: Partial<EditorDraft>;
  initialWorkflowTab?: WorkflowTab;
}) {
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const touchProject = useEditorStore((state) => state.touchProject);
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<WorkflowTab>(
    isWorkflowTab(requestedTab) ? requestedTab : initialWorkflowTab,
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isWorkflowTab(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (projectId !== NEW_PROJECT_ID) {
      touchProject(projectId, initialDraft, { workflowTab: activeTab });
    }
  }, [activeTab, initialDraft, projectId, touchProject]);

  const content = {
    editor: <ProjectEditor plan={plan} projectId={projectId} initialDraft={initialDraft} />,
    wordofday: <WordOfDayPanel projectId={projectId} />,
    didyouknow: <DidYouKnowPanel projectId={projectId} />,
    shayari: <ShayariPanel projectId={projectId} />,
    suvichar: <SuvicharPanel projectId={projectId} />,
    bollywood: <BollywoodPanel projectId={projectId} />,
    factshindi: <FactsHindiPanel projectId={projectId} />,
  } satisfies Record<WorkflowTab, ReactNode>;

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
