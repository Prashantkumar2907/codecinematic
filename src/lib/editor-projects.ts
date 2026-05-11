import { z } from "zod";

import type { EditorDraft } from "@/lib/editor-store";
import type { Narration } from "@/lib/narration";
import { isWorkflowTab, type WorkflowTab } from "@/lib/workflows";

export const workflowTabSchema = z.enum([
  "editor",
  "wordofday",
  "didyouknow",
  "shayari",
  "suvichar",
  "bollywood",
  "factshindi",
]);

const narrationSchema = z.object({
  intro: z.string().max(2000).default(""),
  outro: z.string().max(2000).default(""),
  segments: z
    .array(
      z.object({
        lineStart: z.number().int().min(1),
        lineEnd: z.number().int().min(1),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(200),
});

export const editorProjectPayloadSchema = z.object({
  title: z.string().trim().min(2).max(120),
  language: z.string().trim().min(1).max(40),
  aspectRatioMode: z.enum(["9:16", "16:9", "both"]),
  contentRaw: z.string().min(1),
  normalSpeed: z.string().trim().min(1).max(12).optional(),
  focusSpeed: z.string().trim().min(1).max(12).optional(),
  sound: z.enum(["off", "soft", "typewriter", "keyboard", "chime"]).optional(),
  soundVolume: z.string().trim().min(1).max(12).optional(),
  focus: z.array(z.number().int().min(1)).max(2500).optional(),
  narration: narrationSchema.nullable().optional(),
  bgPresetId: z.string().trim().min(1).max(80).optional(),
  theme: z.string().trim().min(1).max(80).optional(),
  codeFont: z.string().trim().min(1).max(120).optional(),
  cursorBlink: z.boolean().optional(),
  focusFlash: z.boolean().optional(),
  workflowTab: workflowTabSchema.optional(),
});

export type EditorProjectPayload = z.infer<typeof editorProjectPayloadSchema>;

const storedEditorDraftSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  language: z.string().trim().min(1).max(40).optional(),
  aspect: z.enum(["9:16", "16:9"]).optional(),
  normalSpeed: z.string().trim().min(1).max(12).optional(),
  focusSpeed: z.string().trim().min(1).max(12).optional(),
  sound: z.enum(["off", "soft", "typewriter", "keyboard", "chime"]).optional(),
  soundVolume: z.string().trim().min(1).max(12).optional(),
  code: z.string().optional(),
  focus: z.array(z.number().int().min(1)).max(2500).optional(),
  narration: narrationSchema.nullable().optional(),
  bgPresetId: z.string().trim().min(1).max(80).optional(),
  theme: z.string().trim().min(1).max(80).optional(),
  codeFont: z.string().trim().min(1).max(120).optional(),
  cursorBlink: z.boolean().optional(),
  focusFlash: z.boolean().optional(),
});

type StoredEditorDraft = z.infer<typeof storedEditorDraftSchema>;

export type ProjectStructuredContent = {
  source: "code_studio";
  createdVia: string;
  workflowTab: WorkflowTab;
  editorDraft: StoredEditorDraft;
  updatedAt: string;
};

export function editorDraftFromPayload(payload: EditorProjectPayload): Partial<EditorDraft> {
  return removeUndefined({
    title: payload.title,
    language: payload.language,
    aspect: payload.aspectRatioMode === "16:9" ? "16:9" : "9:16",
    normalSpeed: payload.normalSpeed,
    focusSpeed: payload.focusSpeed,
    sound: payload.sound,
    soundVolume: payload.soundVolume,
    code: payload.contentRaw,
    focus: payload.focus,
    narration: payload.narration as Narration | null | undefined,
    bgPresetId: payload.bgPresetId,
    theme: payload.theme,
    codeFont: payload.codeFont,
    cursorBlink: payload.cursorBlink,
    focusFlash: payload.focusFlash,
  });
}

export function buildProjectStructuredContent(
  payload: EditorProjectPayload,
  createdVia: string,
): ProjectStructuredContent {
  return {
    source: "code_studio",
    createdVia,
    workflowTab: payload.workflowTab ?? "editor",
    editorDraft: editorDraftFromPayload(payload) as StoredEditorDraft,
    updatedAt: new Date().toISOString(),
  };
}

export function readProjectStructuredContent(value: unknown): {
  workflowTab: WorkflowTab;
  editorDraft: Partial<EditorDraft>;
} {
  if (!isRecord(value)) {
    return { workflowTab: "editor", editorDraft: {} };
  }

  const workflowTab = isWorkflowTab(value.workflowTab) ? value.workflowTab : "editor";
  const parsedDraft = storedEditorDraftSchema.safeParse(value.editorDraft);

  return {
    workflowTab,
    editorDraft: parsedDraft.success ? parsedDraft.data : {},
  };
}

export function mergeProjectDraft(
  fallback: Partial<EditorDraft>,
  structured: unknown,
): { workflowTab: WorkflowTab; draft: Partial<EditorDraft> } {
  const parsed = readProjectStructuredContent(structured);
  return {
    workflowTab: parsed.workflowTab,
    draft: {
      ...fallback,
      ...parsed.editorDraft,
      focus: parsed.editorDraft.focus ?? fallback.focus,
      narration: parsed.editorDraft.narration === undefined ? fallback.narration : parsed.editorDraft.narration,
    },
  };
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
