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
const forbidden=['carga','motorista','telefone'].join('_');
const forbiddenWhatsapp=['carga','motorista','whatsapp'].join('_');

for(const field of ['delivery_number','driver_phone','driver_whatsapp','pod_status','billing_status','payment_status'])
  assert(migration.includes(`'${field}'`)||normalization.includes(`'${field}'`),`Campo canônico ausente: ${field}`);
assert(!migration.toLowerCase().includes('hostgator'),'Catálogo não pode conter destino de cliente.');
assert(!migration.includes(forbidden)&&!migration.includes(forbiddenWhatsapp),'Campo de origem específico não pode ser nativo.');
const service=Object.create(NormalizationService.prototype) as any;
assert(service.resolveTarget('deliveries','delivery_number')?.field==='delivery_number','Alias legado delivery_number deixou de resolver.');
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
