# API Routes

## Critical Files

- `src/lib/api-response.ts`
- `src/app/api/create-project/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/history/route.ts`
- `src/lib/supabase/domain.ts`
- `src/app/api/email/send/route.ts`
- `src/app/api/billing/webhook/route.ts`

## Response Shape

JSON API routes should use `apiSuccess()` and `apiError()` from `src/lib/api-response.ts`.

Success:

```json
{ "ok": true, "data": {} }
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_payload",
    "message": "Invalid payload",
    "details": {}
  }
}
```

## Request Handling

- Use `readJsonBody()` before Zod parsing so malformed JSON becomes a 400 response.
- Use Zod schemas at the route boundary.
- Keep secrets server-side only. Do not import server routes into client components.
- Return validation details from `parsed.error.flatten()` when useful.
- For auth-protected routes, call `await getSession()` and return `apiError("unauthorized", "Unauthorized", 401)` if missing.
- For routes that can persist data, call `getSupabaseUserContext()` after app-session auth. If it returns `null`, preserve the demo fallback unless the product flow requires durable storage.
- Validate ids tightly. Local demo project slugs may be alphanumeric with `_` or `-`; UUID projects should be ownership-checked before writes.
- Login form routes may read `request.formData()`, but they should still validate with Zod at the route boundary before touching auth providers.
- Use `apiError("rate_limited", ..., 429)` for throttled route attempts.

## Client Handling

- New clients should read payloads from `result.data`.
- Some older client code may still tolerate legacy top-level fields during transition, but do not add new legacy shapes.

## Current Gaps

- Checkout still redirects rather than returning JSON because it hands off directly to Stripe.
- Checkout plan selection uses an explicit paid-plan type guard. Do not cast raw query params to `PlanCode`.
- Middleware manually returns the same envelope for protected API session failures to avoid importing route-only helpers into edge code.
- Stripe webhooks intentionally bypass app-session middleware and must always verify `stripe-signature`.
