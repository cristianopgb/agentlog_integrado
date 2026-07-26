create table public.data_source_api_configs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null, base_url text not null, endpoint_path text not null, method text not null default 'GET',
  auth_type text not null default 'none', auth_header_name text, credentials_encrypted text, response_root_path text,
  external_id_field text, updated_at_field text, updated_since_param text, page_param text, page_size_param text,
  page_size integer not null default 100, auto_sync_enabled boolean not null default false, sync_frequency_minutes integer,
  last_cursor text, last_sync_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz,
  last_error_safe text, next_sync_at timestamptz, detected_fields jsonb not null default '[]'::jsonb,
  sample_preview jsonb not null default '[]'::jsonb, sample_http_status integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, data_source_id), unique (id, tenant_id),
  foreign key (data_source_id, tenant_id) references public.data_sources(id, tenant_id) on delete cascade,
  check (method = 'GET'), check (auth_type in ('none','bearer_token','api_key_header','basic')),
  check (page_size between 1 and 500), check (sync_frequency_minutes is null or sync_frequency_minutes in (15,60,1440))
);
create table public.data_source_api_sync_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null, staging_batch_id uuid, sync_type text not null, status text not null default 'running',
  started_at timestamptz not null default now(), finished_at timestamptz, http_status integer,
  received_count integer not null default 0, accepted_count integer not null default 0, rejected_count integer not null default 0,
  unchanged_count integer not null default 0, error_message_safe text, cursor_before text, cursor_after text, created_at timestamptz not null default now(),
  foreign key (data_source_id, tenant_id) references public.data_sources(id, tenant_id) on delete cascade,
  foreign key (staging_batch_id, tenant_id) references public.staging_batches(id, tenant_id) on delete set null,
  check (sync_type in ('manual','scheduled')), check (status in ('running','completed','completed_with_errors','failed'))
);
create table public.data_source_api_record_states (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null, external_id text not null, source_updated_at text not null default '', payload_hash text not null,
  staging_batch_id uuid not null, staging_record_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,data_source_id,external_id,source_updated_at,payload_hash),
  foreign key (data_source_id,tenant_id) references public.data_sources(id,tenant_id) on delete cascade,
  foreign key (staging_batch_id,tenant_id) references public.staging_batches(id,tenant_id) on delete cascade,
  foreign key (staging_record_id,tenant_id) references public.staging_records(id,tenant_id) on delete set null
);
create table public.data_source_api_field_mappings (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null, data_contract_id uuid not null, data_contract_field_id uuid not null,
  source_field_name text not null, status text not null default 'active', created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,data_source_id,source_field_name), unique(tenant_id,data_source_id,data_contract_field_id),
  foreign key(data_source_id,tenant_id) references public.data_sources(id,tenant_id) on delete cascade,
  foreign key(data_contract_id,tenant_id) references public.data_contracts(id,tenant_id) on delete cascade,
  constraint api_field_mapping_contract_field_tenant_fk foreign key(data_contract_field_id,tenant_id) references public.data_contract_fields(id,tenant_id) on delete cascade,
  check(status in ('active','inactive'))
);
create index on public.data_source_api_field_mappings(tenant_id,data_source_id,status);
alter table public.data_source_api_field_mappings enable row level security;
create policy "tenant members view api field mappings" on public.data_source_api_field_mappings for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'));
create trigger set_api_field_mappings_updated_at before update on public.data_source_api_field_mappings for each row execute function public.set_updated_at();
create index on public.data_source_api_configs(tenant_id,data_source_id);
create index on public.data_source_api_configs(auto_sync_enabled,next_sync_at) where auto_sync_enabled;
create index on public.data_source_api_sync_runs(tenant_id,data_source_id,created_at desc);
create index on public.data_source_api_record_states(tenant_id,data_source_id,external_id);
create trigger set_api_configs_updated_at before update on public.data_source_api_configs for each row execute function public.set_updated_at();
create trigger set_api_record_states_updated_at before update on public.data_source_api_record_states for each row execute function public.set_updated_at();
alter table public.data_source_api_configs enable row level security;
alter table public.data_source_api_sync_runs enable row level security;
alter table public.data_source_api_record_states enable row level security;
create policy "tenant members view api configs" on public.data_source_api_configs for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.configure'));
create policy "tenant members view api runs" on public.data_source_api_sync_runs for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'integrations.api.view_logs'));
with permission_seed(key,name,module_key,resource,action,description) as (values
 ('integrations.api.configure','Configurar API','integrations','api','configure','Configurar conexão API de leitura.'),
 ('integrations.api.test','Testar API','integrations','api','test','Testar conexão API.'),
 ('integrations.api.sync_now','Sincronizar API','integrations','api','sync_now','Executar sincronização API.'),
 ('integrations.api.manage_auto_sync','Agendar API','integrations','api','manage_auto_sync','Gerenciar atualização automática.'),
 ('integrations.api.view_logs','Ver logs de API','integrations','api','view_logs','Visualizar logs de sincronização API.'))
insert into public.permissions(key,name,module_key,resource,action,description) select * from permission_seed on conflict(key) do update set name=excluded.name,description=excluded.description,updated_at=now();
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key like 'integrations.api.%' on conflict do nothing;
