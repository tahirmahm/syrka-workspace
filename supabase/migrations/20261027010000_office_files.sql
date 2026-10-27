-- Apply once in the Supabase SQL editor or with `supabase db push`.
create table public.office_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('doc','sheet','slides')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  starred boolean not null default false,
  updated_at timestamptz not null default now()
);
create index office_files_owner_recent_idx on public.office_files (owner_id, updated_at desc);
alter table public.office_files enable row level security;
revoke all on public.office_files from anon;
grant select, insert, update, delete on public.office_files to authenticated;
create policy "Read own files" on public.office_files for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "Create own files" on public.office_files for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy "Update own files" on public.office_files for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Delete own files" on public.office_files for delete to authenticated
using ((select auth.uid()) = owner_id);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-assets', 'office-assets', false, 5242880, array['image/png','image/jpeg','image/webp','image/gif']);
create policy "Upload own images" on storage.objects for insert to authenticated
with check (bucket_id = 'office-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Read own images" on storage.objects for select to authenticated
using (bucket_id = 'office-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own images" on storage.objects for delete to authenticated
using (bucket_id = 'office-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: uploads use random, immutable paths and never overwrite.
