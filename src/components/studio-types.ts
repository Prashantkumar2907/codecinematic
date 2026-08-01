/**
 * Types shared between `app/page.tsx` and the view components it renders.
 * They live here rather than in `lib/` because `lib/` is imported by the API
 * routes, and nothing in the studio UI belongs in a server bundle.
 */
export type Format = "short" | "long";
export type View = "create" | "library" | "news";
export type Stage =
  | "idle"
  | "topics"
  | "generating"
  | "scripted"
  | "voicing"
  | "rendering"
  | "rendered"
  | "saving"
  | "uploading"
  | "uploaded";
export type GenStage = "planning" | "writing" | "reviewing" | "refining" | "validating" | "repairing" | "optimizing";

export type Submodule = { id: string; label: string };
export type Module = { id: string; label: string; submodules: Submodule[] };
export type Subject = { id: string; label: string; audience: string; style: string; modules: Module[] };
export type TopicSuggestion = { title: string; angle?: string };
export type GenerateFailure = { message: string; details?: string[]; raw?: string };
export type Quota = {
  used: number;
  limit: number;
  perModel: { model: string; used: number; limit: number }[];
  byKey?: Record<string, number>;
};
export type KeyProbe = {
  id: string;
  label: string;
  billed: boolean;
  exhausted: boolean;
  models: { model: string; status: "ok" | "exhausted" | "unavailable" }[];
};
export type DraftInfo = {
  slug: string;
  hasVideo: boolean;
  hasThumbnail: boolean;
  hasCaptions: boolean;
  videoBytes: number;
  savedAt: string;
  format: string;
  subject: string;
  module: string;
  submodule: string;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  videoId?: string;
};
