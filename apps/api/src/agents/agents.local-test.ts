import assert from 'node:assert/strict';
import {BadRequestException} from '@nestjs/common';
import {AgentsService} from './agents.service';

async function main(){
  const inserted:Record<string,unknown>[]=[];
  const existing={id:'dashboard-1',tenant_id:'tenant-1',agent_type:'dashboard_analyst',module_key:'core'};
  const attendance={id:'attendance-1',tenant_id:'tenant-1',agent_type:'attendance_inbox',module_key:'atendimento'};
  const db={
    select:async(_table:string,query:string)=>query.includes('id=eq.dashboard-1')?[existing]:query.includes('id=eq.attendance-1')?[attendance]:[],
    insert:async(_table:string,payload:Record<string,unknown>)=>{inserted.push(payload);return[{id:`agent-${inserted.length}`,...payload}]},
    update:async(_table:string,_query:string,payload:Record<string,unknown>)=>[{...existing,...payload}],
  };
  const service=new AgentsService(db as never,{} as never,{} as never,{ensure:async()=>undefined} as never);

  const normalized=await service.create('tenant-1','user-1',{name:'Atendimento principal',agent_type:'attendance_inbox',module_key:'core',status:'active'});
  assert.equal(normalized.agent_type,'attendance_inbox');
  assert.equal(normalized.module_key,'atendimento');
  assert.notEqual(normalized.agent_type,'dashboard_analyst');

  const defaulted=await service.create('tenant-1','user-1',{name:'Atendimento secundário',agent_type:'attendance_inbox'});
  assert.equal(defaulted.module_key,'atendimento');

  await assert.rejects(
    service.create('tenant-1','user-1',{name:'Dashboard inválido',agent_type:'dashboard_analyst',module_key:'atendimento'}),
    (error:unknown)=>error instanceof BadRequestException&&error.message==='Dashboard não pode ser criado no módulo Atendimento. Use o tipo Atendimento / Inbox.',
  );
  await assert.rejects(service.update('tenant-1','dashboard-1',{module_key:'atendimento'}),BadRequestException);
  await assert.rejects(service.update('tenant-1','attendance-1',{module_key:'core'}),BadRequestException);
  await assert.rejects(service.create('tenant-1','user-1',{name:'Inválido',agent_type:'unknown'}),BadRequestException);
  assert.equal(inserted.length,2,'tipos inválidos não devem sofrer fallback ou ser inseridos');
  console.log('agents.local-test: ok');
}

void main();
