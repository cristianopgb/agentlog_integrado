-- Sprint 8 — Base Operacional Nativa Comum + Extensões Modulares
create table if not exists public.operation_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  external_code text,
  source_system text,
  source_data_source_id uuid references public.data_sources(id) on delete set null,
  source_data_contract_id uuid references public.data_contracts(id) on delete set null,
  source_staging_batch_id uuid references public.staging_batches(id) on delete set null,
  source_staging_record_id uuid references public.staging_records(id) on delete set null,
  source_payload_hash text,
  module_origin text,
  record_type text,
  document_number text,
  document_type text,
  cte_number text,
  cte_key text,
  invoice_number text,
  invoice_key text,
  manifest_number text,
  order_number text,
  delivery_number text,
  customer_name text,
  customer_document text,
  shipper_name text,
  shipper_document text,
  recipient_name text,
  recipient_document text,
  payer_name text,
  payer_document text,
  origin_city text,
  origin_state text,
  destination_city text,
  destination_state text,
  vehicle_plate text,
  driver_name text,
  driver_document text,
  status text,
  status_updated_at timestamptz,
  occurrence_status text,
  last_event_at timestamptz,
  gross_weight numeric(14,3),
  cubed_weight numeric(14,3),
  volume_count numeric(14,3),
  total_value numeric(14,2),
  freight_value numeric(14,2),
  issued_at timestamptz,
  expected_date timestamptz,
  completed_at timestamptz,
  data_quality_status text,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.transport_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_record_id uuid not null references public.operation_records(id) on delete cascade,
  transport_status text,
  route_name text,
  trip_number text,
  vehicle_type text,
  driver_phone text,
  collected_at timestamptz,
  delivered_at timestamptz,
  delivery_performance_status text,
  sla_status text,
  cost_center text,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_record_id uuid not null references public.operation_records(id) on delete cascade,
  ticket_number text,
  channel text,
  subject text,
  description text,
  occurrence_code text,
  occurrence_type text,
  occurrence_reason text,
  priority text,
  attendance_status text,
  assigned_to text,
  opened_at timestamptz,
  first_response_at timestamptz,
  last_interaction_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  sla_due_at timestamptz,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_record_id uuid not null references public.operation_records(id) on delete cascade,
  billing_reference text,
  billing_period text,
  billing_status text,
  proof_of_delivery_status text,
  proof_received_at timestamptz,
  ready_to_bill boolean not null default false,
  blocked_amount numeric(14,2),
  block_status text,
  block_reason text,
  extra_cost_value numeric(14,2),
  discount_value numeric(14,2),
  total_amount numeric(14,2),
  due_at timestamptz,
  paid_at timestamptz,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.warehouse_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_record_id uuid not null references public.operation_records(id) on delete cascade,
  product_code text,
  sku text,
  product_name text,
  warehouse_code text,
  warehouse_name text,
  location_code text,
  batch_number text,
  serial_number text,
  quantity_available numeric(14,3),
  quantity_reserved numeric(14,3),
  quantity_blocked numeric(14,3),
  unit_of_measure text,
  last_movement_type text,
  last_movement_at timestamptz,
  warehouse_status text,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.team_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_record_id uuid references public.operation_records(id) on delete set null,
  employee_code text,
  employee_name text,
  employee_document text,
  email text,
  phone text,
  department_name text,
  position_name text,
  manager_name text,
  team_status text,
  admission_date date,
  termination_date date,
  shift_name text,
  workload_hours numeric(8,2),
  overtime_hours numeric(8,2),
  worked_at timestamptz,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.entity_events (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, entity_type text not null, entity_id uuid not null, event_type text not null, event_title text, event_description text, previous_value jsonb, new_value jsonb, occurred_at timestamptz not null default now(), actor_user_id uuid references auth.users(id), source_system text, source_data_source_id uuid references public.data_sources(id) on delete set null, source_staging_record_id uuid references public.staging_records(id) on delete set null, created_at timestamptz not null default now());
create table if not exists public.documents (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, entity_type text not null, entity_id uuid not null, document_type text, document_number text, file_name text, file_url text, storage_path text, mime_type text, file_size bigint, status text, uploaded_by uuid references auth.users(id), uploaded_at timestamptz, source_system text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.custom_fields (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, module_key text not null, entity_type text not null, field_key text not null, field_label text not null, data_type text not null, is_required boolean not null default false, is_active boolean not null default true, allowed_values jsonb not null default '[]'::jsonb, validation_rules jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, unique(tenant_id,module_key,entity_type,field_key));
create table if not exists public.custom_field_values (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, custom_field_id uuid not null references public.custom_fields(id) on delete cascade, entity_type text not null, entity_id uuid not null, value_text text, value_number numeric, value_boolean boolean, value_date timestamptz, value_json jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
drop trigger if exists set_operation_records_updated_at on public.operation_records; create trigger set_operation_records_updated_at before update on public.operation_records for each row execute function public.set_updated_at();
drop trigger if exists set_transport_records_updated_at on public.transport_records; create trigger set_transport_records_updated_at before update on public.transport_records for each row execute function public.set_updated_at();
drop trigger if exists set_attendance_records_updated_at on public.attendance_records; create trigger set_attendance_records_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
drop trigger if exists set_finance_records_updated_at on public.finance_records; create trigger set_finance_records_updated_at before update on public.finance_records for each row execute function public.set_updated_at();
drop trigger if exists set_warehouse_records_updated_at on public.warehouse_records; create trigger set_warehouse_records_updated_at before update on public.warehouse_records for each row execute function public.set_updated_at();
drop trigger if exists set_team_records_updated_at on public.team_records; create trigger set_team_records_updated_at before update on public.team_records for each row execute function public.set_updated_at();
drop trigger if exists set_documents_updated_at on public.documents; create trigger set_documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
drop trigger if exists set_custom_fields_updated_at on public.custom_fields; create trigger set_custom_fields_updated_at before update on public.custom_fields for each row execute function public.set_updated_at();
drop trigger if exists set_custom_field_values_updated_at on public.custom_field_values; create trigger set_custom_field_values_updated_at before update on public.custom_field_values for each row execute function public.set_updated_at();
alter table public.operation_records enable row level security; create index if not exists idx_operation_records_tenant_id on public.operation_records(tenant_id);
alter table public.transport_records enable row level security; create index if not exists idx_transport_records_tenant_id on public.transport_records(tenant_id);
alter table public.attendance_records enable row level security; create index if not exists idx_attendance_records_tenant_id on public.attendance_records(tenant_id);
alter table public.finance_records enable row level security; create index if not exists idx_finance_records_tenant_id on public.finance_records(tenant_id);
alter table public.warehouse_records enable row level security; create index if not exists idx_warehouse_records_tenant_id on public.warehouse_records(tenant_id);
alter table public.team_records enable row level security; create index if not exists idx_team_records_tenant_id on public.team_records(tenant_id);
alter table public.entity_events enable row level security; create index if not exists idx_entity_events_tenant_id on public.entity_events(tenant_id);
alter table public.documents enable row level security; create index if not exists idx_documents_tenant_id on public.documents(tenant_id);
alter table public.custom_fields enable row level security; create index if not exists idx_custom_fields_tenant_id on public.custom_fields(tenant_id);
alter table public.custom_field_values enable row level security; create index if not exists idx_custom_field_values_tenant_id on public.custom_field_values(tenant_id);
alter table public.operation_records drop constraint if exists operation_records_record_type_check; alter table public.operation_records add constraint operation_records_record_type_check check (record_type is null or record_type in ('delivery','cte','invoice','manifest','order','stock','ticket','financial','employee','other'));
alter table public.operation_records drop constraint if exists operation_records_document_type_check; alter table public.operation_records add constraint operation_records_document_type_check check (document_type is null or document_type in ('cte','nfe','nfse','manifesto','pedido','entrega','outro'));
alter table public.operation_records drop constraint if exists operation_records_data_quality_status_check; alter table public.operation_records add constraint operation_records_data_quality_status_check check (data_quality_status is null or data_quality_status in ('valid','invalid','partial','manual_review'));
alter table public.attendance_records drop constraint if exists attendance_records_channel_check; alter table public.attendance_records add constraint attendance_records_channel_check check (channel is null or channel in ('whatsapp','email','phone','portal','manual','other'));
alter table public.attendance_records drop constraint if exists attendance_records_status_check; alter table public.attendance_records add constraint attendance_records_status_check check (attendance_status is null or attendance_status in ('open','in_progress','waiting_customer','waiting_internal','resolved','closed','cancelled'));
alter table public.finance_records drop constraint if exists finance_records_billing_status_check; alter table public.finance_records add constraint finance_records_billing_status_check check (billing_status is null or billing_status in ('pending','ready','blocked','billed','paid','cancelled'));
alter table public.finance_records drop constraint if exists finance_records_proof_status_check; alter table public.finance_records add constraint finance_records_proof_status_check check (proof_of_delivery_status is null or proof_of_delivery_status in ('pending','received','approved','rejected','missing'));
alter table public.warehouse_records drop constraint if exists warehouse_records_movement_type_check; alter table public.warehouse_records add constraint warehouse_records_movement_type_check check (last_movement_type is null or last_movement_type in ('inbound','outbound','transfer','adjustment','inventory','block','release'));
alter table public.entity_events drop constraint if exists entity_events_entity_type_check; alter table public.entity_events add constraint entity_events_entity_type_check check (entity_type in ('operation_record','transport_record','attendance_record','finance_record','warehouse_record','team_record','custom'));
create index if not exists idx_operation_records_tenant_cte_number on public.operation_records(tenant_id,cte_number); create index if not exists idx_operation_records_tenant_invoice_number on public.operation_records(tenant_id,invoice_number); create index if not exists idx_operation_records_tenant_delivery_number on public.operation_records(tenant_id,delivery_number); create index if not exists idx_operation_records_tenant_customer_document on public.operation_records(tenant_id,customer_document); create index if not exists idx_operation_records_tenant_vehicle_plate on public.operation_records(tenant_id,vehicle_plate); create index if not exists idx_operation_records_tenant_status on public.operation_records(tenant_id,status); create index if not exists idx_operation_records_tenant_issued_at on public.operation_records(tenant_id,issued_at); create index if not exists idx_operation_records_tenant_expected_date on public.operation_records(tenant_id,expected_date); create index if not exists idx_operation_records_tenant_completed_at on public.operation_records(tenant_id,completed_at);
create index if not exists idx_transport_records_tenant_operation_record_id on public.transport_records(tenant_id,operation_record_id);
create index if not exists idx_transport_records_tenant_transport_status on public.transport_records(tenant_id,transport_status);
create index if not exists idx_transport_records_tenant_collected_at on public.transport_records(tenant_id,collected_at);
create index if not exists idx_transport_records_tenant_delivered_at on public.transport_records(tenant_id,delivered_at);
create index if not exists idx_attendance_records_tenant_operation_record_id on public.attendance_records(tenant_id,operation_record_id);
create index if not exists idx_attendance_records_tenant_attendance_status on public.attendance_records(tenant_id,attendance_status);
create index if not exists idx_attendance_records_tenant_opened_at on public.attendance_records(tenant_id,opened_at);
create index if not exists idx_attendance_records_tenant_sla_due_at on public.attendance_records(tenant_id,sla_due_at);
create index if not exists idx_finance_records_tenant_operation_record_id on public.finance_records(tenant_id,operation_record_id);
create index if not exists idx_finance_records_tenant_billing_status on public.finance_records(tenant_id,billing_status);
create index if not exists idx_finance_records_tenant_due_at on public.finance_records(tenant_id,due_at);
create index if not exists idx_finance_records_tenant_paid_at on public.finance_records(tenant_id,paid_at);
create index if not exists idx_warehouse_records_tenant_operation_record_id on public.warehouse_records(tenant_id,operation_record_id);
create index if not exists idx_warehouse_records_tenant_warehouse_status on public.warehouse_records(tenant_id,warehouse_status);
create index if not exists idx_warehouse_records_tenant_last_movement_at on public.warehouse_records(tenant_id,last_movement_at);
create index if not exists idx_team_records_tenant_operation_record_id on public.team_records(tenant_id,operation_record_id);
create index if not exists idx_team_records_tenant_team_status on public.team_records(tenant_id,team_status);
create index if not exists idx_team_records_tenant_employee_document on public.team_records(tenant_id,employee_document);
create index if not exists idx_team_records_tenant_worked_at on public.team_records(tenant_id,worked_at);
create index if not exists idx_entity_events_tenant_entity on public.entity_events(tenant_id,entity_type,entity_id); create index if not exists idx_entity_events_tenant_occurred_at on public.entity_events(tenant_id,occurred_at); create index if not exists idx_documents_tenant_entity on public.documents(tenant_id,entity_type,entity_id); create index if not exists idx_custom_field_values_lookup on public.custom_field_values(tenant_id,custom_field_id,entity_type,entity_id);
drop policy if exists "members can read operation_records" on public.operation_records; create policy "members can read operation_records" on public.operation_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage operation_records" on public.operation_records; create policy "members can manage operation_records" on public.operation_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read transport_records" on public.transport_records; create policy "members can read transport_records" on public.transport_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage transport_records" on public.transport_records; create policy "members can manage transport_records" on public.transport_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read attendance_records" on public.attendance_records; create policy "members can read attendance_records" on public.attendance_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage attendance_records" on public.attendance_records; create policy "members can manage attendance_records" on public.attendance_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read finance_records" on public.finance_records; create policy "members can read finance_records" on public.finance_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage finance_records" on public.finance_records; create policy "members can manage finance_records" on public.finance_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read warehouse_records" on public.warehouse_records; create policy "members can read warehouse_records" on public.warehouse_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage warehouse_records" on public.warehouse_records; create policy "members can manage warehouse_records" on public.warehouse_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read team_records" on public.team_records; create policy "members can read team_records" on public.team_records for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage team_records" on public.team_records; create policy "members can manage team_records" on public.team_records for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read entity_events" on public.entity_events; create policy "members can read entity_events" on public.entity_events for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage entity_events" on public.entity_events; create policy "members can manage entity_events" on public.entity_events for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read documents" on public.documents; create policy "members can read documents" on public.documents for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.view')); drop policy if exists "members can manage documents" on public.documents; create policy "members can manage documents" on public.documents for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'native_records.manage'));
drop policy if exists "members can read custom_fields" on public.custom_fields; create policy "members can read custom_fields" on public.custom_fields for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.view')); drop policy if exists "members can manage custom_fields" on public.custom_fields; create policy "members can manage custom_fields" on public.custom_fields for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.manage'));
drop policy if exists "members can read custom_field_values" on public.custom_field_values; create policy "members can read custom_field_values" on public.custom_field_values for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.view')); drop policy if exists "members can manage custom_field_values" on public.custom_field_values; create policy "members can manage custom_field_values" on public.custom_field_values for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.manage')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'custom_fields.manage'));
with permission_seed(key,name,module_key,resource,action,description) as (values ('native_schema.view','Visualizar estrutura nativa','core','native_schema','view','Permite visualizar estrutura canônica da base operacional nativa.'),('native_records.view','Visualizar registros nativos','core','native_records','view','Permite visualizar registros da base operacional nativa.'),('native_records.manage','Gerenciar registros nativos','core','native_records','manage','Permite gerenciar registros da base operacional nativa.'),('custom_fields.view','Visualizar campos customizados','core','custom_fields','view','Permite visualizar campos customizados.'),('custom_fields.manage','Gerenciar campos customizados','core','custom_fields','manage','Permite gerenciar campos customizados.')) insert into public.permissions (key,name,module_key,resource,action,description) select * from permission_seed on conflict (key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now(); insert into public.role_permissions (tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key in ('native_schema.view','native_records.view','native_records.manage','custom_fields.view','custom_fields.manage') on conflict (tenant_id,role_id,permission_id) do nothing;
with entity_seed(entity_key,module_key,name,description,sort_order) as (values ('operation_records','core','Núcleo operacional comum','Dados básicos usados por vários módulos, como CTe, NF, cliente, embarcador, destinatário, origem, destino, peso, valor, placa, motorista, status e datas.',10),('transport_records','transporte','Transporte','Extensão leve para dados específicos de transporte.',20),('attendance_records','atendimento','Atendimento','Extensão leve para ocorrências e atendimento.',30),('finance_records','financeiro','Financeiro','Extensão leve para faturamento, canhoto e bloqueios.',40),('warehouse_records','armazem','Armazém','Extensão leve para estoque e movimentação.',50),('team_records','equipes','Equipes','Extensão leve para pessoas, turnos e jornadas.',60)) insert into public.canonical_entities (tenant_id,module_key,entity_key,name,description,status,is_system,sort_order) select t.id,s.module_key,s.entity_key,s.name,s.description,'active',true,s.sort_order from public.tenants t cross join entity_seed s on conflict (tenant_id,entity_key) do update set module_key=excluded.module_key,name=excluded.name,description=excluded.description,status='active',is_system=true,sort_order=excluded.sort_order,updated_at=now();
with field_seed(entity_key,field_key,name,data_type,is_required,sort_order) as (values ('operation_records','external_id','external id','text',false,10),('operation_records','external_code','external code','text',false,20),('operation_records','source_system','source system','text',false,30),('operation_records','source_data_source_id','source data source id','text',false,40),('operation_records','source_data_contract_id','source data contract id','text',false,50),('operation_records','source_staging_batch_id','source staging batch id','text',false,60),('operation_records','source_staging_record_id','source staging record id','text',false,70),('operation_records','source_payload_hash','source payload hash','text',false,80),('operation_records','module_origin','module origin','text',false,90),('operation_records','record_type','record type','enum',false,100),('operation_records','document_number','document number','text',false,110),('operation_records','document_type','document type','enum',false,120),('operation_records','cte_number','cte number','text',false,130),('operation_records','cte_key','cte key','text',false,140),('operation_records','invoice_number','invoice number','text',false,150),('operation_records','invoice_key','invoice key','text',false,160),('operation_records','manifest_number','manifest number','text',false,170),('operation_records','order_number','order number','text',false,180),('operation_records','delivery_number','delivery number','text',false,190),('operation_records','customer_name','customer name','text',false,200),('operation_records','customer_document','customer document','text',false,210),('operation_records','shipper_name','shipper name','text',false,220),('operation_records','shipper_document','shipper document','text',false,230),('operation_records','recipient_name','recipient name','text',false,240),('operation_records','recipient_document','recipient document','text',false,250),('operation_records','payer_name','payer name','text',false,260),('operation_records','payer_document','payer document','text',false,270),('operation_records','origin_city','origin city','text',false,280),('operation_records','origin_state','origin state','text',false,290),('operation_records','destination_city','destination city','text',false,300),('operation_records','destination_state','destination state','text',false,310),('operation_records','vehicle_plate','vehicle plate','text',false,320),('operation_records','driver_name','driver name','text',false,330),('operation_records','driver_document','driver document','text',false,340),('operation_records','status','status','text',false,350),('operation_records','status_updated_at','status updated at','datetime',false,360),('operation_records','occurrence_status','occurrence status','text',false,370),('operation_records','last_event_at','last event at','datetime',false,380),('operation_records','gross_weight','gross weight','decimal',false,390),('operation_records','cubed_weight','cubed weight','decimal',false,400),('operation_records','volume_count','volume count','decimal',false,410),('operation_records','total_value','total value','decimal',false,420),('operation_records','freight_value','freight value','decimal',false,430),('operation_records','issued_at','issued at','datetime',false,440),('operation_records','expected_date','expected date','date',false,450),('operation_records','completed_at','completed at','datetime',false,460),('operation_records','data_quality_status','data quality status','enum',false,470),('transport_records','operation_record_id','operation record id','text',false,10),('transport_records','transport_status','transport status','text',false,20),('transport_records','route_name','route name','text',false,30),('transport_records','trip_number','trip number','text',false,40),('transport_records','vehicle_type','vehicle type','text',false,50),('transport_records','driver_phone','driver phone','text',false,60),('transport_records','collected_at','collected at','datetime',false,70),('transport_records','delivered_at','delivered at','datetime',false,80),('transport_records','delivery_performance_status','delivery performance status','text',false,90),('transport_records','sla_status','sla status','text',false,100),('transport_records','cost_center','cost center','text',false,110),('attendance_records','operation_record_id','operation record id','text',false,10),('attendance_records','ticket_number','ticket number','text',false,20),('attendance_records','channel','channel','enum',false,30),('attendance_records','subject','subject','text',false,40),('attendance_records','description','description','text',false,50),('attendance_records','occurrence_code','occurrence code','text',false,60),('attendance_records','occurrence_type','occurrence type','text',false,70),('attendance_records','occurrence_reason','occurrence reason','text',false,80),('attendance_records','priority','priority','text',false,90),('attendance_records','attendance_status','attendance status','enum',false,100),('attendance_records','assigned_to','assigned to','text',false,110),('attendance_records','opened_at','opened at','datetime',false,120),('attendance_records','first_response_at','first response at','datetime',false,130),('attendance_records','last_interaction_at','last interaction at','datetime',false,140),('attendance_records','resolved_at','resolved at','datetime',false,150),('attendance_records','closed_at','closed at','datetime',false,160),('attendance_records','sla_due_at','sla due at','datetime',false,170),('finance_records','operation_record_id','operation record id','text',false,10),('finance_records','billing_reference','billing reference','text',false,20),('finance_records','billing_period','billing period','text',false,30),('finance_records','billing_status','billing status','enum',false,40),('finance_records','proof_of_delivery_status','proof of delivery status','enum',false,50),('finance_records','proof_received_at','proof received at','datetime',false,60),('finance_records','ready_to_bill','ready to bill','boolean',false,70),('finance_records','blocked_amount','blocked amount','decimal',false,80),('finance_records','block_status','block status','text',false,90),('finance_records','block_reason','block reason','text',false,100),('finance_records','extra_cost_value','extra cost value','decimal',false,110),('finance_records','discount_value','discount value','decimal',false,120),('finance_records','total_amount','total amount','decimal',false,130),('finance_records','due_at','due at','datetime',false,140),('finance_records','paid_at','paid at','datetime',false,150),('warehouse_records','operation_record_id','operation record id','text',false,10),('warehouse_records','product_code','product code','text',false,20),('warehouse_records','sku','sku','text',false,30),('warehouse_records','product_name','product name','text',false,40),('warehouse_records','warehouse_code','warehouse code','text',false,50),('warehouse_records','warehouse_name','warehouse name','text',false,60),('warehouse_records','location_code','location code','text',false,70),('warehouse_records','batch_number','batch number','text',false,80),('warehouse_records','serial_number','serial number','text',false,90),('warehouse_records','quantity_available','quantity available','decimal',false,100),('warehouse_records','quantity_reserved','quantity reserved','decimal',false,110),('warehouse_records','quantity_blocked','quantity blocked','decimal',false,120),('warehouse_records','unit_of_measure','unit of measure','text',false,130),('warehouse_records','last_movement_type','last movement type','enum',false,140),('warehouse_records','last_movement_at','last movement at','datetime',false,150),('warehouse_records','warehouse_status','warehouse status','text',false,160),('team_records','operation_record_id','operation record id','text',false,10),('team_records','employee_code','employee code','text',false,20),('team_records','employee_name','employee name','text',false,30),('team_records','employee_document','employee document','text',false,40),('team_records','email','email','text',false,50),('team_records','phone','phone','text',false,60),('team_records','department_name','department name','text',false,70),('team_records','position_name','position name','text',false,80),('team_records','manager_name','manager name','text',false,90),('team_records','team_status','team status','text',false,100),('team_records','admission_date','admission date','date',false,110),('team_records','termination_date','termination date','date',false,120),('team_records','shift_name','shift name','text',false,130),('team_records','workload_hours','workload hours','decimal',false,140),('team_records','overtime_hours','overtime hours','decimal',false,150),('team_records','worked_at','worked at','datetime',false,160)) insert into public.canonical_fields (tenant_id,canonical_entity_id,field_key,name,data_type,is_required,is_system,sort_order) select ce.tenant_id,ce.id,fs.field_key,initcap(fs.name),fs.data_type,fs.is_required,true,fs.sort_order from field_seed fs join public.canonical_entities ce on ce.entity_key=fs.entity_key on conflict (canonical_entity_id,field_key) do update set name=excluded.name,data_type=excluded.data_type,is_required=excluded.is_required,is_system=true,sort_order=excluded.sort_order,updated_at=now();

do $$ begin alter table public.operation_records add constraint operation_records_id_tenant_id_key unique (id, tenant_id); exception when duplicate_object then null; end $$;
do $$ begin alter table public.custom_fields add constraint custom_fields_id_tenant_id_key unique (id, tenant_id); exception when duplicate_object then null; end $$;
do $$ begin alter table public.transport_records add constraint transport_records_operation_tenant_fk foreign key (operation_record_id, tenant_id) references public.operation_records(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table public.attendance_records add constraint attendance_records_operation_tenant_fk foreign key (operation_record_id, tenant_id) references public.operation_records(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table public.finance_records add constraint finance_records_operation_tenant_fk foreign key (operation_record_id, tenant_id) references public.operation_records(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table public.warehouse_records add constraint warehouse_records_operation_tenant_fk foreign key (operation_record_id, tenant_id) references public.operation_records(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table public.team_records add constraint team_records_operation_tenant_fk foreign key (operation_record_id, tenant_id) references public.operation_records(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
do $$ begin alter table public.custom_field_values add constraint custom_field_values_field_tenant_fk foreign key (custom_field_id, tenant_id) references public.custom_fields(id, tenant_id) on delete cascade; exception when duplicate_object then null; end $$;
