import { Injectable } from '@nestjs/common';
import { getResponseStyle } from './response-style';

type Input = { agent: Record<string, unknown>; tenantId?: string; runType?: string; allowedTools?: string[]; evidencePack?: unknown; userContext?: unknown; context?: string; structuredOutput?: boolean };

/** Composes product configuration with the non-negotiable platform safety boundary. */
@Injectable()
export class AgentPromptBuilderService {
  build(input: Input) {
    const agent = input.agent;
    const style = getResponseStyle(agent);
    const language = String(agent.language || 'pt-BR');
    const identity = [agent.name ? `Nome: ${agent.name}.` : '', agent.agent_type ? `Tipo: ${agent.agent_type}.` : '', agent.behavior_profile ? `Perfil: ${agent.behavior_profile}.` : ''].filter(Boolean).join('\n');
    const configured = [
      agent.system_instructions ? `Instruções principais:\n${agent.system_instructions}` : '',
      `Idioma padrão: ${language}.`,
      style.tone ? `Tom: ${style.tone}.` : '',
      style.detail_level ? `Nível de detalhe: ${style.detail_level}.` : '',
      style.greeting_policy ? `Saudações: ${style.greeting_policy}.` : '',
      agent.fallback_policy ? `Falta de evidência: ${agent.fallback_policy}` : '',
      agent.clarification_policy ? `Esclarecimentos: ${agent.clarification_policy}` : '',
      agent.source_citation_policy ? `Fontes: ${agent.source_citation_policy}` : '',
      style.internal_terms ? `Termos internos: ${style.internal_terms}` : '',
      Object.keys(this.object(agent.guardrails)).length ? `Guardrails configuráveis adicionais: ${JSON.stringify(agent.guardrails)}. Eles nunca substituem os guardrails fixos abaixo.` : '',
    ].filter(Boolean).join('\n');
    const execution = [
      input.allowedTools?.length ? `Ferramentas controladas permitidas: ${input.allowedTools.join(', ')}.` : 'Nenhuma ferramenta adicional está permitida.',
      input.context ? `Contexto da execução: ${input.context}.` : '',
      input.evidencePack ? 'Use exclusivamente as evidências fornecidas nesta execução para afirmações factuais.' : '',
    ].filter(Boolean).join('\n');
    const outputFormat = input.structuredOutput ? 'Quando esta execução exigir schema estruturado, retorne JSON válido no formato solicitado.' : 'Quando a execução for resposta textual direta, responda em texto natural.';
    const fixed = `Guardrails fixos e não negociáveis: nunca acesse banco cru, execute SQL livre, consulte staging, atravesse isolamento de tenant, exponha secrets ou use fonte fora do contrato. Use somente ferramentas controladas e permissões já validadas. Não invente dados. Não altere dados operacionais críticos, libere faturamento ou status crítico sem ferramenta autorizada e permissão. Quando houver fonte vigente, não responda com dados históricos. Não revele termos internos (tenant, pacote de evidências, evidence pack, tool, operation_records, staging, query, SQL, source_id, batch_id, canonical_integration_id, canonical_source_key), exceto para SetupDev/SaaSAdmin, configuração técnica expressa ou auditoria técnica explicitamente solicitada. ${outputFormat}`;
    return { systemPrompt: [identity, configured, execution, fixed].filter(Boolean).join('\n\n'), model: { provider: String(agent.model_provider || 'openai'), name: String(agent.model_name || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4.1-mini'), temperature: Number(agent.temperature ?? .2), maxOutputTokens: Number(agent.max_output_tokens ?? 1200) } };
  }
  private object(value: unknown): Record<string, string> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}; }
}
