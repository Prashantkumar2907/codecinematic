export type DemoProjectRecord = {
  id: string;
  ownerEmail: string;
  title: string;
  language: string;
  aspectRatioMode: "9:16" | "16:9" | "both";
  contentRaw: string;
  updatedAt: string;
};

declare global {
  var __codecinematicDemoProjects: Map<string, DemoProjectRecord> | undefined;
}

const demoProjects =
  globalThis.__codecinematicDemoProjects ??
  (globalThis.__codecinematicDemoProjects = new Map<string, DemoProjectRecord>());

function keyFor(ownerEmail: string, projectId: string) {
  return `${ownerEmail.toLowerCase()}:${projectId}`;
}

export function saveDemoProject(
  ownerEmail: string,
  project: Omit<DemoProjectRecord, "ownerEmail" | "updatedAt"> & { updatedAt?: string },
) {
  const record: DemoProjectRecord = {
    ...project,
    ownerEmail,
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };

  demoProjects.set(keyFor(ownerEmail, project.id), record);
  return record;
}

export function getDemoProject(ownerEmail: string, projectId: string) {
  return demoProjects.get(keyFor(ownerEmail, projectId)) ?? null;
}

export function deleteDemoProject(ownerEmail: string, projectId: string) {
  demoProjects.delete(keyFor(ownerEmail, projectId));
}
