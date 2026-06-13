create table if not exists public.biznisoft_sale_actions (
  id uuid primary key default gen_random_uuid(),
  action_type int not null,
  loyalty_level int,
  storage_id int,
  article_id int,
  discount_percent numeric,
  wholesale_price numeric,
  retail_price numeric,
  from_chapter timestamptz,
  chapter_to timestamptz,
  priority_level int,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create unique index if not exists biznisoft_sale_actions_unique_idx
on public.biznisoft_sale_actions (
  action_type,
  storage_id,
  article_id,
  from_chapter,
  chapter_to
) nulls not distinct;

create index if not exists biznisoft_sale_actions_storage_id_idx
on public.biznisoft_sale_actions(storage_id);

create index if not exists biznisoft_sale_actions_from_chapter_idx
on public.biznisoft_sale_actions(from_chapter);

create index if not exists biznisoft_sale_actions_chapter_to_idx
on public.biznisoft_sale_actions(chapter_to);

alter table public.biznisoft_sale_actions enable row level security;

drop policy if exists "admins can manage biznisoft sale actions" on public.biznisoft_sale_actions;
create policy "admins can manage biznisoft sale actions"
on public.biznisoft_sale_actions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.store_tasks add column if not exists source_type text;
alter table public.store_tasks add column if not exists source_key text;

create unique index if not exists store_tasks_source_key_unique_idx
on public.store_tasks(source_key)
where source_key is not null;
