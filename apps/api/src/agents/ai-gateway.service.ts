import { Injectable, Logger } from '@nestjs/common';
import { AgentPromptBuilderService } from './agent-prompt-builder.service';

type GatewayInput = { tenantId?: string; agent: Record<string, unknown>; runType?: string; triggerType?: string; inputSnapshot: Record<string, unknown>; messages?: Array<{ role: string; content: string }>; responseSchema?: Record<string, unknown>; context?: 'dashboard'|'report' };
type GeneralChatResult = { answer: string; model_provider: 'openai'|'system'; model_name: string; input_tokens: number; output_tokens: number; total_tokens: number; dry_run: boolean; gateway_error?: string };

const GENERAL_CHAT_FALLBACK = 'Olá! Sou o Agente Geral do Sistema Logístico Integrado. Posso ajudar com dúvidas sobre o sistema, processos internos publicados na Base de Conhecimento e consultas à base tratada da operação.';

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  constructor(private readonly prompts: AgentPromptBuilderService) {}

  async generalChat(input: { agent: Record<string, unknown>; message: string; history: Array<{role:string;content:string}>; toolResult?: unknown; plan?:unknown; toolResults?:unknown[]; capabilitySummary?:unknown }): Promise<GeneralChatResult> {
    const enabled = process.env.AI_GATEWAY_ENABLED === 'true';
    const dryRun = !enabled || process.env.AI_GATEWAY_DRY_RUN === 'true';
    const prompt = this.prompts.build({agent:input.agent,runType:'general_chat',allowedTools:input.toolResults?.map((x:any)=>String(x.tool_key)).filter(Boolean),evidencePack:input.toolResult,context:'chat',structuredOutput:true}); const model_name = prompt.model.name;
    if (dryRun) return this.generalResult(this.safeGeneralAnswer(this.simulatedChatAnswer(input.agent,input.toolResult),input.agent,input.message), 'system', model_name, true);

    if (!process.env.OPENAI_API_KEY) {
      this.logger.error('AI Gateway habilitado sem chave configurada.');
      return this.generalResult(GENERAL_CHAT_FALLBACK, 'system', model_name, false, undefined, 'gateway_not_configured');
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
      return this.generalResult(this.safeGeneralAnswer(answer || GENERAL_CHAT_FALLBACK,input.agent,input.message), 'openai', model_name, false, usage, answer ? undefined : 'empty_gateway_answer');
    } catch (error) {
      // Do not include provider payloads or credentials in persistence or client responses.
      this.logger.error(`Falha no gateway de chat geral: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      return this.generalResult(GENERAL_CHAT_FALLBACK, 'system', model_name, false, undefined, 'gateway_call_failed');
    }
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

  private simulatedChatAnswer(agent:Record<string,unknown>,toolResult: unknown) { const result: any = toolResult; if(result?.simple_greeting)return this.greeting(agent); if(result?.ambiguity)return result.ambiguity; if(Array.isArray(result?.evidence)&&result.evidence.length){const best=result.evidence[0];return `Encontrei informações em ${best.source_name}.`; } return result?.results?.length ? result.results.map((x:any) => `${x.title}: ${x.chunk}`).join('\n\n') : String(agent.fallback_policy||GENERAL_CHAT_FALLBACK); }
  private greeting(agent:Record<string,unknown>){const style=agent.response_style&&typeof agent.response_style==='object'?agent.response_style as Record<string,unknown>:{};return String(style.greeting_response||'Olá! Como posso ajudar?').slice(0,300);}
  private safeGeneralAnswer(answer:string,agent:Record<string,unknown>,message:string){if(this.allowsTechnicalLanguage(agent,message))return answer;return answer.replace(/\b(tenant|evidence pack|pacote de evid[eê]ncias|tool|operation_records|staging|query|sql|source_id|batch_id|canonical_integration_id|canonical_source_key)\b/gi,'dados internos');}
  private allowsTechnicalLanguage(agent:Record<string,unknown>,message:string){const style=agent.response_style&&typeof agent.response_style==='object'?agent.response_style as Record<string,unknown>:{};return ['setup_dev','saas_admin'].includes(String(agent.agent_type))||style.technical_language===true||style.technical_language==='true'||/\b(auditoria t[eé]cnica|auditar tecnicamente)\b/i.test(message);}

  async realtimeSession(agent:Record<string,unknown>,instructions:string){if(!process.env.OPENAI_API_KEY)throw new Error('Voz ao vivo indisponível neste ambiente.');const model=process.env.OPENAI_REALTIME_MODEL||'gpt-realtime';const response=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({session:{type:'realtime',model,instructions}})});if(!response.ok)throw new Error('Não foi possível iniciar a voz ao vivo.');const data:any=await response.json();const secret=data?.value??data?.client_secret?.value??data?.client_secret;if(typeof secret!=='string')throw new Error('Sessão de voz inválida.');return {enabled:true,session:{client_secret:secret,expires_at:data?.expires_at??data?.client_secret?.expires_at??null,model}};}
  async runAgent(input: GatewayInput) {
    const enabled = process.env.AI_GATEWAY_ENABLED === 'true'; const dryRun = !enabled || process.env.AI_GATEWAY_DRY_RUN === 'true'; const prompt=this.prompts.build({agent:input.agent,tenantId:input.tenantId,runType:input.runType,allowedTools:[],evidencePack:input.inputSnapshot,context:input.context,structuredOutput:Boolean(input.responseSchema)}); const modelName = prompt.model.name;
    if (dryRun) return { output_json: this.simulation(input), usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, model_provider: 'openai', model_name: modelName, dry_run: true };
    if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.');
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelName, temperature: prompt.model.temperature, max_output_tokens: prompt.model.maxOutputTokens, input: [{ role: 'system', content: prompt.systemPrompt }, { role: 'user', content: JSON.stringify({ snapshot: input.inputSnapshot, messages: input.messages ?? [] }) }], text: { format: input.responseSchema ? { type: 'json_schema', name: 'dashboard_response', strict: true, schema: input.responseSchema } : { type: 'json_object' } } }) });
    if (!response.ok) throw new Error('Falha na chamada do provedor de IA.'); const data = await response.json() as any; let output_json: unknown; try { output_json = JSON.parse(this.responseText(data)); } catch { throw new Error('O provedor retornou JSON inválido.'); } const usage = data.usage ?? {}; return { output_json, usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0 }, model_provider: 'openai', model_name: modelName, dry_run: false };
  }
  async transcribe(audioBase64:string,mimeType:string,language:string){if(!audioBase64||audioBase64.length>8_000_000)throw new Error('Áudio inválido ou muito grande.');if(process.env.AI_GATEWAY_ENABLED!=='true'||process.env.AI_GATEWAY_DRY_RUN==='true')throw new Error('Transcrição por voz indisponível neste ambiente.');if(!process.env.OPENAI_API_KEY)throw new Error('Voz indisponível neste ambiente.');const bytes=Buffer.from(audioBase64,'base64');const form=new FormData();form.append('file',new Blob([bytes],{type:mimeType}),mimeType.includes('mp4')?'message.mp4':'message.webm');form.append('model',process.env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe');form.append('language',language.slice(0,10));const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form});if(!response.ok)throw new Error('Falha ao transcrever áudio.');const data:any=await response.json();if(typeof data?.text!=='string'||!data.text.trim())throw new Error('Não foi possível identificar a fala.');return data.text.trim().slice(0,2000);}
  async speech(text: string) { if (process.env.AI_VOICE_ENABLED !== 'true' || process.env.AI_GATEWAY_ENABLED !== 'true' || process.env.AI_GATEWAY_DRY_RUN === 'true') return { dry_run: true, message: 'Resposta por voz simulada. TTS não foi chamado.' }; if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.'); const modelName = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'; const response = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelName, voice: process.env.OPENAI_TTS_VOICE || 'alloy', input: text, response_format: 'mp3' }) }); if (!response.ok) throw new Error('Falha ao gerar a resposta por voz.'); return { audio_base64: Buffer.from(await response.arrayBuffer()).toString('base64'), audio_mime_type: 'audio/mpeg', dry_run: false, model_name: modelName }; }
  private simulation(input: GatewayInput) { const sections = (input.inputSnapshot.sections as any[] | undefined) ?? []; if(input.context==='report'){if(input.messages?.length)return {answer:'Esta resposta considera somente as seções e os dados tratados deste relatório.',related_sections:sections.slice(0,3).map(s=>s.id),limitations:['A resposta não recalcula indicadores e depende do relatório gerado.']};return {opening:'Narrativa simulada do relatório concluída.',executive_summary:'Os resultados abaixo refletem somente os dados tratados deste relatório.',sections:sections.map(s=>({section_id:s.id,section_title:s.title,analysis:'Seção incluída no snapshot tratado; avalie os resultados exibidos.',highlights:[],attention_points:[]})),closing:'O relatório permanece disponível para consulta.',next_steps:['Acompanhe os pontos destacados nas seções do relatório.'],data_quality_notes:sections.length?[]:['Dados insuficientes para uma narrativa detalhada.']};} const widgets = (input.inputSnapshot.widgets as any[] | undefined) ?? []; if (input.messages?.length) return { answer: 'Esta resposta considera somente os widgets e filtros atualmente apresentados neste dashboard.', related_widgets: widgets.slice(0, 3).map((w) => w.id), limitations: ['A análise não calcula novos indicadores e depende dos dados exibidos.'] }; return { opening: 'Análise simulada do dashboard concluída.', executive_summary: 'Os resultados abaixo refletem somente os widgets e filtros atuais.', highlights: widgets.length ? [`${widgets.length} widget(s) foram considerados na análise.`] : ['Não há widgets suficientes para análise.'], attention_points: [], risks: [], recommendations: ['Acompanhe os pontos destacados nos widgets do dashboard.'], widget_insights: widgets.map((w) => ({ widget_id: w.id, widget_title: w.title, analysis: 'Widget incluído no snapshot tratado; avalie o resultado exibido.' })), data_quality_notes: widgets.length ? [] : ['Dados insuficientes para uma análise detalhada.'] }; }
}
