"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Narration } from "@/lib/narration";

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

type EditorStore = {
  drafts: Record<string, EditorDraft>;
  setDraft: (projectId: string, patch: Partial<EditorDraft>) => void;
  replaceDraft: (projectId: string, draft: EditorDraft) => void;
  getDraft: (projectId: string) => EditorDraft | null;
};

export const defaultEditorDraft: EditorDraft = {
  title: "API Gateway explainer",
  language: "typescript",
  aspect: "9:16",
  normalSpeed: "1.00",
  focusSpeed: "0.70",
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

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (projectId, patch) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: {
              ...(state.drafts[projectId] ?? defaultEditorDraft),
              ...patch
            }
          }
        })),
      replaceDraft: (projectId, draft) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: draft
          }
        })),
      getDraft: (projectId) => get().drafts[projectId] ?? null
    }),
    {
      name: "codecinematic-editor-store",
      storage: createJSONStorage(() => sessionStorage)
    }
  )
);
