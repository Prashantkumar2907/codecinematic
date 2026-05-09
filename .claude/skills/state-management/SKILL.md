---
name: state-management
description: Load when changing CodeCinematic editor drafts, project summaries, local panel state, or workspace URL tab state.
---

# State Management

## When to use this skill
Use this before touching `src/lib/editor-store.ts`, editor route state, creator panel controls, or persistence of project settings.

## Quick reference
- Store: `src/lib/editor-store.ts`
- Store hook: `useEditorStore`
- Persistence key: `codecinematic-editor-store`
- Persistence backend: `localStorage` via Zustand `createJSONStorage`
- Version: `2`
- New project sentinel: `NEW_PROJECT_ID` in `src/lib/project-ids.ts`
- URL tab state: `tab` search param in `src/components/editor/project-workspace.tsx`

## Store shape
`useEditorStore` owns:
- `drafts: Record<string, EditorDraft>`
- `projects: Record<string, ProjectSummary>`
- `projectOrder: string[]`
- mutators: `setDraft`, `replaceDraft`, `getDraft`, `createProject`, `ensureProject`, `deleteProject`, `touchProject`

`EditorDraft` includes title, language, aspect, typing speeds, sound, code, focus lines, optional narration, background preset, theme, font, cursor blink, and focus flash.

## Choosing state location
- Use `useEditorStore` when a value must survive route navigation from `/projects/[projectId]` to `/projects/[projectId]/create-video`.
- Use component `useState` for creator-panel settings that do not currently survive navigation, such as Word of Day or Bollywood controls.
- Use the URL only for workspace tab selection. Valid tabs are `editor`, `wordofday`, `didyouknow`, `shayari`, `suvichar`, `bollywood`, `factshindi`.
- Use server route handlers and Supabase for durable project/export/history data, not client state alone.

## Mutation patterns
- Use `setDraft(projectId, patch)` for field-level editor changes.
- Use `createProject(draftPatch, projectId?)` after creating a new project through `/api/create-project`.
- Use `ensureProject(projectId, draftPatch)` when opening an existing non-new project without a local draft.
- Use `touchProject(projectId, draft)` after saving/updating an existing project.
- Clone nested arrays/objects through `cloneEditorDraft()` and `buildEditorDraft()` to avoid shared references.

## Do not
- Do not describe this store as sessionStorage; the actual code uses localStorage.
- Do not add Redux, React Query, SWR, or a second global store unless explicitly requested.
- Do not persist secrets, API keys, raw auth tokens, or payment data in the editor store.
- Do not rely on middleware or URL params to validate project ownership; state is not an authorization boundary.
