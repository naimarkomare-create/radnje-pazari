-- Admin-only write-off inventory drafts. These rows are the immutable source
-- for the two exports; no BizniSoft document is created by this module.
create table if not exists public.writeoff_lists (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  store_id uuid not null references public.stores(id) on delete restrict,
  supplier_id uuid not null references public.biznisoft_suppliers(id) on delete restrict,
  supplier_name text not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.writeoff_list_items (
  id uuid primary key default gen_random_uuid(),
  writeoff_list_id uuid not null references public.writeoff_lists(id) on delete cascade,
  client_entry_id uuid not null unique,
  store_id uuid not null references public.stores(id) on delete restrict,
  supplier_id uuid not null references public.biznisoft_suppliers(id) on delete restrict,
  article_id integer not null,
  article_code text,
  barcode text not null,
  article_name text not null,
  unit text,
  quantity numeric not null check (quantity > 0),
  expiration_date date not null,
  stock_amount numeric,
  stock_fetched_at timestamptz,
  price numeric,
  level_price numeric,
  account text,
  popdv_id text,
  vat_transaction_type text,
  operator_name text,
  modify_time timestamptz,
  supplier_name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writeoff_list_items_store_supplier_check check (store_id is not null and supplier_id is not null)
);

create index if not exists writeoff_lists_store_id_idx on public.writeoff_lists(store_id);
create index if not exists writeoff_lists_status_idx on public.writeoff_lists(status);
create index if not exists writeoff_lists_updated_at_idx on public.writeoff_lists(updated_at desc);
create index if not exists writeoff_list_items_list_id_idx on public.writeoff_list_items(writeoff_list_id, created_at);
create index if not exists writeoff_list_items_article_id_idx on public.writeoff_list_items(article_id);
create index if not exists writeoff_list_items_expiration_idx on public.writeoff_list_items(expiration_date);

create or replace function public.set_writeoff_list_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_writeoff_lists_updated_at on public.writeoff_lists;
create trigger set_writeoff_lists_updated_at
before update on public.writeoff_lists
for each row execute function public.set_writeoff_list_updated_at();

drop trigger if exists set_writeoff_list_items_updated_at on public.writeoff_list_items;
create trigger set_writeoff_list_items_updated_at
before update on public.writeoff_list_items
for each row execute function public.set_writeoff_list_updated_at();

alter table public.writeoff_lists enable row level security;
alter table public.writeoff_list_items enable row level security;

drop policy if exists "admins can manage writeoff lists" on public.writeoff_lists;
create policy "admins can manage writeoff lists"
on public.writeoff_lists for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins can manage writeoff list items" on public.writeoff_list_items;
create policy "admins can manage writeoff list items"
on public.writeoff_list_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

comment on table public.writeoff_lists is
'Admin-only expired-stock write-off drafts. Export only; never creates or posts a BizniSoft document.';
comment on table public.writeoff_list_items is
'Confirmed article/expiration lines for write-off exports, including snapshots needed for reconciliation.';

notify pgrst, 'reload schema';
