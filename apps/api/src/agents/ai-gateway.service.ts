import { Injectable, Logger } from '@nestjs/common';
import { AgentPromptBuilderService } from './agent-prompt-builder.service';
import { getResponseStyle } from './response-style';
import { LlmInputGuardService } from './llm-input-guard.service';

type GatewayInput = { tenantId?: string; agent: Record<string, unknown>; runType?: string; triggerType?: string; inputSnapshot: Record<string, unknown>; messages?: Array<{ role: string; content: string }>; responseSchema?: Record<string, unknown>; context?: 'dashboard'|'report' };
type GeneralChatResult = { answer: string; model_provider: 'openai'|'system'; model_name: string; input_tokens: number; output_tokens: number; total_tokens: number; dry_run: boolean; gateway_error?: string };

const GENERAL_CHAT_FALLBACK = 'Não encontrei dados tratados suficientes para responder com segurança.';

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  constructor(private readonly prompts: AgentPromptBuilderService, private readonly guard:LlmInputGuardService) {}

  /** OpenAI selects controlled capabilities; it never receives database access. */
  async generalChatToolCall(input:{agent:Record<string,unknown>;message:string;history:Array<{role:string;content:string}>}){
    const prompt=this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:['analytics_map_get','analytics_result_get','analytics_context_analyze','operational_record_find','knowledge_guidance_search'],context:'chat'}), dry=process.env.AI_GATEWAY_ENABLED!=='true'||process.env.AI_GATEWAY_DRY_RUN==='true';
    if(dry)return {calls:[],response_id:null,tool_choice:'none'};
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:prompt.model.name,temperature:prompt.model.temperature,max_output_tokens:prompt.model.maxOutputTokens,input:[{role:'system',content:this.generalAgentInstructions(prompt.systemPrompt,input.agent)},{role:'user',content:JSON.stringify({message:input.message,history:input.history.slice(-8)})}],tools:this.generalTools(),tool_choice:'auto'})});
    if(!response.ok)throw new Error('Falha na escolha de ferramentas.'); const data:any=await response.json();
    return {calls:(data.output||[]).filter((x:any)=>x.type==='function_call').map((x:any)=>({id:x.call_id||x.id,name:x.name,arguments:this.json(x.arguments)})).slice(0,4),response_id:data.id||null,tool_choice:'auto'};
  }
  async generalChatToolFinal(input:{agent:Record<string,unknown>;message:string;history:Array<{role:string;content:string}>;toolResults:any[];previousResponseId:string|null}){
    const prompt=this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:['analytics_map_get','analytics_result_get','analytics_context_analyze','operational_record_find','knowledge_guidance_search'],context:'chat'}), dry=process.env.AI_GATEWAY_ENABLED!=='true'||process.env.AI_GATEWAY_DRY_RUN==='true';
    if(dry){const direct=input.message.trim()==='quanto é 1+1'?'1 + 1 = 2.':'Não consigo consultar a base operacional agora. Tente novamente em instantes.';return {answer:direct,model_provider:'system' as const,model_name:prompt.model.name,input_tokens:0,output_tokens:0,total_tokens:0,dry_run:true,llm_final_called:false};}
    const outputs=input.toolResults.map(x=>({type:'function_call_output',call_id:x.call_id,output:JSON.stringify(x.result)}));
    const body:any={model:prompt.model.name,temperature:prompt.model.temperature,max_output_tokens:prompt.model.maxOutputTokens,input:outputs.length?outputs:[{role:'user',content:JSON.stringify({message:input.message,history:input.history.slice(-8)})}],instructions:this.generalAgentInstructions(prompt.systemPrompt,input.agent)}; if(input.previousResponseId)body.previous_response_id=input.previousResponseId;
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('Falha na resposta final.');const data:any=await response.json(), usage=data.usage||{};return {answer:this.responseText(data)||GENERAL_CHAT_FALLBACK,model_provider:'openai' as const,model_name:prompt.model.name,input_tokens:usage.input_tokens||0,output_tokens:usage.output_tokens||0,total_tokens:usage.total_tokens||0,dry_run:false,llm_final_called:true};
  }
  async generalChatToolContinue(input:{agent:Record<string,unknown>;toolResults:any[];previousResponseId:string}){const prompt=this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:['analytics_map_get','analytics_result_get','analytics_context_analyze','operational_record_find','knowledge_guidance_search'],context:'chat'});const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:prompt.model.name,previous_response_id:input.previousResponseId,input:input.toolResults.map(x=>({type:'function_call_output',call_id:x.call_id,output:JSON.stringify(x.result)})),tools:this.generalTools(),tool_choice:'auto',instructions:this.generalAgentInstructions(prompt.systemPrompt,input.agent)})});if(!response.ok)throw new Error('Falha ao continuar ferramentas.');const data:any=await response.json();return {calls:(data.output||[]).filter((x:any)=>x.type==='function_call').map((x:any)=>({id:x.call_id||x.id,name:x.name,arguments:this.json(x.arguments)})),response_id:data.id||null,answer:this.responseText(data),done:!(data.output||[]).some((x:any)=>x.type==='function_call')};}
  private json(value:any){try{return typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('Argumentos de ferramenta inválidos.');}}
  private generalAgentInstructions(base='',agent:Record<string,unknown>={}){return `${base}\nVocê é o Analista Logístico do cliente. Responda diretamente quando não precisar de dados. Use apenas as ferramentas oferecidas para dados. Nunca calcule indicadores fora do mapa analítico, invente números, peça SQL/tabelas/campos técnicos ou exponha dados internos. Para resultado não configurado, consulte o mapa e depois o manual para orientar solicitação de configuração. Interprete fatos retornados pelas ferramentas com linguagem funcional e objetiva. Comporte-se conforme as instruções configuradas do agente: ${String(agent.system_instructions||agent.behavior_profile||'')}`;}
  private generalTools(){return [
    {type:'function',name:'analytics_map_get',description:'Mapa compacto de resultados analíticos configurados.',parameters:{type:'object',properties:{scope:{type:'string',enum:['summary','full']},search:{type:'string'}},additionalProperties:false}},
    {type:'function',name:'analytics_result_get',description:'Resultado pronto e configurado do mapa analítico.',parameters:{type:'object',properties:{result_key:{type:'string'},period:{type:'object'},filters:{type:'object'},include:{type:'array',items:{type:'string'}}},required:['result_key'],additionalProperties:false}},
    {type:'function',name:'analytics_context_analyze',description:'Pacote de fatos para analisar dashboard, relatório ou entidade.',parameters:{type:'object',properties:{context_type:{type:'string',enum:['dashboard','report','customer','driver','vehicle_plate','shipper','operation']},context_value:{type:'string'},period:{type:'object'},include:{type:'array',items:{type:'string'}}},required:['context_type'],additionalProperties:false}},
    {type:'function',name:'operational_record_find',description:'Registro operacional específico e vigente.',parameters:{type:'object',properties:{identifier_type:{type:'string',enum:['delivery_number','cte_number','invoice_number','manifest_number','vehicle_plate']},identifier_value:{type:'string'},filters:{type:'object'},period:{type:'object'},limit:{type:'integer',minimum:1,maximum:5}},additionalProperties:false}},
    {type:'function',name:'knowledge_guidance_search',description:'Manual funcional para itens não configurados.',parameters:{type:'object',properties:{topic:{type:'string'},user_question:{type:'string'},limit:{type:'integer',minimum:1,maximum:5}},required:['topic','user_question'],additionalProperties:false}}
  ];}

  /** Legacy entrypoint. It is permanently unavailable to General Chat. */
  async generalChat(input: { agent: Record<string, unknown>; message: string; history: Array<{role:string;content:string}>; toolResult?: unknown; plan?:unknown; toolResults?:unknown[]; capabilitySummary?:unknown }): Promise<GeneralChatResult> {
    if(String(input.agent.agent_type)==='general_chat') throw new Error('Fluxo legado de Chat Geral não permitido.');
    this.guard.inspect({message:input.message,history:input.history,tool_result:input.toolResult,tool_results:input.toolResults,plan:input.plan});
    const enabled = process.env.AI_GATEWAY_ENABLED === 'true';
    const dryRun = !enabled || process.env.AI_GATEWAY_DRY_RUN === 'true';
    const prompt = this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:input.toolResults?.map((x:any)=>String(x.tool_key)).filter(Boolean),evidencePack:input.toolResult,context:'chat',structuredOutput:true}); const model_name = prompt.model.name;
    if (dryRun) return this.generalResult(this.safeGeneralAnswer(this.simulatedChatAnswer(input.agent,input.toolResult),input.agent,input.message), 'system', model_name, true);

    if (!process.env.OPENAI_API_KEY) {
      this.logger.error('AI Gateway habilitado sem chave configurada.');
      return this.generalResult(this.fallback(input.agent), 'system', model_name, false, undefined, 'gateway_not_configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model_name, temperature: prompt.model.temperature, max_output_tokens: prompt.model.maxOutputTokens, input: [{ role: 'system', content: prompt.systemPrompt }, { role: 'user', content: JSON.stringify({ message: input.message, history: input.history.map(x => ({ role: x.role, content: x.content.slice(0, 1000) })), plan:input.plan, official_evidence_pack: input.toolResult, controlled_tool_results: input.toolResults ?? [input.toolResult], capability_summary:input.capabilitySummary }) }], text: { format: { type: 'json_object' } },
        }),
      });
      if (!response.ok) throw new Error(`OpenAI respondeu HTTP ${response.status}`);
      const data: any = await response.json();
      const raw = this.responseText(data);
      const answer = this.answerFromResponse(raw);
      const usage = data?.usage ?? {};
      return this.generalResult(this.safeGeneralAnswer(answer || this.fallback(input.agent),input.agent,input.message), 'openai', model_name, false, usage, answer ? undefined : 'empty_gateway_answer');
    } catch (error) {
      // Do not include provider payloads or credentials in persistence or client responses.
      this.logger.error(`Falha no gateway de chat geral: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      return this.generalResult(this.fallback(input.agent), 'system', model_name, false, undefined, 'gateway_call_failed');
    }
  }

  async generalChatPlan(input:{agent:Record<string,unknown>;message:string;history:any[];semanticMatches:any[];toolMemoryMatches:any[];fallbackPlan:any}):Promise<any>{
    const capabilities=[
      {tool_key:'logistics.metric.get',description:'Número consolidado da operação.',allowed_metrics:['frete_total','frete_medio','peso_total','volume_total','total_entregas','entregas_canceladas','entregas_atrasadas'],allowed_dimensions:[],allowed_filters:['vehicle_plate','driver_name','customer_name','shipper_name','status','origin_state','destination_state','destination_city','date_range'],examples:[{question:'qual o custo total de frete',args:{metric:'frete_total'}}],limits:{steps:1}},
      {tool_key:'logistics.distribution.get',description:'Agrupamento consolidado.',allowed_metrics:['frete_total','peso_total','volume_total','total_entregas'],allowed_dimensions:['status','customer_name','shipper_name','driver_name','vehicle_plate','origin_state','destination_state','destination_city'],allowed_filters:['vehicle_plate','driver_name','customer_name','shipper_name','status','origin_state','destination_state','destination_city','date_range'],examples:[{question:'entregas por status',args:{metric:'total_entregas',dimension:'status'}}],limits:{rows:20}},
      {tool_key:'logistics.records.search',description:'Amostra de registros canônicos.',allowed_filters:['delivery_number','manifest_number','invoice_number','cte_number','vehicle_plate','driver_name','customer_name','shipper_name','status','origin_state','destination_state','destination_city','date_range'],examples:[],limits:{sample_records:5}},
      {tool_key:'logistics.entity.analysis',description:'Resumo de motorista, cliente, veículo ou embarcador.',allowed_filters:['vehicle_plate','driver_name','customer_name','shipper_name','date_range'],examples:[{question:'analise motorista Maria Souza',args:{filters:{driver_name:'Maria Souza'}}}],limits:{sample_records:5}},
      {tool_key:'logistics.operation.analysis',description:'Resumo geral da operação.',allowed_filters:['date_range'],examples:[],limits:{sample_records:5}},
      {tool_key:'logistics.compound.query',description:'Combina saídas operacionais controladas.',allowed_filters:['vehicle_plate','driver_name','customer_name','shipper_name','status','origin_state','destination_state','destination_city','date_range'],allowed_outputs:['freight_total','status_distribution','sample_records'],examples:[{question:'placa ABC1D23 frete e status',args:{filters:{vehicle_plate:'ABC1D23'},requested_outputs:['freight_total','status_distribution','sample_records']}}],limits:{sample_records:5}},
      {tool_key:'knowledge_base.search',description:'Trechos publicados de manual e processo.',examples:[],limits:{knowledge_chunks:5}}, {tool_key:'dashboard.summary.get',description:'Resumo compacto de dashboard.',examples:[],limits:{facts:5}}, {tool_key:'report.summary.get',description:'Resumo compacto de relatório.',examples:[],limits:{facts:5}}
    ];
    const payload={question:input.message,history:input.history.slice(-8),capabilities,semantic_matches:input.semanticMatches.slice(0,12),tool_memory_matches:input.toolMemoryMatches.slice(0,5)}; this.guard.inspect(payload);
    if(process.env.AI_GATEWAY_ENABLED!=='true'||process.env.AI_GATEWAY_DRY_RUN==='true')return input.fallbackPlan;
    try {const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:(this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:[],context:'chat'})).model.name,input:[{role:'system',content:'Planeje apenas uma consulta controlada. Nunca gere SQL, não peça nem receba dados operacionais. Retorne somente JSON com exatamente {intent,confidence,needs_clarification,clarification_message,clarification_options,main_tool,steps:[{tool_key,purpose,args}],needs_final_llm_answer,reasoning_summary}. Campos fora desse schema serão rejeitados.'},{role:'user',content:JSON.stringify(payload)}],text:{format:{type:'json_object'}}})}); if(!response.ok) return input.fallbackPlan; return JSON.parse(this.responseText(await response.json())||'{}');}catch{return input.fallbackPlan;}
  }
  async generalChatFinalAnswer(input:{agent:Record<string,unknown>;message:string;history:Array<{role:string;content:string}>;narrativeContext:unknown}):Promise<GeneralChatResult & {llm_input_bytes:number}>{
    const guard=this.guard.inspect({message:input.message,history:input.history.slice(-8),narrative_context:input.narrativeContext}); const enabled=process.env.AI_GATEWAY_ENABLED==='true', prompt=this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:[],context:'chat'}), model=prompt.model.name;
    if(!enabled||process.env.AI_GATEWAY_DRY_RUN==='true')return {...this.generalResult(this.fallback(input.agent),'system',model,true),llm_input_bytes:guard.bytes};
    try { const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:prompt.model.temperature,max_output_tokens:prompt.model.maxOutputTokens,input:[{role:"system",content:prompt.systemPrompt+"\nAs consultas controladas já foram executadas pelo backend. Use somente o contexto consolidado recebido para responder. Não recalcule números. Não invente dados. Não cite termos internos."},{role:"user",content:JSON.stringify({message:input.message,history:input.history.slice(-8),narrative_context:input.narrativeContext})}]})}); if(!response.ok)throw new Error("OpenAI respondeu com erro");const data:any=await response.json();return {...this.generalResult(this.safeGeneralAnswer(this.responseText(data)||this.fallback(input.agent),input.agent,input.message),"openai",model,false,data.usage),llm_input_bytes:guard.bytes}; } catch {return {...this.generalResult(this.fallback(input.agent),"system",model,false),llm_input_bytes:guard.bytes};}
  }

  private controlledToolAnswer(toolResult:unknown):string|undefined {
    const r:any=toolResult;
    const format=(value:number,unit?:string)=>unit==='BRL'?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value):new Intl.NumberFormat('pt-BR').format(value)+(unit?` ${unit}`:'');
    if(Array.isArray(r?.rows)){
      const labels=r.group_by==='vehicle_plate'&&r.metric==='count'?'Placas com mais/menos entregas':(r.group_by==='destination_state'||r.group_by==='origin_state')&&r.field==='gross_weight'?'UFs com maior/menor peso':'Ranking';
      const rows=r.rows.map((row:any,index:number)=>`${index+1}. ${row.label}: ${format(Number(row.value)||0,r.unit)}`).join('; ');
      return `${labels}: ${rows||'dados insuficientes'}.`;
    }
    if(typeof r?.total==='number'){
      const label=r.metric==='sum'&&r.field==='freight_value'?'O frete total é':r.metric==='sum'&&r.field==='gross_weight'?'O peso total é':r.metric==='sum'&&r.field==='volume_count'?'O total de volumes é':r.metric==='count'&&r.field==='id'?'O total de entregas é':'O total na base tratada é';
      return `${label} ${format(r.total,r.unit)}.`+(Array.isArray(r.data_quality_notes)&&r.data_quality_notes.length?` Limitações: ${r.data_quality_notes.join(' ')}`:'');
    }
    if(Array.isArray(r?.available_fields))return 'Posso consultar a base tratada de operação. Há '+r.record_count+' registro(s), com campos como: '+r.available_fields.join(', ')+'. Exemplos: '+(r.examples_of_queries||[]).join(' ');
    return undefined;
  }
  private responseText(data: any): string {
    if (typeof data?.output_text === 'string') return data.output_text;
    if (!Array.isArray(data?.output)) return '';
    return data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).map((item: any) => typeof item?.text === 'string' ? item.text : typeof item?.text?.value === 'string' ? item.text.value : typeof item?.value === 'string' ? item.value : '').filter(Boolean).join('\n');
  }

  private answerFromResponse(raw: string): string {
    if (!raw.trim()) return '';
    try { const parsed = JSON.parse(raw); return typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''; } catch { return raw.trim(); }
  }

  private generalResult(answer: string, model_provider: 'openai'|'system', model_name: string, dry_run: boolean, usage?: any, gateway_error?: string): GeneralChatResult {
    return { answer: answer.trim() || GENERAL_CHAT_FALLBACK, model_provider, model_name, input_tokens: Number(usage?.input_tokens) || 0, output_tokens: Number(usage?.output_tokens) || 0, total_tokens: Number(usage?.total_tokens) || 0, dry_run, ...(gateway_error ? { gateway_error } : {}) };
  }

  private simulatedChatAnswer(agent:Record<string,unknown>,toolResult: unknown) { const result: any = toolResult; if(result?.simple_greeting)return this.greeting(agent); if(result?.ambiguity)return result.ambiguity; if(Array.isArray(result?.evidence)&&result.evidence.length){const best=result.evidence[0];return `Encontrei informações em ${best.source_name}.`; } return result?.results?.length ? result.results.map((x:any) => `${x.title}: ${x.chunk}`).join('\n\n') : this.fallback(agent); }
  private greeting(agent:Record<string,unknown>){return String(getResponseStyle(agent).greeting_response||'Olá! Como posso ajudar?').slice(0,300);}
  private fallback(agent:Record<string,unknown>){return String(agent.fallback_policy||GENERAL_CHAT_FALLBACK).slice(0,1000);}
  private safeGeneralAnswer(answer:string,agent:Record<string,unknown>,message:string){if(this.allowsTechnicalLanguage(agent,message))return answer;return answer.replace(/\b(tenant|evidence pack|pacote de evid[eê]ncias|tool|operation_records|staging|query|sql|source_id|batch_id|canonical_integration_id|canonical_source_key)\b/gi,'dados internos');}
  private allowsTechnicalLanguage(agent:Record<string,unknown>,message:string){const style=getResponseStyle(agent);return ['setup_dev','saas_admin'].includes(String(agent.agent_type))||style.technical_language===true||style.technical_language==='true'||/\b(auditoria t[eé]cnica|auditar tecnicamente)\b/i.test(message);}

  async realtimeSession(agent:Record<string,unknown>,instructions:string){if(!process.env.OPENAI_API_KEY)throw new Error('Voz ao vivo indisponível neste ambiente.');const model=process.env.OPENAI_REALTIME_MODEL||'gpt-realtime';const response=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({session:{type:'realtime',model,instructions}})});if(!response.ok)throw new Error('Não foi possível iniciar a voz ao vivo.');const data:any=await response.json();const secret=data?.value??data?.client_secret?.value??data?.client_secret;if(typeof secret!=='string')throw new Error('Sessão de voz inválida.');return {enabled:true,session:{client_secret:secret,expires_at:data?.expires_at??data?.client_secret?.expires_at??null,model}};}
  async runAgent(input: GatewayInput) {
    const enabled = process.env.AI_GATEWAY_ENABLED === 'true'; const dryRun = !enabled || process.env.AI_GATEWAY_DRY_RUN === 'true'; const prompt=this.prompts.build({agent:input.agent,tenantId:input.tenantId,runType:input.runType,allowedTools:[],evidencePack:input.inputSnapshot,context:input.context,structuredOutput:Boolean(input.responseSchema)}); const modelName = prompt.model.name;
    if (dryRun) return { output_json: input.responseSchema ? this.simulation(input) : { answer: this.manualTextAnswer(input), text_response: true }, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, model_provider: 'openai', model_name: modelName, dry_run: true };
    if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.');
    const body:any={ model: modelName, temperature: prompt.model.temperature, max_output_tokens: prompt.model.maxOutputTokens, input: [{ role: 'system', content: prompt.systemPrompt }, { role: 'user', content: JSON.stringify({ snapshot: input.inputSnapshot, messages: input.messages ?? [] }) }] };
    if(input.responseSchema)body.text={format:{type:'json_schema',name:'structured_response',strict:true,schema:input.responseSchema}};
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Falha na chamada do provedor de IA.'); const data = await response.json() as any; const text=this.responseText(data); let output_json: unknown;
    if(input.responseSchema){try { output_json = JSON.parse(text); } catch { throw new Error('O provedor retornou JSON inválido para uma resposta estruturada.'); }}else output_json={answer:text.trim()||this.fallback(input.agent),text_response:true};
    const usage = data.usage ?? {}; return { output_json, usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0 }, model_provider: 'openai', model_name: modelName, dry_run: false };
  }
  private manualTextAnswer(input:GatewayInput){const prompt=String(input.inputSnapshot.test_prompt||input.messages?.[0]?.content||'');return this.isSimpleGreeting(prompt)?this.greeting(input.agent):this.fallback(input.agent);}
  private isSimpleGreeting(message:string){return /^(ol[aá]|oi|bom dia|boa tarde|boa noite|obrigad[oa]|tudo bem\??)[!?.\s]*$/i.test(message.trim());}
  async transcribe(audioBase64:string,mimeType:string,language:string){if(!audioBase64||audioBase64.length>8_000_000)throw new Error('Áudio inválido ou muito grande.');if(process.env.AI_GATEWAY_ENABLED!=='true'||process.env.AI_GATEWAY_DRY_RUN==='true')throw new Error('Transcrição por voz indisponível neste ambiente.');if(!process.env.OPENAI_API_KEY)throw new Error('Voz indisponível neste ambiente.');const bytes=Buffer.from(audioBase64,'base64');const form=new FormData();form.append('file',new Blob([bytes],{type:mimeType}),mimeType.includes('mp4')?'message.mp4':'message.webm');form.append('model',process.env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe');form.append('language',language.slice(0,10));const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form});if(!response.ok)throw new Error('Falha ao transcrever áudio.');const data:any=await response.json();if(typeof data?.text!=='string'||!data.text.trim())throw new Error('Não foi possível identificar a fala.');return data.text.trim().slice(0,2000);}
  async speech(text: string) { if (process.env.AI_VOICE_ENABLED !== 'true' || process.env.AI_GATEWAY_ENABLED !== 'true' || process.env.AI_GATEWAY_DRY_RUN === 'true') return { dry_run: true, message: 'Resposta por voz simulada. TTS não foi chamado.' }; if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.'); const modelName = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'; const response = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelName, voice: process.env.OPENAI_TTS_VOICE || 'alloy', input: text, response_format: 'mp3' }) }); if (!response.ok) throw new Error('Falha ao gerar a resposta por voz.'); return { audio_base64: Buffer.from(await response.arrayBuffer()).toString('base64'), audio_mime_type: 'audio/mpeg', dry_run: false, model_name: modelName }; }
  private simulation(input: GatewayInput) { const sections = (input.inputSnapshot.sections as any[] | undefined) ?? []; if(input.context==='report'){if(input.messages?.length)return {answer:'Esta resposta considera somente as seções e os dados tratados deste relatório.',related_sections:sections.slice(0,3).map(s=>s.id),limitations:['A resposta não recalcula indicadores e depende do relatório gerado.']};return {opening:'Narrativa simulada do relatório concluída.',executive_summary:'Os resultados abaixo refletem somente os dados tratados deste relatório.',sections:sections.map(s=>({section_id:s.id,section_title:s.title,analysis:'Seção incluída no snapshot tratado; avalie os resultados exibidos.',highlights:[],attention_points:[]})),closing:'O relatório permanece disponível para consulta.',next_steps:['Acompanhe os pontos destacados nas seções do relatório.'],data_quality_notes:sections.length?[]:['Dados insuficientes para uma narrativa detalhada.']};} const widgets = (input.inputSnapshot.widgets as any[] | undefined) ?? []; if (input.messages?.length) return { answer: 'Esta resposta considera somente os widgets e filtros atualmente apresentados neste dashboard.', related_widgets: widgets.slice(0, 3).map((w) => w.id), limitations: ['A análise não calcula novos indicadores e depende dos dados exibidos.'] }; return { opening: 'Análise simulada do dashboard concluída.', executive_summary: 'Os resultados abaixo refletem somente os widgets e filtros atuais.', highlights: widgets.length ? [`${widgets.length} widget(s) foram considerados na análise.`] : ['Não há widgets suficientes para análise.'], attention_points: [], risks: [], recommendations: ['Acompanhe os pontos destacados nos widgets do dashboard.'], widget_insights: widgets.map((w) => ({ widget_id: w.id, widget_title: w.title, analysis: 'Widget incluído no snapshot tratado; avalie o resultado exibido.' })), data_quality_notes: widgets.length ? [] : ['Dados insuficientes para uma análise detalhada.'] }; }
}
