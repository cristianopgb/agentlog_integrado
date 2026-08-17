-- Hotfix: one deterministic logistic join key per tenant.
create table if not exists public.tenant_integration_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  primary_logistic_key text not null check (primary_logistic_key in ('delivery_number','document_number','invoice_number','cte_number','manifest_number','order_number')),
  established_by_data_source_id uuid references public.data_sources(id) on delete set null,
  established_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.tenant_integration_settings enable row level security;
drop policy if exists "tenant members view integration settings" on public.tenant_integration_settings;
create policy "tenant members view integration settings" on public.tenant_integration_settings for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'));
drop policy if exists "tenant members manage integration settings" on public.tenant_integration_settings;
drop policy if exists "tenant members insert integration settings" on public.tenant_integration_settings;
create policy "tenant members insert integration settings" on public.tenant_integration_settings for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'));
drop policy if exists "tenant members update integration settings" on public.tenant_integration_settings;
create policy "tenant members update integration settings" on public.tenant_integration_settings for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'));
-- There is intentionally no DELETE policy: ordinary authenticated calls cannot remove the setting.

create or replace function public.protect_tenant_primary_logistic_key()
returns trigger language plpgsql as $$
begin
  if new.primary_logistic_key is distinct from old.primary_logistic_key then
    raise exception 'primary_logistic_key is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_tenant_primary_logistic_key on public.tenant_integration_settings;
create trigger protect_tenant_primary_logistic_key before update on public.tenant_integration_settings
for each row execute function public.protect_tenant_primary_logistic_key();
drop trigger if exists set_tenant_integration_settings_updated_at on public.tenant_integration_settings;
create trigger set_tenant_integration_settings_updated_at before update on public.tenant_integration_settings
for each row execute function public.set_updated_at();

comment on table public.tenant_integration_settings is 'Immutable-by-backend primary logistic key used to join canonical modules for each tenant.';

with f(field_key,name,sort_order) as (values
 ('source_reference','Referência da origem',429),
 ('linked_manifest_number','Manifesto / Romaneio vinculado',430),
 ('linked_order_number','Pedido vinculado',431)
)
insert into public.canonical_fields(tenant_id,canonical_entity_id,field_key,name,data_type,is_required,is_system,sort_order)
select e.tenant_id,e.id,f.field_key,f.name,'text',false,true,f.sort_order
from f join public.canonical_entities e on e.entity_key='occurrences'
where not exists (select 1 from public.canonical_fields cf where cf.tenant_id=e.tenant_id and cf.canonical_entity_id=e.id and cf.field_key=f.field_key);
