create extension if not exists pg_trgm;

create index if not exists idx_return_proposals_updated_at
on public.return_proposals(updated_at desc);

create index if not exists idx_return_proposals_store_updated
on public.return_proposals(store_id, updated_at desc);

create index if not exists idx_return_proposals_status_updated
on public.return_proposals(status, updated_at desc);

create index if not exists idx_return_proposals_date_updated
on public.return_proposals(return_date, updated_at desc);

create index if not exists idx_return_proposal_items_proposal_created
on public.return_proposal_items(proposal_id, created_at desc);

create index if not exists idx_stock_price_current_article_seen
on public.biznisoft_stock_price_current(article_id, last_seen_at desc);

create index if not exists idx_stock_price_current_last_seen
on public.biznisoft_stock_price_current(last_seen_at desc);

create index if not exists idx_stock_price_current_barcode
on public.biznisoft_stock_price_current(barcode)
where barcode is not null;

create index if not exists idx_stock_price_current_name_trgm
on public.biznisoft_stock_price_current using gin (name gin_trgm_ops)
where name is not null;

create index if not exists idx_price_changes_date_detected
on public.biznisoft_price_changes(change_date, detected_at desc);

create index if not exists idx_price_changes_status_task_detected
on public.biznisoft_price_changes(status, task_created, detected_at desc);

create index if not exists idx_price_changes_storage_date_detected
on public.biznisoft_price_changes(storage_key, change_date, detected_at desc);

create index if not exists idx_store_tasks_active_due_created
on public.store_tasks(due_date desc, created_at desc)
where active = true;

create index if not exists idx_daily_revenue_date_created
on public.daily_revenue_reports(report_date desc, created_at desc);

create index if not exists idx_temperature_reports_date_created
on public.temperature_reports(report_date desc, created_at desc);

create index if not exists idx_produce_batches_date_created
on public.produce_request_batches(request_date desc, created_at desc);

create index if not exists idx_shelf_checks_date_created
on public.produce_shelf_photo_checks(check_date desc, created_at desc);

create index if not exists idx_sale_actions_grouping
on public.biznisoft_sale_actions(
  action_type,
  storage_id,
  from_chapter,
  chapter_to,
  loyalty_level,
  priority_level
);

create or replace view public.biznisoft_sale_action_groups
with (security_invoker = true)
as
select
  bsa.action_type,
  bsa.storage_id,
  bsa.from_chapter,
  bsa.chapter_to,
  coalesce(bsa.loyalty_level, 0) as loyalty_level,
  coalesce(bsa.priority_level, 0) as priority_level,
  max(bsa.sale_action_name) as sale_action_name,
  count(*)::integer as item_count,
  count(bsa.article_id)::integer as article_count,
  count(ba.name)::integer as resolved_article_count
from public.biznisoft_sale_actions bsa
left join public.biznisoft_articles ba
  on ba.article_id = bsa.article_id
group by
  bsa.action_type,
  bsa.storage_id,
  bsa.from_chapter,
  bsa.chapter_to,
  coalesce(bsa.loyalty_level, 0),
  coalesce(bsa.priority_level, 0);

grant select on public.biznisoft_sale_action_groups to authenticated;

create or replace view public.store_open_task_counts
with (security_invoker = true)
as
select
  sta.store_id,
  count(*)::integer as open_count
from public.store_task_assignments sta
join public.store_tasks st
  on st.id = sta.task_id
where st.active = true
  and sta.status <> 'done'
group by sta.store_id;

grant select on public.store_open_task_counts to authenticated;

notify pgrst, 'reload schema';
