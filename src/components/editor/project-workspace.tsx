"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { ProjectEditor } from "@/components/editor/project-editor";
import { WordOfDayPanel } from "@/components/editor/word-of-day-panel";
import { DidYouKnowPanel } from "@/components/editor/did-you-know-panel";
import { useEditorStore, defaultEditorDraft } from "@/lib/editor-store";
import type { PlanCode } from "@/lib/plans";

const tabIds = ["editor", "wordofday", "didyouknow"] as const;

type TabId = (typeof tabIds)[number];

export function ProjectWorkspace({ plan, projectId }: { plan: PlanCode; projectId: string }) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "editor";
  const [activeTab, setActiveTab] = useState<TabId>(
    tabIds.includes(initialTab) ? initialTab : "editor"
  );
  const storedDraft = useEditorStore((s) => s.drafts[projectId]);
  const draft = storedDraft ?? defaultEditorDraft;

  // Sync tab when URL search param changes
  useEffect(() => {
    const tab = searchParams.get("tab") as TabId;
    if (tab && tabIds.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab content — tab selection is handled by the top nav bar */}
      <div className="flex-1 min-h-0 p-3">
        {activeTab === "editor" && (
          <ProjectEditor plan={plan} projectId={projectId} />
        )}
        {activeTab === "wordofday" && (
          <WordOfDayPanel projectId={projectId} />
        )}
        {activeTab === "didyouknow" && (
          <DidYouKnowPanel projectId={projectId} />
        )}
      </div>
    </div>
  );
}
