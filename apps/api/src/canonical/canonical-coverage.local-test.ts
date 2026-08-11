import { readFileSync } from 'fs';
import { join } from 'path';
import { NormalizationService } from '../normalization/normalization.service';
import { MappingService } from './mapping.service';

const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message)};
const root=join(__dirname,'../../../..');
const normalization=readFileSync(join(root,'apps/api/src/normalization/normalization.service.ts'),'utf8');
const attendance=readFileSync(join(root,'apps/api/src/agents/attendance-agent-tools.service.ts'),'utf8');
const reports=readFileSync(join(root,'apps/api/src/reports/reports.service.ts'),'utf8');
const migration=readFileSync(join(root,'supabase/migrations/202608110001_sprint_7rb_applied_canonical_base.sql'),'utf8');
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
for(const unsafe of ['raw_payload','session_token_hash','tool_calls','secret'])assert(!migration.match(new RegExp(`indicator_field_catalog[\\s\\S]{0,120}['\"]${unsafe}['\"]`)),'Catálogo analítico expõe campo interno.');
const entities = [
  {id:'operation',entity_key:'operation_records',name:'Operações',module_key:'core'},
  {id:'transport',entity_key:'transport_records',name:'Transporte',module_key:'transporte'},
  {id:'finance',entity_key:'finance_records',name:'Financeiro operacional',module_key:'financeiro'},
];
const fields = [
  {id:'delivery',canonical_entity_id:'operation',field_key:'delivery_number',name:'Número da entrega',data_type:'text'},
  {id:'phone',canonical_entity_id:'transport',field_key:'driver_phone',name:'Telefone do motorista',data_type:'text'},
  {id:'whatsapp',canonical_entity_id:'transport',field_key:'driver_whatsapp',name:'WhatsApp do motorista',data_type:'text'},
  {id:'payment',canonical_entity_id:'finance',field_key:'payment_status',name:'Status de pagamento',data_type:'enum'},
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
  console.log('canonical coverage: ok');
});
