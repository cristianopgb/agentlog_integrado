create table if not exists public.staging_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  data_contract_id uuid not null references public.data_contracts(id) on delete restrict,
  batch_code text, source_reference text, status text not null default 'draft',
  total_records integer not null default 0, valid_records integer not null default 0, invalid_records integer not null default 0, error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb, received_at timestamptz, validated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  constraint staging_batches_status_check check (status in ('draft','received','validating','validated','partially_valid','rejected','cancelled')),
  constraint staging_batches_counts_check check (total_records >= 0 and valid_records >= 0 and invalid_records >= 0 and error_count >= 0),
  constraint staging_batches_id_tenant_unique unique (id, tenant_id)
);
create table if not exists public.staging_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staging_batch_id uuid not null references public.staging_batches(id) on delete cascade,
  data_contract_id uuid not null references public.data_contracts(id) on delete restrict,
  row_number integer not null,
  raw_payload jsonb not null, normalized_payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending', error_count integer not null default 0, validated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(staging_batch_id, row_number),
  constraint staging_records_id_tenant_unique unique (id, tenant_id),
  constraint staging_records_validation_status_check check (validation_status in ('pending','valid','invalid','ignored')),
  constraint staging_records_counts_check check (row_number > 0 and error_count >= 0)
);
create table if not exists public.staging_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staging_batch_id uuid not null references public.staging_batches(id) on delete cascade,
  staging_record_id uuid references public.staging_records(id) on delete cascade,
  data_contract_field_id uuid references public.data_contract_fields(id) on delete set null,
  error_code text not null, severity text not null default 'error', field_key text, source_field_name text, raw_value text, expected_rule text, message text not null,
  created_at timestamptz not null default now(),
  constraint staging_errors_severity_check check (severity in ('info','warning','error'))
);

do $$ begin
  alter table public.staging_batches add constraint staging_batches_data_source_tenant_fk foreign key (data_source_id, tenant_id) references public.data_sources(id, tenant_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staging_batches add constraint staging_batches_data_contract_tenant_fk foreign key (data_contract_id, tenant_id) references public.data_contracts(id, tenant_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staging_records add constraint staging_records_batch_tenant_fk foreign key (staging_batch_id, tenant_id) references public.staging_batches(id, tenant_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staging_records add constraint staging_records_contract_tenant_fk foreign key (data_contract_id, tenant_id) references public.data_contracts(id, tenant_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staging_errors add constraint staging_errors_batch_tenant_fk foreign key (staging_batch_id, tenant_id) references public.staging_batches(id, tenant_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staging_errors add constraint staging_errors_record_tenant_fk foreign key (staging_record_id, tenant_id) references public.staging_records(id, tenant_id);
exception when duplicate_object then null; end $$;

create index if not exists idx_staging_batches_tenant_id on public.staging_batches(tenant_id);
create index if not exists idx_staging_batches_data_source_id on public.staging_batches(data_source_id);
create index if not exists idx_staging_batches_data_contract_id on public.staging_batches(data_contract_id);
create index if not exists idx_staging_batches_status on public.staging_batches(status);
create index if not exists idx_staging_records_tenant_id on public.staging_records(tenant_id);
create index if not exists idx_staging_records_staging_batch_id on public.staging_records(staging_batch_id);
create index if not exists idx_staging_records_data_contract_id on public.staging_records(data_contract_id);
create index if not exists idx_staging_records_validation_status on public.staging_records(validation_status);
create index if not exists idx_staging_errors_tenant_id on public.staging_errors(tenant_id);
create index if not exists idx_staging_errors_staging_batch_id on public.staging_errors(staging_batch_id);
create index if not exists idx_staging_errors_staging_record_id on public.staging_errors(staging_record_id);
create index if not exists idx_staging_errors_error_code on public.staging_errors(error_code);

create trigger set_staging_batches_updated_at before update on public.staging_batches for each row execute function public.set_updated_at();
create trigger set_staging_records_updated_at before update on public.staging_records for each row execute function public.set_updated_at();

alter table public.staging_batches enable row level security; alter table public.staging_records enable row level security; alter table public.staging_errors enable row level security;
drop policy if exists "members can read staging batches with permission" on public.staging_batches; create policy "members can read staging batches with permission" on public.staging_batches for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_batches.view'));
drop policy if exists "members can create staging batches with permission" on public.staging_batches; create policy "members can create staging batches with permission" on public.staging_batches for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_batches.create'));
drop policy if exists "members can update staging batches with permission" on public.staging_batches; create policy "members can update staging batches with permission" on public.staging_batches for update to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_batches.update')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_batches.update'));
drop policy if exists "members can read staging records with permission" on public.staging_records; create policy "members can read staging records with permission" on public.staging_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_records.view'));
drop policy if exists "members can create staging records with permission" on public.staging_records; create policy "members can create staging records with permission" on public.staging_records for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_records.create'));
drop policy if exists "members can read staging errors with permission" on public.staging_errors; create policy "members can read staging errors with permission" on public.staging_errors for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'core.staging_errors.view'));

with permission_seed(key,name,module_key,resource,action,description) as (values
('core.staging_batches.view','Visualizar lotes de staging','core','staging_batches','view','Permite visualizar lotes de staging.'),
('core.staging_batches.create','Criar lotes de staging','core','staging_batches','create','Permite criar lotes de staging.'),
('core.staging_batches.update','Atualizar lotes de staging','core','staging_batches','update','Permite atualizar metadados de lotes de staging.'),
('core.staging_batches.validate','Validar lotes de staging','core','staging_batches','validate','Permite executar validação determinística de staging.'),
('core.staging_records.view','Visualizar registros de staging','core','staging_records','view','Permite visualizar registros brutos e normalizados de staging.'),
('core.staging_records.create','Criar registros de staging','core','staging_records','create','Permite criar registros brutos de staging.'),
('core.staging_errors.view','Visualizar erros de staging','core','staging_errors','view','Permite visualizar erros de validação de staging.'))
insert into public.permissions (key,name,module_key,resource,action,description) select * from permission_seed on conflict (key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now();
insert into public.role_permissions (tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key like 'core.staging_%' on conflict (tenant_id,role_id,permission_id) do nothing;

create or replace function public.validate_staging_batch(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_batch public.staging_batches%rowtype; v_record public.staging_records%rowtype; v_field record; v_key text; v_value jsonb; v_text text; v_record_errors integer; v_normalized jsonb; v_total integer; v_valid integer; v_invalid integer; v_errors integer; v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_batch from public.staging_batches where id = p_batch_id;
  if not found then raise exception 'Staging batch not found.'; end if;
  if not public.is_member_of_tenant(v_batch.tenant_id) then raise exception 'User is not a member of this tenant.'; end if;
  if not public.user_has_permission(v_batch.tenant_id, 'core.staging_batches.validate') then raise exception 'User does not have permission to validate staging batches.'; end if;
  update public.staging_batches set status = 'validating', updated_by = v_user_id where id = v_batch.id and tenant_id = v_batch.tenant_id;
  delete from public.staging_errors where staging_batch_id = v_batch.id and tenant_id = v_batch.tenant_id;

  for v_record in select * from public.staging_records where staging_batch_id = v_batch.id and tenant_id = v_batch.tenant_id order by row_number loop
    v_record_errors := 0; v_normalized := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_record.raw_payload) loop
      if not exists (select 1 from public.data_contract_fields f where f.tenant_id = v_batch.tenant_id and f.data_contract_id = v_batch.data_contract_id and f.source_field_name = v_key) then
        insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,'UNKNOWN_FIELD',null,v_key,v_record.raw_payload->>v_key,'contract source_field_name','Campo fora do contrato de dados.');
        v_record_errors := v_record_errors + 1;
      end if;
    end loop;
    for v_field in select * from public.data_contract_fields where tenant_id = v_batch.tenant_id and data_contract_id = v_batch.data_contract_id order by sort_order,id loop
      v_value := v_record.raw_payload -> v_field.source_field_name; v_text := v_record.raw_payload ->> v_field.source_field_name;
      if not (v_record.raw_payload ? v_field.source_field_name) then
        if v_field.is_required then
          insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'REQUIRED_FIELD_MISSING',v_field.field_key,v_field.source_field_name,'required','Campo obrigatório ausente.');
          v_record_errors := v_record_errors + 1;
        end if;
        continue;
      end if;
      if v_value = 'null'::jsonb or (jsonb_typeof(v_value) = 'string' and btrim(v_text) = '') then
        if not v_field.allow_null then
          insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'NULL_NOT_ALLOWED',v_field.field_key,v_field.source_field_name,v_text,'allow_null=false','Nulo ou vazio não permitido.');
          v_record_errors := v_record_errors + 1;
        else v_normalized := jsonb_set(v_normalized, array[v_field.field_key], 'null'::jsonb, true); end if;
        continue;
      end if;
      if (v_field.data_type='text' and jsonb_typeof(v_value) <> 'string') or (v_field.data_type='integer' and not (jsonb_typeof(v_value)='number' and v_text ~ '^-?\d+$')) or (v_field.data_type='decimal' and not (jsonb_typeof(v_value)='number' or v_text ~ '^-?\d+(\.\d+)?$')) or (v_field.data_type='boolean' and jsonb_typeof(v_value) <> 'boolean') or (v_field.data_type in ('date','datetime','enum') and jsonb_typeof(v_value) <> 'string') or (v_field.data_type='json' and jsonb_typeof(v_value) not in ('object','array')) then
        insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'INVALID_TYPE',v_field.field_key,v_field.source_field_name,v_text,v_field.data_type,'Tipo incompatível com o contrato.');
        v_record_errors := v_record_errors + 1;
      end if;
      if v_field.data_type='enum' and not exists (select 1 from public.data_contract_allowed_values av where av.tenant_id=v_batch.tenant_id and av.data_contract_field_id=v_field.id and av.is_active and av.value=v_text) then
        insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'INVALID_ENUM_VALUE',v_field.field_key,v_field.source_field_name,v_text,'active allowed values','Valor não permitido para enum.');
        v_record_errors := v_record_errors + 1;
      end if;
      if v_field.min_length is not null and length(v_text) < v_field.min_length then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'MIN_LENGTH',v_field.field_key,v_field.source_field_name,v_text,'min_length='||v_field.min_length,'Valor menor que o tamanho mínimo.'); v_record_errors := v_record_errors + 1; end if;
      if v_field.max_length is not null and length(v_text) > v_field.max_length then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'MAX_LENGTH',v_field.field_key,v_field.source_field_name,v_text,'max_length='||v_field.max_length,'Valor maior que o tamanho máximo.'); v_record_errors := v_record_errors + 1; end if;
      if v_field.min_value is not null and v_text ~ '^-?\d+(\.\d+)?$' and v_text::numeric < v_field.min_value then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'MIN_VALUE',v_field.field_key,v_field.source_field_name,v_text,'min_value='||v_field.min_value,'Valor menor que o mínimo.'); v_record_errors := v_record_errors + 1; end if;
      if v_field.max_value is not null and v_text ~ '^-?\d+(\.\d+)?$' and v_text::numeric > v_field.max_value then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'MAX_VALUE',v_field.field_key,v_field.source_field_name,v_text,'max_value='||v_field.max_value,'Valor maior que o máximo.'); v_record_errors := v_record_errors + 1; end if;
      if v_field.regex_pattern is not null and v_text !~ v_field.regex_pattern then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'REGEX_MISMATCH',v_field.field_key,v_field.source_field_name,v_text,v_field.regex_pattern,'Valor não atende ao regex.'); v_record_errors := v_record_errors + 1; end if;
      if v_field.date_format is not null and ((v_field.date_format='YYYY-MM-DD' and v_text !~ '^\d{4}-\d{2}-\d{2}$') or (v_field.date_format='DD/MM/YYYY' and v_text !~ '^\d{2}/\d{2}/\d{4}$')) then insert into public.staging_errors(tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,field_key,source_field_name,raw_value,expected_rule,message) values (v_batch.tenant_id,v_batch.id,v_record.id,v_field.id,'DATE_FORMAT_INVALID',v_field.field_key,v_field.source_field_name,v_text,v_field.date_format,'Data fora do formato esperado.'); v_record_errors := v_record_errors + 1; end if;
      v_normalized := jsonb_set(v_normalized, array[v_field.field_key], v_value, true);
    end loop;
    update public.staging_records set normalized_payload = v_normalized, validation_status = case when v_record_errors=0 then 'valid' else 'invalid' end, error_count = v_record_errors, validated_at = now() where id = v_record.id and tenant_id = v_batch.tenant_id;
  end loop;
  select count(*), count(*) filter (where validation_status='valid'), count(*) filter (where validation_status='invalid'), coalesce(sum(error_count),0) into v_total,v_valid,v_invalid,v_errors from public.staging_records where staging_batch_id=v_batch.id and tenant_id=v_batch.tenant_id;
  v_status := case when v_total > 0 and v_valid = v_total then 'validated' when v_valid > 0 and v_invalid > 0 then 'partially_valid' else 'rejected' end;
  update public.staging_batches set total_records=v_total, valid_records=v_valid, invalid_records=v_invalid, error_count=v_errors, status=v_status, validated_at=now(), updated_by=v_user_id where id=v_batch.id and tenant_id=v_batch.tenant_id;
  return jsonb_build_object('batch_id',v_batch.id,'total_records',v_total,'valid_records',v_valid,'invalid_records',v_invalid,'error_count',v_errors,'status',v_status);
end $$;
grant execute on function public.validate_staging_batch(uuid) to authenticated;
