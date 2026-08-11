import { readFileSync } from 'node:fs';
const labels=readFileSync(new URL('../lib/report-labels.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../../supabase/migrations/202608110001_sprint_7rb_applied_canonical_base.sql',import.meta.url),'utf8');
const setup=readFileSync(new URL('../app/app/integrations/[id]/setup/page.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../lib/canonical-api.ts',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
for(const field of ['driver_phone','driver_whatsapp','pod_status','billing_status'])assert(labels.includes(`${field}:`),`Label ausente: ${field}`);
for(const field of ['driver_phone','driver_whatsapp'])assert(migration.includes(`'${field}'`),`Destino de pareamento ausente: ${field}`);
const forbidden=['carga','motorista','telefone'].join('_');
const forbiddenWhatsapp=['carga','motorista','whatsapp'].join('_');
assert(!migration.includes(forbidden)&&!migration.includes(forbiddenWhatsapp),'Campo específico do legado exposto na UI.');
assert(setup.includes('listCanonicalMappingTargets(t)'),'Pareamento não usa o catálogo canônico aplicado da API.');
assert(api.includes('/canonical-entities/mapping-targets'),'Cliente não consulta a API de destinos canônicos.');
for(const label of ["operation_records: 'Operações'","transport_records: 'Transporte'","finance_records: 'Financeiro operacional'"])
  assert(setup.includes(label),`Agrupamento amigável ausente: ${label}`);
assert(!setup.includes('.filter((entity) => visibleEntityOrder.includes(entity.entity_key))'),'UI limita destinos a uma lista antiga de entidades.');
console.log('canonical ui: ok');
