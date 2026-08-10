import { strict as assert } from 'node:assert';
import { AttendanceAgentService } from './attendance-agent.service';

async function main(){
 const writes:any[]=[];const db:any={select:async(table:string)=>table==='ai_agents'?[]:[],insert:async()=>[],update:async()=>[]};
 const service=new AttendanceAgentService(db as any,{} as any,{} as any);const result=await service.processPublicConversation('tenant-a','conversation-a');
 assert.equal(result.configured,false);assert.match(result.answer,/ainda não configurado/);assert.equal(writes.length,0);
 console.log('attendance-agent.local-test: ok');
}
void main();
