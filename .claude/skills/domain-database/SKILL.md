---
name: domain-database
description: Load when editing CodeCinematic Supabase schema, row-level security, indexes, triggers, seed plans, or persistence behavior.
---

# Database Domain

## When to use this skill
Use this before changing `supabase/update_001.sql`, Supabase-backed API behavior, RLS policies, project/export persistence, or plan seed data.

## Quick reference
- SQL bootstrap: `supabase/update_001.sql`
- Server client: `src/lib/supabase/server.ts`
- Browser client: `src/lib/supabase/browser.ts`
- Optional user context: `src/lib/supabase/domain.ts`
- Project APIs: `src/app/api/create-project/route.ts`, `src/app/api/projects/[projectId]/route.ts`
- Export/history APIs: `src/app/api/export/route.ts`, `src/app/api/history/route.ts`

## Schema map
| Area | Tables |
|---|---|
| Identity and billing | `profiles`, `plans`, `plan_features`, `subscriptions` |
| Usage | `usage_counters`, `usage_events`, `feature_overrides` |
| Projects | `projects`, `project_scenes`, `important_line_rules` |
| Outputs/assets | `exports`, `project_assets`, `audio_generations`, `video_analysis_jobs` |

`handle_new_user()` creates a `profiles` row after `auth.users` insert. Plan rows and `plan_features` are seeded at the end of `supabase/update_001.sql`.

## RLS and ownership
- RLS is enabled on all app tables in the bootstrap.
- Public reads exist for `plans` and `plan_features`.
- Owner tables use `auth.uid() = user_id`.
- Nested tables check ownership through parent `projects`.
- API routes should still verify ownership for UUID project ids; RLS is not a substitute for clean API errors.

## Migration style
- This repo uses one rerunnable bootstrap, not timestamped migration files.
- Use `create table if not exists`, `create index if not exists`, and guarded `do $$ begin if not exists ... end $$;` constraint blocks.
- PostgreSQL policies do not support `create policy if not exists`; drop with `drop policy if exists ...` immediately before recreation.
- Add indexes for foreign keys, owner/date list views, status/date queue views, and provider lookup ids.

## Current persistence behavior
- `/api/create-project` inserts into `projects` when Supabase user context exists and returns a demo UUID otherwise.
- `/api/projects/[projectId]` GET/PUT/DELETE works for Supabase UUID projects and local/demo ids.
- `/api/export` inserts rows into `exports` for owned UUID projects; local projects get generated export ids.
- `/api/history` reads recent Supabase exports or returns demo history.

## Do not
- Do not add a new table without RLS, owner policies, and relevant indexes in the same SQL change.
- Do not create unguarded policies; rerunning the bootstrap must remain safe.
- Do not change plan seed limits without updating `src/lib/plans.ts`.
- Do not store real secrets or service role keys in SQL, docs, or seed data.
