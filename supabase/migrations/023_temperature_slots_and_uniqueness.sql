-- Preserve historical first/second shift values while adding the 14:00 slot.
alter table public.temperature_reports
drop constraint if exists temperature_reports_shift_check;

alter table public.temperature_reports
add constraint temperature_reports_shift_check
check (
  shift is null
  or shift in ('Prva smena', 'Međusmena', 'Druga smena')
);

-- One reading per store, device, business date and scheduled slot.
create unique index if not exists temperature_reports_store_device_date_shift_unique
on public.temperature_reports(store_id, device_id, report_date, shift)
where device_id is not null and shift is not null;

drop policy if exists "store users can insert own temperature reports"
on public.temperature_reports;

create policy "store users can insert own temperature reports"
on public.temperature_reports for insert
to authenticated
with check (
  public.current_user_role() = 'store'
  and user_id = auth.uid()
  and store_id = public.current_user_store_id()
  and shift in ('Prva smena', 'Međusmena', 'Druga smena')
  and exists (
    select 1
    from public.temperature_devices device
    where device.id = device_id
      and device.store_id = public.current_user_store_id()
      and device.active = true
  )
);

notify pgrst, 'reload schema';
