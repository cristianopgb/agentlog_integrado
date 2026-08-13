import { readFileSync } from 'fs';
import { join } from 'path';
import { NormalizationService } from '../normalization/normalization.service';
import { MappingService } from './mapping.service';
import { CanonicalValueDomainsService } from './canonical-value-domains.service';

const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message)};
const root=join(__dirname,'../../../..');
const normalization=readFileSync(join(root,'apps/api/src/normalization/normalization.service.ts'),'utf8');
const attendance=readFileSync(join(root,'apps/api/src/agents/attendance-agent-tools.service.ts'),'utf8');
const reports=readFileSync(join(root,'apps/api/src/reports/reports.service.ts'),'utf8');
const migration=readFileSync(join(root,'supabase/migrations/202608110001_sprint_7rb_applied_canonical_base.sql'),'utf8');
const occurrenceMigration=readFileSync(join(root,'supabase/migrations/202608110002_sprint_10r_g_occurrence_canonical_analytics.sql'),'utf8');
const hardening=readFileSync(join(root,'supabase/migrations/202608110003_sprint_10r_g_hardening.sql'),'utf8');
const publishedSourceHardening=readFileSync(join(root,'supabase/migrations/202608110004_sprint_10r_g_published_source_hardening.sql'),'utf8');
const supabaseService=readFileSync(join(root,'apps/api/src/supabase/supabase.service.ts'),'utf8');
const apiConfig=readFileSync(join(root,'apps/api/src/api-integrations/api-connector-config.service.ts'),'utf8');
const apiMappings=readFileSync(join(root,'apps/api/src/api-integrations/api-connector-sync.service.ts'),'utf8');
const valueMappings=readFileSync(join(root,'apps/api/src/api-integrations/value-mappings.service.ts'),'utf8');
const ignoreMigration=readFileSync(join(root,'supabase/migrations/202608120001_canonical_value_domains_and_ignore_decisions.sql'),'utf8');
const hotfixMigration=readFileSync(join(root,'supabase/migrations/202608120002_delivery_status_occurrence_indicators_hotfix.sql'),'utf8');
const runtimeHotfixMigration=readFileSync(join(root,'supabase/migrations/202608120003_occurrence_catalog_runtime_hotfix.sql'),'utf8');
const customIndicators=readFileSync(join(root,'apps/api/src/custom-indicators/custom-indicators.service.ts'),'utf8');
const occurrenceTools=readFileSync(join(root,'apps/api/src/agents/agent-tool-executor.service.ts'),'utf8');
const generalRouter=readFileSync(join(root,'apps/api/src/agents/general-chat-orchestrator.service.ts'),'utf8');
const controlledAiMigration=readFileSync(join(root,'supabase/migrations/202607200001_sprint_17a_controlled_ai.sql'),'utf8');
const occurrenceToolsMigration=readFileSync(join(root,'supabase/migrations/202608130001_hotfix_1_occurrence_agent_tools.sql'),'utf8');
const forbidden=['carga','motorista','telefone'].join('_');
const forbiddenWhatsapp=['carga','motorista','whatsapp'].join('_');

for(const field of ['delivery_number','driver_phone','driver_whatsapp','pod_status','billing_status','payment_status'])
  assert(migration.includes(`'${field}'`)||normalization.includes(`'${field}'`),`Campo canônico ausente: ${field}`);
assert(!migration.toLowerCase().includes('hostgator'),'Catálogo não pode conter destino de cliente.');
assert(!migration.includes(forbidden)&&!migration.includes(forbiddenWhatsapp),'Campo de origem específico não pode ser nativo.');
assert(customIndicators.includes("'occurrence_analytics_view'")&&customIndicators.includes("base_label: occurrence")&&customIndicators.includes("'Ocorrências operacionais'"),'fields() não publica a base funcional de ocorrências.');
for(const field of ['current_status','occurrence_number','pending_actions_count'])assert(hotfixMigration.includes(`'${field}'`),`Catálogo de indicador não contém ${field}.`);
for(const unsafe of ['raw_payload','storage_path','external_url'])assert(customIndicators.match(new RegExp(`blockedFields[\\s\\S]{0,1200}['\"]${unsafe}['\"]`)),'fields() não bloqueia campo proibido.');
assert(occurrenceTools.includes("this.db.select<any[]>('occurrence_analytics_view'")&&occurrenceTools.includes('tenant_id=eq.${t}'),'Tools de ocorrência não usam a view com tenant.');
assert(occurrenceTools.includes("'sql' in input")&&occurrenceTools.includes("'table' in input")&&occurrenceTools.includes("'field' in input"),'Tools aceitam consulta arbitrária.');
for(const unsafe of ['occurrence_id','operation_record_id','responsible_user_id','created_by','updated_by'])assert(!occurrenceTools.match(new RegExp(`const select=['\"][^'\"]*${unsafe}`)),`Detalhe expõe ${unsafe}.`);
assert(generalRouter.includes("resolved_tool_key:'occurrences.analytics.detail'")&&generalRouter.includes('/\\bOC\\d+\\b/i'),'Número OC não roteia para detail.');
assert(generalRouter.includes("resolved_tool_key:'occurrences.analytics.list'")&&generalRouter.includes('quais\\s+ocorr'),'Pedido de números não roteia para list.');
assert(/create table public\.ai_tools[\s\S]{0,300}tool_key text not null unique/.test(controlledAiMigration),'Migration das tools depende de unicidade ausente em ai_tools.tool_key.');
assert(occurrenceToolsMigration.includes('on conflict(tool_key) do update'),'Registro idempotente das tools não usa a constraint validada de tool_key.');
const service=Object.create(NormalizationService.prototype) as any;
assert(service.resolveTarget('deliveries','delivery_number')?.field==='delivery_number','Alias legado delivery_number deixou de resolver.');
assert(service.resolveTarget('operation_records','delivery_status')?.field==='delivery_status','delivery_status deve publicar na própria coluna.');
assert(service.resolveTarget('operation_records','status')?.field==='status','status deve publicar na própria coluna.');
assert(service.resolveTarget('operation_records','delivery_status')?.field!=='status','delivery_status não pode ser convertido em status.');
assert(service.resolveTarget('operation_records','status')?.field!=='delivery_status','status não pode ser convertido em delivery_status.');
assert(normalization.match(/const operationColumns[\s\S]*?'delivery_status'/),'delivery_status ausente da whitelist publicável.');
const publishedPayloads:Array<Record<string,unknown>>=[];
const runtimeService=Object.create(NormalizationService.prototype) as any;
runtimeService.supabase={
  select:async()=>[],
  insert:async(_table:string,payload:Record<string,unknown>)=>{publishedPayloads.push(payload);return [{id:'operation'}]},
  update:async()=>[{id:'operation'}],
};
const publishRuntime=async(field:string,value:string)=>{
  const buckets:Record<string,Record<string,unknown>>={operation_records:{}};
  const target=runtimeService.resolveTarget('operation_records',field);
  runtimeService.publishCanonicalValue(buckets,target,value);
  await runtimeService.upsertOperation('tenant',{id:'batch',data_source_id:null,data_contract_id:'contract',source_reference:'api'} as any,{id:`record-${field}`,normalized_payload:{[field]:value}} as any,buckets.operation_records,false,true,'source','integration','deliveries',[field]);
  return publishedPayloads.at(-1)!;
};
(async()=>{const delivery=await publishRuntime('delivery_status','pending');const status=await publishRuntime('status','active');
  assert(delivery.delivery_status==='pending'&&delivery.status===undefined,'Runtime publicou delivery_status no campo genérico status.');
  assert(status.status==='active'&&status.delivery_status===undefined,'Runtime publicou status genérico em delivery_status.');
})();
assert(service.resolveTarget('transport_records','driver_phone')?.field==='driver_phone','driver_phone não resolve.');
assert(service.resolveTarget('transport_records','driver_whatsapp')?.field==='driver_whatsapp','driver_whatsapp não resolve.');
assert(normalization.includes("'driver_phone'")&&normalization.includes("'driver_whatsapp'"),'Normalizador não publica os telefones tratados.');
assert(attendance.includes('driver_phone,driver_whatsapp'),'Validação não consulta ambos os telefones.');
assert(attendance.includes('phones.includes(p)'),'Validação não compara telefone e WhatsApp.');
assert(attendance.includes('occurrences.detail'),'Tool não reutiliza o detalhe completo da ocorrência manual.');
for(const field of ['occurrence_status','pod_status','billing_status','payment_status'])assert(reports.includes(`${field}:`),`Relatórios não aceitam ${field}.`);
assert(!/select=\*/.test(attendance),'Tool de atendimento não pode usar select=*');
assert(!/staging|raw_payload/.test(attendance),'Tool de atendimento não pode consultar dados crus.');
assert(occurrenceMigration.includes("select tenant_id,'atendimento','occurrences'"),'Ocorrências deve usar módulo atendimento.');
assert(occurrenceMigration.includes("select null,'atendimento','occurrence_analytics_view'"),'Catálogo analítico deve usar módulo atendimento.');
assert(occurrenceMigration.includes("select 'atendimento','occurrences',indicator_key"),'Indicadores devem manter módulo atendimento e família occurrences.');
assert(!occurrenceMigration.toLowerCase().includes('on conflict'),'Migration 202608110002 não deve depender de constraints ON CONFLICT.');
assert(occurrenceMigration.includes("'occurrence_analytics_view'"),'Constraint deve liberar occurrence_analytics_view.');
const occurrenceIndicators=['occurrences_open_count','occurrences_overdue_count','occurrences_by_status','occurrences_by_sla_status','occurrences_by_priority','occurrences_by_reason_category','occurrences_by_reason','occurrence_avg_resolution_time','occurrences_with_pending_actions','occurrence_pending_actions_overdue_count','occurrences_without_operation_link','occurrences_by_source_channel'];
for(const key of occurrenceIndicators)assert(hotfixMigration.includes(`'${key}'`),`Indicador de ocorrências ausente: ${key}`);
assert(hotfixMigration.includes("'atendimento','occurrences',d.indicator_key"),'Indicadores de ocorrências não estão no módulo/família corretos.');
assert(hotfixMigration.includes('not exists(select 1 from public.native_indicator_definitions'),'Indicadores de ocorrências não são idempotentes.');
assert(!/dashboard_widgets|report_definitions|report_blocks/.test(hotfixMigration),'Hotfix não pode criar widgets ou relatórios automaticamente.');
assert(runtimeHotfixMigration.includes("occurrence_financial_entries_total")&&runtimeHotfixMigration.includes("status='inactive'"),'Indicador financeiro fora do MVP deve ficar inativo.');
assert(!/dashboard_widgets|dashboard_definitions|report_definitions|ai_agents/.test(runtimeHotfixMigration),'Migration de catálogo não pode criar objetos de consumo ou agentes.');
for(const unsafe of ['raw_payload','staging','storage_path','external_url','metadata'])assert(!hotfixMigration.includes(unsafe),`Hotfix de indicadores expõe campo interno: ${unsafe}`);
for(const field of ['occurrence_number','current_status','current_priority','source_channel','opened_at','due_at','resolved_at','closed_at','sla_status','reason_code','reason_name','reason_category','responsible_team','linked_document_number','linked_invoice_number','linked_cte_number','linked_delivery_number','has_operation_link','has_pending_actions','pending_actions_count','overdue_pending_actions_count','treatments_count','open_treatments_count','financial_entries_total','documents_count','attachments_count','resolution_minutes'])assert(hotfixMigration.includes(`'${field}'`),`Campo seguro de relatório ausente: ${field}`);
assert(!supabaseService.includes("return '';"),'Filtro operacional não pode ser vazio.');
assert(supabaseService.includes('canonical_validity_status=eq.valid'),'Filtro operacional deve ser canônico explícito.');
assert(apiConfig.includes("status: 'active'"),'Configuração deve promover fonte que já publicou dados válidos.');
assert(publishedSourceHardening.includes("status = 'active'")&&publishedSourceHardening.includes("then 'core'"),'Backfill deve ativar e alinhar fonte operacional multi-módulo.');
for(const value of ['pending','scheduled','in_transit','delivered','delayed','failed','canceled'])assert(publishedSourceHardening.includes(`'${value}'`),`Backfill enum ausente: ${value}`);
assert(hardening.includes('is_importable')&&hardening.includes('is_analytics_only'),'Campos canônicos não classificam importação e analytics.');
for(const field of ['resolved_at','closed_at','closed_reason','closed_notes','resolution_summary'])assert(!normalization.match(new RegExp(`const occurrenceColumns[\\s\\S]{0,500}['\"]${field}['\"]`)),`${field} não deve ser importável.`);
assert(apiMappings.includes('deterministicFieldKey=`${entities[0].entity_key}__${canonical[0].field_key}`'),'Campo automático não usa entity__field.');
assert(apiMappings.includes('canonical_entity_id:mapping.canonical_entity_id')&&apiMappings.includes('canonical_field_id:mapping.canonical_field_id'),'Reload não retorna IDs canônicos.');
assert(apiMappings.includes("entities[0].entity_key==='operation_records'&&operationalKeys.has"),'Chave de ocorrência não pode virar chave operacional de entrega.');
const domains = new CanonicalValueDomainsService({} as any);
for (const key of ['operation_records.delivery_status','operation_records.priority','transport_records.pod_status','finance_records.payment_status'])
  assert(domains.getCanonicalAllowedValues(...key.split('.') as [string,string]).length > 0,`Domínio canônico ausente: ${key}`);
assert(domains.getCanonicalAllowedValues('operation_records','delivery_status').some(({value})=>value==='delivered'),'Domínio de entrega perdeu delivered.');
assert(!domains.getCanonicalAllowedValues('operation_records','delivery_status').some(({value})=>value==='Separado para carregamento'),'Valor legado não pode virar allowed_value.');
assert(valueMappings.includes("field.data_type !== 'enum' && !allowedValues.length"),'Campo não controlado passou a exigir De/Para.');
assert(valueMappings.includes("allowedValues.includes(sourceValue) ? sourceValue : null")&&valueMappings.includes("'exact_match'"),'exact_match automático foi removido.');
assert(valueMappings.includes("decision === 'ignored_value'")&&valueMappings.includes("status: 'ignored_value'"),'Decisão ignored_value não é persistida.');
assert(valueMappings.includes("decision === 'ignored_field'")&&valueMappings.includes('Campo obrigatório mínimo não pode ser ignorado.'),'Governança de ignored_field incompleta.');
assert(apiMappings.includes("configured?.status === 'ignored_value'")&&apiMappings.includes("'VALUE_MAPPING_REQUIRED'"),'Sync não distingue ignore de pendência real.');
for(const status of ['ignored_value','ignored_field'])assert(ignoreMigration.includes(status),`Migration não suporta ${status}.`);
assert(ignoreMigration.includes('not exists')&&!ignoreMigration.includes('on conflict(data_contract_field_id,value)'),'Backfill deve ser idempotente sem depender de constraint implícita.');
assert(apiMappings.includes('status=eq.ignored_field')&&apiMappings.includes('listIgnoredApiFields'),'Campos ignorados não possuem caminho de auditoria visual.');
assert(apiMappings.includes('status=neq.ignored_field'),'Salvar pareamentos não deve apagar decisões ignored_field.');
assert(!normalization.includes("const composite=!number&&values.linked_document_number"),'Idempotência composta antiga permanece ativa.');
const dashboards=readFileSync(join(root,'apps/api/src/dashboards/dashboards.service.ts'),'utf8');
const nativeIndicators=readFileSync(join(root,'apps/api/src/native-indicators/native-indicators.service.ts'),'utf8');
const apiController=readFileSync(join(root,'apps/api/src/api-integrations/api-integrations.controller.ts'),'utf8');
assert(nativeIndicators.includes("'tenant_modules'")&&nativeIndicators.includes('is_active=eq.true'),'Catálogo nativo não filtra módulos ativos do tenant.');
assert(dashboards.includes("availability.status!=='failed'")&&!dashboards.includes("['available','partial'].includes(i.availability.status)"),'Widget builder ainda oculta indicadores aguardando dados.');
assert(!dashboards.includes('dashboard_definitions.module_key'),'Widget builder não pode depender de module_key no dashboard.');
assert(nativeIndicators.includes("table === 'occurrence_analytics_view'")&&nativeIndicators.includes('tableColumns.occurrence_analytics_view.has'),'View de ocorrências não possui escopo analítico próprio com filtros seguros.');
assert(!nativeIndicators.split("if (table !== 'operation_records')")[0].split("if (table === 'occurrence_analytics_view')").at(-1)?.includes('r.operation_record_id'),'View de ocorrências voltou a depender de operation_record_id.');
for(const field of ['primary_operation_record_id','linked_document_number','linked_invoice_number','linked_cte_number','linked_delivery_number'])assert(nativeIndicators.includes(`'${field}'`),`Campo seguro da view ausente: ${field}`);
assert(dashboards.includes("body.title.trim()")&&dashboards.includes('Informe um título para o dashboard.'),'Título do dashboard não é validado/persistido antes da publicação.');
assert(reports.includes("x.available_for_reports!==false&&x.availability?.status!=='failed'"),'Biblioteca de relatórios ainda depende da disponibilidade de dashboard/dados.');
assert(apiController.includes("staging-batches/:batchId/reprocess")&&apiController.includes("@RequirePermission('integrations.api.sync_now')"),'Endpoint controlado de reprocessamento ausente ou sem permissão.');
assert(apiMappings.includes('reprocessValidatedBatch')&&apiMappings.includes('this.normalization.normalizeBatch'),'Reprocessamento não reutiliza o publicador canônico.');
assert(apiMappings.includes('validation_status=eq.valid')&&apiMappings.includes('normalized_payload'),'Reprocessamento não está restrito ao payload normalizado validado.');
assert(normalization.includes('resolveOccurrenceOperation')&&normalization.includes('if(!number&&!resolvedOperationId)return null'),'Ocorrência sem vínculo seguro ainda pode ser criada.');
for(const unsafe of ['storage_path','external_url','document_key','metadata','snapshot','tenant_id','current_owner_id','created_by','updated_by','closed_by','responsible_user_id','authorized_by','requested_by'])assert(!attendance.match(new RegExp(`clean\\([^\\n]+['\"]${unsafe}['\"]`)),`Sanitização retorna ${unsafe}.`);
assert(attendance.includes("['occurrences.ai.create_draft','occurrences.ai.create_confirmed']"),'Permissões alternativas de criação ausentes.');
const rbac=readFileSync(join(root,'apps/api/src/rbac/rbac.service.ts'),'utf8');
assert(rbac.includes("mode: 'any' | 'all' = 'any'")&&rbac.includes("mode === 'all' ? checks.every(Boolean) : checks.some(Boolean)"),'ensurePermission deve usar OR por padrão.');
for(const unsafe of ['raw_payload','session_token_hash','tool_calls','secret'])assert(!migration.match(new RegExp(`indicator_field_catalog[\\s\\S]{0,120}['\"]${unsafe}['\"]`)),'Catálogo analítico expõe campo interno.');
const entities = [
  {id:'operation',entity_key:'operation_records',name:'Operações',module_key:'core'},
  {id:'transport',entity_key:'transport_records',name:'Transporte',module_key:'transporte'},
  {id:'finance',entity_key:'finance_records',name:'Financeiro operacional',module_key:'financeiro'},
  {id:'occurrences',entity_key:'occurrences',name:'Ocorrências',module_key:'atendimento'},
];
const fields = [
  {id:'delivery',canonical_entity_id:'operation',field_key:'delivery_number',name:'Número da entrega',data_type:'text'},
  {id:'phone',canonical_entity_id:'transport',field_key:'driver_phone',name:'Telefone do motorista',data_type:'text'},
  {id:'whatsapp',canonical_entity_id:'transport',field_key:'driver_whatsapp',name:'WhatsApp do motorista',data_type:'text'},
  {id:'payment',canonical_entity_id:'finance',field_key:'payment_status',name:'Status de pagamento',data_type:'enum'},
  {id:'occ-number',canonical_entity_id:'occurrences',field_key:'occurrence_number',name:'Número da ocorrência',data_type:'text',is_importable:true,is_analytics_only:false},
  {id:'occ-total',canonical_entity_id:'occurrences',field_key:'financial_entries_total',name:'Total financeiro',data_type:'decimal',is_importable:false,is_analytics_only:true},
  {id:'internal',canonical_entity_id:'transport',field_key:'operation_record_id',name:'Registro operacional',data_type:'uuid',is_importable:true,is_analytics_only:false},
];
const mappingService = new MappingService({
  select: async (table:string) => table === 'canonical_entities' ? entities : fields,
} as any, {} as any);
mappingService.listMappingTargets('tenant').then((targets) => {
  for(const key of ['driver_phone','driver_whatsapp','delivery_number','payment_status'])
    assert(targets.some((target:any)=>target.field_key===key),`API de destinos não retornou ${key}.`);
  for(const entityKey of ['operation_records','transport_records','finance_records'])
    assert(targets.some((target:any)=>target.canonical_entity_key===entityKey),`API de destinos não retornou ${entityKey}.`);
  assert(targets.some((target:any)=>target.label==='Transporte / Telefone do motorista'),'API não retorna label agrupável.');
  assert(!targets.some((target:any)=>[forbidden,forbiddenWhatsapp].includes(String(target.field_key))),'Campo de origem legado retornado como destino nativo.');
  assert(targets.some((target:any)=>target.field_key==='occurrence_number'),'Número da ocorrência importável ausente.');
  assert(!targets.some((target:any)=>target.field_key==='financial_entries_total'),'Campo analytics-only exposto no pareamento.');
  assert(!targets.some((target:any)=>target.field_key==='operation_record_id'),'Campo interno exposto no pareamento.');
  assert(targets.every((target:any)=>Number.isFinite(target.entity_sort_order)&&Number.isFinite(target.field_sort_order)),'API não retorna ordenação funcional.');
  assert(targets.findIndex((target:any)=>target.canonical_entity_key==='transport_records') < targets.findIndex((target:any)=>target.canonical_entity_key==='occurrences'),'Grupos não seguem a ordem funcional.');
  console.log('canonical coverage: ok');
});
