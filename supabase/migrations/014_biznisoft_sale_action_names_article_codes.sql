alter table public.biznisoft_sale_actions
add column if not exists sale_action_name text;

alter table public.biznisoft_articles
add column if not exists article_code text;

create index if not exists idx_biznisoft_articles_article_code
on public.biznisoft_articles(article_code);

create or replace view public.biznisoft_sale_actions_with_articles
with (security_invoker = true)
as
select
  bsa.id,
  bsa.source_key,
  bsa.sale_action_name,
  bsa.action_type,
  bsa.loyalty_level,
  bsa.storage_id,
  bsa.article_id,
  bsa.article_attribute_id,
  bsa.discount_percent,
  bsa.wholesale_price,
  bsa.retail_price,
  bsa.from_chapter,
  bsa.chapter_to,
  bsa.priority_level,
  bsa.raw,
  bsa.synced_at,
  ba.name as article_name,
  ba.barcode as article_barcode,
  ba.article_code,
  ba.cat_no as article_cat_no,
  ba.unit as article_unit,
  ba.raw as article_raw
from public.biznisoft_sale_actions bsa
left join public.biznisoft_articles ba
  on ba.article_id = bsa.article_id;

notify pgrst, 'reload schema';
