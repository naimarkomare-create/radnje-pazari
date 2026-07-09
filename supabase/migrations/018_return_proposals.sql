create table if not exists public.return_proposals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  status text not null default 'draft',
  return_date date,
  note text,
  partner_id integer,
  partner_name text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_proposals_status_check check (status in ('draft','submitted','reviewed','completed','cancelled'))
);

create table if not exists public.return_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.return_proposals(id) on delete cascade,
  article_id integer not null,
  article_name text not null,
  barcode text,
  unit text,
  quantity numeric not null,
  reason text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_article jsonb not null default '{}'::jsonb
);

create table if not exists public.return_proposal_history (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.return_proposals(id) on delete cascade,
  item_id uuid references public.return_proposal_items(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists return_proposals_store_id_idx on public.return_proposals(store_id);
create index if not exists return_proposals_status_idx on public.return_proposals(status);
create index if not exists return_proposals_return_date_idx on public.return_proposals(return_date);
create index if not exists return_proposals_created_at_idx on public.return_proposals(created_at);
create index if not exists return_proposal_items_proposal_id_idx on public.return_proposal_items(proposal_id);
create index if not exists return_proposal_items_article_id_idx on public.return_proposal_items(article_id);
create index if not exists return_proposal_items_barcode_idx on public.return_proposal_items(barcode);

create or replace function public.set_return_updated_at()
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

drop trigger if exists set_return_proposals_updated_at on public.return_proposals;
create trigger set_return_proposals_updated_at
before update on public.return_proposals
for each row
execute function public.set_return_updated_at();

drop trigger if exists set_return_proposal_items_updated_at on public.return_proposal_items;
create trigger set_return_proposal_items_updated_at
before update on public.return_proposal_items
for each row
execute function public.set_return_updated_at();

create or replace view public.biznisoft_article_lookup as
select distinct on (article_id)
  article_id,
  name,
  barcode,
  unit,
  storage_id,
  storage_key,
  raw,
  last_seen_at
from public.biznisoft_stock_price_current
where article_id is not null
order by article_id, last_seen_at desc nulls last;

alter table public.return_proposals enable row level security;
alter table public.return_proposal_items enable row level security;
alter table public.return_proposal_history enable row level security;

drop policy if exists "admins can manage return proposals" on public.return_proposals;
create policy "admins can manage return proposals"
on public.return_proposals for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can view own return proposals" on public.return_proposals;
create policy "store users can view own return proposals"
on public.return_proposals for select
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own return proposals" on public.return_proposals;
create policy "store users can insert own return proposals"
on public.return_proposals for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
  and status in ('draft','submitted')
);

drop policy if exists "store users can update editable own return proposals" on public.return_proposals;
create policy "store users can update editable own return proposals"
on public.return_proposals for update
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
  and status in ('draft','submitted')
)
with check (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
  and status in ('draft','submitted')
);

drop policy if exists "admins can manage return proposal items" on public.return_proposal_items;
create policy "admins can manage return proposal items"
on public.return_proposal_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can view own return proposal items" on public.return_proposal_items;
create policy "store users can view own return proposal items"
on public.return_proposal_items for select
to authenticated
using (
  public.current_user_role() = 'store'
  and exists (
    select 1
    from public.return_proposals rp
    where rp.id = return_proposal_items.proposal_id
      and rp.store_id = public.current_user_store_id()
  )
);

drop policy if exists "store users can insert own return proposal items" on public.return_proposal_items;
create policy "store users can insert own return proposal items"
on public.return_proposal_items for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and exists (
    select 1
    from public.return_proposals rp
    where rp.id = return_proposal_items.proposal_id
      and rp.store_id = public.current_user_store_id()
      and rp.status in ('draft','submitted')
  )
);

drop policy if exists "store users can update own return proposal items" on public.return_proposal_items;
create policy "store users can update own return proposal items"
on public.return_proposal_items for update
to authenticated
using (
  public.current_user_role() = 'store'
  and exists (
    select 1
    from public.return_proposals rp
    where rp.id = return_proposal_items.proposal_id
      and rp.store_id = public.current_user_store_id()
      and rp.status in ('draft','submitted')
  )
)
with check (
  public.current_user_role() = 'store'
  and exists (
    select 1
    from public.return_proposals rp
    where rp.id = return_proposal_items.proposal_id
      and rp.store_id = public.current_user_store_id()
      and rp.status in ('draft','submitted')
  )
);

drop policy if exists "store users can delete own return proposal items" on public.return_proposal_items;
create policy "store users can delete own return proposal items"
on public.return_proposal_items for delete
to authenticated
using (
  public.current_user_role() = 'store'
  and exists (
    select 1
    from public.return_proposals rp
    where rp.id = return_proposal_items.proposal_id
      and rp.store_id = public.current_user_store_id()
      and rp.status in ('draft','submitted')
  )
);

drop policy if exists "admins can view return history" on public.return_proposal_history;
create policy "admins can view return history"
on public.return_proposal_history for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated users can insert return history" on public.return_proposal_history;
create policy "authenticated users can insert return history"
on public.return_proposal_history for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

-- TODO: discover BizniSoft partner/item attributes.
-- TODO: add partner filtering later.
-- TODO: add suggested supplier later.

notify pgrst, 'reload schema';
