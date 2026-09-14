-- Additive migration: does not read, modify, or delete existing worktrack tables.
begin;
create table public.yeba_radar_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ai text not null check (ai in ('ChatGPT','Gemini','Perplexity')),
  question text not null check (length(btrim(question)) between 1 and 2000),
  answer text not null check (length(btrim(answer)) > 0 and length(answer) <= 60000),
  hospitals jsonb not null default '[]' check (jsonb_typeof(hospitals) = 'array' and jsonb_array_length(hospitals) <= 20),
  our_mention boolean not null default false,
  status text not null check (status in ('완료','실패')),
  source_url text not null default '' check (source_url = '' or source_url ~ '^https?://'),
  collection_method text not null default '비로그인 웹' check (collection_method in ('비로그인 웹','수동 입력 · 비로그인 웹','API')),
  saved_at timestamptz not null default now(),
  constraint yeba_radar_unique_result unique (user_id,date,ai,question),
  constraint yeba_radar_failure_excluded check (status <> '실패' or (not our_mention and hospitals = '[]'::jsonb))
);
create table public.yeba_radar_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  saved_at timestamptz not null default now()
);
alter table public.yeba_radar_records enable row level security;
alter table public.yeba_radar_settings enable row level security;
create policy yeba_radar_own_records on public.yeba_radar_records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy yeba_radar_own_settings on public.yeba_radar_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.yeba_radar_records, public.yeba_radar_settings from anon, authenticated;
grant select, insert, update on public.yeba_radar_records, public.yeba_radar_settings to authenticated;
create function public.yeba_radar_timestamp() returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.saved_at = now(); return new; end;
$$;
create trigger yeba_radar_record_saved before insert or update on public.yeba_radar_records
  for each row execute function public.yeba_radar_timestamp();
create trigger yeba_radar_setting_saved before insert or update on public.yeba_radar_settings
  for each row execute function public.yeba_radar_timestamp();
commit;
