# Deployment Guide

## 1. Create the project files locally

This repository already contains:
- the Next.js app scaffold
- `.env` placeholders
- `supabase/update_001.sql`
- local demo logins for `free`, `basic`, `medium`, and `high`

## 2. Fill environment variables

Open `.env` and replace all placeholder values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

You can also replace the four demo email/password pairs if you want different credentials.

## 3. Install dependencies

Run:

```bash
npm install
```

## 4. Create a Supabase project

Inside Supabase:

1. Create a new project.
2. Copy the project URL and anon key into `.env`.
3. Copy the service role key into `.env`.

## 5. Run the SQL bootstrap

Open the Supabase SQL editor and run:

`supabase/update_001.sql`

This file creates:
- profiles
- plans
- plan_features
- subscriptions
- usage_counters
- usage_events
- feature_overrides
- projects
- project_scenes
- important_line_rules
- exports
- project_assets
- audio_generations
- video_analysis_jobs
- helper indexes
- RLS policies
- seed plan data

## 6. Create storage buckets

Create these buckets in Supabase Storage:

1. `cc-project-assets`
   - private
   - used for uploaded videos, thumbnails, subtitles, and audio

2. `cc-project-exports`
   - private
   - used for saved paid-plan exports

3. `cc-public-previews`
   - public optional
   - use only if you later want public landing-page examples

## 7. Configure auth providers

In Supabase Auth:

1. Enable Email auth if you want regular email/password accounts.
2. Enable Google provider and paste the Google client id/secret.
3. Enable GitHub provider and paste the GitHub client id/secret.
4. Add your local and production callback URLs.

Recommended redirect URLs:

- `http://localhost:3000/dashboard`
- `https://your-domain.com/dashboard`

## 8. Run the app locally

Run:

```bash
npm run dev
```

Open:

`http://localhost:3000`

## 9. Test local demo plan accounts

Go to `/login` and use any of these local accounts:

- free: `free@codecinematic.demo` / `FreePlan123!`
- basic: `basic@codecinematic.demo` / `BasicPlan123!`
- medium: `medium@codecinematic.demo` / `MediumPlan123!`
- high: `high@codecinematic.demo` / `HighPlan123!`

These work without hitting the database. They use a local cookie-based demo session.

## 10. Production deployment

Recommended deployment target:
- Vercel for the Next.js app
- Supabase for auth, Postgres, and storage

Production steps:

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Add the same `.env` values in Vercel project settings.
4. Set `NEXT_PUBLIC_APP_URL` to your production URL.
5. In Supabase auth provider settings, add the production redirect URLs.
6. Deploy.

## 11. What is already browser-first

The current scaffold is designed for:
- browser preview rendering
- browser export flow
- Supabase-backed auth and data later
- line-based plan limits
- comment-based explanation flow

## 12. What you should implement next

After the base app boots successfully, build in this order:

1. real create-project insert into Supabase
2. real project list / history queries
3. syntax-highlighted editor preview using Shiki
4. browser export using `MediaRecorder`
5. Stripe checkout + webhook sync for subscriptions
6. upload paid exports into `cc-project-exports`
7. text-to-audio route
8. video-to-text timeline route
