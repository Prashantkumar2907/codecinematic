import type { EditorDraft } from "@/lib/editor-store";
import type { WorkflowTab } from "@/lib/workflows";

export type DemoProjectRecord = {
  id: string;
  ownerEmail: string;
  title: string;
  language: string;
  aspectRatioMode: "9:16" | "16:9" | "both";
  contentRaw: string;
  editorDraft?: Partial<EditorDraft>;
  workflowTab?: WorkflowTab;
  updatedAt: string;
};

declare global {
  var __codecinematicDemoProjects: Map<string, DemoProjectRecord> | undefined;
}

const demoProjects =
  globalThis.__codecinematicDemoProjects ??
  (globalThis.__codecinematicDemoProjects = new Map<string, DemoProjectRecord>());

const DEMO_PROJECT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DEMO_PROJECTS = 300;

function keyFor(ownerEmail: string, projectId: string) {
  return `${ownerEmail.toLowerCase()}:${projectId}`;
}

export function saveDemoProject(
  ownerEmail: string,
  project: Omit<DemoProjectRecord, "ownerEmail" | "updatedAt"> & { updatedAt?: string },
) {
  pruneDemoProjects();

  const record: DemoProjectRecord = {
    ...project,
    ownerEmail,
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };

  demoProjects.set(keyFor(ownerEmail, project.id), record);
  pruneDemoProjects();
  return record;
}

export function getDemoProject(ownerEmail: string, projectId: string) {
  pruneDemoProjects();
  return demoProjects.get(keyFor(ownerEmail, projectId)) ?? null;
}

export function deleteDemoProject(ownerEmail: string, projectId: string) {
  demoProjects.delete(keyFor(ownerEmail, projectId));
}

function pruneDemoProjects() {
  const now = Date.now();
  for (const [key, project] of demoProjects) {
    if (now - Date.parse(project.updatedAt) > DEMO_PROJECT_TTL_MS) {
      demoProjects.delete(key);
    }
  }

  if (demoProjects.size <= MAX_DEMO_PROJECTS) return;

  const overflow = demoProjects.size - MAX_DEMO_PROJECTS;
  [...demoProjects.entries()]
    .sort(([, a], [, b]) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(0, overflow)
    .forEach(([key]) => demoProjects.delete(key));
}
