---
name: api-conventions
description: Load when adding or modifying CodeCinematic App Router API handlers, validation, Supabase persistence, or response envelopes.
---

# API Conventions

## When to use this skill
Use this for any file under `src/app/api`, client code that calls those routes, or shared response/validation helpers.

## Quick reference
- Envelope helpers: `src/lib/api-response.ts`
- Session helper: `src/lib/auth.ts`
- Optional Supabase context: `src/lib/supabase/domain.ts`
- Server Supabase client: `src/lib/supabase/server.ts`
- Project id validation: `src/lib/project-ids.ts`
- Quota validation: `src/lib/quotas/limits.ts`

## Route handler anatomy
1. Define a local Zod schema near the top of `route.ts`.
2. For protected routes, call `await getSession()` before parsing business data.
3. Parse JSON with `await readJsonBody(request)` before `schema.safeParse(...)`.
4. Return validation failures with `apiError("invalid_payload", "...", 400, parsed.error.flatten())`.
5. Use `getSupabaseUserContext()` only after app-session auth when persistence is optional.
6. Return success with `apiSuccess({ ... })`.

Example files:
- `src/app/api/create-project/route.ts` validates project payload, enforces plan quotas, writes Supabase when available, and returns a demo UUID fallback.
- `src/app/api/projects/[projectId]/route.ts` owns GET/PUT/DELETE and validates routable project ids before optional UUID ownership checks.
- `src/app/api/export/route.ts` verifies project ownership for UUIDs before inserting export rows.

## Response contract
JSON routes should return:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": { "code": "invalid_payload", "message": "Invalid payload" } }
```

`src/app/api/billing/checkout/route.ts` is the current redirect exception because it hands off to Stripe Checkout.

## Supabase and demo fallback
- `hasSupabaseEnv()` decides whether configured Supabase credentials exist.
- `getSupabaseUserContext()` returns `{ supabase, user }` or `null`; preserve demo/local fallback unless durable storage is essential.
- For UUID project ids, verify `.eq("id", projectId).eq("user_id", context.user.id)` before reads/writes.
- For local project ids, let the browser/Zustand flow own persistence.

## Error handling
- Use existing `ApiErrorCode` values from `src/lib/api-response.ts`; add a new code there only when the route needs a new stable client state.
- Catch upstream service failures and return `upstream_error` or redirect error query params, as existing Stripe/OAuth routes do.
- Keep credential and auth errors generic; do not pass raw Supabase auth errors to clients.

## Do not
- Do not return new top-level legacy shapes; new clients should read `result.data`.
- Do not import server route handlers into client components.
- Do not bypass `apiSuccess()`/`apiError()` for JSON routes.
- Do not trust a UUID project id without a `user_id` ownership check.
