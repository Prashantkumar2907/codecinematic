# CodeCinematic Product Understanding

## Core Value Proposition

CodeCinematic is a creator SaaS for turning code snippets, inline explanations, facts, quotes, and Hindi creator formats into browser-rendered short videos. Users tune a structured editor, focus lines, visual themes, background presets, speed, and audio settings, then export deterministic WebM videos locally through Canvas and MediaRecorder.

Primary users are developer educators, DevRel teams, course creators, indie hackers, and social-video creators who need polished technical or text-based clips for Shorts, Reels, TikTok, and presentations without a server-side video-rendering pipeline.

## Critical File Path

1. App shell and metadata: `src/app/layout.tsx`
2. Route transition shell: `src/components/layout/page-transition.tsx`
3. Global styles and design tokens: `src/app/globals.css`, `tailwind.config.ts`
4. Marketing and pricing: `src/app/(marketing)/page.tsx`, `src/app/(marketing)/pricing/page.tsx`, `src/components/marketing/hero.tsx`
5. Auth UI and routes: `src/app/(auth)/login/page.tsx`, `src/app/api/auth/*`
6. Session and middleware: `src/lib/session-cookie.ts`, `src/lib/auth.ts`, `src/middleware.ts`
7. Supabase clients and domain helpers: `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/domain.ts`
8. Protected dashboard: `src/app/(dashboard)/dashboard/page.tsx`
9. Creator workspace router: `src/components/editor/project-workspace.tsx`
10. Code editor and render handoff: `src/components/editor/project-editor.tsx`, `src/components/editor/create-video-panel.tsx`
11. Shared editor utilities: `src/components/editor/shared/*`
12. Database bootstrap and RLS: `supabase/update_001.sql`
13. API response contract: `src/lib/api-response.ts`
14. PWA shell: `src/components/pwa/install-prompt.tsx`, `public/sw.js`, `public/manifest.webmanifest`

## Target Architecture

### Frontend

The app uses Next.js App Router with a server-rendered shell and client-heavy editor surfaces. UI is Tailwind-first with local shadcn-style primitives in `src/components/ui`. Framer Motion is used for page transitions, tab transitions, navigation active states, menus, and marketing motion. Zustand with sessionStorage stores transient editor drafts by `projectId`.

### Backend

API routes live under `src/app/api`. JSON routes should use the `{ ok, data }` / `{ ok, error }` envelope from `src/lib/api-response.ts`. Auth-protected routes use `await getSession()` first, then optionally use Supabase auth cookies through `getSupabaseUserContext()` for durable project/export/history behavior. Demo/admin sessions remain supported when Supabase is not configured.

### Database

Supabase bootstrap defines identity, plans, plan features, subscriptions, usage counters/events, projects, scenes, exports, assets, audio generations, and video analysis jobs. RLS is enabled on all app tables. User-owned tables enforce `auth.uid()` policies; nested resources check ownership through parent projects.

## Ten-Point Audit

1. Security: App sessions are HMAC-signed with expiry; production requires a strong `SESSION_SECRET`.
2. Security: Stripe webhooks are no longer caught by session middleware; they remain public only to allow Stripe signature verification.
3. Security: OAuth now routes through `/api/auth/callback`, exchanges the Supabase code, and mints the app session cookie.
4. Security: The service worker does not cache `/api`, `/dashboard`, or `/projects`, preventing private workspace responses from being reused offline.
5. Security: Global headers now add `nosniff`, strict referrer policy, frame denial, and a limited permissions policy.
6. Backend: `create-project` persists to Supabase when a Supabase user exists, and falls back to demo mode otherwise.
7. Backend: `export` validates project ids, verifies Supabase project ownership for UUID projects, and records export rows when persistence is available.
8. Backend: `history` reads Supabase export history when available, with demo fallback for non-persistent sessions.
9. Database: Foreign-key, owner/date, status/date, provider subscription, slug, public-project, and queue-status indexes are present for common reads and RLS joins.
10. Database: Check constraints protect project, export, and subscription statuses; scene order is unique within a project.
11. UI/UX: Route loading/error states exist for dashboard, editor, and create-video routes.
12. UI/UX: Page transitions, workspace tab transitions, dashboard surface animation, and render status panels prevent static-feeling workflows.
13. Accessibility: The profile menu supports `aria-expanded`, menu roles, and Escape close; editor controls now expose labels/pressed states.
14. Maintainability: `CreateVideoPanel` is still the largest file and should be the next extraction target.

## Identified Gaps

### Security Risks

- The built-in demo admin account is intentional but must be changed before production launch.
- Stripe webhook events are verified and sanitized in logs, but subscription state sync is still not fully implemented.
- Supabase OAuth now creates app sessions, but paid-plan assignment still depends on future subscription sync.

### Performance Bottlenecks

- Browser rendering is CPU-heavy by design. The renderer uses cached tokenization and a singleton AudioContext, but `src/components/editor/create-video-panel.tsx` remains difficult to profile because it mixes UI, render orchestration, canvas painting, audio, and tokenization.
- Creator-mode panels share similar MediaRecorder, font, image, and canvas logic. More extraction into `src/components/editor/shared` would reduce bundle and maintenance costs.

### UI/UX Dead Ends

- The editor routes now have loading, empty, error, and success coverage, but the specialized creator panels still vary in how explicit their error states are during MediaRecorder failures.
- Social auth is wired through the app callback, but pricing/subscription upgrade success still does not update the displayed plan until subscription persistence is completed.

### Code Smells

- `CreateVideoPanel` is over 1,300 lines and should be split into render engine, tokenization/theme helpers, and UI shell.
- TypeScript and SQL plan definitions can drift. Plan limits should eventually be sourced from one canonical plan registry.
- Some localized creator panels intentionally contain Hindi/Urdu text and non-ASCII punctuation; future edits should keep localized copy deliberate and avoid accidental mojibake.
