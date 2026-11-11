begin;

create table if not exists public.task_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) = 87),
  auth text not null check (length(auth) = 22),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade
);

create index if not exists task_push_subscriptions_store_id_idx on public.task_push_subscriptions(store_id);
create index if not exists task_push_subscriptions_user_id_idx on public.task_push_subscriptions(user_id);

alter table public.task_push_subscriptions enable row level security;
revoke all on public.task_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.task_push_subscriptions to service_role;
comment on table public.task_push_subscriptions is 'Server-only Web Push subscriptions. Registration binds an opted-in device to its authenticated employee and store.';

-- The same submission ID saves one task and its assignments in a single transaction.
-- Only the request that actually inserted the task may attempt notification delivery.
create or replace function public.create_notified_store_task(
  p_id uuid, p_title text, p_description text, p_due_date date, p_due_time time,
  p_priority text, p_photo_required boolean, p_store_ids uuid[]
)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_store_ids), 0) = 0 then
    raise exception 'Store assignment required' using errcode = '22023';
  end if;

  insert into public.store_tasks(id, title, description, due_date, due_time, priority, photo_required, created_by)
  values (p_id, p_title, p_description, p_due_date, p_due_time, p_priority, p_photo_required, auth.uid())
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.store_tasks where id = p_id and created_by = auth.uid()) then
      return false;
    end if;
    raise exception 'Task submission ID conflict' using errcode = '23505';
  end if;

  insert into public.store_task_assignments(task_id, store_id)
  select p_id, store_id from (select distinct unnest(p_store_ids) as store_id) as recipients;
  return true;
end;
$$;

revoke all on function public.create_notified_store_task(uuid, text, text, date, time, text, boolean, uuid[]) from public, anon;
grant execute on function public.create_notified_store_task(uuid, text, text, date, time, text, boolean, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
