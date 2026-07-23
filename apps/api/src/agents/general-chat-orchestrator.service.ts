import { BadRequestException, Injectable } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizeAssistantOutput } from './assistant-output-normalizer';

const keys=['analytics.map.get','analytics.result.get','analytics.context.analyze','operational.record.find','knowledge.guidance.search'] as const;
const forbidden=/sql|table|schema|staging|payload|raw|operation_records|dashboard_snapshot|render_snapshot|data_snapshot/i;

@Injectable()
export class GeneralChatOrchestratorService {
  constructor(private readonly gateway:AiGatewayService,private readonly tools:AgentToolExecutorService,private readonly db:SupabaseService) {}
  async execute(tenantId:string,agent:any,message:string,history:any[]=[],runId?:string){
    const toolKeys:string[]=[];
    try {
      let state:any=await this.gateway.generalChatToolCall({agent,message,history:history.slice(-8)}), results:any[]=[], rounds=0, final:any;
      while(rounds++<3&&state.calls?.length&&results.length<4){const batch=state.calls.slice(0,4-results.length);const outputs=[] as any[];for(const call of batch){const name=this.internalName(call.name);if(keys.includes(name as any))toolKeys.push(name);let args:Record<string,any>;try{args=this.validateCall(name,call.arguments);}catch(error){if(keys.includes(name as any))await this.log(tenantId,name,call.arguments,{message:'Chamada bloqueada por validação controlada.'},'blocked',Date.now(),runId);throw error;}const result=await this.executeTool(tenantId,agent.id,name,args,runId),entry={call_id:call.id,name,result:this.compact(result)};results.push(entry);outputs.push(entry);}state=await this.gateway.generalChatToolContinue({agent,toolResults:outputs,previousResponseId:state.response_id});if(state.done){final={answer:state.answer,model_provider:'openai',llm_final_called:true};break;}}
      if(!final)final=await this.gateway.generalChatToolFinal({agent,message,history:history.slice(-8),toolResults:[],previousResponseId:state.response_id});
      const content=normalizeAssistantOutput(final.answer).content;
      return {content,response:final,output_json:{content},observability:{agent_flow:'openai_tool_calling',intent:final.intent||'general_chat',main_tool:toolKeys[0]||null,tool_keys:toolKeys,tool_calls_count:toolKeys.length,llm_called:true,llm_tool_choice:'auto',llm_final_called:final.llm_final_called,cache_hit:false,needs_clarification:false,stage_failed:final.error_code||null,error_code:final.error_code||null,tool_arguments_safe:toolKeys.map(tool_key=>({tool_key})),tool_results_summary:results.map(x=>({tool_key:x.name,keys:Object.keys(x.result||{})})),llm_direct_answer:toolKeys.length===0,no_tool_answer:toolKeys.length===0,analytic_map_used:toolKeys.includes('analytics.map.get'),guidance_used:toolKeys.includes('knowledge.guidance.search')}};
    } catch (error) {
      const failure={agent_flow:'openai_tool_calling',stage_failed:this.stage(error),error_code:this.code(error),error_message_safe:'Não foi possível concluir a consulta controlada.',tool_keys:toolKeys};
      if(runId)await this.db.update('ai_runs',`tenant_id=eq.${tenantId}&id=eq.${runId}`,{output_json:failure});
      Object.assign(error as object,{generalChatFailure:failure});
      throw error;
    }
  }
  private internalName(name:string){return ({analytics_map_get:'analytics.map.get',analytics_result_get:'analytics.result.get',analytics_context_analyze:'analytics.context.analyze',operational_record_find:'operational.record.find',knowledge_guidance_search:'knowledge.guidance.search'} as Record<string,string>)[name]||name;}
  private validateCall(name:string,args:unknown){
    if(!keys.includes(name as any)||!args||typeof args!=='object'||Array.isArray(args))throw new BadRequestException('Chamada de ferramenta inválida.');
    const value=args as Record<string,any>; this.safe(value);
    const allowed:Record<string,string[]>={'analytics.map.get':['scope','search'],'analytics.result.get':['result_key','period','filters','include'],'analytics.context.analyze':['context_type','context_value','period','include'],'operational.record.find':['identifier_type','identifier_value','filters','period','limit'],'knowledge.guidance.search':['topic','user_question','limit']};
    if(Object.keys(value).some(k=>!allowed[name].includes(k)))throw new BadRequestException('Parâmetro de ferramenta não permitido.');
    if(name==='analytics.result.get'&&(typeof value.result_key!=='string'||!value.result_key))throw new BadRequestException('Resultado obrigatório.');
    if(name==='analytics.context.analyze'&&!['dashboard','report','customer','driver','vehicle_plate','shipper','operation'].includes(value.context_type))throw new BadRequestException('Contexto inválido.');
    if(name==='operational.record.find'){if(value.identifier_type&&!['delivery_number','cte_number','invoice_number','manifest_number','vehicle_plate'].includes(value.identifier_type))throw new BadRequestException('Identificador inválido.');if(!value.identifier_value&&!value.filters)throw new BadRequestException('Identificador ou filtro obrigatório.');if(value.limit!==undefined&&(!Number.isInteger(value.limit)||value.limit<1||value.limit>5))throw new BadRequestException('Limite inválido.');}
    if(value.filters)this.filters(name,value.filters);if(name==='knowledge.guidance.search'&&(typeof value.topic!=='string'||typeof value.user_question!=='string'))throw new BadRequestException('Orientação inválida.');if(value.period)this.period(value.period);return value;
  }
  private safe(value:any):void {if(typeof value==='string'){if(value.length>500||forbidden.test(value))throw new BadRequestException('Conteúdo não permitido.');return;}if(Array.isArray(value)){value.forEach(x=>this.safe(x));return;}if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(forbidden.test(k))throw new BadRequestException('Campo não permitido.');this.safe(v);}}
  private period(period:any){if(!period||typeof period!=='object'||Array.isArray(period))throw new BadRequestException('Período inválido.');if(period.preset&&!['today','current_week','current_month','previous_month','custom'].includes(period.preset))throw new BadRequestException('Período inválido.');if(period.preset==='custom'&&(!this.date(period.start)||!this.date(period.end)))throw new BadRequestException('Período personalizado inválido.');}
  private date(v:any){return typeof v==='string'&&!Number.isNaN(Date.parse(v));}
  private filters(name:string,filters:any){if(!filters||typeof filters!=='object'||Array.isArray(filters))throw new BadRequestException('Filtros inválidos.');const allowed=name==='operational.record.find'?['delivery_number','cte_number','invoice_number','manifest_number','vehicle_plate','status','customer_name','driver_name','shipper_name']:['customer_name','driver_name','vehicle_plate','shipper_name','status','destination_state','destination_city','origin_state','origin_city'];if(Object.keys(filters).some(key=>!allowed.includes(key))||Object.values(filters).some(value=>typeof value!=='string'||value.length>160))throw new BadRequestException('Filtro não permitido.');}
  private async executeTool(t:string,agentId:string,key:string,args:Record<string,any>,runId?:string){
    const started=Date.now();const [tool]=await this.db.select<any[]>('ai_tools',`select=id&tool_key=eq.${key}&is_active=eq.true&limit=1`);const [enabled]=tool?await this.db.select<any[]>('ai_agent_tools',`select=id&tenant_id=eq.${t}&agent_id=eq.${agentId}&tool_id=eq.${tool.id}&is_enabled=eq.true&limit=1`):[];
    if(!enabled){await this.log(t,key,args,{message:'Ferramenta bloqueada por permissão.'},'blocked',started,runId,tool?.id);throw new BadRequestException('Ferramenta não habilitada para este agente.');}
    try {const result=await this.tools.execute(t,key,args);await this.log(t,key,args,result,'completed',started,runId,tool.id);return result;}catch(error){await this.log(t,key,args,{message:'Falha controlada ao consultar dados.'},'failed',started,runId,tool.id);throw error;}
  }
  private async log(t:string,key:string,input:any,output:any,status:'completed'|'failed'|'blocked',started:number,runId?:string,toolId?:string){if(!runId)return;await this.db.insert('ai_tool_calls',{tenant_id:t,ai_run_id:runId,tool_id:toolId??null,tool_key:key,input_json:this.compact(input),output_json:this.compact(output),status,duration_ms:Date.now()-started,finished_at:new Date().toISOString()});}
  private stage(error:unknown){return error instanceof BadRequestException?'tool_validation_or_permission':'tool_execution';}
  private code(error:unknown){return error instanceof BadRequestException?'general_chat_tool_blocked':'general_chat_tool_execution_failed';}
  private compact(value:any,depth=0):any {if(value===null||['string','number','boolean'].includes(typeof value))return typeof value==='string'?value.slice(0,1200):value;if(depth>5)return undefined;if(Array.isArray(value))return value.slice(0,20).map(v=>this.compact(v,depth+1));if(value&&typeof value==='object')return Object.entries(value).filter(([k])=>!forbidden.test(k)&&!/(tenant_id|id)$/i.test(k)).slice(0,40).reduce((out,[k,v])=>{const x=this.compact(v,depth+1);if(x!==undefined)(out as any)[k]=x;return out;},{} as any);}
}
