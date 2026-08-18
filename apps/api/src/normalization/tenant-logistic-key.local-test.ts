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

  const legacy=await runOccurrence({source_reference:'',occurrence_number:'LEG-987',title:'Avaria',linked_delivery_number:'ENT-404'});
  const legacyPayload=legacy.inserted.find(item=>item.table==='occurrences')?.payload;
  assert.equal(legacyPayload.source_reference,'LEG-987','número legado vira referência externa');
  assert.equal(legacyPayload.occurrence_number,'OC0000001','número interno continua alocado pelo AgentLog');
  assert.notEqual(legacyPayload.occurrence_number,'LEG-987','número legado não sobrescreve o interno');

  const occurrenceFixture=(initialOccurrences:any[]=[],initialLinks:any[]=[])=>{
    const occurrences=initialOccurrences.map(row=>({...row}));
    const links=initialLinks.map(row=>({...row}));
    const queries:Array<{table:string;query:string}>=[];
    const inserted:Array<{table:string;payload:any}>=[];
    const updated:Array<{table:string;query:string;payload:any}>=[];
    const value=(query:string,key:string)=>{
      const match=query.match(new RegExp(`(?:^|&)${key}=eq\\.([^&]+)`));
      return match?decodeURIComponent(match[1]):null;
    };
    const db:any={
      select:async(table:string,query:string)=>{
        queries.push({table,query});
        if(table==='occurrences')return occurrences.filter(row=>
          (!value(query,'tenant_id')||row.tenant_id===value(query,'tenant_id'))&&
          (!value(query,'source_reference')||row.source_reference===value(query,'source_reference'))&&
          (!value(query,'source_channel')||row.source_channel===value(query,'source_channel'))&&
          (!value(query,'title')||row.title===value(query,'title'))&&
          (!value(query,'opened_at')||row.opened_at===value(query,'opened_at'))&&
          (!query.includes('id=in.(')||query.match(/id=in\.\(([^)]+)\)/)?.[1].split(',').includes(row.id))&&
          row.deleted_at==null,
        ).slice(0,1);
        if(table==='occurrence_operation_links')return links.filter(row=>
          (!value(query,'tenant_id')||row.tenant_id===value(query,'tenant_id'))&&
          (!value(query,'occurrence_id')||row.occurrence_id===value(query,'occurrence_id'))&&
          (!value(query,'operation_record_id')||row.operation_record_id===value(query,'operation_record_id')),
        );
        return[];
      },
      insert:async(table:string,payload:any)=>{
        inserted.push({table,payload:{...payload}});
        if(table==='occurrences'){
          const row={id:`occ-${occurrences.length+1}`,...payload};
          occurrences.push(row);
          return[row];
        }
        if(table==='occurrence_operation_links'){
          const row={id:`link-${links.length+1}`,...payload};
          links.push(row);
          return[row];
        }
        return[payload];
      },
      update:async(table:string,query:string,payload:any)=>{
        updated.push({table,query,payload:{...payload}});
        const rows=table==='occurrences'?occurrences:table==='occurrence_operation_links'?links:[];
        for(const row of rows)if((!value(query,'tenant_id')||row.tenant_id===value(query,'tenant_id'))&&(!value(query,'id')||row.id===value(query,'id'))&&(!value(query,'occurrence_id')||row.occurrence_id===value(query,'occurrence_id')))Object.assign(row,payload);
        return rows;
      },
      rpc:async()=>`OC${String(occurrences.length+1).padStart(7,'0')}`,
    };
    const normalization=new NormalizationService(db,new TenantLogisticKeyService(db));
    const upsert=(values:Record<string,unknown>,operationId?:string)=>(normalization as any).upsertOccurrence('tenant-a',values,{id:'staging-record-hotfix'},'user-a',operationId);
    return{occurrences,links,queries,inserted,updated,upsert};
  };

  const replay=occurrenceFixture();
  const replayValues={title:'Retenção em rota',opened_at:'2026-08-14T17:14:44Z',source_channel:'api'};
  assert.equal((await replay.upsert(replayValues)).created,true,'primeiro processamento cria ocorrência');
  assert.equal((await replay.upsert(replayValues)).created,false,'reprocessamento reutiliza ocorrência pelo fallback funcional');
  assert.equal(replay.inserted.filter(item=>item.table==='occurrences').length,1,'reprocessamento não insere nova ocorrência');

  const operationA='11111111-1111-4111-8111-111111111111';
  const operationB='22222222-2222-4222-8222-222222222222';
  const changedOperation=occurrenceFixture(
    [{id:'occ-existing',tenant_id:'tenant-a',title:'Atraso por retenção em rota',opened_at:'2026-08-14T17:14:44Z',source_channel:'api',source_reference:null,deleted_at:null}],
    [{id:'link-a',tenant_id:'tenant-a',occurrence_id:'occ-existing',operation_record_id:operationA,is_primary:true}],
  );
  const changed=await changedOperation.upsert({title:'Atraso por retenção em rota',opened_at:'2026-08-14T17:14:44Z',source_channel:'api'},operationB);
  assert.equal(changed.created,false,'mudança do UUID operacional reutiliza a ocorrência existente');
  assert.equal(changedOperation.inserted.some(item=>item.table==='occurrences'),false,'mudança do UUID não cria ocorrência');
  assert.equal(changedOperation.links.find(link=>link.operation_record_id===operationA)?.is_primary,false,'vínculo operacional antigo deixa de ser primário');
  assert.equal(changedOperation.links.find(link=>link.operation_record_id===operationB)?.is_primary,true,'operação atual torna-se vínculo primário');

  const exactLink=occurrenceFixture(
    [{id:'occ-exact',tenant_id:'tenant-a',title:'Avaria',opened_at:'2026-08-15T10:00:00Z',source_channel:'api',source_reference:null,deleted_at:null}],
    [{id:'link-exact',tenant_id:'tenant-a',occurrence_id:'occ-exact',operation_record_id:operationB,is_primary:true}],
  );
  await exactLink.upsert({title:'Avaria',opened_at:'2026-08-15T10:00:00Z',source_channel:'api'},operationB);
  assert.equal(exactLink.inserted.filter(item=>item.table==='occurrence_operation_links').length,0,'vínculo exato existente não é duplicado');

  const referencePriority=occurrenceFixture([
    {id:'occ-reference',tenant_id:'tenant-a',title:'Título original',opened_at:'2026-08-01T10:00:00Z',source_channel:'api',source_reference:'EXT-1',deleted_at:null},
    {id:'occ-fallback',tenant_id:'tenant-a',title:'Título novo',opened_at:'2026-08-16T10:00:00Z',source_channel:'api',source_reference:null,deleted_at:null},
  ]);
  const referenceResult=await referencePriority.upsert({source_reference:'EXT-1',title:'Título novo',opened_at:'2026-08-16T10:00:00Z',source_channel:'api'});
  assert.equal(referenceResult.id,'occ-reference','source_reference prevalece sobre a identidade alternativa');
  assert.equal(referencePriority.queries.filter(item=>item.table==='occurrences').length,1,'uma referência encontrada encerra os fallbacks');

  for(const fixture of [replay,changedOperation,exactLink,referencePriority])
    assert.equal(fixture.queries.some(item=>item.query.includes('operation_record_id=eq.null')),false,'nenhuma consulta usa operation_record_id null');
  console.log('tenant logistic key tests passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
