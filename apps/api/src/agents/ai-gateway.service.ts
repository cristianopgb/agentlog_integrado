import { Injectable } from '@nestjs/common';

type GatewayInput = { tenantId?: string; agent: Record<string, unknown>; runType?: string; triggerType?: string; inputSnapshot: Record<string, unknown>; messages?: Array<{ role: string; content: string }>; responseSchema?: Record<string, unknown> };

@Injectable()
export class AiGatewayService {
  async runAgent(input: GatewayInput) {
    const enabled = process.env.AI_GATEWAY_ENABLED === 'true';
    const dryRun = !enabled || process.env.AI_GATEWAY_DRY_RUN === 'true';
    const modelName = String(input.agent.model_name || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4.1-mini');
    if (dryRun) return { output_json: this.simulation(input), usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, model_provider: 'openai', model_name: modelName, dry_run: true };
    if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName, temperature: Number(input.agent.temperature ?? 0.2), max_output_tokens: Number(input.agent.max_output_tokens ?? 1200),
        input: [{ role: 'system', content: this.instructions(input.agent) }, { role: 'user', content: JSON.stringify({ snapshot: input.inputSnapshot, messages: input.messages ?? [] }) }],
        text: { format: input.responseSchema ? { type: 'json_schema', name: 'dashboard_response', strict: true, schema: input.responseSchema } : { type: 'json_object' } },
      }),
    });
    if (!response.ok) throw new Error('Falha na chamada do provedor de IA.');
    const data = await response.json() as any;
    const raw = data.output_text || data.output?.flatMap((item: any) => item.content ?? []).map((item: any) => item.text).filter(Boolean).join('');
    let output_json: unknown; try { output_json = JSON.parse(raw); } catch { throw new Error('O provedor retornou JSON inválido.'); }
    const usage = data.usage ?? {};
    return { output_json, usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0 }, model_provider: 'openai', model_name: modelName, dry_run: false };
  }

  async speech(text: string) {
    if (process.env.AI_VOICE_ENABLED !== 'true' || process.env.AI_GATEWAY_ENABLED !== 'true' || process.env.AI_GATEWAY_DRY_RUN === 'true') return { dry_run: true, message: 'Resposta por voz simulada. TTS não foi chamado.' };
    if (!process.env.OPENAI_API_KEY) throw new Error('AI Gateway habilitado sem chave configurada.');
    const modelName = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const response = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelName, voice: process.env.OPENAI_TTS_VOICE || 'alloy', input: text, response_format: 'mp3' }) });
    if (!response.ok) throw new Error('Falha ao gerar a resposta por voz.');
    return { audio_base64: Buffer.from(await response.arrayBuffer()).toString('base64'), audio_mime_type: 'audio/mpeg', dry_run: false, model_name: modelName };
  }

  private instructions(agent: Record<string, unknown>) { return `Responda em português do Brasil, com linguagem executiva, clara e objetiva. Use somente os dados fornecidos no snapshot do dashboard e use deterministic_summary como base principal. Não calcule indicadores oficiais, não invente valores, não acesse banco de dados, não use SQL, não consulte fontes externas, não altere dados operacionais e não prometa ações automáticas. Se os dados forem insuficientes, diga isso; se a pergunta estiver fora do contexto do dashboard, diga que está fora do contexto deste dashboard. Não mencione chave de API, banco, tabelas internas ou detalhes técnicos. Devolva somente JSON válido no schema solicitado. Instruções de tom permitidas: ${String(agent.system_instructions ?? '')}`; }
  private simulation(input: GatewayInput) { const widgets = (input.inputSnapshot.widgets as any[] | undefined) ?? []; if (input.messages?.length) return { answer: 'Esta resposta considera somente os widgets e filtros atualmente apresentados neste dashboard.', related_widgets: widgets.slice(0, 3).map((w) => w.id), limitations: ['A análise não calcula novos indicadores e depende dos dados exibidos.'] }; return { opening: 'Análise simulada do dashboard concluída.', executive_summary: 'Os resultados abaixo refletem somente os widgets e filtros atuais.', highlights: widgets.length ? [`${widgets.length} widget(s) foram considerados na análise.`] : ['Não há widgets suficientes para análise.'], attention_points: [], risks: [], recommendations: ['Acompanhe os pontos destacados nos widgets do dashboard.'], widget_insights: widgets.map((w) => ({ widget_id: w.id, widget_title: w.title, analysis: 'Widget incluído no snapshot tratado; avalie o resultado exibido.' })), data_quality_notes: widgets.length ? [] : ['Dados insuficientes para uma análise detalhada.'] }; }
}
