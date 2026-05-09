---
name: architecture
description: Load when adding or moving CodeCinematic files across App Router routes, API handlers, editor components, shared helpers, or Supabase SQL.
---

# Architecture

## When to use this skill
Use this before adding files, creating routes, deciding where helpers belong, or reorganizing code in CodeCinematic.

## Quick reference
- App root: `src/app/layout.tsx`
- Route groups: `src/app/(marketing)`, `src/app/(auth)`, `src/app/(dashboard)`
- API handlers: `src/app/api/**/route.ts`
- UI primitives: `src/components/ui`
- Editor workflows: `src/components/editor`
- Shared editor helpers: `src/components/editor/shared`
- Cross-cutting app logic: `src/lib`
- Database bootstrap: `supabase/update_001.sql`

## Directory ownership
| Path | Owns |
|---|---|
| `src/app/(marketing)` | Public pages: home, pricing, legal pages. |
| `src/app/(auth)` | Login UI only; auth route handlers live under `src/app/api/auth`. |
| `src/app/(dashboard)` | Protected dashboard, project workspace, create-video route states. |
| `src/app/api` | Server route handlers for auth, projects, export, billing, email. |
| `src/components/layout` | Header, nav tabs, profile menu, route transitions. |
| `src/components/dashboard` | Dashboard workflow launcher and plan grid. |
| `src/components/editor` | Code Studio plus Word/Fact/Hindi/Bollywood creator panels. |
| `src/components/editor/shared` | Canvas background, font, audio, MediaRecorder, render status helpers. |
| `src/components/ui` | Local shadcn-style reusable primitives. |
| `src/lib` | Session/auth, API responses, plans, quotas, editor store, Supabase, render helpers. |

## Placement decision tree
1. New public or protected page: add `page.tsx` under the relevant route group in `src/app`.
2. New protected/fetching page: add matching `loading.tsx` and client `error.tsx` beside the page, following `src/app/(dashboard)/projects/[projectId]/error.tsx`.
3. New JSON endpoint: create `src/app/api/<domain>/route.ts` and use the API conventions skill.
4. New shared React primitive: put it in `src/components/ui` only if it is generic across features.
5. New editor-specific helper: put it in `src/components/editor/shared`; do not make `src/components/editor/create-video-panel.tsx` larger without strong reason.
6. New auth/session/security helper: keep it in `src/lib` near `auth.ts`, `session-cookie.ts`, or `supabase/*`.
7. New schema or RLS change: update only `supabase/update_001.sql`; there is no migrations directory.

## Naming rules
- Route segment files use Next.js names: `page.tsx`, `loading.tsx`, `error.tsx`, `route.ts`.
- Component files are kebab-case, exported components are PascalCase: `project-workspace.tsx` exports `ProjectWorkspace`.
- Shared utility files are kebab-case: `api-response.ts`, `session-cookie.ts`, `media-recorder.ts`.
- Route groups use parentheses and dynamic segments use brackets: `(dashboard)/projects/[projectId]`.
- Import app code through `@/*`, as configured in `tsconfig.json`.

## Do not
- Do not add a `pages/` router; this app uses App Router only.
- Do not put API/business logic inside client components when route handlers or `src/lib` own the boundary.
- Do not add a second database migration layout unless asked; current schema is a single bootstrap SQL file.
- Do not copy stale paths from `plan.md`; verify against current `src/` files first.
