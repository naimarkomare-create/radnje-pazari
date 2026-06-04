create table if not exists public.produce_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'gajba',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.produce_request_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  request_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.produce_request_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.produce_request_batches(id) on delete cascade,
  produce_item_id uuid not null references public.produce_items(id) on delete restrict,
  quantity numeric not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  unique (batch_id, produce_item_id)
);

create index if not exists produce_items_active_sort_idx
on public.produce_items(active, sort_order, name);

create index if not exists produce_request_batches_store_date_idx
on public.produce_request_batches(store_id, request_date desc);

create index if not exists produce_request_items_batch_idx
on public.produce_request_items(batch_id);

do $$
begin
  if exists (select 1 from public.stores where name = 'Radnja 10')
     and not exists (select 1 from public.stores where name = 'Radnja 11') then
    update public.stores set name = 'Radnja 11' where name = 'Radnja 10';
  elsif not exists (select 1 from public.stores where name = 'Radnja 11') then
    insert into public.stores (name) values ('Radnja 11');
  end if;
end
$$;

insert into public.produce_items (name, unit, sort_order)
values
  ('Paradajz', 'gajba', 1),
  ('Paradajz pink', 'gajba', 2),
  ('Paradajz cherry', 'gajba', 3),
  ('Paradajz plavi', 'gajba', 4),
  ('Krastavac', 'gajba', 5),
  ('Krastavac folija', 'gajba', 6),
  ('Šargarepa', 'gajba', 7),
  ('Praziluk', 'gajba', 8),
  ('Luk ljubičasti', 'gajba', 9),
  ('Luk beli', 'gajba', 10),
  ('Luk crni', 'gajba', 11),
  ('Luk mlad crn veza', 'gajba', 12),
  ('Krompir beli', 'gajba', 13),
  ('Krompir crveni', 'gajba', 14),
  ('Krompir batat', 'gajba', 15),
  ('Krompir mlad DOM', 'gajba', 16),
  ('Papričica ljuta', 'gajba', 17),
  ('Kupus mlad', 'gajba', 18),
  ('Kupus beli', 'gajba', 19),
  ('Kupus ljubičasti', 'gajba', 20),
  ('Karfiol', 'gajba', 21),
  ('Brokoli', 'gajba', 22),
  ('Cvekla', 'gajba', 23),
  ('Peršun veza', 'gajba', 24),
  ('Rotkvica veza', 'gajba', 25),
  ('Salata zelena', 'gajba', 26),
  ('Paprika žuta', 'gajba', 27),
  ('Paprika zelena', 'gajba', 28),
  ('Paprika crvena', 'gajba', 29),
  ('Paprika babura', 'gajba', 30),
  ('Paprika bela šilja', 'gajba', 31),
  ('Celer', 'gajba', 32),
  ('Paškanat', 'gajba', 33),
  ('Tikvica', 'gajba', 34),
  ('Šampinjoni', 'gajba', 35),
  ('Bukovača', 'gajba', 36),
  ('Banana', 'gajba', 37),
  ('Klementina', 'gajba', 38),
  ('Mandarina', 'gajba', 39),
  ('Limun', 'gajba', 40),
  ('Narandža', 'gajba', 41),
  ('Narandža mreža', 'gajba', 42),
  ('Kivi', 'gajba', 43),
  ('Jabuka ajdara', 'gajba', 44),
  ('Jabuka crveni delišes', 'gajba', 45),
  ('Jabuka zlatni delišes', 'gajba', 46),
  ('Jabuka greeny', 'gajba', 47),
  ('Nar', 'gajba', 48),
  ('Kruška', 'gajba', 49),
  ('Grožđe crno', 'gajba', 50),
  ('Grožđe belo', 'gajba', 51),
  ('Ananas', 'gajba', 52),
  ('Lubenica', 'gajba', 53),
  ('Dinja', 'gajba', 54),
  ('Dunja', 'gajba', 55),
  ('Breskva', 'gajba', 56),
  ('Nektarina', 'gajba', 57),
  ('Zelen tacna', 'gajba', 58)
on conflict (name) do update
set unit = excluded.unit,
    sort_order = excluded.sort_order,
    active = true;

create or replace function public.is_own_produce_batch(requested_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.produce_request_batches
    where id = requested_batch_id
      and user_id = auth.uid()
      and store_id = public.current_user_store_id()
  )
$$;

alter table public.produce_items enable row level security;
alter table public.produce_request_batches enable row level security;
alter table public.produce_request_items enable row level security;

drop policy if exists "authenticated users can view active produce items" on public.produce_items;
create policy "authenticated users can view active produce items"
on public.produce_items for select
to authenticated
using (active or public.is_admin());

drop policy if exists "admins can view produce request batches" on public.produce_request_batches;
create policy "admins can view produce request batches"
on public.produce_request_batches for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own produce request batches" on public.produce_request_batches;
create policy "store users can view own produce request batches"
on public.produce_request_batches for select
to authenticated
using (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own produce request batches" on public.produce_request_batches;
create policy "store users can insert own produce request batches"
on public.produce_request_batches for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
);

drop policy if exists "admins can view produce request items" on public.produce_request_items;
create policy "admins can view produce request items"
on public.produce_request_items for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own produce request items" on public.produce_request_items;
create policy "store users can view own produce request items"
on public.produce_request_items for select
to authenticated
using (public.is_own_produce_batch(batch_id));

drop policy if exists "store users can insert own produce request items" on public.produce_request_items;
create policy "store users can insert own produce request items"
on public.produce_request_items for insert
to authenticated
with check (
  quantity > 0
  and public.is_own_produce_batch(batch_id)
);

create or replace function public.submit_produce_request(
  p_request_date date,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_batch_id uuid;
  inserted_count integer;
begin
  if public.current_user_role() <> 'store' or public.current_user_store_id() is null then
    raise exception 'Only store users can submit produce requests';
  end if;

  insert into public.produce_request_batches (store_id, user_id, request_date, note)
  values (public.current_user_store_id(), auth.uid(), p_request_date, nullif(trim(p_note), ''))
  returning id into new_batch_id;

  insert into public.produce_request_items (batch_id, produce_item_id, quantity)
  select new_batch_id, produce_item.id, sum(requested.quantity)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as requested(produce_item_id uuid, quantity numeric)
  join public.produce_items produce_item
    on produce_item.id = requested.produce_item_id
   and produce_item.active = true
  where requested.quantity > 0
  group by produce_item.id;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception 'At least one item with quantity greater than zero is required';
  end if;

  return new_batch_id;
end
$$;

grant execute on function public.submit_produce_request(date, text, jsonb) to authenticated;
