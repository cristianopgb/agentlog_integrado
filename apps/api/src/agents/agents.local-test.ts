import assert from 'node:assert/strict';
import {BadRequestException} from '@nestjs/common';
import {AgentsService} from './agents.service';

async function main(){
  let inserted:Record<string,unknown>|undefined;
  const db={
    select:async()=>[],
    insert:async(_table:string,payload:Record<string,unknown>)=>{inserted=payload;return[{id:'agent-1',...payload}]},
  };
  const semanticBootstrap={ensure:async()=>undefined};
  const service=new AgentsService(db as never,{} as never,{} as never,semanticBootstrap as never);

  const agent=await service.create('tenant-1','user-1',{
    name:'Atendimento principal',
    agent_type:'attendance_inbox',
    module_key:'core',
    status:'active',
  });

  assert.equal(inserted?.agent_type,'attendance_inbox');
  assert.equal(inserted?.module_key,'atendimento');
  assert.equal(agent.agent_type,'attendance_inbox');
  assert.notEqual(agent.agent_type,'dashboard_analyst');
  await assert.rejects(
    service.create('tenant-1','user-1',{name:'Inválido',agent_type:'unknown'}),
    BadRequestException,
  );
  console.log('agents.local-test: ok');
}

void main();
