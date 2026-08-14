import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiGatewayService } from './ai-gateway.service';
import { AttendanceAgentToolsService } from './attendance-agent-tools.service';
import { ATTENDANCE_SECURITY_GUARDRAILS } from './attendance-agent.prompts';

const safeUnavailable =
  'Atendimento automático indisponível no momento. Sua mensagem foi registrada.';
const definitions: Record<
  string,
  {
    description: string;
    properties: Record<string, unknown>;
    required?: string[];
  }
> = {
  'attendance.contacts.find_by_phone': {
    description: 'Localiza o contato pelo telefone.',
    properties: { phone: { type: 'string' } },
    required: ['phone'],
  },
  'attendance.inbox.get_context': {
    description: 'Obtém o contexto público da conversa.',
    properties: { conversation_id: { type: 'string' } },
    required: ['conversation_id'],
  },
  'attendance.operation.find_by_document': {
    description: 'Localiza uma operação tratada por documento.',
    properties: {
      document_number: { type: 'string' },
      document_type: {
        type: 'string',
        enum: ['nf', 'cte', 'manifesto', 'delivery', 'unknown'],
      },
    },
    required: ['document_number'],
  },
  'attendance.operation.verify_driver_document': {
    description: 'Confere motorista e operação.',
    properties: {
      operation_record_id: { type: 'string' },
      phone: { type: 'string' },
      driver_name: { type: 'string' },
    },
    required: ['operation_record_id', 'phone'],
  },
  'attendance.knowledge.search': {
    description: 'Pesquisa orientação publicada.',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  'attendance.occurrence.reasons.list': {
    description:
      'Lista motivos ativos do catálogo controlado; use para escolher reason_code.',
    properties: { search: { type: 'string' } },
  },
  'attendance.occurrence.create': {
    description:
      'Cria ocorrência local. operation_record_id deve ser o UUID interno retornado pela busca; para DOC/NF/CT-e/manifesto use operation_document_number ou operation_identifier. reason_id, se usado, deve ser UUID; para classificação textual prefira reason_code. Nunca invente UUID.',
    properties: {
      conversation_id: { type: 'string' },
      contact_id: { type: 'string' },
      operation_record_id: { type: 'string' },
      operation_document_number: { type: 'string' },
      operation_identifier: { type: 'string' },
      document_number: { type: 'string' },
      delivery_number: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      reason_id: { type: 'string' },
      reason_code: { type: 'string' },
      reason_name: { type: 'string' },
      source_channel: { type: 'string', enum: ['public_chat'] },
      priority: { type: 'string' },
      evidence_summary: { type: 'string' },
      requires_human_review: { type: 'boolean' },
      verification_result: { type: 'string' },
      verification_reason: { type: 'string' },
      explicit_new_problem: { type: 'boolean' },
    },
    required: ['conversation_id', 'contact_id', 'title', 'description'],
  },
  'attendance.occurrence.add_treatment': {
    description:
      'Adiciona tratativa sem fechar ocorrência. Aceita UUID, número funcional OC/OCO ou usa a ocorrência vinculada à conversa.',
    properties: {
      occurrence_id: { type: 'string' },
      occurrence_number: { type: 'string' },
      identifier: { type: 'string' },
      conversation_id: { type: 'string' },
      description: { type: 'string' },
      treatment_type: {
        type: 'string',
        enum: [
          'contact_driver',
          'contact_customer',
          'contact_shipper',
          'contact_recipient',
          'internal_analysis',
          'request_document',
          'request_authorization',
          'schedule_redelivery',
          'confirm_return',
          'financial_validation',
          'operational_action',
          'other',
        ],
      },
    },
    required: ['description'],
  },
  'attendance.occurrence.get_detail': {
    description:
      'Consulta contexto tratado por UUID, número funcional OC/OCO ou pela ocorrência vinculada à conversa. Nunca coloque número OC no campo UUID.',
    properties: {
      occurrence_id: { type: 'string' },
      occurrence_number: { type: 'string' },
      identifier: { type: 'string' },
      conversation_id: { type: 'string' },
    },
  },
  'attendance.legacy.check_capability': {
    description: 'Verifica capability declarada.',
    properties: {
      capability_key: { type: 'string', enum: ['occurrences.create'] },
    },
    required: ['capability_key'],
  },
  'attendance.legacy.create_if_configured': {
    description: 'Registra envio controlado; nunca inventa endpoint.',
    properties: { occurrence_id: { type: 'string' } },
    required: ['occurrence_id'],
  },
};
const functionName = (key: string) => key.replace(/\./g, '__');

@Injectable()
export class AttendanceAgentService {
  private readonly logger = new Logger(AttendanceAgentService.name);
  constructor(
    private readonly db: SupabaseService,
    private readonly gateway: AiGatewayService,
    private readonly tools: AttendanceAgentToolsService,
  ) {}
  async processPublicConversation(tenantId: string, conversationId: string) {
    const agents = await this.db.select<any[]>(
        'ai_agents',
        `select=id,created_by,agent_type,name,system_instructions,behavior_profile,guardrails,model_name,temperature,max_output_tokens,response_style,language,fallback_policy&tenant_id=eq.${tenantId}&agent_type=eq.attendance_inbox&status=eq.active&deleted_at=is.null&order=updated_at.desc&limit=1`,
      ),
      agent = agents[0];
    if (!agent) {
      this.logger.warn(`agent_not_configured tenant=${tenantId}`);
      return {
        answer:
          'Atendimento automático ainda não configurado. Sua mensagem foi registrada para a equipe operacional.',
        configured: false,
      };
    }
    const links = await this.db.select<any[]>(
        'ai_agent_tools',
        `select=tool_id&tenant_id=eq.${tenantId}&agent_id=eq.${agent.id}&is_enabled=eq.true`,
      ),
      ids = links.map((x) => x.tool_id);
    const catalog = ids.length
      ? await this.db.select<any[]>(
          'ai_tools',
          `select=id,tool_key&is_active=eq.true&id=in.(${ids.join(',')})`,
        )
      : [];
    let allowed = catalog
      .map((x) => x.tool_key)
      .filter((x: string) => definitions[x]);
    const occurrenceLink = (
      await this.db.select<any[]>(
        'conversation_occurrence_links',
        `select=occurrence_id&tenant_id=eq.${tenantId}&conversation_id=eq.${conversationId}&deleted_at=is.null&limit=1`,
      )
    )[0];
    const messages = await this.db.select<any[]>(
      'inbox_messages',
      `select=direction,body&tenant_id=eq.${tenantId}&conversation_id=eq.${conversationId}&direction=in.(inbound,outbound)&deleted_at=is.null&order=created_at.asc&limit=30`,
    );
    const [run] = await this.db.insert<any[]>('ai_runs', {
      tenant_id: tenantId,
      agent_id: agent.id,
      run_type: 'attendance_inbox',
      trigger_type: 'inbox_message',
      status: 'processing',
      input_snapshot: { conversation_id: conversationId },
      started_at: new Date().toISOString(),
    });
    try {
      let turn = await this.gateway.attendanceTurn({
        agent,
        instructions: `${ATTENDANCE_SECURITY_GUARDRAILS}${occurrenceLink ? `\nContexto: esta conversa já possui a ocorrência ${occurrenceLink.occurrence_id}. Sem novo documento, use add_treatment. Se a mensagem informar outro documento ou outra ocorrência explicitamente, compare a operação antes de decidir e só crie após validar a identidade.` : ''}`,
        messages: messages.map((x) => ({
          role: x.direction === 'inbound' ? 'user' : 'assistant',
          content: String(x.body ?? ''),
        })),
        tools: allowed.map((key) => ({
          type: 'function',
          name: functionName(key),
          description: definitions[key].description,
          parameters: {
            type: 'object',
            properties: definitions[key].properties,
            required: definitions[key].required ?? [],
            additionalProperties: false,
          },
          strict: false,
        })),
      });
      let rounds = 0;
      while (turn.calls.length && rounds++ < 5) {
        const outputs = [];
        for (const call of turn.calls) {
          const key = allowed.find((k) => functionName(k) === call.name);
          if (!key) continue;
          const started = Date.now();
          try {
            const result = await this.tools.execute(
              tenantId,
              key,
              { ...call.args, conversation_id: conversationId },
              agent.created_by,
            );
            await this.db.insert('ai_tool_calls', {
              tenant_id: tenantId,
              ai_run_id: run.id,
              tool_id: catalog.find((x) => x.tool_key === key)?.id,
              tool_key: key,
              status: 'completed',
              input_json: call.args,
              output_json: result,
              duration_ms: Date.now() - started,
            });
            outputs.push({
              type: 'function_call_output',
              call_id: call.id,
              output: JSON.stringify(result),
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'tool_failed';
            await this.db.insert('ai_tool_calls', {
              tenant_id: tenantId,
              ai_run_id: run.id,
              tool_id: catalog.find((x) => x.tool_key === key)?.id,
              tool_key: key,
              status: 'failed',
              input_json: call.args,
              error_message: message,
              duration_ms: Date.now() - started,
            });
            outputs.push({
              type: 'function_call_output',
              call_id: call.id,
              output: JSON.stringify({ error: 'controlled_tool_failed' }),
            });
          }
        }
        turn = await this.gateway.attendanceTurn({
          agent,
          instructions: ATTENDANCE_SECURITY_GUARDRAILS,
          messages: [],
          tools: allowed.map((key) => ({
            type: 'function',
            name: functionName(key),
            description: definitions[key].description,
            parameters: {
              type: 'object',
              properties: definitions[key].properties,
              required: definitions[key].required ?? [],
              additionalProperties: false,
            },
            strict: false,
          })),
          previousResponseId: turn.responseId,
          toolOutputs: outputs,
        });
      }
      if (!turn.answer.trim()) throw new Error('attendance_empty_answer');
      await this.db.update(
        'ai_runs',
        `tenant_id=eq.${tenantId}&id=eq.${run.id}`,
        {
          status: 'completed',
          output_json: { answer: turn.answer },
          model_provider: 'openai',
          model_name: turn.modelName,
          ...turn.usage,
          finished_at: new Date().toISOString(),
        },
      );
      await this.db.insert('ai_usage_logs', {
        tenant_id: tenantId,
        agent_id: agent.id,
        ai_run_id: run.id,
        provider: 'openai',
        model_name: turn.modelName,
        ...turn.usage,
      });
      return { answer: turn.answer.trim(), configured: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'attendance_failed';
      this.logger.error(`${code} tenant=${tenantId}`);
      await this.db.update(
        'ai_runs',
        `tenant_id=eq.${tenantId}&id=eq.${run.id}`,
        {
          status: 'failed',
          error_message: code,
          finished_at: new Date().toISOString(),
        },
      );
      return { answer: safeUnavailable, configured: true };
    }
  }
}
