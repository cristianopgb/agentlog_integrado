create table public.data_source_value_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null,
  data_contract_id uuid not null,
  data_contract_field_id uuid not null,
  source_field_name text not null,
  source_value text not null,
  target_value text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, data_source_id, data_contract_field_id, source_field_name, source_value),
  foreign key (data_source_id, tenant_id) references public.data_sources(id, tenant_id) on delete cascade,
  foreign key (data_contract_id, tenant_id) references public.data_contracts(id, tenant_id) on delete cascade,
  foreign key (data_contract_field_id, tenant_id) references public.data_contract_fields(id, tenant_id) on delete cascade,
  check (status in ('active', 'revoked')),
  check (source_field_name <> '' and source_value <> '' and target_value <> '')
);

create index idx_data_source_value_mappings_lookup on public.data_source_value_mappings
  (tenant_id, data_source_id, data_contract_field_id);
create trigger set_data_source_value_mappings_updated_at before update on public.data_source_value_mappings
  for each row execute function public.set_updated_at();

alter table public.data_source_value_mappings enable row level security;
create policy "tenant members read value mappings" on public.data_source_value_mappings for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'integrations.value_mappings.read'));
create policy "tenant members manage value mappings" on public.data_source_value_mappings for all to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'integrations.value_mappings.manage'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'integrations.value_mappings.manage'));

with permission_seed(key,name,module_key,resource,action,description) as (values
 ('integrations.value_mappings.read','Visualizar De/Para de valores','integrations','value_mappings','read','Visualizar conversões controladas das integrações.'),
 ('integrations.value_mappings.manage','Gerenciar De/Para de valores','integrations','value_mappings','manage','Configurar conversões controladas das integrações.'))
insert into public.permissions(key,name,module_key,resource,action,description)
select * from permission_seed on conflict(key) do update set name=excluded.name,description=excluded.description,updated_at=now();

insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.key='owner' and p.key in ('integrations.value_mappings.read','integrations.value_mappings.manage') on conflict do nothing;

-- Remove external synonyms from the persisted native indicator formula. Incoming
-- synonyms now belong exclusively to tenant/source value mappings.
update public.native_indicator_definitions
set calculation_config = jsonb_set(calculation_config, '{numerator,filter,0,value}', '["met","on_time"]'::jsonb, false),
    updated_at = now()
where indicator_key = 'transport_sla_compliance'
  and calculation_config #> '{numerator,filter,0,value}' is not null;
