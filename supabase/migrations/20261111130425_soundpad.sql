create table public.sound_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name))
);

create unique index sound_categories_name_unique on public.sound_categories (lower(name));

create table public.sounds (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'ready', 'deleting')),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  category_id uuid references public.sound_categories(id) on delete restrict,
  source_name text not null check (char_length(source_name) between 1 and 255),
  source_kind text not null check (source_kind in ('mp3', 'wav', 'm4a')),
  source_bytes integer not null check (source_bytes between 1 and 50000000),
  source_duration_ms integer check (source_duration_ms between 250 and 1800000),
  waveform real[] check (cardinality(waveform) between 1 and 640),
  trim_start_ms integer,
  trim_end_ms integer,
  duration_ms integer,
  clip_path text,
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  check (status <> 'ready' or (
    category_id is not null and clip_path is not null and waveform is not null and
    source_duration_ms is not null and trim_start_ms is not null and
    trim_end_ms is not null and duration_ms is not null and
    trim_start_ms >= 0 and trim_end_ms <= source_duration_ms and
    duration_ms = trim_end_ms - trim_start_ms and duration_ms between 250 and 120000
  )),
  check (clip_path is null or clip_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.mp3$'))
);
create index sounds_category_id_idx on public.sounds (category_id);

alter table public.sound_categories enable row level security;
alter table public.sounds enable row level security;

revoke all on public.sound_categories, public.sounds from anon, authenticated;
grant select (id, name) on public.sound_categories to anon;
grant select (id, name, category_id, duration_ms, clip_path, created_at) on public.sounds to anon;
grant select, insert, update, delete on public.sound_categories, public.sounds to authenticated, service_role;

create policy "Public reads categories" on public.sound_categories for select to anon using (true);
create policy "Public reads ready sounds" on public.sounds for select to anon using (status = 'ready');

create policy "Soundpad admin manages categories" on public.sound_categories for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true');
create policy "Soundpad admin manages sounds" on public.sounds for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('soundpad-sources', 'soundpad-sources', false, 50000000, array['audio/mpeg', 'audio/wav', 'audio/mp4']),
  ('soundpad-clips', 'soundpad-clips', true, 2500000, array['audio/mpeg']);

create policy "Soundpad admin reads audio objects" on storage.objects for select to authenticated
  using (bucket_id in ('soundpad-sources', 'soundpad-clips')
    and (select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true');
create policy "Soundpad admin uploads audio objects" on storage.objects for insert to authenticated
  with check (bucket_id in ('soundpad-sources', 'soundpad-clips')
    and (select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true');
create policy "Soundpad admin deletes audio objects" on storage.objects for delete to authenticated
  using (bucket_id in ('soundpad-sources', 'soundpad-clips')
    and (select auth.jwt() -> 'app_metadata' ->> 'soundpad_admin') = 'true');
