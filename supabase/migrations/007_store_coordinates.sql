alter table public.stores add column if not exists latitude numeric;
alter table public.stores add column if not exists longitude numeric;
alter table public.stores add column if not exists address text;

update public.stores
set latitude = 43.14636361437266,
    longitude = 21.872217040944182
where name = 'Radnja 1';

update public.stores
set latitude = 43.074931369118765,
    longitude = 21.936103678025855
where name = 'Radnja 2';

update public.stores
set latitude = 43.13594558460894,
    longitude = 21.841264809021187
where name = 'Radnja 3';

update public.stores
set latitude = 43.10011894231299,
    longitude = 21.92824332084508
where name = 'Radnja 4';

update public.stores
set latitude = 43.13274123485969,
    longitude = 21.901452410866906
where name = 'Radnja 5';

update public.stores
set latitude = 43.15290112086575,
    longitude = 21.875902336355896
where name = 'Radnja 6';

update public.stores
set latitude = 43.098834451619595,
    longitude = 21.914737693317033
where name = 'Radnja 7';

update public.stores
set latitude = 43.11798775469654,
    longitude = 21.835154787174407
where name = 'Radnja 8';

update public.stores
set latitude = 42.996312895837356,
    longitude = 21.95381370779405
where name = 'Radnja 9';

update public.stores
set latitude = 43.10824815449931,
    longitude = 21.946754022497014
where name = 'Radnja 11';
