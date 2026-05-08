# Deployment Guide - CodeCinematic

## 1. Prerequisites

- Node.js 18+ installed
- A Supabase project (free tier works)
- A Stripe account (for paid subscriptions)
- A Resend account (for transactional emails, free tier: 100 emails/day)
- A Vercel account (recommended deployment target)

## 2. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your public URL, e.g. `https://codecinematic.vercel.app` |
| `SESSION_SECRET` | Random 32+ character secret used to sign app session cookies |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `STRIPE_PRICE_BASIC` | Stripe Price ID for Basic plan |
| `STRIPE_PRICE_MEDIUM` | Stripe Price ID for Medium plan |
| `STRIPE_PRICE_HIGH` | Stripe Price ID for High plan |
| `RESEND_API_KEY` | Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | From address for emails |

### Admin account

The built-in demo admin account `admin@example.com` / `adminpassword123` bypasses Supabase auth and gets full premium (High plan) access. Change these credentials in `src/lib/demo-account.ts` before going to production, and set a strong `SESSION_SECRET` so app session cookies cannot be tampered with.

## 3. Install dependencies

```bash
npm install
```

## 4. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Copy the project URL, anon key, and service role key into `.env`.

## 5. Run the SQL bootstrap

Open the Supabase SQL Editor and execute the contents of:

```
supabase/update_001.sql
```

This creates all required tables, indexes, RLS policies, triggers, and seed data.

## 6. Create storage buckets

In Supabase Storage, create:

| Bucket | Access | Purpose |
|---|---|---|
| `cc-project-assets` | Private | Uploaded videos, thumbnails, audio |
| `cc-project-exports` | Private | Stored paid-plan exports |

## 7. Configure auth providers

In Supabase Auth settings:

1. Enable Email auth.
2. Enable Google provider with your client ID/secret.
3. Enable GitHub provider with your client ID/secret.
4. Add redirect URLs:
   - `http://localhost:3000/api/auth/callback`
   - `https://your-domain.com/api/auth/callback`

## 8. Set up Stripe

1. Create three subscription products in Stripe with monthly prices:
   - Basic ($19/mo)
   - Medium ($39/mo)
   - High ($79/mo)
2. Copy each Price ID into `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_MEDIUM`, `STRIPE_PRICE_HIGH`.
3. Create a webhook endpoint pointing to `https://your-domain.com/api/billing/webhook`.
4. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## 9. Set up Resend

1. Sign up at [resend.com](https://resend.com).
2. Add and verify your sending domain (or use the free sandbox domain for testing).
3. Create an API key and add it to `RESEND_API_KEY`.
4. Set `RESEND_FROM_EMAIL` to your verified sender address.

## 10. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 11. Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Add all `.env` variables in Vercel project settings (Settings -> Environment Variables).
4. Set `NEXT_PUBLIC_APP_URL` to your production URL.
5. Update Supabase auth redirect URLs with your production domain.
6. Deploy.

## 12. Post-deployment checklist

- [ ] Verify admin login works
- [ ] Verify Google/GitHub social login works
- [ ] Test project editor and video export
- [ ] Test Stripe checkout flow
- [ ] Verify webhook events reach `/api/billing/webhook`
- [ ] Send a test email via the API
- [ ] Update admin credentials for production
