# CodeCinematic SaaS Application Plan

## 0. Implementation Update

This plan has been updated to reflect the current application scaffold in this repository.

### Added product constraints
- users can select any programming language per project or per scene
- explanations should be authored inside the codebase as comments so they animate naturally with the code
- important lines must be highlighted with strong syntax-aware coloring and focus metadata
- the app includes a marketing landing page and a login page with social auth entry points
- free and paid limits should prioritize line count and max characters per line, not just total characters
- the UI and video renderer must reject overly long lines because they become unreadable in preview and export
- the experience should avoid overscroll bounce / scroll stretch behavior
- export flow should use one aspect ratio per render path so visibility and wrapping rules stay deterministic
- long code lines should wrap visually based on the selected aspect ratio instead of disappearing outside the frame
- typing animation should reveal code character-by-character within a logical line before moving to the next line
- editor and export workflow state should persist across navigation so going back does not reset the draft
- use Zustand for client-side draft state management in the editor/export flow

### Added application deliverables
- `.env` placeholder file
- `supabase/update_001.sql` bootstrap schema
- `deployment.md` step-by-step setup guide
- four local demo accounts that represent `free`, `basic`, `medium`, and `high` plans without hitting the database

### Current application features
- landing page and pricing page
- login page with demo plan accounts
- Google and GitHub social login entry points
- dashboard with plan-aware limit cards
- cinematic project editor with:
  - language selection
  - single aspect-ratio selection
  - code/comment authoring
  - focus-map line toggling
  - separate normal-line and focused-line speed sliders
  - speed range from `0.05x` to `1.50x`
  - optional typing sound profile
  - insertion volume slider
  - persisted draft state with Zustand
- create-video flow with:
  - browser-side video generation
  - downloadable `.webm` output
  - free-plan watermarking
  - plan-aware export job metadata
  - reads the same persisted draft state used by the editor
- browser renderer with:
  - syntax-colored code drawing
  - character-by-character typing within the active line
  - ratio-aware line wrapping
  - separate timing for focused and non-focused lines
  - per-character speed consistency for focused and non-focused lines
  - synthesized typing audio
  - per-character insertion sound timing
  - richer coloring for comments, keywords, strings, numbers, braces, and punctuation
  - render duration scales with actual content length instead of stopping at a hard short-video cap

### Known product-quality issues to think about every time
- multiline code should never be passed only through URL params for rendering
- a line that fits in the editor can still overflow in the video frame if render-specific wrapping is missing
- “show full line at once” feels wrong for typing animation; reveal should be character-based
- `9:16` and `16:9` need different visible-width rules, not just different canvas sizes
- focus maps should show all non-empty lines, not only auto-detected important ones
- exports should fail loudly with a visible UI message when render input is missing
- browser audio/video support differs by device, so fallback behavior must be explicit
- every feature change that affects product behavior should also be reflected in this file
- per-character typing sound can become too harsh without volume control and whitespace attenuation
- slider-based speed controls must be interpreted as multipliers, not labels, in the renderer
- syntax coloring should degrade safely if a token type is unknown rather than rendering invisible text
- local component state in the editor is not enough if users navigate between editor and export steps
- long audio envelopes can make insertion sound smear into a tonal `teeeee` instead of short clicks
- low-end speed multipliers need much slower timing than naive preset-based mappings
- hard render-duration caps can silently cut off longer code samples before completion
- fixed-duration line timing makes equally focused lines feel inconsistent when line lengths differ

## 1. Product Direction

### Working name
- Primary: CodeCinematic
- Strong alternatives:
  - CodeReel
  - DevCine
  - SnippetStudio
  - ReelMyCode
  - StackFrame

Recommendation: keep `CodeCinematic` for now. It is memorable, descriptive, and flexible enough to expand beyond code-only exports into narrated explainer videos.

### One-line positioning
CodeCinematic helps developers, educators, founders, and content creators turn code snippets and scripted technical explanations into clean cinematic videos without manual screen recording.

### Core value proposition
- Deterministic output, not AI video generation
- Cheap to run because rendering is animation-driven
- Better than static code screenshots because it adds timing, focus, narration, and export formats
- Easier than screen recording because creators can edit the source text and regenerate

### Target users
- DevRel teams
- indie hackers
- course creators
- coding YouTubers
- educators
- SaaS founders making product demos with code
- agencies making technical explainers

## 2. Product Surface

The long-term product should be one platform with multiple creation modes, not three disconnected apps.

### Creation modes
1. Text -> Video
   - Input: code, markdown-like script, or mixed text + code scenes
   - Output: MP4/WebM in `9:16` and `16:9`

2. Video -> Text timeline
   - Input: uploaded video
   - Output: timestamped scene summary, transcript, chapter list, event timeline
   - Use case: convert a recorded coding demo into reusable article/script structure

3. Text -> Audio
   - Input: narration script
   - Output: voiceover audio
   - Use case: pair explanation with typing animation

4. Storyboard Composer
   - Input: multi-frame script such as:
     - scene 1: concept intro
     - scene 2: explanation
     - scene 3: code typing demo
     - scene 4: conclusion / CTA
   - Output: one combined video made from scene blocks

### Recommended product packaging
- Phase 1 product: `Code-to-Video`
- Phase 2 product: `Scripted Tech Video Builder`
- Phase 3 product: `Technical Content Studio`

## 3. Market Landscape

### What exists today
- `Hackreels` focuses on beautiful animated code exports with code diffing and video export.
- `snappify` supports code presentations and has experimental video export.
- `CodeVideo` is the closest conceptual competitor for deterministic technical lesson generation, timelines, and multi-format exports.
- `ray.so` is adjacent for code visuals, but it is more image-first than timeline-video-first.
- `Canvid` and similar tools solve polished screen recording, but not deterministic code-scene generation.

### Market gap
The gap is not “make videos from code” alone. The stronger gap is:
- structured technical storytelling
- deterministic code animation
- lightweight narration
- reusable project templates
- social-ready exports in `9:16`
- usage controls and SaaS monetization for creators and teams

### Differentiation to pursue
- scene-based technical storytelling, not just snippet export
- smart line focus and captioning without heavy AI video
- one-click vertical and landscape exports from the same project
- cheap/free creation path with in-browser rendering
- optional AI help only for script generation, narration prep, timeline summarization, and scene suggestions

### Useful product lessons from the market
- creators like templates and beautiful defaults
- pricing usually maps to export minutes, export quality, or storage
- code-only export is useful, but narration + structure increases value
- vertical video is still underserved in technical creator tools

## 4. Strategic Recommendation

Build one SaaS with three internal pipelines:
- `render pipeline`: deterministic video generation
- `understanding pipeline`: transcript/timeline/scene extraction from video
- `audio pipeline`: TTS generation and audio assembly

Expose them to users as simple workflows:
- `Code Clip`
- `Explainer Reel`
- `Video to Notes`
- `Narrated Lesson`

## 5. Feature Set By Domain

### A. Project authoring
- create project
- choose project type
- choose any programming language
- pick one aspect ratio per render: `9:16` or `16:9`
- paste code or multi-scene script
- write explanation in code comments and scene text blocks
- choose syntax language
- choose theme
- choose normal-line typing speed with slider control
- choose focused-line typing speed with slider control
- use `0.05x` to `1.50x` speed range
- choose typing sound profile
- choose insertion volume
- choose cursor style
- choose focus behavior
- choose watermark / branding
- add narration script
- preview timeline
- keep draft changes when moving forward and backward in the workflow

### B. Scene system
- intro scene
- text-only scene
- code typing scene
- highlight scene
- outro scene
- reusable scene templates

### C. Export
- browser preview render
- browser export with `MediaRecorder` for MVP
- optional server export later with FFmpeg
- MP4 / WebM
- one selected aspect ratio per render flow in the current implementation
- downloadable `.webm` file generation in-browser
- synthesized typing audio embedded in rendered video
- per-character insertion sound generation
- free-tier watermark support

### D. AI-assisted helpers
- script expansion from prompt
- narration generation
- chapter/timeline extraction from uploaded video
- auto-caption suggestions for important lines

### E. SaaS / growth
- auth
- subscriptions
- usage tracking
- quota enforcement
- public share links
- export history
- template gallery
- referral / invite system later

## 6. Recommended Auth Strategy

### Default recommendation
Use `Supabase Auth` first.

### Why
- fast to integrate in Next.js
- supports email/password, magic links, OTP, and social auth
- good fit for MVP cost and speed
- clean tie-in with Postgres and Row Level Security

### Social login recommendation
Enable:
- Google
- GitHub

Optional:
- LinkedIn for creator/professional audience

### SSO recommendation
Yes, SSO is good, but not for initial MVP unless you target teams early.

Recommended rollout:
- MVP: Supabase Auth + Google + GitHub
- Later: add enterprise SSO only for team/enterprise plan
- Use SSO as a sales feature, not a day-1 build requirement

### Why not start with SSO-only thinking
- SSO adds operational and support complexity
- most early users are individual creators, not IT-managed companies
- it does not help core retention as much as fast creation/export does

### Demo access recommendation
Ship four built-in local demo logins that do not hit the DB:
- `free@codecinematic.demo`
- `basic@codecinematic.demo`
- `medium@codecinematic.demo`
- `high@codecinematic.demo`

These are useful for:
- QA
- investor/product demos
- testing plan-gated UI quickly
- local development before Supabase is fully configured

## 7. Pricing and Quota Model

Do not hardcode plan behavior in application code. Model pricing, quotas, and feature entitlements as data.

### Suggested plans

| Plan | Audience | Monthly Price | Daily Free Limits | Storage | Watermark | Export Quality |
|---|---|---:|---|---:|---|---|
| free | trial users | $0 | 1 download/day, 1 project/day or 3 project saves/day | 0 stored exports | yes | capped |
| basic | solo creator | $12-$19 | optional 5-10 downloads/day soft cap | 3 stored videos | no | 1080p |
| medium | active creator | $29-$39 | higher soft cap | 10 stored videos | no | 1080p / better duration |
| high | power user/team-lite | $59-$99 | higher soft cap | 20-50 stored videos | no | priority/export queue |

Recommendation:
- free: `1 exported download per rolling 24h`
- basic: `3 stored exports` and `30-60 downloads/month`
- medium: `10 stored exports` and `150 downloads/month`
- high: `25 stored exports` and `300+ downloads/month`

If you want creator growth over revenue at launch:
- keep unlimited browser previews on free
- limit final downloads very tightly
- never store free exports

### Character and content limits
Use per-plan limits for:
- max code lines
- max characters per line
- max scenes per project
- max export duration
- max voiceover duration
- max uploads per day

Recommendation:
- do not optimize around huge total character limits
- optimize around readable line length and visible line count
- reject or warn on lines that exceed the safe viewport width
- this matters even more for `9:16`

Example:

| Plan | Max scenes | Max code lines | Max chars/line | Max duration/export |
|---|---:|---:|---:|---:|
| free | 5 | 120 | 90 | 30 sec |
| basic | 15 | 400 | 110 | 2 min |
| medium | 40 | 1,000 | 120 | 5 min |
| high | 100 | 2,500 | 140 | 15 min |

### Download limitations
Free plan should absolutely be rate-limited.

Recommendation:
- free users can download `1 final export per 24 hours`
- free users can preview more times, but preview generation is rate-limited
- free exports should always carry watermark
- free exports are not stored in Supabase Storage

### Abuse and anti-spam limits
- max 3 project creations per day on free
- max 10 preview renders per day on free
- IP + user + device fingerprint style throttling
- CAPTCHA on signup and suspicious export activity
- cool-down on repeated failed exports

## 8. Quota and Entitlement Data Model

This is the right place to use separate tables.

### Why separate tables are better
- plan logic changes without migrations
- easier to run promotions
- easier to grandfather old plans
- easier to add feature flags or temporary boosts
- easier to enforce daily vs monthly quotas separately

### Recommended billing and quota tables

#### `plans`
Stores marketing-facing plans.

Columns:
- `id` uuid pk
- `code` text unique (`free`, `basic`, `medium`, `high`)
- `name` text
- `description` text
- `price_monthly_usd` numeric
- `price_yearly_usd` numeric nullable
- `is_active` boolean
- `sort_order` int
- `created_at` timestamptz
- `updated_at` timestamptz

#### `plan_features`
Stores feature flags and scalar entitlements.

Columns:
- `id` uuid pk
- `plan_id` uuid fk -> `plans.id`
- `feature_key` text
- `feature_type` text check in (`boolean`, `integer`, `string`, `json`)
- `feature_value_boolean` boolean nullable
- `feature_value_integer` bigint nullable
- `feature_value_string` text nullable
- `feature_value_json` jsonb nullable
- `created_at` timestamptz

Example keys:
- `watermark_enabled`
- `max_stored_exports`
- `max_daily_downloads`
- `max_monthly_downloads`
- `max_projects_saved`
- `max_code_lines`
- `max_line_length`
- `max_export_seconds`
- `can_use_audio`
- `can_use_video_to_text`
- `can_use_sso`
- `max_team_members`

#### `subscriptions`
Tracks current commercial subscription state.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `plan_id` uuid fk -> `plans.id`
- `provider` text (`stripe`, `manual`, `promo`)
- `provider_customer_id` text nullable
- `provider_subscription_id` text nullable
- `status` text
- `current_period_start` timestamptz
- `current_period_end` timestamptz
- `cancel_at_period_end` boolean
- `trial_ends_at` timestamptz nullable
- `created_at` timestamptz
- `updated_at` timestamptz

#### `usage_counters`
Stores aggregate counters for fast quota checks.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `metric_key` text
- `window_type` text (`day`, `month`, `rolling_24h`, `lifetime`)
- `window_start` timestamptz
- `window_end` timestamptz
- `usage_count` bigint
- `usage_value` bigint default 0
- `updated_at` timestamptz

Examples:
- `downloads`
- `preview_renders`
- `projects_created`
- `audio_generations`
- `video_to_text_runs`
- `tokens_used`

#### `usage_events`
Append-only event table for auditing and analytics.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `project_id` uuid nullable fk -> `projects.id`
- `export_id` uuid nullable fk -> `exports.id`
- `metric_key` text
- `event_type` text
- `delta_count` int default 1
- `delta_value` bigint default 0
- `metadata` jsonb
- `created_at` timestamptz

#### `feature_overrides`
For promos, support adjustments, lifetime deals, or abuse mitigation.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `feature_key` text
- `override_type` text (`set`, `increment`, `disable`)
- `value_boolean` boolean nullable
- `value_integer` bigint nullable
- `value_json` jsonb nullable
- `starts_at` timestamptz nullable
- `ends_at` timestamptz nullable
- `reason` text
- `created_at` timestamptz

This lets you give a user 5 extra downloads without inventing a new plan.

## 9. Core Supabase Schema

### `profiles`
App-specific user profile, linked to `auth.users`.

Columns:
- `user_id` uuid pk references `auth.users.id`
- `username` text unique nullable
- `full_name` text nullable
- `avatar_url` text nullable
- `default_language` text nullable
- `default_aspect_ratio` text nullable
- `onboarding_state` text default `new`
- `created_at` timestamptz
- `updated_at` timestamptz

### `projects`
Top-level creative unit.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `title` text
- `slug` text nullable
- `project_type` text
- `status` text
- `source_mode` text check in (`code_only`, `scripted`, `mixed`)
- `primary_language` text nullable
- `supported_languages_json` jsonb nullable
- `default_theme_id` uuid nullable
- `default_typing_preset_id` uuid nullable
- `content_raw` text
- `content_structured` jsonb nullable
- `aspect_ratio_mode` text check in (`vertical`, `landscape`, `both`)
- `important_lines_json` jsonb nullable
- `max_line_count_applied` int nullable
- `max_line_length_applied` int nullable
- `total_line_count` int nullable
- `longest_line_length` int nullable
- `estimated_duration_ms` int nullable
- `is_public` boolean default false
- `last_opened_at` timestamptz nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### `project_scenes`
Needed for the full application vision.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `scene_order` int
- `scene_type` text (`intro_text`, `code_typing`, `explanation`, `outro`, `pause`)
- `title` text nullable
- `content_text` text nullable
- `content_code` text nullable
- `language` text nullable
- `duration_ms` int nullable
- `settings_json` jsonb nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### `project_versions`
Optional but recommended for regeneration/history.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `version_number` int
- `content_snapshot` jsonb
- `created_by` uuid fk -> `profiles.user_id`
- `created_at` timestamptz

### `important_line_rules`
Stores the rule engine version and match metadata.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `scene_id` uuid nullable fk -> `project_scenes.id`
- `line_number` int
- `line_text` text
- `rule_key` text
- `importance_score` numeric
- `focus_type` text (`zoom`, `spotlight`, `caption`, `pause`)
- `caption_text` text nullable
- `metadata` jsonb
- `created_at` timestamptz

### `exports`
Tracks each generated output file request, even if free and non-stored.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `user_id` uuid fk -> `profiles.user_id`
- `aspect_ratio` text check in (`9:16`, `16:9`)
- `export_format` text (`mp4`, `webm`, `gif`, `audio`, `json`)
- `render_mode` text (`browser`, `server`)
- `status` text (`queued`, `rendering`, `completed`, `failed`, `expired`)
- `watermarked` boolean
- `duration_ms` int nullable
- `resolution_width` int nullable
- `resolution_height` int nullable
- `file_size_bytes` bigint nullable
- `storage_bucket` text nullable
- `storage_path` text nullable
- `public_url` text nullable
- `error_message` text nullable
- `metadata` jsonb
- `download_count` int default 0
- `expires_at` timestamptz nullable
- `created_at` timestamptz
- `completed_at` timestamptz nullable

### `project_assets`
For audio, thumbnails, posters, uploaded source videos.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `user_id` uuid fk -> `profiles.user_id`
- `asset_type` text (`audio`, `thumbnail`, `uploaded_video`, `subtitle`, `poster`)
- `storage_bucket` text
- `storage_path` text
- `mime_type` text
- `file_size_bytes` bigint
- `metadata` jsonb
- `created_at` timestamptz

### `audio_generations`
For text-to-audio output.

Columns:
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `scene_id` uuid nullable fk -> `project_scenes.id`
- `user_id` uuid fk -> `profiles.user_id`
- `provider` text
- `voice_name` text
- `script_text` text
- `status` text
- `duration_ms` int nullable
- `storage_bucket` text nullable
- `storage_path` text nullable
- `metadata` jsonb
- `created_at` timestamptz

### `video_analysis_jobs`
For `video -> text timeline`.

Columns:
- `id` uuid pk
- `user_id` uuid fk -> `profiles.user_id`
- `project_id` uuid nullable fk -> `projects.id`
- `source_asset_id` uuid fk -> `project_assets.id`
- `provider` text
- `status` text
- `summary_text` text nullable
- `timeline_json` jsonb nullable
- `chapters_json` jsonb nullable
- `metadata` jsonb
- `created_at` timestamptz
- `completed_at` timestamptz nullable

## 10. Smart Line-Focus Engine

No heavy AI is required here.

### Goals
- detect lines likely to matter
- create focus moments
- improve viewer understanding
- keep animation deterministic and cheap

### Rule engine approach
Run a parser pipeline when project content is saved:

1. Split content into lines
2. Detect language if user did not select one
3. Score lines based on rules
4. Store matched lines and reasons
5. Use those scores during preview and export

### Rule examples

#### Structural keywords
High importance if line starts with:
- `function`
- `def`
- `class`
- `export default`
- `export const`
- `const`
- `let`
- `var`
- `async function`
- `app.`
- `router.`
- `handler`

#### Backend/API relevance
Boost if line contains:
- `auth`
- `api`
- `middleware`
- `handler`
- `validate`
- `schema`
- `token`
- `session`
- `jwt`
- `db`
- `query`
- `fetch`
- `await`
- `try`
- `catch`

#### Comment relevance
Boost comments that look explanatory:
- starts with `//`, `#`, `/*`
- contains `what`, `why`, `important`, `note`, `implementation`, `step`, `todo`, `warning`

Recommendation:
- explanations should live in comments directly above or beside the code they describe
- the renderer should treat explanation comments as first-class focus moments
- when a comment is highlighted, the following block should inherit a softer focus boost

#### Positional heuristics
- first non-empty line: mild boost
- function/class declaration: high boost
- return statements inside key functions: medium boost
- lines after explanatory comment: medium boost
- import block: low boost unless imported object matches keywords

### Example scoring
- declaration line: `+5`
- contains important backend keyword: `+3`
- explanatory comment: `+4`
- line after explanation comment: `+2`
- repeated trivial assignment: `+0` or `+1`

### Storage strategy
Two options:

1. Lightweight MVP:
   - store `important_lines_json` on `projects`
   - format:
   ```json
   [
     { "line": 1, "score": 5, "rule": "function_decl", "focusType": "zoom" },
     { "line": 8, "score": 8, "rule": "auth_handler", "focusType": "spotlight", "caption": "Auth check" }
   ]
   ```

2. Better long-term:
   - normalize into `important_line_rules`
   - easier for editing, analytics, and scene-level control

Recommendation:
- MVP: keep `important_lines_json` on `projects`
- V2: also populate `important_line_rules`

### How UI should use it
- draw subtle markers in line-number gutter
- optionally show “focus moments” list
- when typing reaches an important line:
  - slow slightly
  - brighten code block or line background
  - zoom camera to region
  - show small caption if present
  - pause 300ms to 1200ms depending on preset
- use stronger syntax coloring for declarations, comments, strings, and highlighted lines so the visual hierarchy is obvious in video

## 11. Aspect Ratios and Render Logic

Each project should support:
- `9:16`
- `16:9`
- both

### Recommendation
Treat each aspect ratio as a separate export job generated from the same project timeline.

### Why
- different framing
- different font sizes
- different safe areas
- different zoom ranges
- easier cacheability and retry behavior

### Layout rules

#### `9:16`
- larger font
- narrower visible code width
- fewer lines visible at once
- more aggressive vertical centering around active line
- captions placed top/bottom with mobile-safe margins

#### `16:9`
- more lines visible
- less aggressive zoom
- wider editor chrome
- more room for side caption or title

### Export model
User selects:
- vertical only
- landscape only
- both

Create one `exports` row per requested aspect ratio.

Example:
- project `abc`
- export request says both
- create:
  - export row `abc-vert`
  - export row `abc-land`

### UI handling
- project settings panel includes aspect ratio selector
- preview tabs for `9:16` and `16:9`
- keep one shared project timeline, two render configs

### Recommended render config shape
```ts
type RenderPreset = {
  aspectRatio: "9:16" | "16:9";
  width: number;
  height: number;
  fontSize: number;
  padding: number;
  lineHeight: number;
  cameraZoomMin: number;
  cameraZoomMax: number;
  maxVisibleLines: number;
  captionPosition: "top" | "bottom" | "right";
};
```

## 12. Storage Flow in Supabase

### Buckets

#### `project-assets`
Private bucket for source assets:
- uploaded videos
- thumbnails
- subtitles
- audio

#### `project-exports`
Private bucket for final stored exports

#### `public-previews` optional later
Only if you support shareable public samples

### Free tier flow
1. user creates project
2. browser renders locally
3. user downloads directly from browser
4. create `exports` row for analytics only
5. `storage_path` remains null
6. watermark enabled
7. file never stored in Supabase Storage

### Paid tier flow
1. user creates project
2. export generated in browser initially or server later
3. completed file uploaded to `project-exports`
4. `exports.storage_path` saved
5. storage retention enforced by plan
6. if export count exceeds plan, ask user to delete old exports or auto-prune based on user preference

### Retention enforcement
Do not silently delete paid exports by default.

Recommended behavior:
- block saving new stored export when limit reached
- allow local download without storage
- offer “replace oldest stored export” action
- optional auto-delete policy if user opts in

## 13. Recommended Next.js Folder Structure

```txt
src/
  app/
    (marketing)/
      page.tsx
      pricing/page.tsx
      examples/page.tsx
    (auth)/
      login/page.tsx
      signup/page.tsx
      callback/route.ts
    (dashboard)/
      dashboard/page.tsx
      projects/page.tsx
      projects/[projectId]/page.tsx
      projects/[projectId]/editor/page.tsx
      projects/[projectId]/exports/page.tsx
      history/page.tsx
      settings/page.tsx
    api/
      create-project/route.ts
      projects/[projectId]/route.ts
      projects/[projectId]/preview/route.ts
      export/route.ts
      exports/[exportId]/route.ts
      history/route.ts
      usage/route.ts
      billing/webhook/route.ts
      video-to-text/route.ts
      text-to-audio/route.ts
  components/
    auth/
    billing/
    dashboard/
    editor/
    export/
    landing/
    marketing/
    scene-builder/
    ui/
    video/
  features/
    auth/
    billing/
    editor/
    exports/
    projects/
    quotas/
    scenes/
    smart-focus/
    timeline/
    video-analysis/
    voice/
  hooks/
    use-current-user.ts
    use-project.ts
    use-project-exports.ts
    use-quota.ts
    use-render-preview.ts
  lib/
    supabase/
      browser.ts
      server.ts
      middleware.ts
    auth/
    billing/
    ffmpeg/
    gemini/
    render/
    quotas/
    validation/
  utils/
    aspect-ratio.ts
    code-language.ts
    duration.ts
    file.ts
    watermark.ts
  types/
    api.ts
    db.ts
    editor.ts
    project.ts
    quota.ts
    render.ts
  styles/
    globals.css
```

### Notes on structure
- keep `features/` for domain logic
- keep `components/` mostly presentational
- keep `lib/quotas` and `lib/render` very clean because they will become core IP
- avoid dumping business logic into route handlers

## 14. Minimal API Design

Use Next.js route handlers backed by Supabase and service modules.

### `POST /api/create-project`
Creates a new project.

Request:
```json
{
  "title": "API Gateway Intro",
  "projectType": "code_video",
  "sourceMode": "mixed",
  "primaryLanguage": "typescript",
  "aspectRatioMode": "both",
  "contentRaw": "#What API Gateway is?\n...\n```ts\nconst app = ...\n```"
}
```

Response:
```json
{
  "projectId": "uuid",
  "status": "created"
}
```

### `GET /api/projects/:projectId`
Returns project detail, scene data, important lines, and export summary.

### `PATCH /api/projects/:projectId`
Updates project content/settings.

### `POST /api/projects/:projectId/preview`
Generates preview config and timeline data for the browser renderer.

Response should include:
- resolved scenes
- important lines
- render presets for selected aspect ratios
- watermark flag
- effective quotas

### `POST /api/export`
Creates one or more export jobs.

Request:
```json
{
  "projectId": "uuid",
  "aspectRatios": ["9:16", "16:9"],
  "format": "mp4",
  "renderMode": "browser"
}
```

Response:
```json
{
  "jobs": [
    { "exportId": "uuid-1", "aspectRatio": "9:16", "uploadRequired": false },
    { "exportId": "uuid-2", "aspectRatio": "16:9", "uploadRequired": false }
  ]
}
```

### `POST /api/exports/:exportId/complete`
Called by client after successful browser rendering and optional upload.

Request:
```json
{
  "status": "completed",
  "durationMs": 18000,
  "fileSizeBytes": 4829381,
  "storagePath": "user-id/project-id/export-id-vertical.mp4"
}
```

### `GET /api/history`
List export history for the signed-in user.

Query params:
- `cursor`
- `limit`
- `projectId` optional

### `GET /api/usage`
Returns effective plan, quotas, and current usage.

### `POST /api/video-to-text`
Creates video analysis job.

### `POST /api/text-to-audio`
Creates TTS generation job.

## 15. Quota Enforcement Logic

Quota enforcement should happen in this order:

1. authenticate user
2. resolve active subscription
3. resolve plan features
4. apply feature overrides
5. read relevant counters
6. decide allow / deny / allow-with-degradation

### Examples

#### Free export
- allow preview
- deny if `downloads in rolling_24h >= 1`
- if allowed:
  - export must be watermarked
  - export not stored

#### Basic export
- allow if stored exports < 3 or user chooses local-only download
- no watermark

#### When storage is full
- allow local render/download
- block storage upload
- show upgrade or replace flow

### Important design rule
Not every over-limit action should become a hard error.

Preferred degradations:
- over storage limit -> local download only
- over premium narration limit -> fallback to disabled feature
- over render queue limit -> delayed or deny

## 16. Browser-First MVP Architecture

### MVP render path
- parse project content
- build timeline in JS
- render animated code scene to canvas/DOM
- capture via `MediaRecorder`
- export client-side

### Suggested libraries
- `Shiki` or `Prism` for syntax highlighting
- `Remotion` is tempting, but for strict MVP simplicity you can start with your own browser animation layer
- `ffmpeg.wasm` only if truly needed later, not day 1

### Why browser-first is right
- lowest infra cost
- simplest launch path
- good enough for short clips
- free tier becomes economically viable

### Known browser-first limitations
- low-end devices may struggle
- long exports may fail
- consistency across browsers is imperfect
- upload-after-render adds friction

### Rule for adding server rendering
Add server-side FFmpeg only when:
- users need longer exports
- users need reliable background rendering
- users need better consistency
- browsers become the bottleneck

## 17. Future Server-Side Render Path

### Recommended later stack
- Next.js app routes trigger job
- Supabase DB stores queue state
- background worker renders frames or composition
- FFmpeg generates MP4/WebM
- asset uploaded to Supabase Storage

### Worker options
- cheap VM worker
- container job
- serverless job if video duration remains short

### Caution
Do not make FFmpeg infrastructure the first hard problem. Let customer demand force that decision.

## 18. AI and Free-Resource Strategy

The product should remain useful even if all AI is turned off.

### Best AI use cases
- scene suggestions from prompt
- script cleanup
- caption generation
- narration text rewriting
- video summary with timestamps
- transcript/chapter extraction from uploaded video

### Suggested model usage

#### `Gemini 2.5 Flash`
Use for:
- prompt to scene outline
- code explanation draft
- caption suggestions
- project summary
- timeline JSON extraction

#### Google AI Studio / Gemini Developer API
Use as the cheapest flexible AI helper for early stage.

#### Video understanding
Use for:
- `video -> timestamped notes`
- `at this time this happened` timeline outputs

#### Native TTS
Use for:
- `text -> audio`
- scene narration voiceovers

### AI cost strategy
- free plan gets very small AI quota or no AI quota
- paid plans get bounded AI usage
- keep deterministic render path free of AI dependencies

### Strong recommendation
Do not let AI become mandatory for the core product. The core product should still be code/video animation.

## 19. Recommended Scene DSL

To support your example format, define a lightweight text format that can later compile into structured scenes.

Example:
```txt
#TITLE: API Gateway
#SCENE: intro
#TEXT: What is API Gateway?
#BODY:
API Gateway is a single entry point that routes, secures, and manages API traffic.

#SCENE: explanation
#TEXT: Why teams use it
#BODY:
It centralizes auth, rate limiting, monitoring, and routing.

#SCENE: code
#LANG: typescript
#TEXT: Basic implementation
const app = express()
app.use("/api", gatewayMiddleware)
app.get("/health", handler)

#SCENE: outro
#TEXT: Key takeaway
#BODY:
It simplifies external API access while keeping backend services modular.
```

Benefits:
- user-friendly
- parseable
- can support prompt-to-video workflows later

## 20. Edge Cases To Design For

### Quotas and billing
- free user deletes export and wants another same day
- user downgrades with too many stored exports
- user subscription payment fails mid-cycle
- user has manual support override
- user changes timezone, daily limits must still be deterministic

Recommendation:
- use rolling 24h for free downloads
- use UTC windows for monthly quotas
- on downgrade, keep existing assets read-only until user reduces usage

### Rendering
- browser tab closed during render
- mobile device too weak to render
- code too long for selected aspect ratio
- a single line is too long to fit vertical layout
- unknown language syntax highlighting
- special characters or long lines overflow
- multiline draft payload gets lost between editor and export step
- entire line appears at once instead of typing character-by-character
- insertion sound fires too sparsely instead of once per character
- syntax coloring is too flat and does not distinguish braces/punctuation clearly

Recommendation:
- autosave before render
- prefer ratio-aware wrapping over allowing text to go off-screen
- default to plain text highlighting if language not recognized
- validate `max_code_lines` and `max_line_length` before render begins
- store draft state in a dedicated client store before navigation to export steps
- use Zustand for editor/export draft persistence in the current implementation
- render logical lines character-by-character, then advance to the next line
- interpret speed sliders as render multipliers and expose them in the UI summary
- keep insertion audio volume user-adjustable
- use very short audio envelopes for per-character insertion sound so clicks stay crisp
- avoid arbitrary short maximum render durations when the content itself is longer
- base render timing on character count so the same speed setting feels consistent across lines

### Storage
- upload succeeds but DB update fails
- DB row exists but file missing
- file duplicates
- user hits storage cap mid-upload

Recommendation:
- use upload session IDs
- background reconciliation job later
- status transitions must be idempotent

### Security
- malicious huge text payloads
- script injection in captions/comments
- unauthorized file access
- abuse via automated free accounts

Recommendation:
- strict input validation
- HTML escaping/sanitization
- private buckets by default
- RLS on every user-owned table
- CAPTCHA + rate limit + email verification on suspicious activity

## 21. Recommended RLS Principles

For user-owned resources:
- user can only select their own rows
- user can only insert rows with `user_id = auth.uid()`
- user can only update/delete their own rows

For shared/public resources later:
- templates can be public read-only
- plan tables may be public read-only

Storage:
- users can read/write only paths under their namespace
- free non-stored exports skip Storage entirely

## 22. Analytics Events To Track

Track these early:
- signup_completed
- project_created
- project_previewed
- export_started
- export_completed
- export_failed
- export_downloaded
- upgrade_clicked
- upgrade_completed
- storage_limit_hit
- daily_download_limit_hit
- ai_feature_used
- video_to_text_completed
- audio_generated

These events will tell you whether users value:
- code-only exports
- mixed scene storytelling
- narration
- vertical vs landscape

## 23. Suggested MVP Scope For 2-4 Weeks

### Week 1
- Next.js app shell
- landing page
- Supabase auth
- social login
- project CRUD
- editor UI for raw code/text input
- theme selection
- aspect ratio selection

### Week 2
- deterministic typing animation
- syntax highlighting
- any-language project selection
- comment-based explanation handling
- smart line-focus MVP
- browser preview player

### Week 3
- browser export via `MediaRecorder`
- watermark for free users
- usage quota enforcement
- line-count and line-length validation
- export history table

### Week 4
- pricing page
- Stripe subscriptions
- stored export flow for paid users
- basic dashboard and limits UI

### MVP features to include
- text/code input
- any-language selection
- explanation comments inside code
- `9:16` and `16:9`
- single-project editor
- syntax-highlighted typing animation
- smart line focus
- browser export
- free plan daily limit
- paid storage for 3/10/25 exports
- landing page
- social login
- local demo logins for all plans
- focus-map editing for all non-empty lines
- separate normal and focused typing-speed sliders
- optional synthesized typing sound
- insertion volume control
- ratio-aware line wrapping
- character-by-character typing per logical line
- richer token coloring for comments, strings, keywords, braces, numbers, and punctuation

### MVP features to exclude
- server-side FFmpeg
- team collaboration
- enterprise SSO
- video-to-text
- text-to-audio
- public template marketplace

## 24. Phase 2 Plan

- text -> audio with Gemini TTS
- uploaded background audio
- scene-based storyboard editor
- video -> text timeline extraction
- scene templates
- better caption system
- public share pages
- saved brand presets

## 25. Phase 3 Plan

- server-side rendering
- long-form exports
- workspace/team support
- enterprise SSO
- collaboration/review comments
- template marketplace
- prompt-to-multi-scene video builder

## 26. Recommended Product Decisions

### What to build first
Build `Text/Code -> Video` first.

### What to build second
Build `Storyboard Composer`.

### What to build third
Build `Text -> Audio`.

### What to build fourth
Build `Video -> Text timeline`.

Reason:
- code/video is the core wedge
- storyboard unlocks broader use cases
- audio improves perceived quality
- video-to-text is valuable, but not the acquisition wedge

## 27. Clear Recommendation For Your SaaS

The best version of this product is:
- a deterministic technical content studio
- browser-first for MVP
- Supabase for auth/data/storage
- Stripe for billing
- Gemini for optional low-cost AI assistance
- strict quota tables for free/paid enforcement
- separate export records per aspect ratio
- scene-based architecture so code-only and explainer-style videos can coexist

## 28. Immediate Build Blueprint

If you start now, implement in this order:

1. Supabase auth and user profile
2. plans + plan_features + subscriptions + usage tables
3. project editor and save flow
4. rule-based important-line engine
5. browser preview renderer
6. browser export flow
7. watermark + daily free quota
8. paid storage limits
9. billing
10. only then add audio or video analysis

## 29. Current External Validation Notes

As of April 7, 2026:
- Supabase Auth supports social login and enterprise SSO, so your auth path is viable.
- Google Gemini Developer API currently offers official support for video understanding with timestamps and native text-to-speech, so your `video -> text timeline` and `text -> audio` ideas are realistic without building custom ML infrastructure.
- Existing competitors validate demand, but most still leave room for a vertical-video-first, scene-driven, creator-focused technical storytelling tool.

## 30. Final Recommendation

Start narrow, but design wide.

Narrow first release:
- code/text to animated video
- browser render
- vertical + landscape
- free daily download cap
- paid storage tiers

Design wide underneath:
- scene system
- quota engine
- AI helper layer
- audio and video-analysis pipelines

That gives you a product you can launch quickly without painting yourself into a corner.
