"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Narration } from "@/lib/narration";
import { NEW_PROJECT_ID } from "@/lib/project-ids";

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
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

type EditorStore = {
  drafts: Record<string, EditorDraft>;
  projects: Record<string, ProjectSummary>;
  projectOrder: string[];
  demoProjectSeeded: boolean;
  setDraft: (projectId: string, patch: Partial<EditorDraft>) => void;
  replaceDraft: (projectId: string, draft: EditorDraft) => void;
  getDraft: (projectId: string) => EditorDraft | null;
  createProject: (draft?: Partial<EditorDraft>, projectId?: string) => string;
  ensureDemoProjectSeed: () => void;
  ensureProject: (projectId: string, draft?: Partial<EditorDraft>) => void;
  deleteProject: (projectId: string) => void;
  touchProject: (projectId: string, draft?: Partial<EditorDraft>) => void;
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

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function summaryFromDraft(id: string, draft: EditorDraft, now = new Date().toISOString()): ProjectSummary {
  return {
    id,
    title: draft.title.trim() || "Untitled project",
    language: draft.language,
    aspect: draft.aspect,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
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
      createProject: (draftPatch, projectId) => {
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
            [id]: summaryFromDraft(id, draft, now),
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
              [DEMO_PROJECT_ID]: summaryFromDraft(DEMO_PROJECT_ID, draft, now),
            },
            projectOrder: [DEMO_PROJECT_ID],
          };
        });
      },
      ensureProject: (projectId, draftPatch) => {
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
                    updatedAt: now,
                    lastOpenedAt: now,
                  }
                : summaryFromDraft(projectId, draft, now),
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
      touchProject: (projectId, draftPatch) => {
        if (projectId === NEW_PROJECT_ID) return;

        set((state) => {
          const draft = buildEditorDraft({ ...(state.drafts[projectId] ?? defaultEditorDraft), ...draftPatch });
          const now = new Date().toISOString();
          const project = state.projects[projectId] ?? summaryFromDraft(projectId, draft, now);

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                title: draft.title.trim() || "Untitled project",
                language: draft.language,
                aspect: draft.aspect,
                updatedAt: now,
                lastOpenedAt: now,
              },
            },
            projectOrder: [projectId, ...state.projectOrder.filter((existingId) => existingId !== projectId)],
          };
        });
      },
    }),
    {
      name: "codecinematic-editor-store",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (state) => ({
        drafts: state.drafts,
        projects: state.projects,
        projectOrder: state.projectOrder,
        demoProjectSeeded: state.demoProjectSeeded,
      }),
    }
  )
);
