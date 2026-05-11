"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Narration } from "@/lib/narration";
import { NEW_PROJECT_ID } from "@/lib/project-ids";
import type { WorkflowTab } from "@/lib/workflows";

export type EditorDraft = {
  title: string;
  language: string;
  aspect: "9:16" | "16:9";
  normalSpeed: string;
  focusSpeed: string;
  sound: "off" | "soft" | "typewriter" | "keyboard" | "chime";
  soundVolume: string;
  code: string;
  focus: number[];
  narration: Narration | null;
  // Visual settings
  bgPresetId: string;
  theme: string;
  codeFont: string;
  cursorBlink: boolean;
  focusFlash: boolean;
};

export type ProjectSummary = {
  id: string;
  title: string;
  language: string;
  aspect: "9:16" | "16:9";
  workflowTab: WorkflowTab;
  storageMode: "local" | "demo" | "cloud";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

type ProjectSummaryOptions = {
  workflowTab?: WorkflowTab;
  storageMode?: ProjectSummary["storageMode"];
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
};

type EditorStore = {
  drafts: Record<string, EditorDraft>;
  projects: Record<string, ProjectSummary>;
  projectOrder: string[];
  demoProjectSeeded: boolean;
  setDraft: (projectId: string, patch: Partial<EditorDraft>) => void;
  replaceDraft: (projectId: string, draft: EditorDraft) => void;
  getDraft: (projectId: string) => EditorDraft | null;
  createProject: (draft?: Partial<EditorDraft>, projectId?: string, options?: ProjectSummaryOptions) => string;
  ensureDemoProjectSeed: () => void;
  ensureProject: (projectId: string, draft?: Partial<EditorDraft>, options?: ProjectSummaryOptions) => void;
  deleteProject: (projectId: string) => void;
  touchProject: (projectId: string, draft?: Partial<EditorDraft>, options?: ProjectSummaryOptions) => void;
};

export const defaultEditorDraft: EditorDraft = {
  title: "API Gateway explainer",
  language: "typescript",
  aspect: "9:16",
  normalSpeed: "2.40",
  focusSpeed: "1.80",
  sound: "soft",
  soundVolume: "0.30",
  code: `# What API Gateway is?
# It centralizes auth, traffic routing, and monitoring.

function createGateway() {
  const authMiddleware = buildAuthMiddleware()
  return {
    middleware: () => authMiddleware
  }
}

app.use("/api", createGateway().middleware())`,
  focus: [],
  narration: null,
  bgPresetId: "cosmic",
  theme: "vscode",
  codeFont: "ui-monospace",
  cursorBlink: true,
  focusFlash: true,
};

export function cloneEditorDraft(draft: EditorDraft = defaultEditorDraft): EditorDraft {
  return {
    ...draft,
    focus: [...draft.focus],
    narration: draft.narration
      ? {
          ...draft.narration,
          segments: draft.narration.segments.map((segment) => ({ ...segment })),
        }
      : null,
  };
}

export function buildEditorDraft(patch: Partial<EditorDraft> = {}): EditorDraft {
  const base = cloneEditorDraft();
  return {
    ...base,
    ...patch,
    focus: patch.focus ? [...patch.focus] : base.focus,
    narration: patch.narration === undefined ? base.narration : patch.narration,
  };
}

const DEMO_PROJECT_ID = "local-demo-api-gateway-explainer";
const PERSISTENCE_KEY = "codecinematic-editor-store";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function summaryFromDraft(
  id: string,
  draft: EditorDraft,
  now = new Date().toISOString(),
  options: ProjectSummaryOptions = {},
): ProjectSummary {
  return {
    id,
    title: draft.title.trim() || "Untitled project",
    language: draft.language,
    aspect: draft.aspect,
    workflowTab: options.workflowTab ?? "editor",
    storageMode: options.storageMode ?? "local",
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
    lastOpenedAt: options.lastOpenedAt ?? now,
  };
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      projects: {},
      projectOrder: [],
      demoProjectSeeded: false,
      setDraft: (projectId, patch) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: {
              ...(state.drafts[projectId] ?? cloneEditorDraft()),
              ...patch
            }
          },
          projects: state.projects[projectId]
            ? {
                ...state.projects,
                [projectId]: {
                  ...state.projects[projectId],
                  ...(patch.title === undefined ? {} : { title: patch.title.trim() || "Untitled project" }),
                  ...(patch.language === undefined ? {} : { language: patch.language }),
                  ...(patch.aspect === undefined ? {} : { aspect: patch.aspect }),
                  updatedAt: new Date().toISOString(),
                  lastOpenedAt: new Date().toISOString(),
                },
              }
            : state.projects,
        })),
      replaceDraft: (projectId, draft) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: cloneEditorDraft(draft)
          }
        })),
      getDraft: (projectId) => get().drafts[projectId] ?? null,
      createProject: (draftPatch, projectId, options) => {
        const id = projectId ?? createId();
        const draft = buildEditorDraft(draftPatch);
        const now = new Date().toISOString();

        set((state) => ({
          drafts: {
            ...state.drafts,
            [id]: draft,
          },
          projects: {
            ...state.projects,
            [id]: summaryFromDraft(id, draft, now, options),
          },
          projectOrder: [id, ...state.projectOrder.filter((existingId) => existingId !== id)],
        }));

        return id;
      },
      ensureDemoProjectSeed: () => {
        set((state) => {
          if (state.demoProjectSeeded) {
            return state;
          }

          if (state.projectOrder.length > 0) {
            return { demoProjectSeeded: true };
          }

          const draft = cloneEditorDraft(defaultEditorDraft);
          const now = new Date().toISOString();

          return {
            demoProjectSeeded: true,
            drafts: {
              ...state.drafts,
              [DEMO_PROJECT_ID]: draft,
            },
            projects: {
              ...state.projects,
              [DEMO_PROJECT_ID]: summaryFromDraft(DEMO_PROJECT_ID, draft, now, {
                workflowTab: "editor",
                storageMode: "local",
              }),
            },
            projectOrder: [DEMO_PROJECT_ID],
          };
        });
      },
      ensureProject: (projectId, draftPatch, options) => {
        if (projectId === NEW_PROJECT_ID) return;

        set((state) => {
          const existingDraft = state.drafts[projectId];
          const draft = existingDraft ? buildEditorDraft({ ...existingDraft, ...draftPatch }) : buildEditorDraft(draftPatch);
          const existingProject = state.projects[projectId];
          const now = new Date().toISOString();

          return {
            drafts: {
              ...state.drafts,
              [projectId]: draft,
            },
            projects: {
              ...state.projects,
              [projectId]: existingProject
                ? {
                    ...existingProject,
                    title: draft.title.trim() || "Untitled project",
                    language: draft.language,
                    aspect: draft.aspect,
                    workflowTab: options?.workflowTab ?? existingProject.workflowTab ?? "editor",
                    storageMode: options?.storageMode ?? existingProject.storageMode ?? "local",
                    createdAt: options?.createdAt ?? existingProject.createdAt,
                    updatedAt: options?.updatedAt ?? now,
                    lastOpenedAt: options?.lastOpenedAt ?? now,
                  }
                : summaryFromDraft(projectId, draft, now, options),
            },
            projectOrder: [projectId, ...state.projectOrder.filter((existingId) => existingId !== projectId)],
          };
        });
      },
      deleteProject: (projectId) =>
        set((state) => {
          const { [projectId]: _draft, ...drafts } = state.drafts;
          const { [projectId]: _project, ...projects } = state.projects;

          return {
            drafts,
            projects,
            projectOrder: state.projectOrder.filter((existingId) => existingId !== projectId),
          };
        }),
      touchProject: (projectId, draftPatch, options) => {
        if (projectId === NEW_PROJECT_ID) return;

        set((state) => {
          const draft = buildEditorDraft({ ...(state.drafts[projectId] ?? defaultEditorDraft), ...draftPatch });
          const now = new Date().toISOString();
          const project = state.projects[projectId] ?? summaryFromDraft(projectId, draft, now, options);

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                title: draft.title.trim() || "Untitled project",
                language: draft.language,
                aspect: draft.aspect,
                workflowTab: options?.workflowTab ?? project.workflowTab ?? "editor",
                storageMode: options?.storageMode ?? project.storageMode ?? "local",
                createdAt: options?.createdAt ?? project.createdAt,
                updatedAt: options?.updatedAt ?? now,
                lastOpenedAt: options?.lastOpenedAt ?? now,
              },
            },
            projectOrder: [projectId, ...state.projectOrder.filter((existingId) => existingId !== projectId)],
          };
        });
      },
    }),
    {
      name: PERSISTENCE_KEY,
      storage: createJSONStorage(() => createSafeLocalStorage()),
      version: 3,
      partialize: (state) => ({
        drafts: state.drafts,
        projects: state.projects,
        projectOrder: state.projectOrder,
        demoProjectSeeded: state.demoProjectSeeded,
      }),
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object") {
          return persisted;
        }

        const state = persisted as Partial<EditorStore>;
        const projects = Object.fromEntries(
          Object.entries(state.projects ?? {}).map(([id, project]) => [
            id,
            {
              ...project,
              workflowTab: project.workflowTab ?? "editor",
              storageMode: project.storageMode ?? "local",
            },
          ]),
        );

        return {
          ...state,
          projects,
        };
      },
    }
  )
);

function createSafeLocalStorage(): Storage {
  return {
    get length() {
      return localStorage.length;
    },
    clear() {
      localStorage.clear();
    },
    getItem(name) {
      const value = localStorage.getItem(name);
      if (name !== PERSISTENCE_KEY || value === null) {
        return value;
      }

      try {
        JSON.parse(value);
        return value;
      } catch {
        localStorage.removeItem(name);
        return null;
      }
    },
    key(index) {
      return localStorage.key(index);
    },
    removeItem(name) {
      localStorage.removeItem(name);
    },
    setItem(name, value) {
      localStorage.setItem(name, value);
    },
  };
}
