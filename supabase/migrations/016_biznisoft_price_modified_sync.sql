alter table public.stores add column if not exists biznisoft_storage_id integer;

create table if not exists public.biznisoft_article_modified_current (
  article_id integer primary key,
  modify_time timestamptz not null,
  last_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.biznisoft_pos_price_current (
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  price_without_vat numeric null,
  price_with_vat numeric null,
  basic_price_without_vat numeric null,
  basic_price_with_vat numeric null,
  discount_percent numeric null,
  action_discount_percent numeric null,
  action_valid_from timestamptz null,
  action_valid_to timestamptz null,
  checked_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  primary key (storage_key, article_id)
);

create table if not exists public.biznisoft_price_changes (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz not null default now(),
  change_date date not null default current_date,
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  old_price_with_vat numeric null,
  new_price_with_vat numeric null,
  old_price_without_vat numeric null,
  new_price_without_vat numeric null,
  old_basic_price_with_vat numeric null,
  new_basic_price_with_vat numeric null,
  old_action_valid_from timestamptz null,
  new_action_valid_from timestamptz null,
  old_action_valid_to timestamptz null,
  new_action_valid_to timestamptz null,
  article_modify_time timestamptz null,
  status text not null default 'new' check (status in ('new', 'task_created', 'ignored')),
  task_created boolean not null default false,
  task_created_at timestamptz null,
  ignored_at timestamptz null,
  raw_old jsonb not null default '{}'::jsonb,
  raw_new jsonb not null default '{}'::jsonb,
  source_key text not null
);

alter table public.biznisoft_price_changes add column if not exists old_price_with_vat numeric;
alter table public.biznisoft_price_changes add column if not exists new_price_with_vat numeric;
alter table public.biznisoft_price_changes add column if not exists old_price_without_vat numeric;
alter table public.biznisoft_price_changes add column if not exists new_price_without_vat numeric;
alter table public.biznisoft_price_changes add column if not exists old_basic_price_with_vat numeric;
alter table public.biznisoft_price_changes add column if not exists new_basic_price_with_vat numeric;
alter table public.biznisoft_price_changes add column if not exists old_action_valid_from timestamptz;
alter table public.biznisoft_price_changes add column if not exists new_action_valid_from timestamptz;
alter table public.biznisoft_price_changes add column if not exists old_action_valid_to timestamptz;
alter table public.biznisoft_price_changes add column if not exists new_action_valid_to timestamptz;
alter table public.biznisoft_price_changes add column if not exists article_modify_time timestamptz;
alter table public.biznisoft_price_changes add column if not exists source_key text;

update public.biznisoft_price_changes
set source_key = 'legacy_price_change__' || id::text
where source_key is null;

alter table public.biznisoft_price_changes alter column source_key set not null;

create unique index if not exists idx_biznisoft_price_changes_source_key
on public.biznisoft_price_changes(source_key);

create index if not exists idx_biznisoft_article_modified_seen
on public.biznisoft_article_modified_current(last_seen_at);

create index if not exists idx_biznisoft_pos_price_current_storage
on public.biznisoft_pos_price_current(storage_key);

create index if not exists idx_biznisoft_price_changes_date_status
on public.biznisoft_price_changes(change_date, status);

create index if not exists idx_biznisoft_price_changes_storage
on public.biznisoft_price_changes(storage_key);

alter table public.store_tasks add column if not exists source_type text;
alter table public.store_tasks add column if not exists source_key text;

create unique index if not exists idx_store_tasks_source_type_key_unique
on public.store_tasks(source_type, source_key)
where source_type is not null and source_key is not null;

alter table public.biznisoft_article_modified_current enable row level security;
alter table public.biznisoft_pos_price_current enable row level security;
alter table public.biznisoft_price_changes enable row level security;

drop policy if exists "Admins manage biznisoft article modified current" on public.biznisoft_article_modified_current;
create policy "Admins manage biznisoft article modified current"
on public.biznisoft_article_modified_current
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins manage biznisoft pos price current" on public.biznisoft_pos_price_current;
create policy "Admins manage biznisoft pos price current"
on public.biznisoft_pos_price_current
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins manage biznisoft price changes" on public.biznisoft_price_changes;
create policy "Admins manage biznisoft price changes"
on public.biznisoft_price_changes
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

notify pgrst, 'reload schema';
