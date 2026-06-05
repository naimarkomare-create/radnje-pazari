alter table public.daily_revenue_reports
add column if not exists check_revenue numeric not null default 0 check (check_revenue >= 0),
add column if not exists bank_transfer_revenue numeric not null default 0 check (bank_transfer_revenue >= 0),
add column if not exists correction_revenue numeric not null default 0,
add column if not exists edopuna_revenue numeric not null default 0 check (edopuna_revenue >= 0);

create or replace function public.guard_store_daily_revenue_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() = 'store' then
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

drop trigger if exists guard_store_daily_revenue_update on public.daily_revenue_reports;
create trigger guard_store_daily_revenue_update
before update on public.daily_revenue_reports
for each row
execute function public.guard_store_daily_revenue_update();

drop policy if exists "admins can update daily revenue reports" on public.daily_revenue_reports;
create policy "admins can update daily revenue reports"
on public.daily_revenue_reports for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can update own recent daily revenue reports" on public.daily_revenue_reports;
create policy "store users can update own recent daily revenue reports"
on public.daily_revenue_reports for update
to authenticated
using (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and created_at > now() - interval '20 minutes'
)
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and created_at > now() - interval '20 minutes'
);
