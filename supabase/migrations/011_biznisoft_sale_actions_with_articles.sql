create or replace view public.biznisoft_sale_actions_with_articles
with (security_invoker = true)
as
select
  bsa.id,
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
  ba.raw as article_raw
from public.biznisoft_sale_actions bsa
left join public.biznisoft_articles ba
  on ba.article_id = bsa.article_id;
