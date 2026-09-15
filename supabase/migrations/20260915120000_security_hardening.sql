begin;

-- The old lookup view ran as its owner and exposed raw stock rows despite table RLS.
-- The application lookup API uses a server-only, explicit-column catalog query.
alter view public.biznisoft_article_lookup set (security_invoker = true);
revoke all on public.biznisoft_article_lookup from anon;
grant select on public.biznisoft_article_lookup to authenticated;

-- A worker must not write history against another store's proposal or item UUID.
drop policy if exists "authenticated users can insert return history" on public.return_proposal_history;
create policy "authenticated users can insert return history"
on public.return_proposal_history for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'store'
    and user_id = auth.uid()
    and exists (
      select 1 from public.return_proposals p
      where p.id = return_proposal_history.proposal_id
        and p.store_id = public.current_user_store_id()
    )
    and (item_id is null or exists (
      select 1 from public.return_proposal_items i
      where i.id = return_proposal_history.item_id
        and i.proposal_id = return_proposal_history.proposal_id
    ))
  )
);

-- Prevent a direct PostgREST insert from extending the 20-minute edit window.
create or replace function public.stamp_store_revenue_creation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.current_user_role() = 'store' then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_store_revenue_creation() from public, anon, authenticated;
drop trigger if exists stamp_store_revenue_creation on public.daily_revenue_reports;
create trigger stamp_store_revenue_creation before insert on public.daily_revenue_reports
for each row execute function public.stamp_store_revenue_creation();

-- Keep creator/reviewer attribution server-controlled, including direct Data API writes.
-- Existing rows and admin correction permissions are unchanged.
create or replace function public.guard_return_proposal_store_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.current_user_role() is distinct from 'store' then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.completed_at := null;
    new.cancelled_at := null;
  else
    if new.id is distinct from old.id or new.store_id is distinct from old.store_id then
      raise exception 'Nije dozvoljena izmena vlasništva najave.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.completed_at := old.completed_at;
    new.cancelled_at := old.cancelled_at;
  end if;
  new.updated_by := auth.uid();
  new.submitted_at := case when new.status = 'submitted'
    then case when tg_op = 'UPDATE' and old.status = 'submitted' then old.submitted_at else now() end
    else null end;
  return new;
end;
$$;
revoke all on function public.guard_return_proposal_store_fields() from public, anon, authenticated;
drop trigger if exists guard_return_proposal_store_fields on public.return_proposals;
create trigger guard_return_proposal_store_fields before insert or update on public.return_proposals
for each row execute function public.guard_return_proposal_store_fields();

create or replace function public.guard_return_item_store_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.current_user_role() is distinct from 'store' then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.id is distinct from old.id or new.proposal_id is distinct from old.proposal_id then
      raise exception 'Nije dozvoljeno premeštanje artikla u drugu najavu.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.guard_return_item_store_fields() from public, anon, authenticated;
drop trigger if exists guard_return_item_store_fields on public.return_proposal_items;
create trigger guard_return_item_store_fields before insert or update on public.return_proposal_items
for each row execute function public.guard_return_item_store_fields();

-- NOT VALID preserves historical rows but protects all new inserts and updates.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.return_proposal_items'::regclass and conname = 'return_item_finite_positive_quantity') then
    alter table public.return_proposal_items add constraint return_item_finite_positive_quantity
      check (quantity > 0 and quantity::text not in ('NaN', 'Infinity', '-Infinity')) not valid;
  end if;
end $$;

-- Object paths use fixed segments; never accept encoded separators or dot traversal.
create or replace function public.is_safe_shelf_object_path(p_name text, p_store_id uuid)
returns boolean language sql immutable security invoker set search_path = public as $$
  select p_store_id is not null and (
    p_name ~ ('^[0-9]{4}-[0-9]{2}-[0-9]{2}/' || p_store_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    or p_name ~ ('^tasks/' || p_store_id::text || '/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
  );
$$;
revoke all on function public.is_safe_shelf_object_path(text, uuid) from public, anon;
grant execute on function public.is_safe_shelf_object_path(text, uuid) to authenticated, service_role;

drop policy if exists "store users can view own shelf photo files" on storage.objects;
create policy "store users can view own shelf photo files" on storage.objects
for select to authenticated using (
  bucket_id = 'shelf-photos' and public.current_user_role() = 'store'
  and public.is_safe_shelf_object_path(name, public.current_user_store_id())
);
drop policy if exists "store users can upload own shelf photo files" on storage.objects;
create policy "store users can upload own shelf photo files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'shelf-photos' and public.current_user_role() = 'store'
  and public.is_safe_shelf_object_path(name, public.current_user_store_id())
  and (split_part(name, '/', 1) <> 'tasks' or exists (
    select 1 from public.store_task_assignments a
    join public.store_tasks t on t.id = a.task_id
    where a.id::text = split_part(name, '/', 3)
      and a.store_id = public.current_user_store_id() and a.status <> 'done' and t.active
  ))
);

drop policy if exists "store users can insert own shelf photo checks" on public.produce_shelf_photo_checks;
create policy "store users can insert own shelf photo checks"
on public.produce_shelf_photo_checks for insert to authenticated with check (
  public.current_user_role() = 'store' and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and storage_path like ('shelf-photos/' || check_date::text || '/' || store_id::text || '/%')
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'shelf-photos' and 'shelf-photos/' || o.name = storage_path
  )
);

-- Direct assignment updates must satisfy the same required-photo rule as the server action.
-- The earlier trigger continues protecting task/store IDs and completion attribution.
create or replace function public.guard_store_task_completion_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare task_active boolean; needs_photo boolean;
begin
  if public.current_user_role() is distinct from 'store' then return new; end if;
  if old.status = 'done' then
    raise exception 'Zadatak je već završen.';
  end if;
  select active, photo_required into task_active, needs_photo
  from public.store_tasks where id = old.task_id;
  if task_active is distinct from true then raise exception 'Zadatak nije dostupan.'; end if;
  if needs_photo and new.photo_path is null then raise exception 'Slika je obavezna za ovaj zadatak.'; end if;
  if new.photo_path is not null and (
    new.photo_path not like ('shelf-photos/tasks/' || old.store_id::text || '/' || old.id::text || '/%')
    or not public.is_safe_shelf_object_path(substring(new.photo_path from 14), old.store_id)
    or not exists (select 1 from storage.objects o where o.bucket_id = 'shelf-photos' and 'shelf-photos/' || o.name = new.photo_path)
  ) then raise exception 'Putanja slike nije ispravna.'; end if;
  new.photo_url := new.photo_path;
  new.completed_at := now();
  return new;
end;
$$;
revoke all on function public.guard_store_task_completion_photo() from public, anon, authenticated;
drop trigger if exists guard_store_task_completion_photo on public.store_task_assignments;
create trigger guard_store_task_completion_photo before update on public.store_task_assignments
for each row execute function public.guard_store_task_completion_photo();

update storage.buckets set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'shelf-photos';

-- A small server-only lease prevents simultaneous expensive synchronization runs.
create table if not exists public.security_operation_locks (
  operation text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
comment on table public.security_operation_locks is 'Server-only short-lived leases; no user data or credentials.';
alter table public.security_operation_locks enable row level security;
revoke all on public.security_operation_locks from public, anon, authenticated;
grant all on public.security_operation_locks to service_role;
create or replace function public.claim_security_operation(p_operation text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare claimed uuid;
begin
  insert into public.security_operation_locks(operation, token, expires_at)
  values (p_operation, gen_random_uuid(), clock_timestamp() + interval '5 minutes')
  on conflict (operation) do update set token = excluded.token, expires_at = excluded.expires_at
  where security_operation_locks.expires_at <= clock_timestamp()
  returning token into claimed;
  return claimed;
end;
$$;
revoke all on function public.claim_security_operation(text) from public, anon, authenticated;
grant execute on function public.claim_security_operation(text) to service_role;

notify pgrst, 'reload schema';
commit;
