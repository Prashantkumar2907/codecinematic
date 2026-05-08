# Database Access

## Critical Files

- `supabase/update_001.sql`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/domain.ts`
- `src/lib/plans.ts`
- `src/lib/quotas/limits.ts`

## Schema Model

The Supabase bootstrap creates:

- Identity and billing: `profiles`, `plans`, `plan_features`, `subscriptions`
- Usage tracking: `usage_counters`, `usage_events`, `feature_overrides`
- Project model: `projects`, `project_scenes`, `important_line_rules`
- Output and assets: `exports`, `project_assets`, `audio_generations`, `video_analysis_jobs`

RLS is enabled on all app tables. Owner-scoped tables use `auth.uid()` policies, and nested resources check ownership through their parent project.

## Query Rules

- Use `createSupabaseServerClient()` in route handlers and server components when Supabase auth cookies are needed.
- Use `getSupabaseUserContext()` when a route should support durable Supabase reads/writes but still fall back to demo mode when Supabase is unavailable.
- Use `createSupabaseBrowserClient()` only in client components that genuinely need browser-side Supabase access.
- Keep writes behind route handlers when business rules, plan checks, or secrets are involved.
- Validate request payloads with Zod before touching Supabase.
- Keep plan enforcement aligned between `src/lib/plans.ts` and the seeded `plans`/`plan_features` rows.

## Indexing Rules

- Add explicit indexes for every foreign key used by RLS or joins.
- Add owner/date composite indexes for user history views, such as `(user_id, created_at desc)` or `(user_id, updated_at desc)`.
- Add status/date indexes for render queues, export history, and analysis jobs.
- Add partial unique indexes for provider identifiers that must not duplicate, such as Stripe subscription ids.
- Prefer `create index if not exists` in `supabase/update_001.sql` because the bootstrap may be re-run.

## Current Gaps

- `create-project`, `export`, and `history` now use Supabase when a Supabase user context exists, with demo fallback for local/demo sessions.
- Stripe webhooks verify signatures but do not fully sync `subscriptions` yet.
