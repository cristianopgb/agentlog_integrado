import assert from 'node:assert/strict';
import { TenantLogisticKeyService } from './tenant-logistic-key.service';
import { NormalizationService } from './normalization.service';

async function run(){
  const settings:any[]=[];
  const mappings:any[]=[];
  const db:any={
    select:async(table:string,query:string)=>table==='tenant_integration_settings'?settings.filter(row=>query.includes(row.tenant_id)):table==='canonical_entities'?[{id:'entity-occurrences'}]:table==='canonical_fields'?(mappings.length?[{id:'field-linked-invoice'}]:[]):table==='field_mappings'?mappings:[],
    insert:async(table:string,payload:any)=>{if(table==='tenant_integration_settings')settings.push(payload);return[payload];},
  };
  const service=new TenantLogisticKeyService(db);
  assert.equal(await service.get('tenant-without-setting'),null,'tenant sem configuração retorna null, nunca array vazio');
  await service.establish('tenant-a','source-operations','invoice_number','user-a');
  assert.equal((await service.get('tenant-a'))?.primary_logistic_key,'invoice_number','a primeira fonte define a chave');
  await assert.rejects(()=>service.establish('tenant-a','source-2','cte_number','user-a'),/já usa NF/);
  await assert.rejects(()=>service.validateSourceMapping('tenant-a','contract-occurrences','occurrences'),/Mapeie um campo da API para Ocorrências \/ NF vinculada/);
  mappings.push({id:'mapping-linked-invoice'});
  assert.equal((await service.validateSourceMapping('tenant-a','contract-occurrences','occurrences')).expected_field,'linked_invoice_number');
  assert.equal(service.label('invoice_number'),'NF');
  assert.equal(service.expectedCanonicalField('delivery_number','occurrences'),'linked_delivery_number');
  assert.equal(service.expectedCanonicalLabel('delivery_number','occurrences'),'Ocorrências / Documento da entrega vinculada');

  settings[0].primary_logistic_key='delivery_number';
  mappings.length=0;
  await assert.rejects(
    ()=>service.validateSourceMapping('tenant-a','contract-occurrences','occurrences'),
    /Esta empresa usa Documento da entrega como chave logística principal\. Mapeie um campo da API para Ocorrências \/ Documento da entrega vinculada\./,
  );

  const inserted:Array<{table:string;payload:any}>=[];
  const normalizationDb:any={
    select:async(table:string)=>table==='tenant_integration_settings'?[{tenant_id:'tenant-a',primary_logistic_key:'delivery_number'}]:table==='operation_records'?[{id:'existing-operation'}]:[],
    insert:async(table:string,payload:any)=>{inserted.push({table,payload});return table==='occurrences'?[{id:'new-occurrence'}]:[payload];},
    update:async()=>[], rpc:async()=> 'OC0000001',
  };
  const normalization=new NormalizationService(normalizationDb,new TenantLogisticKeyService(normalizationDb));
  const result=await (normalization as any).upsertOccurrence('tenant-a',{source_reference:'legacy-occ-1',title:'Atraso',current_priority:'medium',linked_delivery_number:'ENT-42'},{id:'staging-record-1'},'user-a');
  assert.equal(result.created,true,'a ocorrência API é criada');
  assert.equal(inserted.filter(item=>item.table==='occurrences').length,1);
  assert.equal(inserted.filter(item=>item.table==='operation_records').length,0,'a fonte de ocorrência nunca cria operação');
  assert.equal(inserted.find(item=>item.table==='occurrence_operation_links')?.payload.operation_record_id,'existing-operation','vincula pela chave principal à operação existente');
  assert.equal(inserted.find(item=>item.table==='occurrences')?.payload.current_priority,'medium','prioridade medium permanece medium');
  assert.equal(inserted.find(item=>item.table==='occurrences')?.payload.source_reference,'legacy-occ-1');
  console.log('tenant logistic key tests passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
