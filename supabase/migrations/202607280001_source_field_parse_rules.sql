-- Source-specific, deterministic parsing configuration shared by API and spreadsheet inputs.
create table public.data_source_field_parse_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null,
  data_contract_id uuid not null,
  data_contract_field_id uuid not null,
  source_field_name text not null,
  data_type text not null,
  date_format text,
  timezone text,
  decimal_separator text,
  thousand_separator text,
  boolean_true_values text[],
  boolean_false_values text[],
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id,data_source_id,data_contract_field_id,source_field_name),
  foreign key (data_source_id,tenant_id) references public.data_sources(id,tenant_id) on delete cascade,
  foreign key (data_contract_id,tenant_id) references public.data_contracts(id,tenant_id) on delete cascade,
  constraint field_parse_rule_contract_field_tenant_fk foreign key (data_contract_field_id,tenant_id) references public.data_contract_fields(id,tenant_id) on delete cascade,
  check (data_type in ('date','datetime','decimal','number','integer','boolean')),
  check (date_format is null or date_format in ('YYYY-MM-DD','YYYY-MM-DDTHH:mm:ss','YYYY-MM-DDTHH:mm:ss.SSSZ','DD/MM/YYYY','DD/MM/YYYY HH:mm','DD/MM/YYYY HH:mm:ss','MM/DD/YYYY','MM/DD/YYYY HH:mm','MM/DD/YYYY HH:mm:ss')),
  check (decimal_separator is null or decimal_separator in ('.',',')),
  check (thousand_separator is null or thousand_separator in ('.',',')),
  check (decimal_separator is null or thousand_separator is null or decimal_separator <> thousand_separator),
  check (status in ('active','inactive','revoked'))
);
create index on public.data_source_field_parse_rules(tenant_id,data_source_id,status);
create trigger set_field_parse_rules_updated_at before update on public.data_source_field_parse_rules for each row execute function public.set_updated_at();
alter table public.data_source_field_parse_rules enable row level security;
create policy "tenant members read field parse rules" on public.data_source_field_parse_rules for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.field_formats.read'));
create policy "tenant members manage field parse rules" on public.data_source_field_parse_rules for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.field_formats.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.field_formats.manage'));

with p(key,name,module_key,resource,action,description) as (values
 ('integrations.field_formats.read','Visualizar formatos de campos','integrations','field_formats','read','Visualizar parsing declarativo por fonte e campo.'),
 ('integrations.field_formats.manage','Gerenciar formatos de campos','integrations','field_formats','manage','Configurar parsing determinístico por fonte e campo.'))
insert into public.permissions(key,name,module_key,resource,action,description) select * from p on conflict(key) do update set name=excluded.name,description=excluded.description,updated_at=now();
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key in ('integrations.field_formats.read','integrations.field_formats.manage') on conflict do nothing;
