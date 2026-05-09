# CLAUDE.md

## Project
CodeCinematic is a creator SaaS for turning code snippets, text facts, quotes, and Hindi creator formats into browser-rendered short videos for developer educators and social-video creators.
Stack: Node 18+ · TypeScript 5.9.3 · Next.js 15.5.18 App Router · React 19.1 · Tailwind CSS/local shadcn-style UI · Zustand localStorage · no test runner configured

## Commands
| Task | Command |
|---|---|
| Install | `npm install` |
| Dev | `npm run dev` |
| Build | `npm run build` |
| Start | `npm run start` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Format | Not configured |
| Test (unit) | Not configured |
| Test (e2e) | Not configured |
| Test (watch) | Not configured |

## Structure
`src/app/(marketing)` - landing, pricing, privacy, terms pages.
`src/app/(auth)` - login UI and auth entry surface.
`src/app/(dashboard)` - protected dashboard, project workspace, create-video routes.
`src/app/api` - App Router route handlers for auth, projects, export, billing, email.
`src/components/ui` - local shadcn-style primitives; prefer these before new UI deps.
`src/components/layout` - header, nav, profile menu, page transitions.
`src/components/dashboard` - dashboard workspace and plan grid.
`src/components/editor` - Code Studio, creator panels, browser render UI.
`src/components/editor/shared` - canvas, font, audio, background, MediaRecorder helpers.
`src/lib` - auth/session, API responses, env, plans, quotas, Supabase, editor store.
`supabase/update_001.sql` - single SQL bootstrap for schema, RLS, indexes, seeds.
`public` - PWA manifest, service worker, app icons.

## Code Rules
- Load the relevant `.claude/skills/*/SKILL.md` before touching that domain.
- Use `@/*` imports for `src/*`; keep file names kebab-case except exported React components in PascalCase.
- Do not add patterns from stale docs unless current source files confirm them.
- Keep protected pages/server routes authoritative with `await getSession()`; middleware is only a missing-cookie fast path.
- Use `apiSuccess()`, `apiError()`, `readJsonBody()`, and Zod for JSON route handlers.
- Preserve demo-mode fallbacks when Supabase is not configured unless the flow requires durable storage.
- Never hardcode secrets; `.env.example` values are placeholders only.

### File Placement
- New App Router pages go under `src/app/<route-group>/<route>/page.tsx`; add `loading.tsx` and `error.tsx` for protected/fetching routes.
- New API calls go in `src/app/api/<domain>/route.ts`; shared API envelopes stay in `src/lib/api-response.ts`.
- New reusable UI primitives go in `src/components/ui`; feature UI goes in `src/components/<feature>`.
- New editor shared logic goes in `src/components/editor/shared` instead of enlarging creator panels.
- New types live beside their owner or in `src/lib/*`; `src/types/app.ts` currently only re-exports tiny app types.

### Code Style
- Comments are sparse and explain complex render/auth/security blocks, not obvious assignments.
- Existing doc comments use JSDoc-style `/** ... */` for exported types or complex helpers.
- Prefer small helpers around route validation, session handling, and rendering; `CreateVideoPanel` is already oversized.
- Handle API errors with typed envelopes; UI async surfaces need loading, empty, error, and success states.
- Use `async/await`; avoid promise chains except event callbacks.

### UI / UX
- Styling is Tailwind plus CSS variables from `src/app/globals.css`; compose classes with `cn()`.
- Use local `Button`, `buttonVariants`, `Card`, `Input`, `Textarea`, `Badge`, `Skeleton`, and feedback states.
- Use Framer Motion for page/nav/tab/menu transitions and respect `useReducedMotion`.
- Dashboard/editor surfaces are dense, dark-first, scroll-contained, and work-focused.
- Buttons, toggles, swatches, pagination, menus, and render status panels need labels/roles/ARIA where applicable.

### State
- Persist cross-route editor drafts/projects in `useEditorStore` from `src/lib/editor-store.ts`; it uses Zustand localStorage, version 2.
- Keep transient panel-only controls in local `useState` unless another route needs them.
- URL state currently drives the project workspace `tab` search param only.

### API Layer
- Add route boundary schemas with Zod, parse with `readJsonBody()`, then authorize with `getSession()`.
- Use `getSupabaseUserContext()` after app-session auth for optional durable reads/writes with demo fallback.
- Verify UUID project ownership before reading, updating, exporting, or deleting Supabase rows.

### Auth & Security
- App sessions are signed `codecinematic_session` cookies from `src/lib/session-cookie.ts`.
- Use `getSafeRedirectPath()` for all `next`/redirect params.
- Do not cache `/api`, `/dashboard`, or `/projects` in the service worker.
- Stripe webhooks stay outside app-session auth and must verify `stripe-signature`.

### Testing
- No unit, integration, e2e, coverage, or test runner config exists.
- For changes today, run `npm run lint` and `npm run build` when feasible.
- Do not invent test commands; add a test framework only as an explicit implementation task.

### Git
- No project commit convention, branch convention, or PR template is configured.
- Keep changes scoped; split renderer/auth/database changes when they are not part of one feature.
- Never force-push to `main`, `master`, or `develop`.

## Skills
| Skill | When to load |
|---|---|
| architecture | Adding files, routes, components, or shared helpers |
| api-conventions | Adding or modifying App Router API handlers |
| ui-conventions | Building or editing UI components and app states |
| state-management | Working with editor drafts, projects, or URL tab state |
| auth | Touching login, sessions, redirects, protected routes, or middleware |
| new-feature | Starting a feature that spans route, UI, state, API, or database |
| deployment | Building, releasing, or debugging env/hosting setup |
| domain-database | Editing Supabase schema, RLS, indexes, or SQL seeds |
| domain-rendering | Editing Canvas, MediaRecorder, audio, captions, or creator panels |
| domain-plans-billing | Touching plan limits, watermarks, Stripe checkout, or subscription data |
