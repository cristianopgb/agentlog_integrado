import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiGatewayService } from './ai-gateway.service';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { parseChatIntent } from './chat-intent-parser';

const FALLBACK = 'Olá! Sou o Agente Geral do Sistema Logístico Integrado. Posso ajudar com dúvidas sobre o sistema, processos internos publicados na Base de Conhecimento e consultas à base tratada da operação.';
const UNAVAILABLE_TOOL = 'Essa ferramenta ainda não está disponível no Chat Geral.';

@Injectable()
export class ChatService {
  constructor(private db: SupabaseService, private gateway: AiGatewayService, private tools: AgentToolExecutorService) {}
  async conversations(t:string,u:string){return {data:await this.db.select('ai_chat_conversations',`tenant_id=eq.${t}&user_id=eq.${u}&deleted_at=is.null&status=eq.active&order=updated_at.desc&limit=50`)}}
  async create(t:string,u:string,b:Record<string,unknown>){const a=await this.agent(t);const [x]=await this.db.insert<any[]>('ai_chat_conversations',{tenant_id:t,user_id:u,agent_id:a?.id??null,title:typeof b.title==='string'?this.cleanUserMessage(b.title,120):null});return x}
  async messages(t:string,u:string,id:string){await this.conversation(t,u,id);return {data:await this.db.select('ai_chat_messages',`tenant_id=eq.${t}&conversation_id=eq.${id}&order=created_at.asc&limit=100`)}}
  async archive(t:string,u:string,id:string){await this.conversation(t,u,id);await this.db.update('ai_chat_conversations',`tenant_id=eq.${t}&id=eq.${id}`,{status:'archived',deleted_at:new Date().toISOString()});return {archived:true}}
  async send(t:string,u:string,id:string,b:Record<string,unknown>){
    const message=this.cleanUserMessage(b.message,2000), c=await this.conversation(t,u,id), agent=await this.agent(t);
    if(!agent)return {enabled:false,message:await this.save(t,id,'assistant','Nenhum agente de chat geral ativo foi configurado.')};
    await this.save(t,id,'user',message);
    const [run]=await this.db.insert<any[]>('ai_runs',{tenant_id:t,agent_id:agent.id,run_type:'general_chat',trigger_type:'chat_message',status:'processing',input_snapshot:{conversation_id:id,message:message.slice(0,500)},requested_by:u,started_at:new Date().toISOString()});
    let stage='call_ai_gateway';
    try {
      const intent=parseChatIntent(message);
      if(intent.needsClarification)return this.complete(t,id,c,run,agent,'Para responder com segurança, informe o nome completo do motorista, cliente ou a placa.');
      let toolResult:unknown=null, toolKey=intent.tool, knowledgeResultsCount:number|undefined;
      // Knowledge retrieval is a controlled read capability of General Chat. It must run
      // whenever the deterministic parser identifies a knowledge question, even if a
      // legacy agent-tool association was not created for this tenant.
      if(toolKey&&(toolKey==='knowledge_base.search'||await this.enabled(t,agent.id,toolKey))) {
        if(!this.tools.supports(toolKey)) { await this.recordUnavailableTool(t,run.id,toolKey,intent.input!); return this.complete(t,id,c,run,agent,UNAVAILABLE_TOOL,toolKey,undefined,true); }
        toolResult=await this.call(t,run.id,toolKey,intent.input!);
        if(toolKey==='knowledge_base.search') {
          knowledgeResultsCount=Array.isArray((toolResult as any).results)?(toolResult as any).results.length:0;
          if(knowledgeResultsCount===0)return this.complete(t,id,c,run,agent,'Não encontrei conteúdo publicado na Base de Conhecimento sobre esse tema.',toolKey,undefined,false,knowledgeResultsCount);
        }
        const matches=(toolResult as any).matches;
        if(toolKey==='treated_data.search_records') { if(matches?.length===1){toolResult={search:toolResult,detail:await this.call(t,run.id,'treated_data.get_record_detail',{entity:'operation_record',id:matches[0].id})}} else if(matches?.length===0)return this.complete(t,id,c,run,agent,'Não encontrei esse registro na base tratada.',toolKey); else if(matches?.length>1)return this.complete(t,id,c,run,agent,'Encontrei mais de um registro. Informe um identificador mais específico para eu detalhar.',toolKey); }
      }
      const history=(await this.db.select<any[]>('ai_chat_messages',`tenant_id=eq.${t}&conversation_id=eq.${id}&order=created_at.desc&limit=10`)).reverse();
      const result=await this.gateway.generalChat({agent,message,history,toolResult});
      stage='normalize_gateway_response';
      const normalized=this.cleanAssistantAnswer(result?.answer,4000);
      const fallbackUsed=!normalized || Boolean(result?.gateway_error);
      const answer=normalized||FALLBACK;
      stage='save_assistant_message';
      return this.complete(t,id,c,run,agent,answer,toolKey,result,fallbackUsed,knowledgeResultsCount);
    } catch(e) {
      await this.db.update('ai_runs',`tenant_id=eq.${t}&id=eq.${run.id}`,{status:'failed',error_message:'Falha ao responder no Chat Geral.',output_json:{stage,tool_key:null,safe_error:'Não foi possível concluir a resposta com segurança.'},finished_at:new Date().toISOString()});
      throw new BadRequestException('Não foi possível responder agora. Tente novamente.');
    }
  }
  private async complete(t:string,id:string,c:any,run:any,agent:any,answer:string,toolKey?:string,result?:any,fallbackUsed=false,knowledgeResultsCount?:number){
    const usage={input_tokens:Number(result?.input_tokens)||0,output_tokens:Number(result?.output_tokens)||0,total_tokens:Number(result?.total_tokens)||0};
    const output={answer,tool_key:toolKey,...(toolKey==='knowledge_base.search'?{knowledge_results_count:knowledgeResultsCount??0}:{}),...(fallbackUsed?{fallback_used:true,reason:'empty_or_invalid_gateway_answer'}:{})};
    await this.db.update('ai_runs',`tenant_id=eq.${t}&id=eq.${run.id}`,{status:'completed',output_json:output,model_provider:result?.model_provider??'system',model_name:result?.model_name??null,...usage,finished_at:new Date().toISOString()});
    if(result)await this.db.insert('ai_usage_logs',{tenant_id:t,agent_id:agent.id,ai_run_id:run.id,provider:result.model_provider,model_name:result.model_name,...usage});
    const saved=await this.save(t,id,'assistant',answer,run.id,toolKey?{tool_key:toolKey}:{});
    await this.db.update('ai_chat_conversations',`tenant_id=eq.${t}&id=eq.${id}`,{updated_at:new Date().toISOString(),title:c.title||answer.slice(0,80)});
    return {message:saved,ai_run_id:run.id,tool_key:toolKey,dry_run:result?.dry_run??true};
  }
  private async call(t:string,run:string,key:string,input:Record<string,unknown>){const started=Date.now(),output=await this.tools.execute(t,key,input),tools=await this.db.select<any[]>('ai_tools',`tool_key=eq.${key}&limit=1`);await this.db.insert('ai_tool_calls',{tenant_id:t,ai_run_id:run,tool_id:tools[0]?.id??null,tool_key:key,input_json:input,output_json:output,status:'completed',duration_ms:Date.now()-started,finished_at:new Date().toISOString()});return output}
  private async recordUnavailableTool(t:string,run:string,key:string,input:Record<string,unknown>){const tools=await this.db.select<any[]>('ai_tools',`tool_key=eq.${key}&limit=1`);await this.db.insert('ai_tool_calls',{tenant_id:t,ai_run_id:run,tool_id:tools[0]?.id??null,tool_key:key,input_json:input,output_json:{message:UNAVAILABLE_TOOL},status:'failed',error_message:'Ferramenta não implementada no Chat Geral.',finished_at:new Date().toISOString()})}
  async speech(_t:string,b:Record<string,unknown>){return this.gateway.speech(this.cleanAssistantAnswer(b.text,4000)||FALLBACK)}
  async realtime(t:string){const a=await this.agent(t);if(!a)throw new BadRequestException('Nenhum agente de chat geral ativo foi configurado.');return this.gateway.realtimeSession(a,'Responda em português do Brasil como assistente do sistema. Não execute ferramentas, não consulte dados operacionais e não altere dados. Para consultas operacionais, oriente o chat por texto.')}
  private async save(t:string,id:string,role:string,content:string,ai_run_id?:string,metadata:Record<string,unknown>={}){const[x]=await this.db.insert<any[]>('ai_chat_messages',{tenant_id:t,conversation_id:id,ai_run_id,role,content,metadata});return x}
  private async conversation(t:string,u:string,id:string){const x=await this.db.select<any[]>('ai_chat_conversations',`tenant_id=eq.${t}&id=eq.${id}&user_id=eq.${u}&deleted_at=is.null&limit=1`);if(!x[0])throw new NotFoundException('Conversa não encontrada.');return x[0]}
  private async agent(t:string){return(await this.db.select<any[]>('ai_agents',`tenant_id=eq.${t}&agent_type=eq.general_chat&status=eq.active&deleted_at=is.null&order=updated_at.desc&limit=1`))[0]}
  private async enabled(t:string,a:string,k:string){return!!(await this.db.select<any[]>('ai_agent_tools',`tenant_id=eq.${t}&agent_id=eq.${a}&is_enabled=eq.true&select=ai_tools!inner(tool_key)&ai_tools.tool_key=eq.${k}&limit=1`))[0]}
  private cleanUserMessage(v:unknown,max:number){const s=this.stripHtml(v,max);if(!s)throw new BadRequestException('Mensagem obrigatória.');if(/\b(select|insert|update|delete|drop|alter|create|truncate)\b[\s\S]{0,160}\b(from|into|table|where|set|database)\b/i.test(s))throw new BadRequestException('Conteúdo não permitido.');return s}
  private cleanAssistantAnswer(v:unknown,max:number){return this.stripHtml(v,max)}
  private stripHtml(v:unknown,max:number){return typeof v==='string'?v.replace(/<[^>]*>/g,'').trim().slice(0,max):''}
}
