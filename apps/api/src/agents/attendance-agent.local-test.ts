import { strict as assert } from 'node:assert';
import { AttendanceAgentService } from './attendance-agent.service';

async function main(){
 const writes:any[]=[];const db:any={select:async(table:string)=>table==='ai_agents'?[]:[],insert:async()=>[],update:async()=>[]};
 const service=new AttendanceAgentService(db as any,{} as any,{} as any);const result=await service.processPublicConversation('tenant-a','conversation-a');
 assert.equal(result.configured,false);assert.match(result.answer,/ainda não configurado/);assert.equal(writes.length,0);
 const executed:any[]=[];let turn=0;
 const configuredDb:any={
  select:async(table:string)=>table==='ai_agents'?[{id:'agent-a',created_by:'actor-a',agent_type:'attendance_inbox'}]:table==='ai_agent_tools'?[{tool_id:'tool-a'}]:table==='ai_tools'?[{id:'tool-a',tool_key:'attendance.occurrence.create'}]:[],
  insert:async(table:string)=>table==='ai_runs'?[{id:'run-a'}]:[],update:async()=>[],
 };
 const gateway:any={attendanceTurn:async()=>turn++===0?{calls:[{id:'call-a',name:'attendance__occurrence__create',args:{conversation_id:'operation-record-a',operation_record_id:'operation-record-a'}}],answer:'',responseId:'response-a'}:{calls:[],answer:'Registro realizado.',responseId:'response-b',modelName:'test',usage:{}}};
 const tools:any={execute:async(_tenant:string,key:string,args:Record<string,unknown>)=>{executed.push({key,args});return{created:true}}};
 const configured=new AttendanceAgentService(configuredDb,gateway,tools);await configured.processPublicConversation('tenant-a','real-conversation-a');
 assert.equal(executed[0].args.conversation_id,'real-conversation-a');assert.equal(executed[0].args.operation_record_id,'operation-record-a');
 console.log('attendance-agent.local-test: ok');
}
void main();
