import { strict as assert } from 'node:assert';
import { GeneralChatOrchestratorService } from './general-chat-orchestrator.service';
import { generalChatToolDefinitions, GENERAL_CHAT_FUNCTION_TO_KEY } from './general-chat-tool-contracts';
import { ChatService } from './chat.service';

async function main(){
  const executed:string[]=[],logged:string[]=[];
  const gateway:any={generalChatToolCall:async()=>({calls:[],response_id:'selection',tool_choice:'auto'}),generalChatToolFinal:async()=>({answer:'Resposta baseada em evidência controlada.',model_provider:'system',llm_final_called:true})};
  const tools:any={execute:async(_tenant:string,key:string)=>{executed.push(key);return {found:true,tool_key:key};}};
  const db:any={select:async(table:string)=>table==='ai_tools'?[{id:'tool'}]:[{id:'link'}],insert:async(table:string,row:any)=>{if(table==='ai_tool_calls')logged.push(row.tool_key);return [row];},update:async()=>[]};
  const orchestrator=new GeneralChatOrchestratorService(gateway,tools,db),agent={id:'agent'};
  const cases:Array<[string,Record<string,unknown>,string]>=[
    ['Como está minha operação?',{},'analytics.context.analyze'],
    ['Me mostre resumo dos dados tratados',{},'treated_data.summary.get'],
    ['Analise o dashboard',{page:'dashboard',dashboard_id:'dashboard-1'},'dashboard.get_snapshot'],
    ['Analise o relatório',{page:'report',report_job_id:'job-1'},'reports.get_job_snapshot'],
  ];
  for(const [message,context,expected] of cases){const result:any=await orchestrator.execute('tenant',agent,message,[],'run',{channel:'text',...context});assert.equal(result.observability.main_tool,expected);assert.equal(result.output_json.fallback_used,true);}
  const voice=await orchestrator.executeRealtimeTool('tenant','agent','treated_data_summary_get',{},'voice-run');assert.equal((voice as any).tool_key,'treated_data.summary.get');
  assert.deepEqual(executed,[...cases.map(item=>item[2]),'treated_data.summary.get']);
  assert.deepEqual(logged,executed);
  const exposed=new Set(generalChatToolDefinitions().map((tool:any)=>tool.name));for(const name of Object.keys(GENERAL_CHAT_FUNCTION_TO_KEY))assert.ok(exposed.has(name),`${name} não foi exposta pelo gateway`);
  const updates:any[]=[],voiceDb:any={select:async(table:string)=>{if(table==='ai_chat_conversations')return[{id:'conversation'}];if(table==='ai_agents')return[{id:'agent',status:'active'}];if(table==='ai_runs')return[{id:'voice-run',output_json:{}}];if(table==='ai_chat_messages')return[{content:'Como está minha operação?',created_at:'2026-07-31T00:00:00.000Z'}];if(table==='ai_tool_calls')return[];return[];},insert:async(_table:string,row:any)=>[{id:'event',...row}],update:async(table:string,_query:string,row:any)=>{if(table==='ai_runs')updates.push(row);return[row];}};
  const chat=new ChatService(voiceDb,{} as any,{} as any,orchestrator);await chat.realtimeEvent('tenant','user','conversation',{ai_run_id:'voice-run',stage:'responded',text:'Resposta sem consulta.'});assert.equal(updates[0].output_json.operational_response_without_tool,true);assert.equal(updates[0].output_json.error_code,'voice_tool_required');
  console.log('general-chat-tools.local-test: ok');
}

void main();
