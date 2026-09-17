-- Neat Soon — Supabase schema
-- Run this whole file once in Supabase Dashboard → SQL Editor.

-- ───────────────────────────────────────────────────────────
-- Tables
-- ───────────────────────────────────────────────────────────

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  service_date  date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  position    integer not null default 0,
  title       text not null,
  lyrics      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sheet music / lyric images: object paths in the `song-images` storage bucket, in display order.
alter table public.songs add column if not exists image_paths text[] not null default '{}';

create table if not exists public.passages (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  position     integer not null default 0,
  book         text not null,
  chapter      integer,
  verse_start  integer,
  verse_end    integer,
  title        text not null default '',
  body         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.commentaries (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  position    integer not null default 0,
  title       text not null,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  position      integer not null default 0,
  title         text not null,
  body          text not null default '',
  is_important  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Users allowed to create / edit / delete content.
-- Rows are added manually by the project owner (see README).
create table if not exists public.editors (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists services_date_idx       on public.services (service_date desc);
create index if not exists songs_service_idx         on public.songs (service_id, position);
create index if not exists passages_service_idx      on public.passages (service_id, position);
create index if not exists commentaries_service_idx  on public.commentaries (service_id, position);
create index if not exists announcements_service_idx on public.announcements (service_id, position);

-- ───────────────────────────────────────────────────────────
-- updated_at trigger
-- ───────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['services', 'songs', 'passages', 'commentaries', 'announcements'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ───────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────

-- security definer so the check can read `editors` regardless of that table's RLS.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors where user_id = auth.uid());
$$;

revoke all on function public.is_editor() from public;
grant execute on function public.is_editor() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['services', 'songs', 'passages', 'commentaries', 'announcements'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Anyone can read" on public.%I', t);
    execute format('drop policy if exists "Editors can insert" on public.%I', t);
    execute format('drop policy if exists "Editors can update" on public.%I', t);
    execute format('drop policy if exists "Editors can delete" on public.%I', t);

    -- Reading is public so members can follow along without logging in.
    -- To require login for reading, change `to anon, authenticated` to `to authenticated`.
    execute format('create policy "Anyone can read" on public.%I
      for select to anon, authenticated using (true)', t);

    execute format('create policy "Editors can insert" on public.%I
      for insert to authenticated with check (public.is_editor())', t);
    execute format('create policy "Editors can update" on public.%I
      for update to authenticated using (public.is_editor()) with check (public.is_editor())', t);
    execute format('create policy "Editors can delete" on public.%I
      for delete to authenticated using (public.is_editor())', t);

    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- editors: a signed-in user may only see whether they themselves are an editor.
-- No insert/update/delete policies → only the dashboard / service role can change it.
alter table public.editors enable row level security;
drop policy if exists "Users can see own editor row" on public.editors;
create policy "Users can see own editor row" on public.editors
  for select to authenticated using (user_id = auth.uid());
revoke all on public.editors from anon;
grant select on public.editors to authenticated;

-- ───────────────────────────────────────────────────────────
-- Storage: song images
-- ───────────────────────────────────────────────────────────

-- Public bucket: images are viewable by URL without login (same as the rest of the content).
-- The app always uploads resized JPEGs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('song-images', 'song-images', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Editors can list song images" on storage.objects;
drop policy if exists "Editors can upload song images" on storage.objects;
drop policy if exists "Editors can update song images" on storage.objects;
drop policy if exists "Editors can delete song images" on storage.objects;

-- select is needed by the Storage API to remove objects.
create policy "Editors can list song images" on storage.objects
  for select to authenticated using (bucket_id = 'song-images' and public.is_editor());
create policy "Editors can upload song images" on storage.objects
  for insert to authenticated with check (bucket_id = 'song-images' and public.is_editor());
create policy "Editors can update song images" on storage.objects
  for update to authenticated
  using (bucket_id = 'song-images' and public.is_editor())
  with check (bucket_id = 'song-images' and public.is_editor());
create policy "Editors can delete song images" on storage.objects
  for delete to authenticated using (bucket_id = 'song-images' and public.is_editor());
