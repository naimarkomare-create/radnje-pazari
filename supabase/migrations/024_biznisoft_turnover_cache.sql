-- Shared cache for the admin BizniSoft turnover dashboard.
-- The payload contains normalized totals only; SOAP responses and credentials are never stored.
create table if not exists public.biznisoft_turnover_cache (
  business_date date primary key,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz null,
  refresh_started_at timestamptz null,
  refresh_token uuid null,
  last_error_code text null,
  last_error_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.biznisoft_turnover_cache is
  'Server-controlled shared cache for normalized BizniSoft daily turnover totals.';

alter table public.biznisoft_turnover_cache enable row level security;

drop policy if exists "Admins can view BizniSoft turnover cache"
on public.biznisoft_turnover_cache;

create policy "Admins can view BizniSoft turnover cache"
on public.biznisoft_turnover_cache
for select
to authenticated
using (public.is_admin());

-- Atomically claims a refresh for one business date. A token is returned only
-- when the cache is stale (or force is requested) and no live refresh owns it.
create or replace function public.claim_biznisoft_turnover_refresh(
  p_business_date date,
  p_fresh_for_seconds integer,
  p_lock_for_seconds integer,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  insert into public.biznisoft_turnover_cache (business_date)
  values (p_business_date)
  on conflict (business_date) do nothing;

  update public.biznisoft_turnover_cache
  set
    refresh_started_at = clock_timestamp(),
    refresh_token = v_token,
    updated_at = clock_timestamp()
  where business_date = p_business_date
    and (
      refresh_started_at is null
      or refresh_started_at < clock_timestamp() - make_interval(secs => greatest(p_lock_for_seconds, 1))
    )
    and (
      p_force
      or fetched_at is null
      or fetched_at < clock_timestamp() - make_interval(secs => greatest(p_fresh_for_seconds, 0))
    )
  returning refresh_token into v_claimed_token;

  return v_claimed_token;
end;
$$;

revoke all on function public.claim_biznisoft_turnover_refresh(date, integer, integer, boolean)
from public;

grant execute on function public.claim_biznisoft_turnover_refresh(date, integer, integer, boolean)
to service_role;

notify pgrst, 'reload schema';
