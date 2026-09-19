-- READ-ONLY production security verification for Supabase SQL Editor.
-- Run after all migrations. Every result set below is inspection-only.

-- Important tables should have rowsecurity=true. Missing expected tables indicate schema drift.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage') and c.relkind = 'r'
  and c.relname in (
    'profiles', 'stores', 'daily_revenue_reports', 'temperature_reports',
    'temperature_devices', 'produce_request_batches', 'produce_request_items',
    'produce_shelf_photo_checks', 'store_tasks', 'store_task_assignments',
    'return_proposals', 'return_proposal_items', 'return_proposal_history',
    'biznisoft_suppliers', 'article_suppliers', 'security_operation_locks', 'objects'
  )
order by schema_name, table_name;

-- Store policies should constrain rows through auth/profile ownership; admin policies call is_admin().
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, cmd, policyname;

-- RLS tables without policies should be service-only and explicitly documented.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by c.relname;

-- Safe result: no unexplained business-table writes granted to PUBLIC or anon.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('PUBLIC', 'anon')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
order by table_schema, table_name, grantee, privilege_type;

-- Security-definer functions need an explicit search_path and justified execute grants.
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig as function_settings, p.proacl as access_control
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname, arguments;

-- Identity helpers must derive role/store from auth.uid() and profiles.
select n.nspname as schema_name, p.proname, pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role', 'current_user_store_id', 'is_admin',
    'claim_security_operation', 'claim_biznisoft_turnover_refresh'
  )
order by p.proname;

-- Lease functions should be service-role-only; trigger functions need no direct client grant.
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'current_user_role', 'current_user_store_id', 'is_admin',
    'claim_security_operation', 'claim_biznisoft_turnover_refresh',
    'guard_store_task_completion_photo', 'set_return_item_supplier_snapshot'
  )
order by routine_name, grantee;

-- Safe result: security_invoker=true and anon_can_select=false.
select n.nspname as schema_name, c.relname as view_name, c.reloptions,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'biznisoft_article_lookup';
