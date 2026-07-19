-- BizniSoft suppliers used by the existing return proposal workflow.
-- Suppliers are partners observed on purchase calculation documents.
create table if not exists public.biznisoft_suppliers (
  id uuid primary key default gen_random_uuid(),
  biznisoft_partner_id text not null unique,
  name text not null,
  code text,
  tax_id text,
  registration_number text,
  phone text,
  email text,
  address text,
  city text,
  attributes jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A relation is created only from an explicit BizniSoft purchase calculation
-- master/detail pair. There is intentionally no primary-supplier flag because
-- the available BizniSoft item types do not expose one.
create table if not exists public.article_suppliers (
  id uuid primary key default gen_random_uuid(),
  article_id integer not null,
  supplier_id uuid not null references public.biznisoft_suppliers(id) on delete cascade,
  biznisoft_article_id text,
  relation_source text not null default 'purchase_calculation',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_suppliers_article_supplier_unique unique (article_id, supplier_id)
);

-- GetItems for calculation details requires one CalcNo at a time. Tracking
-- completed documents keeps subsequent manual syncs incremental and idempotent.
create table if not exists public.biznisoft_supplier_relation_documents (
  company_year integer not null,
  storage_id integer not null,
  calculation_no integer not null,
  partner_id text not null,
  document_date date,
  synced_at timestamptz not null default now(),
  primary key (company_year, storage_id, calculation_no)
);

-- Supplier data on return items is a snapshot. Old rows stay valid, and
-- supplier names remain visible even if the supplier record later changes.
alter table public.return_proposal_items
add column if not exists supplier_id uuid references public.biznisoft_suppliers(id) on delete set null;

alter table public.return_proposal_items
add column if not exists supplier_partner_id text;

alter table public.return_proposal_items
add column if not exists supplier_name text;

-- Validate the selected supplier at the database boundary and capture a
-- historical snapshot from trusted synchronized data. This also protects
-- direct PostgREST writes made outside the application API route.
create or replace function public.set_return_item_supplier_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  connected_supplier_count integer;
  selected_supplier public.biznisoft_suppliers%rowtype;
begin
  if tg_op = 'UPDATE'
    and new.article_id is not distinct from old.article_id
    and new.supplier_id is not distinct from old.supplier_id
  then
    new.supplier_partner_id := old.supplier_partner_id;
    new.supplier_name := old.supplier_name;
    return new;
  end if;

  if new.supplier_id is null then
    select count(*)
    into connected_supplier_count
    from public.article_suppliers article_supplier
    join public.biznisoft_suppliers supplier
      on supplier.id = article_supplier.supplier_id
    where article_supplier.article_id = new.article_id
      and supplier.is_active;

    if connected_supplier_count > 1 then
      raise exception 'Izaberite dobavljača za ovaj artikal.';
    end if;

    if connected_supplier_count = 1 then
      select supplier.*
      into selected_supplier
      from public.article_suppliers article_supplier
      join public.biznisoft_suppliers supplier
        on supplier.id = article_supplier.supplier_id
      where article_supplier.article_id = new.article_id
        and supplier.is_active
      limit 1;

      new.supplier_id := selected_supplier.id;
      new.supplier_partner_id := selected_supplier.biznisoft_partner_id;
      new.supplier_name := selected_supplier.name;
    else
      new.supplier_partner_id := null;
      new.supplier_name := null;
    end if;

    return new;
  end if;

  select supplier.*
  into selected_supplier
  from public.article_suppliers article_supplier
  join public.biznisoft_suppliers supplier
    on supplier.id = article_supplier.supplier_id
  where article_supplier.article_id = new.article_id
    and article_supplier.supplier_id = new.supplier_id
    and supplier.is_active
  limit 1;

  if not found then
    raise exception 'Izabrani dobavljač nije povezan sa ovim artiklom.';
  end if;

  new.supplier_partner_id := selected_supplier.biznisoft_partner_id;
  new.supplier_name := selected_supplier.name;
  return new;
end;
$$;

drop trigger if exists set_return_item_supplier_snapshot on public.return_proposal_items;
create trigger set_return_item_supplier_snapshot
before insert or update on public.return_proposal_items
for each row
execute function public.set_return_item_supplier_snapshot();

revoke all on function public.set_return_item_supplier_snapshot() from public;

create index if not exists biznisoft_suppliers_name_idx
on public.biznisoft_suppliers(name);

create index if not exists article_suppliers_supplier_id_idx
on public.article_suppliers(supplier_id);

create index if not exists return_proposal_items_supplier_proposal_idx
on public.return_proposal_items(supplier_id, proposal_id);

drop trigger if exists set_biznisoft_suppliers_updated_at on public.biznisoft_suppliers;
create trigger set_biznisoft_suppliers_updated_at
before update on public.biznisoft_suppliers
for each row
execute function public.set_return_updated_at();

drop trigger if exists set_article_suppliers_updated_at on public.article_suppliers;
create trigger set_article_suppliers_updated_at
before update on public.article_suppliers
for each row
execute function public.set_return_updated_at();

alter table public.biznisoft_suppliers enable row level security;
alter table public.article_suppliers enable row level security;
alter table public.biznisoft_supplier_relation_documents enable row level security;

drop policy if exists "admins can view BizniSoft suppliers" on public.biznisoft_suppliers;
create policy "admins can view BizniSoft suppliers"
on public.biznisoft_suppliers for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can view article supplier relations" on public.article_suppliers;
create policy "admins can view article supplier relations"
on public.article_suppliers for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can view supplier relation documents" on public.biznisoft_supplier_relation_documents;
create policy "admins can view supplier relation documents"
on public.biznisoft_supplier_relation_documents for select
to authenticated
using (public.is_admin());

grant select on public.biznisoft_suppliers to authenticated;
grant select on public.article_suppliers to authenticated;
grant select on public.biznisoft_supplier_relation_documents to authenticated;

grant all on public.biznisoft_suppliers to service_role;
grant all on public.article_suppliers to service_role;
grant all on public.biznisoft_supplier_relation_documents to service_role;

comment on table public.biznisoft_suppliers is
'BizniSoft partners proven to be suppliers by their use on purchase calculation documents.';

comment on table public.article_suppliers is
'Explicit article-to-supplier relations observed on BizniSoft purchase calculation master/detail documents.';

comment on column public.return_proposal_items.supplier_name is
'Historical supplier name snapshot captured when the return item is added.';

notify pgrst, 'reload schema';
