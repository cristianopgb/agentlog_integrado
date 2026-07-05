do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'data_sources_id_tenant_id_key') then
    alter table public.data_sources add constraint data_sources_id_tenant_id_key unique (id, tenant_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contracts_id_tenant_id_key') then
    alter table public.data_contracts add constraint data_contracts_id_tenant_id_key unique (id, tenant_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contract_fields_id_tenant_id_key') then
    alter table public.data_contract_fields add constraint data_contract_fields_id_tenant_id_key unique (id, tenant_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contracts_data_source_tenant_fk') then
    alter table public.data_contracts
      add constraint data_contracts_data_source_tenant_fk
      foreign key (data_source_id, tenant_id)
      references public.data_sources (id, tenant_id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contract_fields_contract_tenant_fk') then
    alter table public.data_contract_fields
      add constraint data_contract_fields_contract_tenant_fk
      foreign key (data_contract_id, tenant_id)
      references public.data_contracts (id, tenant_id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contract_allowed_values_contract_tenant_fk') then
    alter table public.data_contract_allowed_values
      add constraint data_contract_allowed_values_contract_tenant_fk
      foreign key (data_contract_id, tenant_id)
      references public.data_contracts (id, tenant_id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'data_contract_allowed_values_field_tenant_fk') then
    alter table public.data_contract_allowed_values
      add constraint data_contract_allowed_values_field_tenant_fk
      foreign key (data_contract_field_id, tenant_id)
      references public.data_contract_fields (id, tenant_id)
      on delete cascade;
  end if;
end $$;

drop policy if exists "members can create data contracts with permission" on public.data_contracts;
create policy "members can create data contracts with permission" on public.data_contracts
  for insert to authenticated
  with check (
    public.is_member_of_tenant(tenant_id)
    and public.user_has_permission(tenant_id, 'core.data_contracts.create')
    and (status <> 'active' or public.user_has_permission(tenant_id, 'core.data_contracts.activate'))
  );

drop policy if exists "members can update data contracts with permission" on public.data_contracts;
create policy "members can update data contracts with permission" on public.data_contracts
  for update to authenticated
  using (
    public.is_member_of_tenant(tenant_id)
    and public.user_has_permission(tenant_id, 'core.data_contracts.update')
  )
  with check (
    public.is_member_of_tenant(tenant_id)
    and public.user_has_permission(tenant_id, 'core.data_contracts.update')
    and (status <> 'active' or public.user_has_permission(tenant_id, 'core.data_contracts.activate'))
  );
