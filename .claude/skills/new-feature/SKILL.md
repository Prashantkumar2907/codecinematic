---
name: new-feature
description: Load when starting a CodeCinematic feature that spans routes, UI, editor state, API handlers, Supabase persistence, or browser rendering.
---

# New Feature

## When to use this skill
Use this before implementing a user-facing feature, workflow, or creator mode from scratch.

## Quick reference
- Routes: `src/app`
- Feature components: `src/components/<feature>`
- Editor panels: `src/components/editor`
- API handlers: `src/app/api`
- State: `src/lib/editor-store.ts`
- Plan limits: `src/lib/plans.ts`, `src/lib/quotas/limits.ts`
- Database: `supabase/update_001.sql`
- Verification: `npm run lint`, `npm run build`

## End-to-end checklist
1. Identify the user flow and whether it is public, authenticated, editor-only, or admin-only.
2. Add or choose the route under `src/app/(marketing)`, `src/app/(auth)`, or `src/app/(dashboard)`.
3. For protected or fetching pages, include `loading.tsx` and client `error.tsx`.
4. Place UI in `src/components/<feature>` or `src/components/editor` for creator workflows.
5. Put reusable editor utilities in `src/components/editor/shared`.
6. Persist cross-route editor data in `useEditorStore`; keep panel-only controls local.
7. Add an API route in `src/app/api/<domain>/route.ts` when secrets, validation, Supabase, or business rules are involved.
8. Use `getSession()`, Zod validation, `apiSuccess()`/`apiError()`, and optional `getSupabaseUserContext()` as appropriate.
9. If database-backed, update `supabase/update_001.sql` with tables, constraints, indexes, RLS, and seeds in an idempotent style.
10. If feature affects plan behavior, update both `src/lib/plans.ts` and SQL `plan_features`.
11. Run `npm run lint`; run `npm run build` for route, rendering, auth, or deployment-impacting changes.

## Current feature surfaces
- Code Studio: `src/components/editor/project-editor.tsx`
- Browser export: `src/components/editor/create-video-panel.tsx`
- Word/fact panels: `word-of-day-panel.tsx`, `did-you-know-panel.tsx`
- Hindi/Bollywood panels: `shayari-panel.tsx`, `suvichar-panel.tsx`, `facts-hindi-panel.tsx`, `bollywood-panel.tsx`
- Dashboard launcher: `src/components/dashboard/dashboard-workspace.tsx`

## Do not
- Do not add a feature by only changing UI when it requires API, auth, quota, or persistence updates.
- Do not add tests commands to docs unless a real test framework/config has been added.
- Do not grow `CreateVideoPanel` or specialized creator panels with reusable logic that belongs in `src/components/editor/shared`.
- Do not assume Supabase is always configured; local/demo fallbacks are intentional.
