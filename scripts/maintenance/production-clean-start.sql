-- DESTRUCTIVE ONE-TIME MAINTENANCE SCRIPT. THIS IS NOT A MIGRATION.
-- It deletes operational/test data but preserves accounts, stores, master data,
-- BizniSoft reference/current-state data, schema, migrations, and RLS objects.
--
-- 1. Run scripts/maintenance/production-clean-storage.mjs first so linked files
--    are removed while their trusted database paths still exist.
-- 2. Review the counts below.
-- 3. Replace REVIEW_ONLY with DELETE_OPERATIONAL_DATA only after backup approval.

select set_config('app.production_clean_start_confirmation', 'REVIEW_ONLY', false);

-- PRE-CLEAN COUNTS: these are exactly the database rows this script deletes.
select 'daily_revenue_reports' as table_name, count(*) as rows_to_delete from public.daily_revenue_reports
union all select 'temperature_reports', count(*) from public.temperature_reports
union all select 'produce_requests (legacy)', count(*) from public.produce_requests
union all select 'produce_request_items', count(*) from public.produce_request_items
union all select 'produce_request_batches', count(*) from public.produce_request_batches
union all select 'produce_shelf_photo_checks', count(*) from public.produce_shelf_photo_checks
union all select 'store_task_assignments', count(*) from public.store_task_assignments
union all select 'store_tasks', count(*) from public.store_tasks
union all select 'return_proposal_history', count(*) from public.return_proposal_history
union all select 'return_proposal_items', count(*) from public.return_proposal_items
union all select 'return_proposals', count(*) from public.return_proposals
union all select 'biznisoft_price_changes', count(*) from public.biznisoft_price_changes
union all select 'biznisoft_price_snapshots', count(*) from public.biznisoft_price_snapshots
union all select 'biznisoft_stock_price_snapshots', count(*) from public.biznisoft_stock_price_snapshots
union all select 'biznisoft_turnover_cache', count(*) from public.biznisoft_turnover_cache
union all select 'security_operation_locks', count(*) from public.security_operation_locks
order by table_name;

-- Linked Storage paths expected to be removed before this SQL is confirmed.
select 'shelf_check_photo_paths' as path_type, count(*) as referenced_paths
from public.produce_shelf_photo_checks where storage_path is not null
union all
select 'task_photo_paths', count(*)
from public.store_task_assignments where photo_path is not null;

begin;

do $$
begin
  if current_setting('app.production_clean_start_confirmation', true)
       is distinct from 'DELETE_OPERATIONAL_DATA' then
    raise exception 'REVIEW ONLY: set confirmation to DELETE_OPERATIONAL_DATA after backup and count review.';
  end if;
end
$$;

-- Child records first. Every deletion is explicit; no TRUNCATE/CASCADE is used.
delete from public.return_proposal_history;
delete from public.return_proposal_items;
delete from public.return_proposals;

delete from public.store_task_assignments;
delete from public.store_tasks;

delete from public.produce_request_items;
delete from public.produce_request_batches;
delete from public.produce_requests;

delete from public.produce_shelf_photo_checks;
delete from public.temperature_reports;
delete from public.daily_revenue_reports;

-- Operational BizniSoft history/cache only. Current article, supplier, action,
-- stock-price, mapping, and incremental supplier-sync master state is preserved.
delete from public.biznisoft_price_changes;
delete from public.biznisoft_price_snapshots;
delete from public.biznisoft_stock_price_snapshots;
delete from public.biznisoft_turnover_cache;
delete from public.security_operation_locks;

commit;

-- POST-CLEAN OPERATIONAL VERIFICATION: every count below should be zero.
select 'daily_revenue_reports' as table_name, count(*) as remaining_rows from public.daily_revenue_reports
union all select 'temperature_reports', count(*) from public.temperature_reports
union all select 'produce_requests (legacy)', count(*) from public.produce_requests
union all select 'produce_request_items', count(*) from public.produce_request_items
union all select 'produce_request_batches', count(*) from public.produce_request_batches
union all select 'produce_shelf_photo_checks', count(*) from public.produce_shelf_photo_checks
union all select 'store_task_assignments', count(*) from public.store_task_assignments
union all select 'store_tasks', count(*) from public.store_tasks
union all select 'return_proposal_history', count(*) from public.return_proposal_history
union all select 'return_proposal_items', count(*) from public.return_proposal_items
union all select 'return_proposals', count(*) from public.return_proposals
union all select 'biznisoft_price_changes', count(*) from public.biznisoft_price_changes
union all select 'biznisoft_price_snapshots', count(*) from public.biznisoft_price_snapshots
union all select 'biznisoft_stock_price_snapshots', count(*) from public.biznisoft_stock_price_snapshots
union all select 'biznisoft_turnover_cache', count(*) from public.biznisoft_turnover_cache
union all select 'security_operation_locks', count(*) from public.security_operation_locks
order by table_name;

-- PRESERVED MASTER/SYSTEM DATA: review these as nonzero/expected.
select 'stores' as table_name, count(*) as preserved_rows from public.stores
union all select 'profiles', count(*) from public.profiles
union all select 'produce_items', count(*) from public.produce_items
union all select 'temperature_devices', count(*) from public.temperature_devices
union all select 'biznisoft_articles', count(*) from public.biznisoft_articles
union all select 'biznisoft_sale_actions', count(*) from public.biznisoft_sale_actions
union all select 'biznisoft_stock_price_current', count(*) from public.biznisoft_stock_price_current
union all select 'biznisoft_price_current', count(*) from public.biznisoft_price_current
union all select 'biznisoft_pos_price_current', count(*) from public.biznisoft_pos_price_current
union all select 'biznisoft_article_modified_current', count(*) from public.biznisoft_article_modified_current
union all select 'biznisoft_suppliers', count(*) from public.biznisoft_suppliers
union all select 'article_suppliers', count(*) from public.article_suppliers
union all select 'biznisoft_supplier_relation_documents', count(*) from public.biznisoft_supplier_relation_documents
order by table_name;

select role, count(*) as profile_count
from public.profiles
group by role
order by role;

select id, name, biznisoft_storage_id
from public.stores
order by name;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
