-- Sprint 7R-B — cobertura canônica aplicada, estritamente aditiva.
alter table public.operation_records add column if not exists operation_number text;
alter table public.operation_records add column if not exists external_reference text;
alter table public.operation_records add column if not exists source_record_id text;
alter table public.operation_records add column if not exists customer_id text;
alter table public.operation_records add column if not exists shipper_id text;
alter table public.operation_records add column if not exists recipient_id text;
alter table public.operation_records add column if not exists carrier_id text;
alter table public.operation_records add column if not exists driver_id text;
alter table public.operation_records add column if not exists carrier_name text;
alter table public.operation_records add column if not exists operation_status text;
alter table public.operation_records add column if not exists delivery_status text;
alter table public.operation_records add column if not exists estimated_delivery_at timestamptz;
alter table public.operation_records add column if not exists volume_m3 numeric(14,3);
alter table public.operation_records add column if not exists cargo_type text;
alter table public.operation_records add column if not exists priority text;
alter table public.operation_records add column if not exists vehicle_restriction text;
alter table public.operation_records add column if not exists time_restriction text;

alter table public.transport_records add column if not exists driver_whatsapp text;
alter table public.transport_records add column if not exists vehicle_profile text;
alter table public.transport_records add column if not exists pod_required boolean;
alter table public.transport_records add column if not exists pod_status text;
alter table public.transport_records add column if not exists pod_due_at timestamptz;
alter table public.transport_records add column if not exists pod_received_at timestamptz;
alter table public.transport_records add column if not exists pod_validated_at timestamptz;
alter table public.transport_records add column if not exists pod_validated_by uuid references auth.users(id) on delete set null;
alter table public.transport_records add column if not exists pod_file_url text;
alter table public.transport_records add column if not exists pod_protocol text;
alter table public.transport_records add column if not exists pod_block_reason text;
alter table public.transport_records add column if not exists pod_rejection_reason text;
alter table public.transport_records add column if not exists pod_linked_document text;
alter table public.transport_records add column if not exists pod_linked_delivery text;

alter table public.finance_records add column if not exists freight_value numeric(14,2);
alter table public.finance_records add column if not exists discharge_value numeric(14,2);
alter table public.finance_records add column if not exists daily_value numeric(14,2);
alter table public.finance_records add column if not exists reimbursement_value numeric(14,2);
alter table public.finance_records add column if not exists toll_value numeric(14,2);
alter table public.finance_records add column if not exists waiting_time_value numeric(14,2);
alter table public.finance_records add column if not exists billing_block_status text;
alter table public.finance_records add column if not exists billing_block_reason text;
alter table public.finance_records add column if not exists payment_status text;
alter table public.finance_records add column if not exists payment_due_at timestamptz;
alter table public.finance_records add column if not exists payment_paid_at timestamptz;
alter table public.finance_records add column if not exists financial_approval_status text;
alter table public.finance_records add column if not exists financial_approved_by uuid references auth.users(id) on delete set null;
alter table public.finance_records add column if not exists financial_approved_at timestamptz;
alter table public.finance_records add column if not exists receipt_file_url text;
alter table public.finance_records add column if not exists legacy_financial_reference text;

create index if not exists idx_operation_records_tenant_delivery_status on public.operation_records(tenant_id,delivery_status) where deleted_at is null;
create index if not exists idx_transport_records_tenant_pod_status_due on public.transport_records(tenant_id,pod_status,pod_due_at) where deleted_at is null;
create index if not exists idx_finance_records_tenant_billing_payment on public.finance_records(tenant_id,billing_block_status,payment_status,payment_due_at) where deleted_at is null;

-- Entidades já existentes são reutilizadas; nenhuma entidade de ocorrência paralela é criada.
with entity_seed(module_key,entity_key,name,sort_order) as (values
 ('core','operation_records','Operações',10),('transporte','transport_records','Transporte',20),
 ('financeiro','finance_records','Financeiro operacional',30)
)
insert into public.canonical_entities(tenant_id,module_key,entity_key,name,description,status,is_system,sort_order)
select t.id,s.module_key,s.entity_key,s.name,'Base nativa tratada do AgentLog.','active',true,s.sort_order from public.tenants t cross join entity_seed s
on conflict(tenant_id,entity_key) do nothing;

with field_seed(entity_key,field_key,name,data_type,sort_order) as (values
 ('operation_records','operation_number','Número da operação','text',100),('operation_records','external_reference','Referência externa','text',101),('operation_records','source_record_id','Identificador na origem','text',102),
 ('operation_records','customer_id','Identificador do cliente','text',110),('operation_records','shipper_id','Identificador do embarcador','text',111),('operation_records','recipient_id','Identificador do destinatário','text',112),('operation_records','carrier_id','Identificador da transportadora','text',113),('operation_records','carrier_name','Transportadora','text',114),
 ('operation_records','driver_id','Identificador do motorista','text',120),('operation_records','delivery_status','Status da entrega','enum',130),('operation_records','operation_status','Status da operação','enum',131),('operation_records','estimated_delivery_at','Previsão de entrega','datetime',132),
 ('operation_records','volume_m3','Volume em m³','decimal',140),('operation_records','cargo_type','Tipo de carga','text',141),('operation_records','priority','Prioridade','enum',142),('operation_records','vehicle_restriction','Restrição de veículo','text',143),('operation_records','time_restriction','Restrição de horário','text',144),
 ('transport_records','driver_phone','Telefone do motorista','text',200),('transport_records','driver_whatsapp','WhatsApp do motorista','text',201),('transport_records','vehicle_type','Tipo de veículo','text',202),('transport_records','vehicle_profile','Perfil do veículo','text',203),
 ('transport_records','pod_required','Canhoto obrigatório','boolean',210),('transport_records','pod_status','Status do canhoto','enum',211),('transport_records','pod_due_at','Prazo do canhoto','datetime',212),('transport_records','pod_received_at','Recebimento do canhoto','datetime',213),('transport_records','pod_validated_at','Validação do canhoto','datetime',214),('transport_records','pod_file_url','Arquivo do canhoto','text',215),('transport_records','pod_protocol','Protocolo do canhoto','text',216),('transport_records','pod_block_reason','Motivo de bloqueio do canhoto','text',217),('transport_records','pod_rejection_reason','Motivo de rejeição do canhoto','text',218),('transport_records','pod_linked_document','Documento vinculado ao canhoto','text',219),('transport_records','pod_linked_delivery','Entrega vinculada ao canhoto','text',220),
 ('finance_records','freight_value','Valor do frete','decimal',300),('finance_records','extra_cost_value','Custo extra','decimal',301),('finance_records','discharge_value','Valor de descarga','decimal',302),('finance_records','daily_value','Valor de diária','decimal',303),('finance_records','reimbursement_value','Valor de reembolso','decimal',304),('finance_records','toll_value','Valor de pedágio','decimal',305),('finance_records','waiting_time_value','Valor de espera','decimal',306),('finance_records','billing_status','Status de faturamento','enum',310),('finance_records','billing_block_status','Status de bloqueio financeiro','enum',311),('finance_records','billing_block_reason','Motivo de bloqueio financeiro','text',312),('finance_records','payment_status','Status de pagamento','enum',313),('finance_records','payment_due_at','Vencimento do pagamento','datetime',314),('finance_records','payment_paid_at','Pagamento realizado em','datetime',315),('finance_records','financial_approval_status','Status de aprovação financeira','enum',316),('finance_records','receipt_file_url','Arquivo do comprovante','text',317),('finance_records','legacy_financial_reference','Referência financeira externa','text',318)
)
insert into public.canonical_fields(tenant_id,canonical_entity_id,field_key,name,data_type,is_required,is_system,sort_order)
select e.tenant_id,e.id,f.field_key,f.name,f.data_type,false,true,f.sort_order from field_seed f join public.canonical_entities e on e.entity_key=f.entity_key
on conflict(canonical_entity_id,field_key) do update set name=excluded.name,data_type=excluded.data_type,is_system=true;

with fields(module_key,base_table,field_key,label,data_type,semantic_type,is_dimension,is_measure) as (values
 ('transport','operation_records','carrier_name','Transportadora','text','carrier',true,false),('transport','operation_records','volume_m3','Volume em m³','number','volume',false,true),('transport','operation_records','cargo_type','Tipo de carga','text','category',true,false),('transport','operation_records','priority','Prioridade','text','status',true,false),('transport','operation_records','delivery_status','Status da entrega','text','status',true,false),
 ('transport','transport_records','driver_phone','Telefone do motorista','text','phone',true,false),('transport','transport_records','driver_whatsapp','WhatsApp do motorista','text','phone',true,false),('transport','transport_records','vehicle_type','Tipo de veículo','text','category',true,false),('transport','transport_records','pod_required','Canhoto obrigatório','boolean','flag',true,false),('transport','transport_records','pod_status','Status do canhoto','text','status',true,false),('transport','transport_records','pod_due_at','Prazo do canhoto','date','date',true,false),('transport','transport_records','pod_received_at','Recebimento do canhoto','date','date',true,false),('transport','transport_records','pod_validated_at','Validação do canhoto','date','date',true,false),
 ('finance','finance_records','freight_value','Valor do frete','number','money',false,true),('finance','finance_records','extra_cost_value','Custo extra','number','money',false,true),('finance','finance_records','billing_status','Status de faturamento','text','status',true,false),('finance','finance_records','billing_block_status','Bloqueio financeiro','text','status',true,false),('finance','finance_records','payment_status','Status de pagamento','text','status',true,false),('finance','finance_records','payment_due_at','Vencimento do pagamento','date','date',true,false),('finance','finance_records','payment_paid_at','Pagamento realizado em','date','date',true,false)
)
insert into public.indicator_field_catalog(tenant_id,module_key,base_table,field_key,label,data_type,semantic_type,allowed_operations,allowed_filters,is_dimension,is_measure)
select null,module_key,base_table,field_key,label,data_type,semantic_type,
 case when is_measure then '["SOMA","MÉDIA","MÍNIMO","MÁXIMO"]'::jsonb else '["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb end,
 '["igual a","diferente de","preenchido","não preenchido"]'::jsonb,is_dimension,is_measure from fields
on conflict do nothing;

insert into public.ai_tools(tool_key,name,description,module_key,is_active)
values ('attendance.occurrence.get_detail','Consultar ocorrência completa','Consulta controlada do módulo manual: motivo, vínculos, eventos, itens, valores, documentos, evidências, tratativas, pendências e SLA.','atendimento',true)
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,is_active=true;
