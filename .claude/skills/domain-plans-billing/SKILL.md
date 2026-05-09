---
name: domain-plans-billing
description: Load when changing CodeCinematic plan limits, quotas, watermarks, Stripe checkout, subscription data, or pricing surfaces.
---

# Plans And Billing Domain

## When to use this skill
Use this before touching `src/lib/plans.ts`, `src/lib/quotas/limits.ts`, pricing UI, export watermark behavior, Stripe routes, or SQL plan seeds.

## Quick reference
- TypeScript plan source: `src/lib/plans.ts`
- Quota validation: `src/lib/quotas/limits.ts`
- Pricing UI: `src/app/(marketing)/pricing/page.tsx`
- Plan grid: `src/components/dashboard/plan-grid.tsx`
- Dashboard metrics: `src/components/dashboard/dashboard-workspace.tsx`
- Checkout route: `src/app/api/billing/checkout/route.ts`
- Webhook route: `src/app/api/billing/webhook/route.ts`
- SQL seed data: `supabase/update_001.sql`

## Current plan codes and limits
| Code | UI name | Price | Stored exports | Daily downloads | Max lines | Max chars/line | Watermark |
|---|---|---:|---:|---:|---:|---:|---|
| `free` | Free | `$0` | 0 | 1 | 120 | 90 | Yes |
| `basic` | Starter | `$19` | 3 | 10 | 400 | 110 | No |
| `medium` | Pro | `$39` | 10 | 40 | 1000 | 120 | No |
| `high` | Enterprise | `$79` | 25 | 120 | 2500 | 140 | No |

The SQL seed names are `Free`, `Basic`, `Medium`, and `High`; the UI names in `src/lib/plans.ts` are `Free`, `Starter`, `Pro`, and `Enterprise`.

## Quota behavior
- `validateCodePayload(plan, code)` enforces max line count and longest line length.
- `/api/create-project` and `/api/projects/[projectId]` use quota validation before writing project content.
- `/api/export` uses the session plan to decide `watermarked` and `storageAllowed`.
- The renderer displays watermarks when `job.watermarked` is true.

## Stripe behavior
- Paid checkout only accepts `basic`, `medium`, or `high`.
- Price env vars are `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_MEDIUM`, and `STRIPE_PRICE_HIGH`.
- Checkout redirects to `/dashboard?upgraded=true` on success and `/pricing` on cancel.
- Webhook route verifies `stripe-signature` and logs sanitized details.
- Subscription persistence is not complete; webhooks do not yet update `subscriptions` or session plans.

## Do not
- Do not add a new plan code in only one layer; update `PlanCode`, `PLAN_CONFIG`, quota usage, pricing UI, Stripe mapping, and SQL seed data together.
- Do not cast raw query params to `PlanCode`; keep explicit paid-plan guards.
- Do not remove watermarks from free exports without changing both API and renderer behavior.
- Do not claim checkout upgrades immediately change the displayed plan until subscription/session sync is implemented.
