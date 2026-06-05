create table if not exists public.produce_shelf_photo_checks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  check_date date not null,
  photo_url text not null,
  storage_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists produce_shelf_photo_checks_store_date_idx
on public.produce_shelf_photo_checks(store_id, check_date desc);

create index if not exists produce_shelf_photo_checks_date_idx
on public.produce_shelf_photo_checks(check_date desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shelf-photos',
  'shelf-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.produce_shelf_photo_checks enable row level security;

drop policy if exists "admins can view shelf photo checks" on public.produce_shelf_photo_checks;
create policy "admins can view shelf photo checks"
on public.produce_shelf_photo_checks for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own shelf photo checks" on public.produce_shelf_photo_checks;
create policy "store users can view own shelf photo checks"
on public.produce_shelf_photo_checks for select
to authenticated
using (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own shelf photo checks" on public.produce_shelf_photo_checks;
create policy "store users can insert own shelf photo checks"
on public.produce_shelf_photo_checks for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and storage_path like ('shelf-photos/' || check_date::text || '/' || store_id::text || '/%')
);

drop policy if exists "admins can view shelf photo files" on storage.objects;
create policy "admins can view shelf photo files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shelf-photos'
  and public.is_admin()
);

drop policy if exists "store users can view own shelf photo files" on storage.objects;
create policy "store users can view own shelf photo files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shelf-photos'
  and public.current_user_role() = 'store'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2)::uuid = public.current_user_store_id()
);

drop policy if exists "store users can upload own shelf photo files" on storage.objects;
create policy "store users can upload own shelf photo files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shelf-photos'
  and public.current_user_role() = 'store'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2)::uuid = public.current_user_store_id()
);
