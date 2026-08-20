-- Logistic identity is established explicitly during tenant setup. Detection
-- remains descriptive and must never approve a canonical mapping implicitly.
drop trigger if exists ensure_api_delivery_canonical_mapping
  on public.data_contract_fields;

create or replace function public.ensure_api_delivery_canonical_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Kept only for compatibility with callers that may still resolve the
  -- function by name. No trigger is allowed to invoke it.
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where not trigger.tgisinternal
      and namespace.nspname = 'public'
      and procedure.proname = 'ensure_api_delivery_canonical_mapping'
  ) then
    raise exception 'ensure_api_delivery_canonical_mapping still has an active trigger';
  end if;
end;
$$;

-- Unlike a static unique index, this guard can identify the tenant's official
-- key dynamically and does not restrict ordinary canonical destinations.
create or replace function public.protect_official_logistic_key_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_official_destination boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select exists (
    select 1
    from public.tenant_integration_settings settings
    join public.canonical_entities entity
      on entity.tenant_id = settings.tenant_id
     and entity.entity_key = 'operation_records'
    join public.canonical_fields field
      on field.tenant_id = settings.tenant_id
     and field.canonical_entity_id = entity.id
     and field.field_key = settings.primary_logistic_key
    where settings.tenant_id = new.tenant_id
      and entity.id = new.canonical_entity_id
      and field.id = new.canonical_field_id
  ) into v_is_official_destination;

  if v_is_official_destination then
    -- Serialize approvals for this semantic destination so concurrent
    -- transactions cannot both pass the duplicate check.
    perform pg_advisory_xact_lock(
      hashtextextended(
        new.tenant_id::text || ':' || new.data_contract_id::text || ':' ||
        new.canonical_entity_id::text || ':' || new.canonical_field_id::text,
        0
      )
    );
  end if;

  if v_is_official_destination and exists (
    select 1
    from public.field_mappings mapping
    where mapping.tenant_id = new.tenant_id
      and mapping.data_contract_id = new.data_contract_id
      and mapping.canonical_entity_id = new.canonical_entity_id
      and mapping.canonical_field_id = new.canonical_field_id
      and mapping.status = 'active'
      and mapping.id is distinct from new.id
  ) then
    raise exception 'the official logistic key destination already has an active mapping in this contract'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_official_logistic_key_mapping on public.field_mappings;
create trigger protect_official_logistic_key_mapping
before insert or update of status, canonical_entity_id, canonical_field_id,
  data_contract_id, tenant_id
on public.field_mappings
for each row execute function public.protect_official_logistic_key_mapping();

comment on function public.ensure_api_delivery_canonical_mapping() is
  'Compatibility no-op: API detection cannot create approved mappings or tenant identity.';
