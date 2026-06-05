create table if not exists public.temperature_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null,
  device_type text check (device_type is null or device_type in ('Frižider', 'Zamrzivač', 'Vitrina', 'Ostalo')),
  min_allowed numeric,
  max_allowed numeric,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.temperature_reports
add column if not exists device_id uuid references public.temperature_devices(id) on delete restrict;

create index if not exists temperature_devices_store_active_sort_idx
on public.temperature_devices(store_id, active, sort_order, name);

create index if not exists temperature_reports_device_id_idx
on public.temperature_reports(device_id);

insert into public.temperature_devices (store_id, name, device_type, min_allowed, max_allowed, active, sort_order)
select stores.id, devices.name, devices.device_type, devices.min_allowed, devices.max_allowed, true, devices.sort_order
from public.stores
cross join (
  values
    ('Frižider 1', 'Frižider', 0::numeric, 8::numeric, 1),
    ('Zamrzivač 1', 'Zamrzivač', -25::numeric, -12::numeric, 2)
) as devices(name, device_type, min_allowed, max_allowed, sort_order)
where stores.name in (
  'Radnja 1',
  'Radnja 2',
  'Radnja 3',
  'Radnja 4',
  'Radnja 5',
  'Radnja 6',
  'Radnja 7',
  'Radnja 8',
  'Radnja 9',
  'Radnja 11'
)
and not exists (
  select 1
  from public.temperature_devices existing
  where existing.store_id = stores.id
    and existing.name = devices.name
);

alter table public.temperature_devices enable row level security;

drop policy if exists "admins can view temperature devices" on public.temperature_devices;
create policy "admins can view temperature devices"
on public.temperature_devices for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert temperature devices" on public.temperature_devices;
create policy "admins can insert temperature devices"
on public.temperature_devices for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update temperature devices" on public.temperature_devices;
create policy "admins can update temperature devices"
on public.temperature_devices for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can view own active temperature devices" on public.temperature_devices;
create policy "store users can view own active temperature devices"
on public.temperature_devices for select
to authenticated
using (
  public.current_user_role() = 'store'
  and active = true
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own temperature reports" on public.temperature_reports;
create policy "store users can insert own temperature reports"
on public.temperature_reports for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and exists (
    select 1
    from public.temperature_devices device
    where device.id = device_id
      and device.store_id = public.current_user_store_id()
      and device.active = true
  )
);
