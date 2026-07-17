-- Deduplicate global indicator field catalog entries and enforce defensive uniqueness.
with ranked as (
  select
    id,
    row_number() over (
      partition by base_table, field_key
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as rn
  from public.indicator_field_catalog
  where tenant_id is null
)
delete from public.indicator_field_catalog catalog
using ranked
where catalog.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists indicator_field_catalog_tenant_base_field_uidx
  on public.indicator_field_catalog (
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    base_table,
    field_key
  );
