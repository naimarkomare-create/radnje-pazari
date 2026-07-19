create or replace function public.set_return_item_supplier_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  connected_supplier_count integer;

  selected_supplier_id uuid;
  selected_supplier_partner_id text;
  selected_supplier_name text;
  selected_relation_source text;
begin
  -- Ako se pri izmeni nisu promenili artikal ni dobavljač,
  -- zadržavamo postojeći istorijski snapshot.
  if tg_op = 'UPDATE'
    and new.article_id is not distinct from old.article_id
    and new.supplier_id is not distinct from old.supplier_id
  then
    new.supplier_partner_id := old.supplier_partner_id;
    new.supplier_name := old.supplier_name;
    new.supplier_relation_source := old.supplier_relation_source;

    return new;
  end if;

  -- Dobavljač nije ručno prosleđen.
  if new.supplier_id is null then
    select count(*)
    into connected_supplier_count
    from public.article_suppliers article_supplier
    join public.biznisoft_suppliers supplier
      on supplier.id = article_supplier.supplier_id
    where article_supplier.article_id = new.article_id
      and supplier.is_active;

    if connected_supplier_count > 1 then
      raise exception 'Izaberite dobavljača za ovaj artikal.';
    end if;

    if connected_supplier_count = 1 then
      select
        supplier.id,
        supplier.biznisoft_partner_id,
        supplier.name,
        article_supplier.relation_source
      into
        selected_supplier_id,
        selected_supplier_partner_id,
        selected_supplier_name,
        selected_relation_source
      from public.article_suppliers article_supplier
      join public.biznisoft_suppliers supplier
        on supplier.id = article_supplier.supplier_id
      where article_supplier.article_id = new.article_id
        and supplier.is_active
      order by
        article_supplier.is_primary desc,
        article_supplier.updated_at desc nulls last
      limit 1;

      new.supplier_id := selected_supplier_id;
      new.supplier_partner_id := selected_supplier_partner_id;
      new.supplier_name := selected_supplier_name;
      new.supplier_relation_source := selected_relation_source;
    else
      new.supplier_partner_id := null;
      new.supplier_name := null;
      new.supplier_relation_source := null;
    end if;

    return new;
  end if;

  -- Dobavljač je ručno izabran ili prosleđen iz aplikacije.
  select
    supplier.id,
    supplier.biznisoft_partner_id,
    supplier.name,
    article_supplier.relation_source
  into
    selected_supplier_id,
    selected_supplier_partner_id,
    selected_supplier_name,
    selected_relation_source
  from public.biznisoft_suppliers supplier
  left join public.article_suppliers article_supplier
    on article_supplier.article_id = new.article_id
   and article_supplier.supplier_id = supplier.id
  where supplier.id = new.supplier_id
    and supplier.is_active
  order by
    article_supplier.is_primary desc nulls last,
    article_supplier.updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Izabrani dobavljač nije aktivan ili ne postoji.';
  end if;

  new.supplier_partner_id := selected_supplier_partner_id;
  new.supplier_name := selected_supplier_name;
  new.supplier_relation_source :=
    coalesce(selected_relation_source, 'manual_selection');

  return new;
end;
$$;

revoke all
on function public.set_return_item_supplier_snapshot()
from public;