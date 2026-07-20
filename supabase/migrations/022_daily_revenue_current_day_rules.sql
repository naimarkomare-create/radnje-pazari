-- Keep historical pazar rows unchanged while enforcing one current-day entry
-- for store users from 20 July 2026 onward.

create or replace function public.guard_daily_revenue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  belgrade_today date := (now() at time zone 'Europe/Belgrade')::date;
begin
  if public.current_user_role() = 'store' then
    if new.report_date <> belgrade_today then
      raise exception 'Pazar se može uneti samo za današnji datum.';
    end if;

    if new.shift is not null then
      raise exception 'Smena se ne bira za dnevni pazar.';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.store_id::text || ':' || new.report_date::text, 0)
  );

  if exists (
    select 1
    from public.daily_revenue_reports report
    where report.store_id = new.store_id
      and report.report_date = new.report_date
  ) then
    raise exception using
      errcode = '23505',
      message = 'Pazar za današnji datum je već unet.';
  end if;

  return new;
end
$$;

drop trigger if exists guard_daily_revenue_insert
on public.daily_revenue_reports;

create trigger guard_daily_revenue_insert
before insert on public.daily_revenue_reports
for each row
execute function public.guard_daily_revenue_insert();

create or replace function public.guard_store_daily_revenue_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  belgrade_today date := (now() at time zone 'Europe/Belgrade')::date;
begin
  if public.current_user_role() = 'store' then
    if old.report_date <> belgrade_today
       or new.report_date <> old.report_date then
      raise exception 'Pazar se može izmeniti samo za današnji datum.';
    end if;

    if new.shift is distinct from old.shift then
      raise exception 'Smena se ne može menjati.';
    end if;

    if old.created_at <= now() - interval '20 minutes' then
      raise exception 'Rok za izmenu je istekao. Kontaktirajte admina.';
    end if;

    if new.id <> old.id
       or new.store_id <> old.store_id
       or new.user_id <> old.user_id
       or new.created_at <> old.created_at then
      raise exception 'Nije dozvoljena izmena zaštićenih polja.';
    end if;
  end if;

  return new;
end
$$;

drop policy if exists "store users can insert own daily revenue reports"
on public.daily_revenue_reports;

create policy "store users can insert own daily revenue reports"
on public.daily_revenue_reports for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and report_date = (now() at time zone 'Europe/Belgrade')::date
  and shift is null
);

drop policy if exists "store users can update own recent daily revenue reports"
on public.daily_revenue_reports;

create policy "store users can update own recent daily revenue reports"
on public.daily_revenue_reports for update
to authenticated
using (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and report_date = (now() at time zone 'Europe/Belgrade')::date
  and created_at > now() - interval '20 minutes'
)
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and report_date = (now() at time zone 'Europe/Belgrade')::date
  and created_at > now() - interval '20 minutes'
);

-- Two audited duplicate groups predate this cutoff. They remain untouched.
-- The conditional guard keeps this migration safe if newer duplicates appear
-- before production applies it; the insert trigger still blocks later repeats.
do $$
begin
  if not exists (
    select 1
    from public.daily_revenue_reports
    where report_date >= date '2026-07-20'
    group by store_id, report_date
    having count(*) > 1
  ) then
    execute $index$
      create unique index if not exists
        daily_revenue_reports_store_date_from_20260720_uidx
      on public.daily_revenue_reports(store_id, report_date)
      where report_date >= date '2026-07-20'
    $index$;
  else
    raise warning
      'Forward-only pazar unique index was not created because newer duplicates exist.';
  end if;
end
$$;
