-- READ-ONLY verification. Run in Supabase SQL Editor after account creation.
-- Safe result: ten rows, every binding_status = OK, and no radnja10 result.

with expected(username, store_name) as (
  values
    ('radnja1', 'Radnja 1'),
    ('radnja2', 'Radnja 2'),
    ('radnja3', 'Radnja 3'),
    ('radnja4', 'Radnja 4'),
    ('radnja5', 'Radnja 5'),
    ('radnja6', 'Radnja 6'),
    ('radnja7', 'Radnja 7'),
    ('radnja8', 'Radnja 8'),
    ('radnja9', 'Radnja 9'),
    ('radnja11', 'Radnja 11')
)
select
  expected.username,
  expected.store_name as expected_store,
  auth_user.id as auth_user_id,
  profile.role,
  actual_store.name as actual_store,
  case
    when auth_user.id is null then 'MISSING_AUTH_USER'
    when profile.id is null then 'MISSING_PROFILE'
    when profile.role <> 'store' then 'WRONG_ROLE'
    when profile.store_id is distinct from expected_store.id then 'WRONG_STORE'
    else 'OK'
  end as binding_status
from expected
left join auth.users auth_user
  on lower(auth_user.email) = expected.username || '@firma.local'
left join public.profiles profile on profile.id = auth_user.id
left join public.stores expected_store on expected_store.name = expected.store_name
left join public.stores actual_store on actual_store.id = profile.store_id
order by expected.store_name;

-- Safe result: zero rows. This does not delete an unexpected account.
select auth_user.id as forbidden_auth_user_id, auth_user.email, profile.role, store.name
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
left join public.stores store on store.id = profile.store_id
where lower(auth_user.email) = 'radnja10@firma.local';

-- Safe result: zero rows. Any row is an unexpected store account requiring review.
with expected_email(email) as (
  values
    ('radnja1@firma.local'), ('radnja2@firma.local'), ('radnja3@firma.local'),
    ('radnja4@firma.local'), ('radnja5@firma.local'), ('radnja6@firma.local'),
    ('radnja7@firma.local'), ('radnja8@firma.local'), ('radnja9@firma.local'),
    ('radnja11@firma.local')
)
select profile.id, profile.email as profile_email, auth_user.email as auth_email, store.name as store_name
from public.profiles profile
left join auth.users auth_user on auth_user.id = profile.id
left join public.stores store on store.id = profile.store_id
where profile.role = 'store'
  and not exists (
    select 1 from expected_email
    where expected_email.email = lower(auth_user.email)
  );

-- Admin profiles must remain present and unchanged.
select profile.id, profile.email, profile.role, profile.store_id
from public.profiles profile
where profile.role = 'admin'
order by profile.email;

-- Database-level account invariant and profile RLS status.
select constraint_name, check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and constraint_name = 'profiles_admin_store_null';

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

-- Safe result: no INSERT/UPDATE/DELETE policy for ordinary store users.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by cmd, policyname;
