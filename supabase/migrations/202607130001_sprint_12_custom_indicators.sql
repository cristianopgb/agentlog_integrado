-- Sprint 12 — Criador controlado de indicadores customizados
create table if not exists public.indicator_field_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  module_key text not null,
  base_table text not null,
  field_key text not null,
  label text not null,
  data_type text not null,
  semantic_type text not null,
  allowed_operations jsonb not null default '[]'::jsonb,
  allowed_filters jsonb not null default '[]'::jsonb,
  is_dimension boolean not null default false,
  is_measure boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, base_table, field_key),
  check (base_table in ('operation_records','transport_records','attendance_records','finance_records','warehouse_records','team_records')),
  check (field_key not in ('tenant_id','id','created_at','updated_at','source_payload_hash','source_staging_record_id','raw_payload'))
);
create table if not exists public.custom_indicator_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  module_key text not null,
  family_key text not null,
  indicator_type text not null,
  value_format text not null,
  base_table text not null,
  operation_key text not null,
  calculation_config jsonb not null default '{}'::jsonb,
  formula_preview text not null default '',
  status text not null default 'draft',
  available_for_dashboard boolean not null default false,
  available_for_reports boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft','active','inactive')),
  check (not (status = 'draft' and available_for_dashboard = true)),
  check (base_table in ('operation_records','transport_records','attendance_records','finance_records','warehouse_records','team_records'))
);
create table if not exists public.custom_indicator_calculation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  custom_indicator_id uuid references public.custom_indicator_definitions(id) on delete set null,
  user_id uuid references auth.users(id),
  execution_type text not null default 'preview',
  status text not null,
  records_considered integer not null default 0,
  formula_preview text,
  fields_used jsonb not null default '[]'::jsonb,
  filters_used jsonb not null default '[]'::jsonb,
  result_preview jsonb not null default '{}'::jsonb,
  message text,
  created_at timestamptz not null default now()
);

alter table public.indicator_field_catalog enable row level security;
alter table public.custom_indicator_definitions enable row level security;
alter table public.custom_indicator_calculation_logs enable row level security;
create index if not exists idx_indicator_field_catalog_lookup on public.indicator_field_catalog(tenant_id, base_table, is_active);
create index if not exists idx_custom_indicator_definitions_tenant_status on public.custom_indicator_definitions(tenant_id, status);
create index if not exists idx_custom_indicator_logs_tenant_indicator on public.custom_indicator_calculation_logs(tenant_id, custom_indicator_id, created_at desc);
drop trigger if exists set_indicator_field_catalog_updated_at on public.indicator_field_catalog; create trigger set_indicator_field_catalog_updated_at before update on public.indicator_field_catalog for each row execute function public.set_updated_at();
drop trigger if exists set_custom_indicator_definitions_updated_at on public.custom_indicator_definitions; create trigger set_custom_indicator_definitions_updated_at before update on public.custom_indicator_definitions for each row execute function public.set_updated_at();

with permission_seed(key, name, module_key, resource, action, description) as (
  values
    ('indicators.manage', 'Gerenciar indicadores personalizados', 'indicators', 'custom_indicators', 'manage', 'Permite criar, editar, ativar e desativar indicadores personalizados.')
)
insert into public.permissions (key, name, module_key, resource, action, description)
select key, name, module_key, resource, action, description from permission_seed
on conflict (key) do update set name=excluded.name, module_key=excluded.module_key, resource=excluded.resource, action=excluded.action, description=excluded.description, updated_at=now();
insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('owner','admin','super_admin','administrador') and p.key in ('indicators.manage')
on conflict (tenant_id, role_id, permission_id) do nothing;

with field_seed(module_key, base_table, field_key, label, data_type, semantic_type, allowed_operations, allowed_filters, is_dimension, is_measure) as (
  values
('transport','operation_records','freight_value','Frete','number','money','["SOMA","MÉDIA","MÍNIMO","MÁXIMO","RAZÃO_DIVISÃO"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,false,true),
('transport','operation_records','gross_weight','Peso bruto','number','weight','["SOMA","MÉDIA","MÍNIMO","MÁXIMO","RAZÃO_DIVISÃO"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,false,true),
('transport','operation_records','volume_count','Volumes','number','quantity','["SOMA","MÉDIA","CONTAGEM","RAZÃO_DIVISÃO"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,false,true),
('transport','operation_records','delivery_number','Entrega','text','identifier','["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false),
('transport','operation_records','destination_state','UF destino','text','state','["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA","RANKING"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false),
('transport','operation_records','driver_name','Motorista','text','person','["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA","RANKING"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false),
('core','operation_records','customer_name','Cliente','text','customer','["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA","RANKING"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false),
('core','operation_records','issued_at','Emissão','date','date','["SÉRIE_TEMPORAL","TEMPO_MÉDIO_ENTRE_DATAS"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,true,false),
('core','operation_records','completed_at','Conclusão','date','date','["SÉRIE_TEMPORAL","TEMPO_MÉDIO_ENTRE_DATAS"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,true,false),
('attendance','operation_records','occurrence_status','Ocorrência','text','status','["CONTAGEM","PERCENTUAL","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false),
('finance','finance_records','total_amount','Valor total financeiro','number','money','["SOMA","MÉDIA","MÍNIMO","MÁXIMO"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,false,true),
('warehouse','warehouse_records','quantity_available','Quantidade disponível','number','quantity','["SOMA","MÉDIA","MÍNIMO","MÁXIMO"]'::jsonb,'["igual a","diferente de","maior que","menor que","entre","preenchido","não preenchido"]'::jsonb,false,true),
('team','team_records','employee_name','Colaborador','text','person','["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","contém","preenchido","não preenchido"]'::jsonb,true,false)
)
insert into public.indicator_field_catalog (tenant_id,module_key,base_table,field_key,label,data_type,semantic_type,allowed_operations,allowed_filters,is_dimension,is_measure)
select null,module_key,base_table,field_key,label,data_type,semantic_type,allowed_operations,allowed_filters,is_dimension,is_measure from field_seed
on conflict (tenant_id, base_table, field_key) do update set label=excluded.label, data_type=excluded.data_type, semantic_type=excluded.semantic_type, allowed_operations=excluded.allowed_operations, allowed_filters=excluded.allowed_filters, is_dimension=excluded.is_dimension, is_measure=excluded.is_measure, is_active=true, updated_at=now();

-- Sprint 12 hardening: disable legacy free-form formula indicators safely.
update public.custom_indicator_definitions
set status = 'draft',
    operation_key = 'count',
    calculation_config = jsonb_build_object(
      'base_table', coalesce(nullif(base_table, ''), 'operation_records'),
      'operation', 'count',
      'operation_key', 'count',
      'legacy_free_formula_disabled', true
    ),
    formula_preview = 'Indicador legado com fórmula livre desativado. Recrie usando seletores controlados.',
    available_for_dashboard = false,
    available_for_reports = false,
    updated_at = now()
where operation_key = 'FÓRMULA_CONTROLADA'
   or calculation_config ? 'formula'
   or calculation_config ? 'formula_ast';

alter table public.custom_indicator_definitions
  drop constraint if exists custom_indicator_definitions_operation_key_controlled_chk;
alter table public.custom_indicator_definitions
  add constraint custom_indicator_definitions_operation_key_controlled_chk
  check (operation_key in ('count','count_distinct','sum','avg','min','max','ratio','percentage','group_by','time_series','ranking','duration_avg'));

alter table public.custom_indicator_definitions
  drop constraint if exists custom_indicator_definitions_no_free_formula_chk;
alter table public.custom_indicator_definitions
  add constraint custom_indicator_definitions_no_free_formula_chk
  check (not (calculation_config ? 'formula') and not (calculation_config ? 'formula_ast'));
