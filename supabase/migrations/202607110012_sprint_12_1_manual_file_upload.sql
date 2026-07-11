alter table public.staging_batches drop constraint if exists staging_batches_status_check;
alter table public.staging_batches add constraint staging_batches_status_check check (status in ('draft','received','uploaded','validating','validated','partially_valid','failed','rejected','cancelled','normalized'));

insert into public.permissions (key,name,module_key,resource,action,description) values
('integrations.view','Visualizar integrações','integrations','integrations','view','Permite visualizar integrações configuradas.'),
('integrations.manage','Gerenciar integrações','integrations','integrations','manage','Permite atualizar, inativar ou excluir integrações.'),
('staging.view','Visualizar staging','staging','staging','view','Permite visualizar lotes de staging.'),
('staging.manage','Gerenciar staging','staging','staging','manage','Permite enviar arquivos e criar lotes de staging.'),
('staging.normalize','Normalizar staging','staging','staging','normalize','Permite acionar normalização de staging.')
on conflict (key) do update set name=excluded.name, module_key=excluded.module_key, resource=excluded.resource, action=excluded.action, description=excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id from public.roles r cross join public.permissions p
where r.key='owner' and p.key in ('integrations.view','integrations.manage','staging.view','staging.manage','staging.normalize')
on conflict (tenant_id, role_id, permission_id) do nothing;

with t as (select id from public.tenants where slug='agentlog'),
src as (
  insert into public.data_sources (tenant_id,name,description,source_type,module_key,status,metadata)
  select id,'Base de Entregas','Integração demo idempotente para atualização recorrente por XLSX/CSV.','spreadsheet','transporte','active','{"file_type":"xlsx","connection_declared":true,"demo_sprint_12_1":true}'::jsonb from t
  where not exists (select 1 from public.data_sources d join t on t.id=d.tenant_id where d.name='Base de Entregas')
  returning id,tenant_id
), source_row as (
  select * from src union all select d.id,d.tenant_id from public.data_sources d join t on t.id=d.tenant_id where d.name='Base de Entregas' limit 1
), dc as (
  insert into public.data_contracts (tenant_id,data_source_id,name,description,module_key,entity_key,contract_version,format,direction,status,periodicity)
  select tenant_id,id,'Entregas V1','Contrato demo completo para atualização manual recorrente de entregas.','transporte','deliveries',1,'xlsx','inbound','active','on_demand' from source_row
  on conflict (tenant_id,data_source_id,entity_key,contract_version) do update set status='active', name=excluded.name, description=excluded.description
  returning id,tenant_id
), contract as (
  select * from dc union all select c.id,c.tenant_id from public.data_contracts c join source_row s on s.id=c.data_source_id where c.entity_key='deliveries' and c.contract_version=1 limit 1
), fields(field_key,source_field_name,data_type,is_required,allow_null,date_format,sort_order) as (values
('numero_entrega','numero_entrega','text',true,false,null,10),('documento_cliente','documento_cliente','text',true,false,null,20),('nome_cliente','nome_cliente','text',true,false,null,30),('status_entrega','status_entrega','text',true,false,null,40),('data_emissao','data_emissao','date',true,false,'YYYY-MM-DD',50),('data_prevista','data_prevista','date',false,true,'YYYY-MM-DD',60),('data_entrega','data_entrega','date',false,true,'YYYY-MM-DD',70),('valor_frete','valor_frete','decimal',false,true,null,80),('valor_total','valor_total','decimal',false,true,null,90),('peso_total','peso_total','decimal',false,true,null,100),('quantidade_volumes','quantidade_volumes','integer',false,true,null,110),('ocorrencia','ocorrencia','text',false,true,null,120),('motorista','motorista','text',false,true,null,130),('veiculo','veiculo','text',false,true,null,140),('uf_origem','uf_origem','text',false,true,null,150),('uf_destino','uf_destino','text',false,true,null,160),('cidade_origem','cidade_origem','text',false,true,null,170),('cidade_destino','cidade_destino','text',false,true,null,180))
insert into public.data_contract_fields (tenant_id,data_contract_id,field_key,source_field_name,data_type,is_required,allow_null,date_format,sort_order)
select c.tenant_id,c.id,f.field_key,f.source_field_name,f.data_type,f.is_required,f.allow_null,f.date_format,f.sort_order from contract c cross join fields f
on conflict (data_contract_id, field_key) do update set source_field_name=excluded.source_field_name, data_type=excluded.data_type, is_required=excluded.is_required, allow_null=excluded.allow_null, date_format=excluded.date_format, sort_order=excluded.sort_order;
