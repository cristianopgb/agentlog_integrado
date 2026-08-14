import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OccurrencesService } from '../occurrences/occurrences.service';
import { RbacService } from '../rbac/rbac.service';

type Args = Record<string, unknown>;
const text = (v: unknown, n: string, max = 4000) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new BadRequestException(`${n} inválido.`);
  return v.trim();
};
const phone = (v: unknown) => text(v, 'phone', 30).replace(/\D/g, '');
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AttendanceAgentToolsService {
  constructor(
    private readonly db: SupabaseService,
    private readonly occurrences: OccurrencesService,
    private readonly rbac: RbacService,
  ) {}
  async execute(tenantId: string, key: string, args: Args, actorId: string) {
    const permission: Record<string, string[]> = {
      'attendance.occurrence.create': [
        'occurrences.ai.create_draft',
        'occurrences.ai.create_confirmed',
      ],
      'attendance.occurrence.add_treatment': [
        'occurrence_treatments.create',
        'occurrences.ai.add_treatment',
      ],
      'attendance.occurrence.get_detail': ['occurrences.view'],
      'attendance.legacy.create_if_configured': ['occurrences.legacy.push'],
    };
    if (permission[key])
      await this.rbac.ensurePermission(actorId, tenantId, permission[key]);
    const handlers: Record<string, () => Promise<unknown>> = {
      'attendance.contacts.find_by_phone': () =>
        this.findContact(tenantId, args),
      'attendance.inbox.get_context': () => this.context(tenantId, args),
      'attendance.operation.find_by_document': () =>
        this.findOperation(tenantId, args),
      'attendance.operation.verify_driver_document': () =>
        this.verifyDriver(tenantId, args),
      'attendance.knowledge.search': () => this.knowledge(tenantId, args),
      'attendance.occurrence.reasons.list': () =>
        this.listReasons(tenantId, args),
      'attendance.occurrence.create': () =>
        this.createOccurrence(tenantId, args, actorId),
      'attendance.occurrence.add_treatment': () =>
        this.addTreatment(tenantId, args, actorId),
      'attendance.occurrence.get_detail': () =>
        this.occurrenceDetail(tenantId, args),
      'attendance.legacy.check_capability': () =>
        this.capability(tenantId, args),
      'attendance.legacy.create_if_configured': () =>
        this.legacyCreate(tenantId, args),
    };
    if (!handlers[key])
      throw new BadRequestException('Ferramenta de atendimento não permitida.');
    return handlers[key]();
  }
  private async findContact(t: string, a: Args) {
    const p = phone(a.phone),
      rows = await this.db.select<any[]>(
        'contacts',
        `select=id,name,phone,contact_type,driver_id,customer_id&tenant_id=eq.${t}&phone=eq.${p}&deleted_at=is.null&limit=1`,
      );
    if (rows[0] && typeof a.conversation_id === 'string') {
      const id = text(a.conversation_id, 'conversation_id', 80),
        conversations = await this.db.select<any[]>(
          'inbox_conversations',
          `select=id&tenant_id=eq.${t}&id=eq.${id}&channel=eq.public_chat&deleted_at=is.null&limit=1`,
        );
      if (conversations[0]) {
        await this.db.update(
          'inbox_conversations',
          `tenant_id=eq.${t}&id=eq.${id}`,
          { contact_id: rows[0].id, public_phone_normalized: p },
        );
        await this.db.update(
          'public_chat_sessions',
          `tenant_id=eq.${t}&conversation_id=eq.${id}`,
          {
            contact_id: rows[0].id,
            contact_phone: p,
            contact_name: rows[0].name,
          },
        );
      }
    }
    return rows[0]
      ? {
          found: true,
          contact_id: rows[0].id,
          name: rows[0].name,
          phone: rows[0].phone,
          contact_type: rows[0].contact_type,
          driver_id: rows[0].driver_id,
          customer_id: rows[0].customer_id,
        }
      : { found: false };
  }
  private async context(t: string, a: Args) {
    const id = text(a.conversation_id, 'conversation_id', 80),
      conversations = await this.db.select<any[]>(
        'inbox_conversations',
        `select=id,contact_id,channel,summary&tenant_id=eq.${t}&id=eq.${id}&deleted_at=is.null&limit=1`,
      );
    if (!conversations[0])
      throw new BadRequestException('Conversa não encontrada.');
    const c = conversations[0],
      [messages, contacts, links, attachments] = await Promise.all([
        this.db.select<any[]>(
          'inbox_messages',
          `select=id,direction,sender_type,body,created_at&tenant_id=eq.${t}&conversation_id=eq.${id}&direction=in.(inbound,outbound)&deleted_at=is.null&order=created_at.desc&limit=20`,
        ),
        this.db.select<any[]>(
          'contacts',
          `select=id,name,phone,contact_type&tenant_id=eq.${t}&id=eq.${c.contact_id}&deleted_at=is.null&limit=1`,
        ),
        this.db.select<any[]>(
          'conversation_occurrence_links',
          `select=occurrence_id,created_at&tenant_id=eq.${t}&conversation_id=eq.${id}&deleted_at=is.null&order=created_at.desc&limit=1`,
        ),
        this.db.select<any[]>(
          'inbox_message_attachments',
          `select=id,original_filename,mime_type,size_bytes,created_at&tenant_id=eq.${t}&conversation_id=eq.${id}&deleted_at=is.null&order=created_at.desc&limit=5`,
        ),
      ]);
    let occurrence = null;
    if (links[0]) {
      const [rows, treatments, pending] = await Promise.all([
        this.db.select<any[]>(
          'occurrence_analytics_view',
          `select=occurrence_number,current_status,current_priority,reason_name,reason_category,linked_delivery_number,pending_actions_count,has_pending_actions&tenant_id=eq.${t}&occurrence_id=eq.${links[0].occurrence_id}&limit=1`,
        ),
        this.db.select<any[]>(
          'occurrence_treatments',
          `select=treatment_type,description,status,created_at&tenant_id=eq.${t}&occurrence_id=eq.${links[0].occurrence_id}&deleted_at=is.null&order=created_at.desc&limit=1`,
        ),
        this.db.select<any[]>(
          'occurrence_pending_actions',
          `select=id&tenant_id=eq.${t}&occurrence_id=eq.${links[0].occurrence_id}&deleted_at=is.null&status=neq.done&limit=100`,
        ),
      ]);
      occurrence = rows[0]
        ? {
            occurrence_id: links[0].occurrence_id,
            ...rows[0],
            last_treatment: treatments[0] ?? null,
            pending_actions_count:
              rows[0].pending_actions_count ?? pending.length,
            has_pending_actions:
              rows[0].has_pending_actions ?? pending.length > 0,
          }
        : null;
    }
    return {
      conversation_id: id,
      channel: c.channel,
      summary: c.summary ?? null,
      contact: contacts[0] ?? null,
      messages: messages.reverse(),
      occurrence,
      attachments,
    };
  }

  private async resolveOccurrenceId(t: string, a: Args) {
    const supplied = [a.occurrence_id, a.occurrence_number, a.identifier].find(
      (value) => typeof value === 'string' && value.trim(),
    ) as string | undefined;
    if (supplied) {
      const identifier = text(supplied, 'occurrence_identifier', 80);
      if (uuid.test(identifier)) {
        const rows = await this.db.select<any[]>(
          'occurrences',
          `select=id,occurrence_number&tenant_id=eq.${t}&id=eq.${identifier}&deleted_at=is.null&limit=1`,
        );
        if (rows[0]) return rows[0];
      } else {
        const number = identifier.toUpperCase();
        const rows = await this.db.select<any[]>(
          'occurrences',
          `select=id,occurrence_number&tenant_id=eq.${t}&occurrence_number=eq.${encodeURIComponent(number)}&deleted_at=is.null&limit=1`,
        );
        if (rows[0]) return rows[0];
      }
      throw new BadRequestException('occurrence_not_found');
    }
    if (typeof a.conversation_id === 'string' && a.conversation_id.trim()) {
      const conversation = text(a.conversation_id, 'conversation_id', 80);
      const links = await this.db.select<any[]>(
        'conversation_occurrence_links',
        `select=occurrence_id&tenant_id=eq.${t}&conversation_id=eq.${conversation}&deleted_at=is.null&order=created_at.desc&limit=2`,
      );
      if (links[0]) {
        const rows = await this.db.select<any[]>(
          'occurrences',
          `select=id,occurrence_number&tenant_id=eq.${t}&id=eq.${links[0].occurrence_id}&deleted_at=is.null&limit=1`,
        );
        if (rows[0]) return rows[0];
      }
    }
    throw new BadRequestException('occurrence_not_found');
  }
  private async findOperation(t: string, a: Args) {
    const n = encodeURIComponent(
        text(a.document_number, 'document_number', 100),
      ),
      fields = [
        'document_number',
        'invoice_number',
        'cte_number',
        'manifest_number',
        'delivery_number',
      ],
      or = fields.map((f) => `${f}.eq.${n}`).join(','),
      rows = await this.db.select<any[]>(
        'operation_records',
        `select=id,document_number,invoice_number,cte_number,manifest_number,delivery_number,customer_name,driver_name,vehicle_plate,status,delivery_status,carrier_name,cargo_type,priority,volume_m3&tenant_id=eq.${t}&or=(${or})&deleted_at=is.null&limit=1`,
      ),
      r = rows[0];
    if (!r) return { found: false };
    const transports = await this.db.select<any[]>(
      'transport_records',
      `select=driver_phone,driver_whatsapp,vehicle_type&tenant_id=eq.${t}&operation_record_id=eq.${r.id}&deleted_at=is.null&limit=1`,
    );
    return {
      found: true,
      operation_record_id: r.id,
      ...r,
      driver_phone: transports[0]?.driver_phone ?? null,
      driver_whatsapp: transports[0]?.driver_whatsapp ?? null,
      vehicle_type: transports[0]?.vehicle_type ?? null,
    };
  }
  private async verifyDriver(t: string, a: Args) {
    const id = text(a.operation_record_id, 'operation_record_id', 80),
      p = phone(a.phone),
      rows = await this.db.select<any[]>(
        'operation_records',
        `select=id,driver_name&tenant_id=eq.${t}&id=eq.${id}&deleted_at=is.null&limit=1`,
      );
    if (!rows[0])
      return {
        matched: 'uncertain',
        reason: 'operation_not_found',
        safe_summary: 'Operação não localizada.',
      };
    const transports = await this.db.select<any[]>(
        'transport_records',
        `select=driver_phone,driver_whatsapp&tenant_id=eq.${t}&operation_record_id=eq.${id}&deleted_at=is.null&limit=1`,
      ),
      phones = [transports[0]?.driver_phone, transports[0]?.driver_whatsapp]
        .map((v) => String(v ?? '').replace(/\D/g, ''))
        .filter(Boolean);
    if (!phones.length)
      return {
        matched: 'uncertain',
        reason: 'driver_phone_missing',
        safe_summary:
          'A operação não possui telefone tratado para conferência.',
      };
    const matched = phones.includes(p);
    return {
      matched,
      reason: matched ? 'phone_matches' : 'phone_mismatch',
      safe_summary: matched
        ? 'Motorista conferido pela operação.'
        : 'Telefone não corresponde ao motorista da operação.',
    };
  }
  private async occurrenceDetail(t: string, a: Args) {
    const resolved = await this.resolveOccurrenceId(t, a);
    return this.sanitizeOccurrence(
      (await this.occurrences.detail(t, resolved.id)) as any,
    );
  }
  private sanitizeOccurrence(o: any) {
    const freeText = new Set([
      'event_title',
      'event_description',
      'notes',
      'description',
      'title',
      'product_name',
      'sku',
      'resolution_summary',
      'closed_reason',
    ]);
    const clean = (rows: any[], fields: string[]) =>
      rows.map((row) =>
        Object.fromEntries(
          fields
            .filter((field) => row?.[field] !== undefined)
            .map((field) => {
              const value = row[field];
              return [
                field,
                freeText.has(field) && typeof value === 'string'
                  ? value.slice(0, 500)
                  : value,
              ];
            }),
        ),
      );
    return {
      occurrence_number: o.occurrence_number,
      title: typeof o.title === 'string' ? o.title.slice(0, 300) : o.title,
      description:
        typeof o.description === 'string' ? o.description.slice(0, 1200) : null,
      status: o.current_status,
      priority: o.current_priority,
      sla_status: o.sla_status,
      opened_at: o.opened_at,
      due_at: o.due_at,
      resolved_at: o.resolved_at,
      closed_at: o.closed_at,
      resolution_summary:
        typeof o.resolution_summary === 'string'
          ? o.resolution_summary.slice(0, 500)
          : o.resolution_summary,
      closed_reason:
        typeof o.closed_reason === 'string'
          ? o.closed_reason.slice(0, 300)
          : o.closed_reason,
      operation_links: clean(o.operation_links ?? [], [
        'relationship_type',
        'is_primary',
      ]),
      events: clean(o.events ?? [], [
        'event_type',
        'event_status',
        'event_title',
        'event_description',
        'event_at',
        'old_status',
        'new_status',
      ]),
      items: clean(o.items ?? [], [
        'item_type',
        'sku',
        'product_name',
        'quantity',
        'unit',
        'amount',
        'currency',
        'notes',
      ]),
      financial_summary: {
        count: (o.financial_entries ?? []).length,
        total: (o.financial_entries ?? [])
          .filter((x: any) => !['rejected', 'canceled'].includes(x.status))
          .reduce((sum: number, x: any) => sum + (Number(x.amount) || 0), 0),
      },
      documents: clean(o.documents ?? [], [
        'document_type',
        'document_number',
        'amount',
        'issued_at',
      ]),
      attachments: clean(o.attachments ?? [], [
        'attachment_type',
        'mime_type',
        'size_bytes',
        'description',
      ]),
      treatments: clean(o.treatments ?? [], [
        'treatment_type',
        'description',
        'responsible_team',
        'status',
        'started_at',
        'completed_at',
      ]),
      pending_actions: clean(o.pending_actions ?? [], [
        'action_type',
        'title',
        'description',
        'responsible_team',
        'status',
        'due_at',
        'completed_at',
      ]),
    };
  }
  private async knowledge(t: string, a: Args) {
    const q = encodeURIComponent(text(a.query ?? a.message, 'query', 300)),
      docs = await this.db.select<any[]>(
        'knowledge_documents',
        `select=id,title&tenant_id=eq.${t}&status=eq.published&deleted_at=is.null&order=updated_at.desc&limit=50`,
      );
    if (!docs.length)
      return {
        found: false,
        guidance: null,
        checklist: [],
        source_title: null,
      };
    const ids = docs.map((x) => x.id).join(','),
      chunks = await this.db.select<any[]>(
        'knowledge_chunks',
        `select=document_id,content&tenant_id=eq.${t}&document_id=in.(${ids})&content=ilike.*${q}*&order=chunk_index.asc&limit=3`,
      ),
      doc = docs.find((x) => x.id === chunks[0]?.document_id);
    return {
      found: chunks.length > 0,
      guidance:
        chunks
          .map((x) => x.content)
          .join('\n')
          .slice(0, 3000) || null,
      checklist: [],
      source_title: doc?.title ?? null,
    };
  }
  private async listReasons(t: string, a: Args) {
    const search =
        typeof a.search === 'string' ? a.search.trim().slice(0, 100) : '',
      rows = await this.db.select<any[]>(
        'occurrence_reasons',
        `select=id,code,name,category_id,is_active&tenant_id=eq.${t}&is_active=eq.true${search ? `&or=(code.ilike.*${encodeURIComponent(search)}*,name.ilike.*${encodeURIComponent(search)}*)` : ''}&order=name.asc&limit=30`,
      );
    return {
      reasons: rows.map((r) => ({
        reason_id: r.id,
        reason_code: r.code,
        reason_name: r.name,
        reason_category: r.category_id,
        active: true,
      })),
    };
  }
  private async resolveReason(t: string, a: Args) {
    const supplied = typeof a.reason_id === 'string' ? a.reason_id.trim() : '';
    if (supplied && uuid.test(supplied)) {
      const rows = await this.db.select<any[]>(
        'occurrence_reasons',
        `select=id&tenant_id=eq.${t}&id=eq.${supplied}&is_active=eq.true&limit=1`,
      );
      return rows[0]?.id ?? null;
    }
    const code =
      typeof a.reason_code === 'string'
        ? a.reason_code.trim()
        : supplied && !uuid.test(supplied)
          ? supplied
          : '';
    if (code) {
      const rows = await this.db.select<any[]>(
        'occurrence_reasons',
        `select=id&tenant_id=eq.${t}&code=ilike.${encodeURIComponent(code)}&is_active=eq.true&limit=1`,
      );
      if (rows[0]) return rows[0].id;
    }
    const name =
      typeof a.reason_name === 'string' ? a.reason_name.trim() : supplied;
    if (!name) return null;
    const rows = await this.db.select<any[]>(
      'occurrence_reasons',
      `select=id&tenant_id=eq.${t}&name=ilike.${encodeURIComponent(name)}&is_active=eq.true&limit=2`,
    );
    if (rows.length > 1) return 'needs_clarification';
    return rows[0]?.id ?? null;
  }
  private async createOccurrence(t: string, a: Args, u: string) {
    const conversationId = text(a.conversation_id, 'conversation_id', 80),
      conversations = await this.db.select<any[]>(
        'inbox_conversations',
        `select=id,contact_id&tenant_id=eq.${t}&id=eq.${conversationId}&channel=eq.public_chat&deleted_at=is.null&limit=1`,
      );
    if (!conversations[0])
      throw new BadRequestException('Conversa pública não encontrada.');
    const linked = (
      await this.db.select<any[]>(
        'conversation_occurrence_links',
        `select=occurrence_id&tenant_id=eq.${t}&conversation_id=eq.${conversationId}&deleted_at=is.null&limit=1`,
      )
    )[0];
    if (linked && a.explicit_new_problem !== true) {
      const existing = (
        await this.db.select<any[]>(
          'occurrences',
          `select=id,occurrence_number&tenant_id=eq.${t}&id=eq.${linked.occurrence_id}&deleted_at=is.null&limit=1`,
        )
      )[0];
      return {
        created: false,
        duplicate_blocked: true,
        reason: 'existing_occurrence',
        existing_occurrence: existing
          ? {
              occurrence_id: existing.id,
              occurrence_number: existing.occurrence_number,
            }
          : { occurrence_id: linked.occurrence_id },
        recommended_tool: 'attendance.occurrence.add_treatment',
      };
    }
    if (a.operation_record_id === conversationId)
      throw new BadRequestException(
        'conversation_id não pode ser operation_record_id.',
      );
    if (a.verification_result === false || a.verification_result === 'denied')
      return { created: false, blocked: true, reason: 'driver_mismatch' };
    const reason = await this.resolveReason(t, a);
    if (reason === 'needs_clarification')
      return { created: false, needs_clarification: true };
    if (!reason)
      return {
        created: false,
        reason_not_found: true,
        needs_more_data: ['reason_code'],
      };
    const uncertain =
        a.verification_result === 'uncertain' &&
        a.verification_reason === 'driver_phone_missing',
      audit = uncertain
        ? 'Vínculo motorista/operação não confirmado automaticamente porque a operação não possui telefone tratado.'
        : 'Ocorrência criada pelo agente de atendimento.';
    const occurrence: any = await this.occurrences.create(t, u, {
      title: a.title,
      description: a.description,
      current_priority: a.priority ?? a.severity ?? 'medium',
      source_channel: 'public_chat',
      source_reference: conversationId,
      reason_id: reason,
      operation_record_ids: a.operation_record_id
        ? [a.operation_record_id]
        : [],
      primary_operation_record_id: a.operation_record_id,
      event_description: audit,
      metadata: {
        contact_id: a.contact_id ?? conversations[0].contact_id,
        requires_human_review: Boolean(a.requires_human_review) || uncertain,
        evidence_summary: a.evidence_summary,
        verification_note: uncertain ? audit : undefined,
      },
    });
    await this.db.insert('conversation_occurrence_links', {
      tenant_id: t,
      conversation_id: conversationId,
      occurrence_id: occurrence.id,
      relationship_type: 'created_from',
      created_by: u,
    });
    await this.db.update(
      'inbox_message_attachments',
      `tenant_id=eq.${t}&conversation_id=eq.${conversationId}&occurrence_id=is.null&deleted_at=is.null`,
      { occurrence_id: occurrence.id },
    );
    return {
      created: true,
      occurrence_id: occurrence.id,
      occurrence_number: occurrence.occurrence_number,
      status: occurrence.current_status,
      needs_more_data: [],
    };
  }
  private async addTreatment(t: string, a: Args, u: string) {
    const resolved = await this.resolveOccurrenceId(t, a);
    const row = await this.occurrences.createTreatment(t, resolved.id, u, {
      treatment_type: a.treatment_type ?? 'other',
      description: a.description,
      status: 'open',
    });
    const conversationId =
      typeof a.conversation_id === 'string' ? a.conversation_id : null;
    if (conversationId) {
      const conversation = (
        await this.db.select<any[]>(
          'inbox_conversations',
          `select=channel&tenant_id=eq.${t}&id=eq.${conversationId}&deleted_at=is.null&limit=1`,
        )
      )[0];
      await this.db.update(
        'occurrence_treatments',
        `tenant_id=eq.${t}&id=eq.${(row as any).id}`,
        {
          source_channel:
            conversation?.channel === 'public_chat' ? 'public_chat' : 'inbox',
          conversation_id: conversationId,
          original_message: a.description,
          classification: 'driver_update',
          requires_human_review: true,
        },
      );
    }
    return {
      created: true,
      treatment_id: (row as any).id,
      occurrence_number: resolved.occurrence_number,
      requires_human_review: true,
    };
  }
  private async capability(t: string, a: Args) {
    const key = text(
        a.capability_key ?? 'occurrences.create',
        'capability_key',
        100,
      ),
      rows = await this.db.select<any[]>(
        'integration_action_capabilities',
        `select=id,direction,is_active,requires_human_approval&tenant_id=eq.${t}&capability_key=eq.${key}&deleted_at=is.null&order=updated_at.desc&limit=1`,
      ),
      r = rows[0];
    if (!r || !r.is_active)
      return {
        status: 'not_configured',
        safe_message: 'Integração de escrita não configurada.',
      };
    if (r.direction === 'read')
      return {
        status: 'read_only',
        capability_id: r.id,
        safe_message: 'Integração disponível somente para leitura.',
      };
    if (r.requires_human_approval)
      return {
        status: 'requires_approval',
        capability_id: r.id,
        safe_message: 'Envio depende de aprovação humana.',
      };
    return {
      status: 'write_available',
      capability_id: r.id,
      safe_message: 'Capability de escrita ativa.',
    };
  }
  private async legacyCreate(t: string, a: Args) {
    const occurrenceId = text(a.occurrence_id, 'occurrence_id', 80),
      cap: any = await this.capability(t, {
        capability_key: 'occurrences.create',
      });
    const status =
      cap.status === 'not_configured' || cap.status === 'read_only'
        ? 'not_configured'
        : cap.status === 'requires_approval'
          ? 'pending_send'
          : 'pending_configuration';
    await this.db.insert('occurrence_legacy_sync_logs', {
      tenant_id: t,
      occurrence_id: occurrenceId,
      capability_id: cap.capability_id ?? null,
      status,
      action: 'occurrences.create',
      request_payload: { occurrence_id: occurrenceId },
      error_code:
        status === 'pending_configuration'
          ? 'safe_executor_not_configured'
          : null,
      error_message:
        status === 'pending_send' ? 'Aprovação humana necessária.' : null,
    });
    return {
      sent: false,
      status,
      safe_message:
        status === 'not_configured'
          ? 'Ocorrência mantida somente no AgentLog.'
          : status === 'pending_send'
            ? 'Envio aguardando aprovação humana.'
            : 'Executor seguro ainda não configurado.',
    };
  }
}
