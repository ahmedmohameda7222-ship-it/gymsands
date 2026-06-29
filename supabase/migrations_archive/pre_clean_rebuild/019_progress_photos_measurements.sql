create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_entry_id uuid references public.progress_entries(id) on delete set null,
  photo_type text not null default 'front' check (photo_type in ('front', 'side', 'back')),
  taken_on date not null default current_date,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.progress_photos
  add column if not exists photo_type text not null default 'front';

alter table public.progress_photos
  add column if not exists taken_on date not null default current_date;

alter table public.body_measurements
  add column if not exists body_fat_percent numeric;

alter table public.body_measurements
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_progress_photos_user_date
on public.progress_photos(user_id, taken_on desc, created_at desc);

create index if not exists idx_body_measurements_user_measured
on public.body_measurements(user_id, measured_at desc);

alter table public.progress_photos enable row level security;
alter table public.body_measurements enable row level security;

drop policy if exists "progress_photos_owner_select" on public.progress_photos;
create policy "progress_photos_owner_select"
on public.progress_photos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "progress_photos_owner_insert" on public.progress_photos;
create policy "progress_photos_owner_insert"
on public.progress_photos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "progress_photos_owner_delete" on public.progress_photos;
create policy "progress_photos_owner_delete"
on public.progress_photos
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_select" on public.body_measurements;
create policy "body_measurements_owner_select"
on public.body_measurements
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_insert" on public.body_measurements;
create policy "body_measurements_owner_insert"
on public.body_measurements
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_update" on public.body_measurements;
create policy "body_measurements_owner_update"
on public.body_measurements
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_delete" on public.body_measurements;
create policy "body_measurements_owner_delete"
on public.body_measurements
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "progress_photos_storage_owner_select" on storage.objects;
create policy "progress_photos_storage_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_insert" on storage.objects;
create policy "progress_photos_storage_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_update" on storage.objects;
create policy "progress_photos_storage_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_delete" on storage.objects;
create policy "progress_photos_storage_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
