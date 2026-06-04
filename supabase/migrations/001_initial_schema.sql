create extension if not exists "pgcrypto";

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'store')),
  store_id uuid references public.stores(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint profiles_admin_store_null check (
    (role = 'admin' and store_id is null)
    or (role = 'store' and store_id is not null)
  )
);

create table if not exists public.daily_revenue_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  report_date date not null,
  shift text,
  cash_revenue numeric not null default 0 check (cash_revenue >= 0),
  card_revenue numeric not null default 0 check (card_revenue >= 0),
  total_revenue numeric not null default 0 check (total_revenue >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.temperature_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  report_date date not null,
  device_name text not null,
  temperature numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.produce_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  request_date date not null,
  item_name text not null,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_store_id_idx on public.profiles(store_id);
create index if not exists daily_revenue_reports_store_date_idx on public.daily_revenue_reports(store_id, report_date desc);
create index if not exists temperature_reports_store_date_idx on public.temperature_reports(store_id, report_date desc);
create index if not exists produce_requests_store_date_idx on public.produce_requests(store_id, request_date desc);

insert into public.stores (name)
values
  ('Radnja 1'),
  ('Radnja 2'),
  ('Radnja 3'),
  ('Radnja 4'),
  ('Radnja 5'),
  ('Radnja 6'),
  ('Radnja 7'),
  ('Radnja 8'),
  ('Radnja 9'),
  ('Radnja 10')
on conflict (name) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_revenue_reports enable row level security;
alter table public.temperature_reports enable row level security;
alter table public.produce_requests enable row level security;

drop policy if exists "admins can view stores" on public.stores;
create policy "admins can view stores"
on public.stores for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own store" on public.stores;
create policy "store users can view own store"
on public.stores for select
to authenticated
using (id = public.current_user_store_id());

drop policy if exists "admins can view profiles" on public.profiles;
create policy "admins can view profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "admins can view daily revenue reports" on public.daily_revenue_reports;
create policy "admins can view daily revenue reports"
on public.daily_revenue_reports for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own daily revenue reports" on public.daily_revenue_reports;
create policy "store users can view own daily revenue reports"
on public.daily_revenue_reports for select
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own daily revenue reports" on public.daily_revenue_reports;
create policy "store users can insert own daily revenue reports"
on public.daily_revenue_reports for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
);

drop policy if exists "admins can view temperature reports" on public.temperature_reports;
create policy "admins can view temperature reports"
on public.temperature_reports for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own temperature reports" on public.temperature_reports;
create policy "store users can view own temperature reports"
on public.temperature_reports for select
to authenticated
using (
  public.current_user_role() = 'store'
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
);

drop policy if exists "admins can view produce requests" on public.produce_requests;
create policy "admins can view produce requests"
on public.produce_requests for select
to authenticated
using (public.is_admin());

drop policy if exists "store users can view own produce requests" on public.produce_requests;
create policy "store users can view own produce requests"
on public.produce_requests for select
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can insert own produce requests" on public.produce_requests;
create policy "store users can insert own produce requests"
on public.produce_requests for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
);
