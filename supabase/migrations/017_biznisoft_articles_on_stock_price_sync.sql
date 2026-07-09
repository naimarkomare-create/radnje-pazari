alter table public.stores add column if not exists biznisoft_storage_id integer;

create table if not exists public.biznisoft_stock_price_current (
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  name text null,
  barcode text null,
  unit text null,
  amount numeric null,
  wholesale_price numeric null,
  retail_price numeric null,
  modify_time timestamptz null,
  raw jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  primary key (storage_key, article_id)
);

create table if not exists public.biznisoft_stock_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_run_id uuid not null,
  snapshot_at timestamptz not null default now(),
  snapshot_date date not null default current_date,
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  name text null,
  barcode text null,
  unit text null,
  amount numeric null,
  wholesale_price numeric null,
  retail_price numeric null,
  modify_time timestamptz null,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (snapshot_run_id, storage_key, article_id)
);

create index if not exists idx_biznisoft_stock_price_snapshots_run
on public.biznisoft_stock_price_snapshots(snapshot_run_id);

create index if not exists idx_biznisoft_stock_price_snapshots_date
on public.biznisoft_stock_price_snapshots(snapshot_date);

create index if not exists idx_biznisoft_stock_price_snapshots_storage
on public.biznisoft_stock_price_snapshots(storage_key);

create index if not exists idx_biznisoft_stock_price_snapshots_article
on public.biznisoft_stock_price_snapshots(article_id);

create table if not exists public.biznisoft_price_changes (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz not null default now(),
  change_date date not null default current_date,
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  name text null,
  barcode text null,
  old_retail_price numeric null,
  new_retail_price numeric null,
  old_wholesale_price numeric null,
  new_wholesale_price numeric null,
  amount numeric null,
  status text not null default 'new' check (status in ('new', 'task_created', 'ignored')),
  task_created boolean not null default false,
  task_created_at timestamptz null,
  ignored_at timestamptz null,
  raw_old jsonb not null default '{}'::jsonb,
  raw_new jsonb not null default '{}'::jsonb,
  source_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.biznisoft_price_changes add column if not exists name text;
alter table public.biznisoft_price_changes add column if not exists barcode text;
alter table public.biznisoft_price_changes add column if not exists old_retail_price numeric;
alter table public.biznisoft_price_changes add column if not exists new_retail_price numeric;
alter table public.biznisoft_price_changes add column if not exists old_wholesale_price numeric;
alter table public.biznisoft_price_changes add column if not exists new_wholesale_price numeric;
alter table public.biznisoft_price_changes add column if not exists amount numeric;
alter table public.biznisoft_price_changes add column if not exists source_key text;

update public.biznisoft_price_changes
set source_key = 'legacy_price_change__' || id::text
where source_key is null;

alter table public.biznisoft_price_changes alter column source_key set not null;

create unique index if not exists idx_biznisoft_price_changes_source_key
on public.biznisoft_price_changes(source_key);

create index if not exists idx_biznisoft_stock_price_current_storage
on public.biznisoft_stock_price_current(storage_key);

create index if not exists idx_biznisoft_price_changes_date_status
on public.biznisoft_price_changes(change_date, status);

create index if not exists idx_biznisoft_price_changes_storage_key
on public.biznisoft_price_changes(storage_key);

alter table public.store_tasks add column if not exists source_type text;
alter table public.store_tasks add column if not exists source_key text;

create unique index if not exists idx_store_tasks_source_type_key_unique
on public.store_tasks(source_type, source_key)
where source_type is not null and source_key is not null;

alter table public.biznisoft_stock_price_current enable row level security;
alter table public.biznisoft_stock_price_snapshots enable row level security;
alter table public.biznisoft_price_changes enable row level security;

drop policy if exists "Admins manage biznisoft stock price current" on public.biznisoft_stock_price_current;
create policy "Admins manage biznisoft stock price current"
on public.biznisoft_stock_price_current
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins manage biznisoft stock price snapshots" on public.biznisoft_stock_price_snapshots;
create policy "Admins manage biznisoft stock price snapshots"
on public.biznisoft_stock_price_snapshots
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
