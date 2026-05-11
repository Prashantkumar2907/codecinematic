export const WORKFLOW_TABS = [
  "editor",
  "wordofday",
  "didyouknow",
  "shayari",
  "suvichar",
  "bollywood",
  "factshindi",
] as const;

export type WorkflowTab = (typeof WORKFLOW_TABS)[number];

export const WORKFLOW_LABELS: Record<WorkflowTab, string> = {
  editor: "Code Studio",
  wordofday: "Word of Day",
  didyouknow: "Did You Know?",
  shayari: "Shayari",
  suvichar: "Suvichar",
  bollywood: "Bollywood",
  factshindi: "Facts Hindi",
};

export function isWorkflowTab(value: unknown): value is WorkflowTab {
  return typeof value === "string" && WORKFLOW_TABS.some((tab) => tab === value);
}
