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

  const runOccurrence=async(values:Record<string,unknown>,operationId?:string)=>{
    const inserted:Array<{table:string;payload:any}>=[],queries:Array<{table:string;query:string}>=[];
    const normalizationDb:any={
      select:async(table:string,query:string)=>{
        queries.push({table,query});
        if(table==='tenant_integration_settings')return[{tenant_id:'tenant-a',primary_logistic_key:'delivery_number'}];
        if(table==='operation_records')return operationId?[{id:operationId}]:[];
        return[];
      },
      insert:async(table:string,payload:any)=>{inserted.push({table,payload});return table==='occurrences'?[{id:'new-occurrence'}]:[payload];},
      update:async()=>[],rpc:async()=> 'OC0000001',
    };
    const normalization=new NormalizationService(normalizationDb,new TenantLogisticKeyService(normalizationDb));
    const result=await (normalization as any).upsertOccurrence('tenant-a',values,{id:'staging-record-1'},'user-a');
    return{result,inserted,queries};
  };

  const unresolved=await runOccurrence({title:'Atraso',opened_at:'2026-08-18T10:00:00Z',linked_delivery_number:'ENT-404'});
  assert.equal(unresolved.result.created,true,'ocorrência sem operação correspondente é criada');
  assert.equal(unresolved.inserted.filter(item=>item.table==='operation_records').length,0,'a fonte de ocorrência nunca cria operação');
  assert.equal(unresolved.inserted.filter(item=>item.table==='occurrence_operation_links').length,0,'não cria vínculo sem operação');
  assert.equal(unresolved.queries.some(item=>item.table==='occurrence_operation_links'),false,'não consulta vínculo com UUID nulo');
  assert(unresolved.queries.some(item=>item.table==='occurrences'&&item.query.includes('title=eq.Atraso')&&item.query.includes('opened_at=eq.2026-08-18T10%3A00%3A00Z')),'usa fallback direto e seguro por título, abertura e canal');

  const operationId='11111111-1111-4111-8111-111111111111';
  const resolved=await runOccurrence({source_reference:'external-occ-1',title:'Atraso',linked_delivery_number:'ENT-42'},operationId);
  assert.equal(resolved.result.created,true,'ocorrência com operação correspondente é criada');
  assert.equal(resolved.inserted.find(item=>item.table==='occurrence_operation_links')?.payload.operation_record_id,operationId,'vincula à operação existente');
  assert.equal(resolved.inserted.filter(item=>item.table==='operation_records').length,0,'não cria operação ao vincular ocorrência');

  const legacy=await runOccurrence({occurrence_number:'LEG-987',title:'Avaria',linked_delivery_number:'ENT-404'});
  const legacyPayload=legacy.inserted.find(item=>item.table==='occurrences')?.payload;
  assert.equal(legacyPayload.source_reference,'LEG-987','número legado vira referência externa');
  assert.equal(legacyPayload.occurrence_number,'OC0000001','número interno continua alocado pelo AgentLog');
  assert.notEqual(legacyPayload.occurrence_number,'LEG-987','número legado não sobrescreve o interno');
  console.log('tenant logistic key tests passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
