alter table public.produce_shelf_photo_checks
  alter column photo_url drop not null,
  alter column storage_path drop not null;

drop policy if exists "admins can update shelf photo checks" on public.produce_shelf_photo_checks;
create policy "admins can update shelf photo checks"
on public.produce_shelf_photo_checks for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.store_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date not null,
  due_time time,
  priority text not null default 'podsetnik',
  photo_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  constraint store_tasks_priority_check check (priority in ('podsetnik', 'vazno', 'hitno'))
);

create table if not exists public.store_task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.store_tasks(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  status text not null default 'pending',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  photo_path text,
  photo_url text,
  created_at timestamptz not null default now(),
  constraint store_task_assignments_status_check check (status in ('pending', 'done', 'late')),
  constraint store_task_assignments_unique_task_store unique (task_id, store_id)
);

create index if not exists store_task_assignments_store_id_idx
on public.store_task_assignments(store_id);

create index if not exists store_task_assignments_task_id_idx
on public.store_task_assignments(task_id);

create index if not exists store_tasks_due_date_idx
on public.store_tasks(due_date);

alter table public.store_tasks enable row level security;
alter table public.store_task_assignments enable row level security;

drop policy if exists "admins can manage store tasks" on public.store_tasks;
create policy "admins can manage store tasks"
on public.store_tasks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can view assigned tasks" on public.store_tasks;
create policy "store users can view assigned tasks"
on public.store_tasks for select
to authenticated
using (
  active = true
  and public.current_user_role() = 'store'
  and exists (
    select 1
    from public.store_task_assignments sta
    where sta.task_id = store_tasks.id
      and sta.store_id = public.current_user_store_id()
  )
);

drop policy if exists "admins can manage store task assignments" on public.store_task_assignments;
create policy "admins can manage store task assignments"
on public.store_task_assignments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "store users can view own task assignments" on public.store_task_assignments;
create policy "store users can view own task assignments"
on public.store_task_assignments for select
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
);

drop policy if exists "store users can update own task assignments" on public.store_task_assignments;
create policy "store users can update own task assignments"
on public.store_task_assignments for update
to authenticated
using (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
)
with check (
  public.current_user_role() = 'store'
  and store_id = public.current_user_store_id()
  and status in ('pending', 'done', 'late')
  and (completed_by is null or completed_by = auth.uid())
  and (
    photo_path is null
    or photo_path like ('shelf-photos/tasks/' || store_id::text || '/' || id::text || '/%')
  )
);

create or replace function public.prevent_invalid_store_task_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if public.current_user_role() = 'store' then
    if new.id <> old.id
      or new.task_id <> old.task_id
      or new.store_id <> old.store_id
      or new.created_at <> old.created_at then
      raise exception 'Store users can update only task status and photo fields.';
    end if;

    if new.status <> 'done' then
      raise exception 'Store users can only mark tasks as done.';
    end if;

    if new.completed_by is distinct from auth.uid() then
      raise exception 'completed_by must match current user.';
    end if;

    if new.completed_at is null then
      raise exception 'completed_at is required.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_invalid_store_task_assignment_update_trigger on public.store_task_assignments;
create trigger prevent_invalid_store_task_assignment_update_trigger
before update on public.store_task_assignments
for each row
execute function public.prevent_invalid_store_task_assignment_update();
