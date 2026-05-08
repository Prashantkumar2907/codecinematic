create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  default_language text,
  default_aspect_ratio text,
  onboarding_state text not null default 'new',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly_usd numeric(10,2) not null default 0,
  price_yearly_usd numeric(10,2),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  feature_type text not null check (feature_type in ('boolean', 'integer', 'string', 'json')),
  feature_value_boolean boolean,
  feature_value_integer bigint,
  feature_value_string text,
  feature_value_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (plan_id, feature_key)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  metric_key text not null,
  window_type text not null check (window_type in ('day', 'month', 'rolling_24h', 'lifetime')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  usage_count bigint not null default 0,
  usage_value bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, metric_key, window_type, window_start)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  project_id uuid,
  export_id uuid,
  metric_key text not null,
  event_type text not null,
  delta_count int not null default 1,
  delta_value bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feature_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  feature_key text not null,
  override_type text not null check (override_type in ('set', 'increment', 'disable')),
  value_boolean boolean,
  value_integer bigint,
  value_json jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  slug text,
  project_type text not null default 'code_video',
  status text not null default 'draft',
  source_mode text not null default 'mixed' check (source_mode in ('code_only', 'scripted', 'mixed')),
  primary_language text not null default 'typescript',
  supported_languages_json jsonb not null default '[]'::jsonb,
  content_raw text not null default '',
  content_structured jsonb not null default '{}'::jsonb,
  aspect_ratio_mode text not null default 'both' check (aspect_ratio_mode in ('9:16', '16:9', 'both')),
  important_lines_json jsonb not null default '[]'::jsonb,
  max_line_count_applied int not null default 120,
  max_line_length_applied int not null default 90,
  total_line_count int not null default 0,
  longest_line_length int not null default 0,
  estimated_duration_ms int,
  is_public boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_order int not null,
  scene_type text not null,
  title text,
  content_text text,
  content_code text,
  language text,
  duration_ms int,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.important_line_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.project_scenes(id) on delete cascade,
  line_number int not null,
  line_text text not null default '',
  rule_key text not null,
  importance_score numeric(8,2) not null default 0,
  focus_type text not null default 'spotlight',
  caption_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  aspect_ratio text not null check (aspect_ratio in ('9:16', '16:9')),
  export_format text not null default 'mp4',
  render_mode text not null default 'browser' check (render_mode in ('browser', 'server')),
  status text not null default 'queued',
  watermarked boolean not null default true,
  duration_ms int,
  resolution_width int,
  resolution_height int,
  file_size_bytes bigint,
  storage_bucket text,
  storage_path text,
  public_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  download_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usage_events_project_fk'
  ) then
    alter table public.usage_events
      add constraint usage_events_project_fk
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usage_events_export_fk'
  ) then
    alter table public.usage_events
      add constraint usage_events_export_fk
      foreign key (export_id) references public.exports(id) on delete set null;
  end if;
end $$;

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  asset_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audio_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.project_scenes(id) on delete set null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null,
  voice_name text,
  script_text text not null,
  status text not null default 'queued',
  duration_ms int,
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.video_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source_asset_id uuid not null references public.project_assets(id) on delete cascade,
  provider text not null,
  status text not null default 'queued',
  summary_text text,
  timeline_json jsonb,
  chapters_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_status_check'
  ) then
    alter table public.projects
      add constraint projects_status_check
      check (status in ('draft', 'ready', 'rendering', 'completed', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exports_status_check'
  ) then
    alter table public.exports
      add constraint exports_status_check
      check (status in ('queued', 'rendering', 'completed', 'failed', 'expired'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_status_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_status_check
      check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_scenes_project_order_unique'
  ) then
    alter table public.project_scenes
      add constraint project_scenes_project_order_unique unique (project_id, scene_order);
  end if;
end $$;

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_projects_user_updated on public.projects(user_id, updated_at desc);
create index if not exists idx_projects_public_updated on public.projects(is_public, updated_at desc) where is_public = true;
create index if not exists idx_projects_slug on public.projects(slug) where slug is not null;
create index if not exists idx_project_scenes_project_id on public.project_scenes(project_id);
create index if not exists idx_project_scenes_project_order on public.project_scenes(project_id, scene_order);
create index if not exists idx_exports_user_id on public.exports(user_id);
create index if not exists idx_exports_user_created on public.exports(user_id, created_at desc);
create index if not exists idx_exports_project_id on public.exports(project_id);
create index if not exists idx_exports_status_created on public.exports(status, created_at desc);
create index if not exists idx_plan_features_plan_id on public.plan_features(plan_id);
create index if not exists idx_plan_features_feature_key on public.plan_features(feature_key);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_user_status_period on public.subscriptions(user_id, status, current_period_end desc);
create index if not exists idx_subscriptions_plan_id on public.subscriptions(plan_id);
create unique index if not exists idx_subscriptions_provider_subscription_id on public.subscriptions(provider_subscription_id) where provider_subscription_id is not null;
create index if not exists idx_usage_counters_user_metric on public.usage_counters(user_id, metric_key);
create index if not exists idx_usage_events_user_id on public.usage_events(user_id);
create index if not exists idx_usage_events_user_created on public.usage_events(user_id, created_at desc);
create index if not exists idx_usage_events_project_id on public.usage_events(project_id);
create index if not exists idx_usage_events_export_id on public.usage_events(export_id);
create index if not exists idx_feature_overrides_user_id on public.feature_overrides(user_id);
create index if not exists idx_important_line_rules_project on public.important_line_rules(project_id);
create index if not exists idx_important_line_rules_scene_id on public.important_line_rules(scene_id);
create index if not exists idx_project_assets_project_id on public.project_assets(project_id);
create index if not exists idx_project_assets_user_id on public.project_assets(user_id);
create index if not exists idx_audio_generations_project_id on public.audio_generations(project_id);
create index if not exists idx_audio_generations_scene_id on public.audio_generations(scene_id);
create index if not exists idx_audio_generations_user_id on public.audio_generations(user_id);
create index if not exists idx_audio_generations_status_created on public.audio_generations(status, created_at desc);
create index if not exists idx_video_analysis_jobs_user_id on public.video_analysis_jobs(user_id);
create index if not exists idx_video_analysis_jobs_project_id on public.video_analysis_jobs(project_id);
create index if not exists idx_video_analysis_jobs_source_asset_id on public.video_analysis_jobs(source_asset_id);
create index if not exists idx_video_analysis_jobs_status_created on public.video_analysis_jobs(status, created_at desc);

alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.usage_events enable row level security;
alter table public.feature_overrides enable row level security;
alter table public.projects enable row level security;
alter table public.project_scenes enable row level security;
alter table public.important_line_rules enable row level security;
alter table public.exports enable row level security;
alter table public.project_assets enable row level security;
alter table public.audio_generations enable row level security;
alter table public.video_analysis_jobs enable row level security;

create policy "plans_public_read" on public.plans for select using (true);
create policy "plan_features_public_read" on public.plan_features for select using (true);

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id);

create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "usage_counters_select_own" on public.usage_counters for select using (auth.uid() = user_id);
create policy "usage_events_select_own" on public.usage_events for select using (auth.uid() = user_id);
create policy "feature_overrides_select_own" on public.feature_overrides for select using (auth.uid() = user_id);

create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

create policy "project_scenes_select_own" on public.project_scenes for select using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "project_scenes_insert_own" on public.project_scenes for insert with check (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "project_scenes_update_own" on public.project_scenes for update using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "project_scenes_delete_own" on public.project_scenes for delete using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

create policy "important_line_rules_select_own" on public.important_line_rules for select using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "important_line_rules_insert_own" on public.important_line_rules for insert with check (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "important_line_rules_update_own" on public.important_line_rules for update using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);
create policy "important_line_rules_delete_own" on public.important_line_rules for delete using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

create policy "exports_select_own" on public.exports for select using (auth.uid() = user_id);
create policy "exports_insert_own" on public.exports for insert with check (auth.uid() = user_id);
create policy "exports_update_own" on public.exports for update using (auth.uid() = user_id);
create policy "exports_delete_own" on public.exports for delete using (auth.uid() = user_id);

create policy "project_assets_select_own" on public.project_assets for select using (auth.uid() = user_id);
create policy "project_assets_insert_own" on public.project_assets for insert with check (auth.uid() = user_id);
create policy "project_assets_update_own" on public.project_assets for update using (auth.uid() = user_id);
create policy "project_assets_delete_own" on public.project_assets for delete using (auth.uid() = user_id);

create policy "audio_generations_select_own" on public.audio_generations for select using (auth.uid() = user_id);
create policy "audio_generations_insert_own" on public.audio_generations for insert with check (auth.uid() = user_id);
create policy "audio_generations_update_own" on public.audio_generations for update using (auth.uid() = user_id);

create policy "video_analysis_jobs_select_own" on public.video_analysis_jobs for select using (auth.uid() = user_id);
create policy "video_analysis_jobs_insert_own" on public.video_analysis_jobs for insert with check (auth.uid() = user_id);
create policy "video_analysis_jobs_update_own" on public.video_analysis_jobs for update using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.plans (code, name, description, price_monthly_usd, sort_order)
values
  ('free', 'Free', 'Watermarked browser export with strict daily download limit.', 0, 1),
  ('basic', 'Basic', 'Solo creator plan with 3 stored exports.', 19, 2),
  ('medium', 'Medium', 'Active creator plan with 10 stored exports.', 39, 3),
  ('high', 'High', 'Power plan with 25 stored exports and higher usage limits.', 79, 4)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_monthly_usd = excluded.price_monthly_usd,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

with plan_map as (
  select code, id from public.plans
)
insert into public.plan_features (
  plan_id,
  feature_key,
  feature_type,
  feature_value_boolean,
  feature_value_integer
)
select p.id, f.feature_key, f.feature_type, f.feature_value_boolean, f.feature_value_integer
from plan_map p
join (
  values
    ('free', 'watermark_enabled', 'boolean', true, null),
    ('free', 'max_stored_exports', 'integer', null, 0),
    ('free', 'max_daily_downloads', 'integer', null, 1),
    ('free', 'max_code_lines', 'integer', null, 120),
    ('free', 'max_line_length', 'integer', null, 90),
    ('basic', 'watermark_enabled', 'boolean', false, null),
    ('basic', 'max_stored_exports', 'integer', null, 3),
    ('basic', 'max_daily_downloads', 'integer', null, 10),
    ('basic', 'max_code_lines', 'integer', null, 400),
    ('basic', 'max_line_length', 'integer', null, 110),
    ('medium', 'watermark_enabled', 'boolean', false, null),
    ('medium', 'max_stored_exports', 'integer', null, 10),
    ('medium', 'max_daily_downloads', 'integer', null, 40),
    ('medium', 'max_code_lines', 'integer', null, 1000),
    ('medium', 'max_line_length', 'integer', null, 120),
    ('high', 'watermark_enabled', 'boolean', false, null),
    ('high', 'max_stored_exports', 'integer', null, 25),
    ('high', 'max_daily_downloads', 'integer', null, 120),
    ('high', 'max_code_lines', 'integer', null, 2500),
    ('high', 'max_line_length', 'integer', null, 140)
) as f(plan_code, feature_key, feature_type, feature_value_boolean, feature_value_integer)
  on p.code = f.plan_code
on conflict (plan_id, feature_key) do update
set
  feature_type = excluded.feature_type,
  feature_value_boolean = excluded.feature_value_boolean,
  feature_value_integer = excluded.feature_value_integer;
