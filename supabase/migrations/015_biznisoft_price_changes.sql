create table if not exists public.biznisoft_price_current (
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  price numeric null,
  price_rsd numeric null,
  effective_price numeric null,
  date_from timestamptz null,
  date_to timestamptz null,
  raw jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  primary key (storage_key, article_id)
);

create table if not exists public.biznisoft_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_run_id uuid not null,
  snapshot_at timestamptz not null default now(),
  snapshot_date date not null default current_date,
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  price numeric null,
  price_rsd numeric null,
  effective_price numeric null,
  date_from timestamptz null,
  date_to timestamptz null,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (snapshot_run_id, storage_key, article_id)
);

create index if not exists idx_biznisoft_price_snapshots_run
on public.biznisoft_price_snapshots(snapshot_run_id);

create index if not exists idx_biznisoft_price_snapshots_date
on public.biznisoft_price_snapshots(snapshot_date);

create index if not exists idx_biznisoft_price_snapshots_storage
on public.biznisoft_price_snapshots(storage_key);

create index if not exists idx_biznisoft_price_snapshots_article
on public.biznisoft_price_snapshots(article_id);

create table if not exists public.biznisoft_price_changes (
  id uuid primary key default gen_random_uuid(),
  change_date date not null default current_date,
  detected_at timestamptz not null default now(),
  storage_key text not null,
  storage_id integer null,
  article_id integer not null,
  old_price numeric null,
  new_price numeric null,
  old_price_rsd numeric null,
  new_price_rsd numeric null,
  old_effective_price numeric null,
  new_effective_price numeric null,
  status text not null default 'new' check (status in ('new', 'task_created', 'ignored')),
  task_created boolean not null default false,
  task_created_at timestamptz null,
  ignored_at timestamptz null,
  raw_old jsonb not null default '{}'::jsonb,
  raw_new jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (change_date, storage_key, article_id, old_effective_price, new_effective_price)
);

create index if not exists idx_biznisoft_price_changes_date
on public.biznisoft_price_changes(change_date);

create index if not exists idx_biznisoft_price_changes_storage
on public.biznisoft_price_changes(storage_key);

create index if not exists idx_biznisoft_price_changes_article
on public.biznisoft_price_changes(article_id);

create index if not exists idx_biznisoft_price_changes_status
on public.biznisoft_price_changes(status);

alter table public.store_tasks add column if not exists source_type text;
alter table public.store_tasks add column if not exists source_key text;

create unique index if not exists idx_store_tasks_source_type_key_unique
on public.store_tasks(source_type, source_key)
where source_type is not null and source_key is not null;

alter table public.biznisoft_price_current enable row level security;
alter table public.biznisoft_price_snapshots enable row level security;
alter table public.biznisoft_price_changes enable row level security;

drop policy if exists "Admins manage biznisoft price current" on public.biznisoft_price_current;
create policy "Admins manage biznisoft price current"
on public.biznisoft_price_current
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins manage biznisoft price snapshots" on public.biznisoft_price_snapshots;
create policy "Admins manage biznisoft price snapshots"
on public.biznisoft_price_snapshots
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
