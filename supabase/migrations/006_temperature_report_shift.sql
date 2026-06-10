alter table public.temperature_reports
add column if not exists shift text check (shift is null or shift in ('Prva smena', 'Druga smena'));
