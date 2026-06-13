create table if not exists public.biznisoft_articles (
  article_id integer primary key,
  name text,
  barcode text,
  cat_no text,
  unit text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

alter table public.biznisoft_articles enable row level security;

drop policy if exists "admins can manage biznisoft articles" on public.biznisoft_articles;
create policy "admins can manage biznisoft articles"
on public.biznisoft_articles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.biznisoft_sale_actions add column if not exists article_attribute_id int;

drop index if exists public.biznisoft_sale_actions_unique_idx;

create unique index if not exists biznisoft_sale_actions_unique_idx
on public.biznisoft_sale_actions (
  action_type,
  storage_id,
  article_id,
  article_attribute_id,
  from_chapter,
  chapter_to
) nulls not distinct;

create index if not exists biznisoft_sale_actions_article_id_idx
on public.biznisoft_sale_actions(article_id);

create index if not exists biznisoft_sale_actions_article_attribute_id_idx
on public.biznisoft_sale_actions(article_attribute_id);
