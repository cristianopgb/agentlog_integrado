import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const OCCURRENCE_STATUSES = [
  'draft',
  'open',
  'triage',
  'in_progress',
  'waiting_driver',
  'waiting_customer',
  'waiting_carrier',
  'waiting_approval',
  'waiting_document',
  'waiting_payment',
  'waiting_redelivery',
  'waiting_return',
  'partially_resolved',
  'resolved',
  'closed',
  'canceled',
  'reopened',
] as const;
const priorities = new Set(['low', 'medium', 'high', 'critical']);
const relationships = new Set([
  'primary',
  'affected',
  'source',
  'related',
  'return',
  'complementary',
]);
const stages = new Set(['opening', 'update', 'resolution', 'closing']);
const itemTypes = new Set([
  'missing',
  'extra',
  'damaged',
  'returned',
  'inverted',
  'divergent',
  'other',
]);
const entryTypes = new Set([
  'unloading',
  'daily',
  'layover',
  'helper',
  'scheduling_fee',
  'additional_fee',
  'refund',
  'return_cost',
  'other',
]);
const entryStatuses = new Set([
  'requested',
  'approved',
  'rejected',
  'paid',
  'canceled',
]);
const documentTypes = new Set([
  'original_invoice',
  'return_invoice',
  'cte',
  'mdfe',
  'proof_of_delivery',
  'unloading_receipt',
  'fiscal_document',
  'occurrence_report',
  'other',
]);
const attachmentTypes = new Set([
  'photo',
  'audio',
  'video',
  'pdf',
  'image',
  'document',
  'other',
]);
const treatmentTypes = new Set([
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
]);
const treatmentStatuses = new Set([
  'open',
  'in_progress',
  'waiting',
  'done',
  'canceled',
]);
const pendingStatuses = new Set(['open', 'in_progress', 'done', 'canceled']);
const slaStatuses = new Set([
  'not_started',
  'on_track',
  'at_risk',
  'overdue',
  'met',
  'breached',
  'not_applicable',
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalidOperationMessage =
  'Operação vinculada inválida. Selecione uma operação válida em vez de digitar número de NF.';
const guidedFields = [
  'document_number',
  'invoice_number',
  'return_invoice_number',
  'sku',
  'quantity',
  'amount',
  'unit',
  'evidence_required',
  'driver_notes',
  'customer_notes',
  'authorized_by',
  'payment_amount',
  'payment_receipt_required',
  'redelivery_date',
  'responsible_team',
  'attachment_required',
] as const;
const transitions: Record<string, Set<string>> = {
  draft: new Set(['open', 'canceled']),
  open: new Set(['triage', 'in_progress', 'canceled']),
  triage: new Set(['in_progress', 'canceled']),
  in_progress: new Set([
    'waiting_driver',
    'waiting_customer',
    'waiting_carrier',
    'waiting_approval',
    'waiting_document',
    'waiting_payment',
    'waiting_redelivery',
    'waiting_return',
    'partially_resolved',
    'resolved',
    'canceled',
  ]),
  waiting_driver: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_customer: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_carrier: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_approval: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_document: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_payment: new Set(['in_progress', 'resolved', 'canceled']),
  waiting_redelivery: new Set([
    'in_progress',
    'partially_resolved',
    'resolved',
    'canceled',
  ]),
  waiting_return: new Set([
    'in_progress',
    'partially_resolved',
    'resolved',
    'canceled',
  ]),
  partially_resolved: new Set(['in_progress', 'resolved', 'canceled']),
  resolved: new Set(['closed', 'reopened']),
  reopened: new Set(['triage', 'in_progress', 'resolved', 'canceled']),
  closed: new Set(['reopened']),
  canceled: new Set(['reopened']),
};
type Row = Record<string, unknown> & {
  id: string;
  current_status?: string;
  current_owner_id?: string | null;
};

@Injectable()
export class OccurrencesService {
  constructor(private readonly db: SupabaseService) {}
  listReasonCategories(tenantId: string) {
    return this.db.select<Row[]>(
      'occurrence_reason_categories',
      `select=*&tenant_id=eq.${tenantId}&is_active=eq.true&order=name.asc`,
    );
  }
  listReasons(tenantId: string) {
    return this.db.select<Row[]>(
      'occurrence_reasons',
      `select=*&tenant_id=eq.${tenantId}&is_active=eq.true&order=name.asc`,
    );
  }
  async reasonRequirements(tenantId: string, reasonId: string, stage: string) {
    const valid = this.stage(stage);
    await this.reason(tenantId, reasonId);
    return this.db.select<Row[]>(
      'occurrence_reason_requirements',
      `select=*&tenant_id=eq.${tenantId}&reason_id=eq.${reasonId}&stage=eq.${valid}&is_required=eq.true&order=field_key.asc`,
    );
  }
  async list(tenantId: string, q: Record<string, string> = {}) {
    const filters = [
      `select=*`,
      `tenant_id=eq.${tenantId}`,
      'deleted_at=is.null',
    ];
    if (q.status) {
      this.status(q.status);
      filters.push(`current_status=eq.${encodeURIComponent(q.status)}`);
    }
    if (q.priority) {
      this.priority(q.priority);
      filters.push(`current_priority=eq.${q.priority}`);
    }
    if (q.owner_id) filters.push(`current_owner_id=eq.${q.owner_id}`);
    if (q.search)
      filters.push(
        `or=(occurrence_number.ilike.*${encodeURIComponent(q.search)}*,title.ilike.*${encodeURIComponent(q.search)}*)`,
      );
    return this.db.select<Row[]>(
      'occurrences',
      `${filters.join('&')}&order=opened_at.desc&limit=${Math.min(Number(q.limit) || 50, 100)}`,
    );
  }
  async operationOptions(tenantId: string, search = '') {
    const term = search
      .trim()
      .slice(0, 100)
      .replace(/[(),.*]/g, ' ');
    if (!term) return [];
    const fields = [
      'document_number',
      'invoice_number',
      'manifest_number',
      'customer_name',
      'external_code',
      'order_number',
      'delivery_number',
    ] as const;
    const select = [
      'id',
      'document_number',
      'invoice_number',
      'manifest_number',
      'customer_name',
      'external_code',
      'record_type',
      'order_number',
      'delivery_number',
    ].join(',');
    const filter = fields
      .map((field) => `${field}.ilike.*${encodeURIComponent(term)}*`)
      .join(',');
    const rows = await this.db.select<Row[]>(
      'operation_records',
      `select=${select}&tenant_id=eq.${tenantId}&deleted_at=is.null&or=(${filter})&order=updated_at.desc&limit=20`,
    );
    return rows.map((row) => this.operationOption(row));
  }
  async create(
    tenantId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.only(body, [
      'title',
      'description',
      'current_priority',
      'source_channel',
      'due_at',
      'source_reference',
      'metadata',
      'operation_record_ids',
      'primary_operation_record_id',
      'reason_id',
      'event_description',
      'occurred_at',
      ...guidedFields,
    ]);
    const title = this.required(body.title, 'title');
    const priority = this.priority(body.current_priority ?? 'medium');
    const ids = this.stringArray(body.operation_record_ids).map((id) =>
      this.operationId(id),
    );
    if (body.primary_operation_record_id)
      ids.push(
        this.operationId(
          this.required(
            body.primary_operation_record_id,
            'primary_operation_record_id',
          ),
        ),
      );
    const unique = [...new Set(ids)];
    await Promise.all(unique.map((id) => this.operation(tenantId, id)));
    const reasonId = this.required(body.reason_id, 'reason_id');
    await this.validateRequirements(
      tenantId,
      reasonId,
      'opening',
      body,
      unique,
    );
    const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [created] = await this.db.insert<Row[]>(
      'occurrences',
      this.clean({
        tenant_id: tenantId,
        occurrence_number: `OCO-${suffix}`,
        title,
        description: this.optional(body.description),
        current_status: 'open',
        current_priority: priority,
        source_channel: this.optional(body.source_channel) ?? 'manual',
        due_at: this.optional(body.due_at),
        source_reference: this.optional(body.source_reference),
        metadata: this.object(body.metadata),
        created_by: userId,
        updated_by: userId,
      }),
    );
    await this.event(tenantId, created.id, userId, {
      event_type: 'created',
      event_title: 'Ocorrência criada',
      event_description: this.optional(body.event_description),
      event_at: this.optional(body.occurred_at),
      reason_id: reasonId,
      new_status: 'open',
      metadata: this.guidedMetadata(body),
    });
    for (const operationId of unique)
      await this.insertLink(
        tenantId,
        created.id,
        userId,
        operationId,
        operationId === body.primary_operation_record_id
          ? 'primary'
          : 'affected',
        operationId === body.primary_operation_record_id,
      );
    return this.detail(tenantId, created.id);
  }
  async detail(tenantId: string, id: string) {
    const occurrence = await this.find(tenantId, id);
    const [
      events,
      operation_links,
      items,
      financial_entries,
      documents,
      attachments,
      treatments,
      pending_actions,
    ] = await Promise.all([
      this.db.select<Row[]>(
        'occurrence_events',
        `select=*&tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&order=event_at.asc,created_at.asc`,
      ),
      this.db.select<Row[]>(
        'occurrence_operation_links',
        `select=*&tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&order=is_primary.desc,linked_at.asc`,
      ),
      this.records('occurrence_items', tenantId, id),
      this.records('occurrence_financial_entries', tenantId, id),
      this.records('occurrence_documents', tenantId, id),
      this.records('occurrence_attachments', tenantId, id),
      this.records('occurrence_treatments', tenantId, id),
      this.records('occurrence_pending_actions', tenantId, id),
    ]);
    return {
      ...occurrence,
      events,
      operation_links,
      items,
      financial_entries,
      documents,
      attachments,
      treatments,
      pending_actions,
    };
  }
  async listTreatments(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_treatments', t, o);
  }
  async createTreatment(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    this.only(b, [
      'treatment_type',
      'description',
      'responsible_user_id',
      'responsible_team',
      'status',
      'started_at',
      'event_id',
    ]);
    await this.find(t, o);
    const payload = this.clean({
      treatment_type: this.enumValue(
        b.treatment_type,
        treatmentTypes,
        'treatment_type',
      ),
      description: this.required(b.description, 'description'),
      responsible_user_id: this.uuid(
        b.responsible_user_id,
        'responsible_user_id',
      ),
      responsible_team: this.optionalString(
        b.responsible_team,
        'responsible_team',
      ),
      status:
        b.status === undefined
          ? undefined
          : this.enumValue(b.status, treatmentStatuses, 'status'),
      started_at: this.date(b.started_at, 'started_at'),
      event_id: this.uuid(b.event_id, 'event_id'),
    });
    await this.validateStructuredLinks('occurrence_treatments', t, o, payload);
    const [row] = await this.db.insert<Row[]>('occurrence_treatments', {
      tenant_id: t,
      occurrence_id: o,
      created_by: u,
      ...payload,
    });
    await this.event(t, o, u, {
      event_type: 'treatment_added',
      event_title: 'Tratativa adicionada',
      metadata: { treatment_id: row.id },
    });
    return row;
  }
  async updateTreatment(
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
  ) {
    this.only(b, [
      'treatment_type',
      'description',
      'responsible_user_id',
      'responsible_team',
      'status',
      'started_at',
      'event_id',
    ]);
    await this.find(t, o);
    const payload = this.clean({
      treatment_type:
        b.treatment_type === undefined
          ? undefined
          : this.enumValue(b.treatment_type, treatmentTypes, 'treatment_type'),
      description:
        b.description === undefined
          ? undefined
          : this.required(b.description, 'description'),
      responsible_user_id: this.uuid(
        b.responsible_user_id,
        'responsible_user_id',
      ),
      responsible_team:
        b.responsible_team === undefined
          ? undefined
          : this.optionalString(b.responsible_team, 'responsible_team'),
      status:
        b.status === undefined
          ? undefined
          : this.enumValue(b.status, treatmentStatuses, 'status'),
      started_at: this.date(b.started_at, 'started_at'),
      event_id: this.uuid(b.event_id, 'event_id'),
      ...(b.status === 'done'
        ? { completed_at: new Date().toISOString() }
        : {}),
    });
    await this.validateStructuredLinks('occurrence_treatments', t, o, payload);
    const rows = await this.db.update<Row[]>(
      'occurrence_treatments',
      `tenant_id=eq.${t}&occurrence_id=eq.${o}&id=eq.${id}&deleted_at=is.null`,
      { ...payload, updated_at: new Date().toISOString() },
    );
    if (!rows.length) throw new NotFoundException('Treatment not found.');
    const completed = b.status === 'done';
    await this.event(t, o, u, {
      event_type: completed ? 'treatment_completed' : 'treatment_updated',
      event_title: completed ? 'Tratativa concluída' : 'Tratativa atualizada',
      metadata: { treatment_id: id },
    });
    return rows[0];
  }
  deleteTreatment(t: string, o: string, u: string, id: string) {
    return this.removeRecord('occurrence_treatments', 'treatment', t, o, u, id);
  }
  async listPendingActions(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_pending_actions', t, o);
  }
  async createPendingAction(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    this.only(b, [
      'title',
      'description',
      'responsible_user_id',
      'responsible_team',
      'due_at',
      'status',
      'event_id',
    ]);
    await this.find(t, o);
    const payload = this.clean({
      title: this.required(b.title, 'title'),
      description: this.optional(b.description),
      responsible_user_id: this.uuid(
        b.responsible_user_id,
        'responsible_user_id',
      ),
      responsible_team: this.optionalString(
        b.responsible_team,
        'responsible_team',
      ),
      due_at: this.date(b.due_at, 'due_at'),
      status:
        b.status === undefined
          ? undefined
          : this.enumValue(b.status, pendingStatuses, 'status'),
      event_id: this.uuid(b.event_id, 'event_id'),
    });
    await this.validateStructuredLinks(
      'occurrence_pending_actions',
      t,
      o,
      payload,
    );
    const [row] = await this.db.insert<Row[]>('occurrence_pending_actions', {
      tenant_id: t,
      occurrence_id: o,
      created_by: u,
      ...payload,
    });
    await this.event(t, o, u, {
      event_type: 'pending_action_added',
      event_title: 'Pendência adicionada',
      metadata: { pending_action_id: row.id },
    });
    return row;
  }
  async updatePendingAction(
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
  ) {
    this.only(b, [
      'title',
      'description',
      'responsible_user_id',
      'responsible_team',
      'due_at',
      'status',
      'event_id',
    ]);
    await this.find(t, o);
    const payload = this.clean({
      title:
        b.title === undefined ? undefined : this.required(b.title, 'title'),
      description:
        b.description === undefined ? undefined : this.optional(b.description),
      responsible_user_id: this.uuid(
        b.responsible_user_id,
        'responsible_user_id',
      ),
      responsible_team:
        b.responsible_team === undefined
          ? undefined
          : this.optionalString(b.responsible_team, 'responsible_team'),
      due_at: this.date(b.due_at, 'due_at'),
      status:
        b.status === undefined
          ? undefined
          : this.enumValue(b.status, pendingStatuses, 'status'),
      event_id: this.uuid(b.event_id, 'event_id'),
      ...(b.status === 'done'
        ? { completed_at: new Date().toISOString() }
        : {}),
    });
    await this.validateStructuredLinks(
      'occurrence_pending_actions',
      t,
      o,
      payload,
    );
    const rows = await this.db.update<Row[]>(
      'occurrence_pending_actions',
      `tenant_id=eq.${t}&occurrence_id=eq.${o}&id=eq.${id}&deleted_at=is.null`,
      { ...payload, updated_at: new Date().toISOString() },
    );
    if (!rows.length) throw new NotFoundException('Pending action not found.');
    const completed = b.status === 'done';
    await this.event(t, o, u, {
      event_type: completed
        ? 'pending_action_completed'
        : 'pending_action_updated',
      event_title: completed ? 'Pendência concluída' : 'Pendência atualizada',
      metadata: { pending_action_id: id },
    });
    return rows[0];
  }
  deletePendingAction(t: string, o: string, u: string, id: string) {
    return this.removeRecord(
      'occurrence_pending_actions',
      'pending_action',
      t,
      o,
      u,
      id,
    );
  }
  async updateSla(t: string, o: string, u: string, b: Record<string, unknown>) {
    this.only(b, ['due_at', 'sla_status']);
    await this.find(t, o);
    const payload = {
      due_at: b.due_at === null ? null : this.date(b.due_at, 'due_at'),
      sla_status: this.enumValue(b.sla_status, slaStatuses, 'sla_status'),
      updated_by: u,
      updated_at: new Date().toISOString(),
    };
    const [row] = await this.db.update<Row[]>(
      'occurrences',
      `tenant_id=eq.${t}&id=eq.${o}&deleted_at=is.null`,
      payload,
    );
    await this.event(t, o, u, {
      event_type: 'sla_updated',
      event_title: 'SLA atualizado',
      metadata: { due_at: payload.due_at, sla_status: payload.sla_status },
    });
    return row;
  }
  async resolve(t: string, o: string, u: string, b: Record<string, unknown>) {
    this.only(b, ['resolution_summary']);
    const summary = this.required(b.resolution_summary, 'resolution_summary');
    const current = await this.find(t, o);
    const old = String(current.current_status);
    if (!transitions[old]?.has('resolved'))
      throw new BadRequestException(
        `Invalid status transition: ${old} -> resolved`,
      );
    const now = new Date();
    const sla = current.due_at
      ? now <= new Date(String(current.due_at))
        ? 'met'
        : 'breached'
      : current.sla_status;
    const [row] = await this.db.update<Row[]>(
      'occurrences',
      `tenant_id=eq.${t}&id=eq.${o}&deleted_at=is.null`,
      {
        current_status: 'resolved',
        resolved_at: now.toISOString(),
        resolution_summary: summary,
        sla_status: sla,
        updated_by: u,
        updated_at: now.toISOString(),
      },
    );
    await this.event(t, o, u, {
      event_type: 'occurrence_resolved',
      event_title: 'Ocorrência resolvida',
      old_status: old,
      new_status: 'resolved',
    });
    return row;
  }
  async close(t: string, o: string, u: string, b: Record<string, unknown>) {
    this.only(b, ['closed_reason', 'closed_notes', 'force_close_with_pending']);
    const reason = this.required(b.closed_reason, 'closed_reason');
    const current = await this.find(t, o);
    if (
      !['resolved', 'partially_resolved'].includes(
        String(current.current_status),
      )
    )
      throw new BadRequestException(
        'A ocorrência deve estar resolvida ou parcialmente resolvida antes do fechamento.',
      );
    const pending = await this.db.select<Row[]>(
      'occurrence_pending_actions',
      `select=id&tenant_id=eq.${t}&occurrence_id=eq.${o}&deleted_at=is.null&status=in.(open,in_progress)&limit=1`,
    );
    const force = b.force_close_with_pending === true;
    if (pending.length && !force)
      throw new BadRequestException(
        'Existem pendências abertas. Conclua-as ou confirme o fechamento forçado.',
      );
    const now = new Date().toISOString();
    const [row] = await this.db.update<Row[]>(
      'occurrences',
      `tenant_id=eq.${t}&id=eq.${o}&deleted_at=is.null`,
      {
        current_status: 'closed',
        closed_at: now,
        closed_by: u,
        closed_reason: reason,
        closed_notes: this.optional(b.closed_notes),
        updated_by: u,
        updated_at: now,
      },
    );
    await this.event(t, o, u, {
      event_type: 'occurrence_closed',
      event_title: 'Ocorrência encerrada',
      old_status: current.current_status,
      new_status: 'closed',
      metadata: {
        force_close_with_pending: force,
        pending_count: pending.length,
      },
    });
    return row;
  }
  async listItems(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_items', t, o);
  }
  async createItem(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    return this.createRecord(
      'occurrence_items',
      'item',
      itemTypes,
      t,
      o,
      u,
      b,
      [
        'item_type',
        'sku',
        'product_name',
        'quantity',
        'unit',
        'amount',
        'currency',
        'notes',
        'event_id',
        'operation_record_id',
      ],
      ['quantity', 'amount'],
    );
  }
  async updateItem(
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
  ) {
    return this.updateRecord(
      'occurrence_items',
      'item',
      itemTypes,
      t,
      o,
      u,
      id,
      b,
      [
        'item_type',
        'sku',
        'product_name',
        'quantity',
        'unit',
        'amount',
        'currency',
        'notes',
        'event_id',
        'operation_record_id',
      ],
      ['quantity', 'amount'],
    );
  }
  async deleteItem(t: string, o: string, u: string, id: string) {
    return this.removeRecord('occurrence_items', 'item', t, o, u, id);
  }
  async listFinancialEntries(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_financial_entries', t, o);
  }
  async createFinancialEntry(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    return this.createRecord(
      'occurrence_financial_entries',
      'financial_entry',
      entryTypes,
      t,
      o,
      u,
      b,
      [
        'entry_type',
        'status',
        'amount',
        'currency',
        'description',
        'requested_by',
        'authorized_by',
        'paid_at',
        'due_at',
        'receipt_document_id',
        'notes',
        'event_id',
      ],
      ['amount'],
      entryStatuses,
    );
  }
  async updateFinancialEntry(
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
  ) {
    return this.updateRecord(
      'occurrence_financial_entries',
      'financial_entry',
      entryTypes,
      t,
      o,
      u,
      id,
      b,
      [
        'entry_type',
        'status',
        'amount',
        'currency',
        'description',
        'requested_by',
        'authorized_by',
        'paid_at',
        'due_at',
        'receipt_document_id',
        'notes',
        'event_id',
      ],
      ['amount'],
      entryStatuses,
    );
  }
  async deleteFinancialEntry(t: string, o: string, u: string, id: string) {
    return this.removeRecord(
      'occurrence_financial_entries',
      'financial_entry',
      t,
      o,
      u,
      id,
    );
  }
  async listDocuments(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_documents', t, o);
  }
  async createDocument(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    return this.createRecord(
      'occurrence_documents',
      'document',
      documentTypes,
      t,
      o,
      u,
      b,
      [
        'document_type',
        'document_number',
        'document_key',
        'amount',
        'issued_at',
        'storage_path',
        'external_url',
        'notes',
        'event_id',
      ],
      ['amount'],
    );
  }
  async updateDocument(
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
  ) {
    return this.updateRecord(
      'occurrence_documents',
      'document',
      documentTypes,
      t,
      o,
      u,
      id,
      b,
      [
        'document_type',
        'document_number',
        'document_key',
        'amount',
        'issued_at',
        'storage_path',
        'external_url',
        'notes',
        'event_id',
      ],
      ['amount'],
    );
  }
  async deleteDocument(t: string, o: string, u: string, id: string) {
    return this.removeRecord('occurrence_documents', 'document', t, o, u, id);
  }
  async listAttachments(t: string, o: string) {
    await this.find(t, o);
    return this.records('occurrence_attachments', t, o);
  }
  async createAttachment(
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
  ) {
    return this.createRecord(
      'occurrence_attachments',
      'attachment',
      attachmentTypes,
      t,
      o,
      u,
      b,
      [
        'attachment_type',
        'file_name',
        'mime_type',
        'size_bytes',
        'storage_path',
        'external_url',
        'description',
        'event_id',
        'document_id',
      ],
      ['size_bytes'],
    );
  }
  async deleteAttachment(t: string, o: string, u: string, id: string) {
    return this.removeRecord(
      'occurrence_attachments',
      'attachment',
      t,
      o,
      u,
      id,
    );
  }

  private records(table: string, t: string, o: string) {
    return this.db.select<Row[]>(
      table,
      `select=*&tenant_id=eq.${t}&occurrence_id=eq.${o}&deleted_at=is.null&order=created_at.desc`,
    );
  }
  private enumValue(value: unknown, values: Set<string>, field: string) {
    const v = String(value);
    if (!values.has(v)) throw new BadRequestException(`Invalid ${field}.`);
    return v;
  }
  private numeric(value: unknown, field: string, required = false) {
    if ((value === undefined || value === null || value === '') && !required)
      return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
      throw new BadRequestException(`${field} must be a non-negative number.`);
    return n;
  }
  private recordPayload(
    kind: string,
    types: Set<string>,
    body: Record<string, unknown>,
    allowed: string[],
    numbers: string[],
    statuses?: Set<string>,
    creating = false,
  ) {
    this.only(body, allowed);
    const result: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (numbers.includes(key))
        result[key] = this.numeric(
          body[key],
          key,
          creating && kind === 'financial_entry' && key === 'amount',
        );
      else if (key === `${kind === 'financial_entry' ? 'entry' : kind}_type`)
        result[key] = this.enumValue(body[key], types, key);
      else if (key === 'status' && statuses)
        result[key] = this.enumValue(body[key], statuses, key);
      else if (key.endsWith('_id')) result[key] = this.uuid(body[key], key);
      else result[key] = this.optional(body[key]);
    }
    if (creating) {
      const typeKey =
        kind === 'financial_entry' ? 'entry_type' : `${kind}_type`;
      result[typeKey] = this.enumValue(body[typeKey], types, typeKey);
      if (kind === 'financial_entry') {
        result.amount = this.numeric(body.amount, 'amount', true);
        if (body.status !== undefined)
          result.status = this.enumValue(body.status, statuses!, 'status');
      }
    }
    return this.clean(result);
  }
  private async createRecord(
    table: string,
    kind: string,
    types: Set<string>,
    t: string,
    o: string,
    u: string,
    b: Record<string, unknown>,
    allowed: string[],
    numbers: string[],
    statuses?: Set<string>,
  ) {
    await this.find(t, o);
    const payload = this.recordPayload(
      kind,
      types,
      b,
      allowed,
      numbers,
      statuses,
      true,
    );
    await this.validateStructuredLinks(table, t, o, payload);
    const [row] = await this.db.insert<Row[]>(table, {
      tenant_id: t,
      occurrence_id: o,
      created_by: u,
      ...payload,
    });
    await this.event(t, o, u, {
      event_type: `${kind}_added`,
      event_title: `${kind} added`,
      metadata: { record_id: row.id },
    });
    return row;
  }
  private async updateRecord(
    table: string,
    kind: string,
    types: Set<string>,
    t: string,
    o: string,
    u: string,
    id: string,
    b: Record<string, unknown>,
    allowed: string[],
    numbers: string[],
    statuses?: Set<string>,
  ) {
    await this.find(t, o);
    const payload = this.recordPayload(
      kind,
      types,
      b,
      allowed,
      numbers,
      statuses,
    );
    await this.validateStructuredLinks(table, t, o, payload);
    const rows = await this.db.update<Row[]>(
      table,
      `tenant_id=eq.${t}&occurrence_id=eq.${o}&id=eq.${id}&deleted_at=is.null`,
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
    );
    if (!rows.length) throw new NotFoundException('Record not found.');
    await this.event(t, o, u, {
      event_type: `${kind}_updated`,
      event_title: `${kind} updated`,
      metadata: { record_id: id },
    });
    return rows[0];
  }
  private async removeRecord(
    table: string,
    kind: string,
    t: string,
    o: string,
    u: string,
    id: string,
  ) {
    await this.find(t, o);
    const rows = await this.db.update<Row[]>(
      table,
      `tenant_id=eq.${t}&occurrence_id=eq.${o}&id=eq.${id}&deleted_at=is.null`,
      { deleted_at: new Date().toISOString() },
    );
    if (!rows.length) throw new NotFoundException('Record not found.');
    await this.event(t, o, u, {
      event_type: `${kind}_removed`,
      event_title: `${kind} removed`,
      metadata: { record_id: id },
    });
    return { deleted: true };
  }
  private async validateStructuredLinks(
    table: string,
    tenantId: string,
    occurrenceId: string,
    payload: Record<string, unknown>,
  ) {
    if (payload.event_id) {
      const events = await this.db.select<Row[]>(
        'occurrence_events',
        `select=id&tenant_id=eq.${tenantId}&occurrence_id=eq.${occurrenceId}&id=eq.${payload.event_id}&limit=1`,
      );
      if (!events.length)
        throw new BadRequestException(
          'O evento informado não pertence a esta ocorrência e tenant.',
        );
    }
    if (table === 'occurrence_items' && payload.operation_record_id) {
      const operations = await this.db.select<Row[]>(
        'operation_records',
        `select=id&tenant_id=eq.${tenantId}&id=eq.${payload.operation_record_id}&deleted_at=is.null&limit=1`,
      );
      if (!operations.length)
        throw new BadRequestException(
          'A operação informada não pertence a este tenant ou não está disponível.',
        );
    }
    const documentId =
      table === 'occurrence_financial_entries'
        ? payload.receipt_document_id
        : table === 'occurrence_attachments'
          ? payload.document_id
          : undefined;
    if (documentId) {
      const documents = await this.db.select<Row[]>(
        'occurrence_documents',
        `select=id&tenant_id=eq.${tenantId}&occurrence_id=eq.${occurrenceId}&id=eq.${documentId}&deleted_at=is.null&limit=1`,
      );
      if (!documents.length)
        throw new BadRequestException(
          'O documento informado não pertence a esta ocorrência e tenant ou foi removido.',
        );
    }
  }
  async kanban(tenantId: string) {
    const rows = await this.list(tenantId, { limit: '100' });
    return OCCURRENCE_STATUSES.map((status) => ({
      status,
      items: rows.filter((r) => r.current_status === status),
    }));
  }
  async changeStatus(
    tenantId: string,
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.only(body, ['status']);
    const next = this.status(body.status);
    if (next === 'resolved')
      throw new BadRequestException(
        'Use o endpoint /resolve para resolver a ocorrência.',
      );
    if (next === 'closed')
      throw new BadRequestException(
        'Use o endpoint /close para fechar a ocorrência.',
      );
    const current = await this.find(tenantId, id);
    const old = String(current.current_status);
    if (old === next || !transitions[old]?.has(next))
      throw new BadRequestException(
        `Invalid status transition: ${old} -> ${next}`,
      );
    const dates: Record<string, unknown> = {};
    if (next === 'resolved') dates.resolved_at = new Date().toISOString();
    if (next === 'closed') dates.closed_at = new Date().toISOString();
    const [updated] = await this.db.update<Row[]>(
      'occurrences',
      `tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null`,
      {
        current_status: next,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        ...dates,
      },
    );
    await this.event(tenantId, id, userId, {
      event_type: 'status_changed',
      event_title: 'Status alterado',
      old_status: old,
      new_status: next,
    });
    return updated;
  }
  async assign(
    tenantId: string,
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.only(body, ['owner_id']);
    await this.find(tenantId, id);
    const owner =
      body.owner_id === null ? null : this.required(body.owner_id, 'owner_id');
    const [updated] = await this.db.update<Row[]>(
      'occurrences',
      `tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null`,
      {
        current_owner_id: owner,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
    );
    await this.event(tenantId, id, userId, {
      event_type: 'assigned',
      event_title: owner ? 'Responsável atribuído' : 'Responsável removido',
      metadata: { owner_id: owner },
    });
    return updated;
  }
  async addEvent(
    tenantId: string,
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.only(body, [
      'reason_id',
      'stage',
      'event_type',
      'event_title',
      'event_description',
      'event_at',
      'source_channel',
      'source_reference',
      'metadata',
      ...guidedFields,
    ]);
    await this.find(tenantId, id);
    const reasonId = this.required(body.reason_id, 'reason_id');
    const stage = this.stage(body.stage);
    await this.validateRequirements(tenantId, reasonId, stage, body, []);
    return this.event(tenantId, id, userId, {
      event_type: this.required(body.event_type, 'event_type'),
      reason_id: reasonId,
      event_title: this.optional(body.event_title),
      event_description: this.optional(body.event_description),
      event_at: this.optional(body.event_at),
      source_channel: this.optional(body.source_channel),
      source_reference: this.optional(body.source_reference),
      metadata: {
        ...this.object(body.metadata),
        stage,
        ...this.guidedMetadata(body),
      },
    });
  }
  async addOperationLink(
    tenantId: string,
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.only(body, ['operation_record_id', 'relationship_type', 'is_primary']);
    await this.find(tenantId, id);
    const op = this.operationId(
      this.required(body.operation_record_id, 'operation_record_id'),
    );
    const operation = await this.operation(tenantId, op);
    const relationship = String(body.relationship_type ?? 'affected');
    if (!relationships.has(relationship))
      throw new BadRequestException('Invalid relationship_type.');
    return this.insertLink(
      tenantId,
      id,
      userId,
      op,
      relationship,
      body.is_primary === true,
      operation,
    );
  }
  async removeOperationLink(tenantId: string, id: string, linkId: string) {
    await this.find(tenantId, id);
    const rows = await this.db.delete<Row[]>(
      'occurrence_operation_links',
      `tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&id=eq.${linkId}`,
    );
    if (!rows.length) throw new NotFoundException('Operation link not found.');
    return { deleted: true };
  }
  private async insertLink(
    tenantId: string,
    id: string,
    userId: string,
    operationId: string,
    relationship: string,
    isPrimary: boolean,
    operationRow?: Row,
  ) {
    if (isPrimary)
      await this.db.update(
        'occurrence_operation_links',
        `tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&is_primary=eq.true`,
        { is_primary: false },
      );
    const operation =
      operationRow ?? (await this.operation(tenantId, operationId));
    const reference = [
      'document_number',
      'invoice_number',
      'manifest_number',
      'external_code',
      'order_number',
      'delivery_number',
    ]
      .map((key) => operation[key])
      .find((value) => typeof value === 'string' && value.trim()) as
      string | undefined;
    const fallback = operationId.slice(0, 8);
    const customer =
      typeof operation.customer_name === 'string' &&
      operation.customer_name.trim()
        ? operation.customer_name.trim()
        : undefined;
    const safeReference = reference ?? fallback;
    const snapshot = {
      label: customer ? `${safeReference} · ${customer}` : safeReference,
      reference: safeReference,
      customer_name: customer ?? null,
      record_type:
        typeof operation.record_type === 'string'
          ? operation.record_type
          : null,
    };
    return this.db.insert<Row[]>('occurrence_operation_links', {
      tenant_id: tenantId,
      occurrence_id: id,
      operation_record_id: operationId,
      relationship_type: relationship,
      is_primary: isPrimary,
      linked_by: userId,
      snapshot,
    });
  }
  private event(
    tenantId: string,
    id: string,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return this.db.insert<Row[]>('occurrence_events', {
      tenant_id: tenantId,
      occurrence_id: id,
      created_by: userId,
      created_by_type: 'user',
      source_channel: 'manual',
      metadata: {},
      ...this.clean(payload),
    });
  }
  private async find(tenantId: string, id: string) {
    const rows = await this.db.select<Row[]>(
      'occurrences',
      `select=*&tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null&limit=1`,
    );
    if (!rows.length) throw new NotFoundException('Occurrence not found.');
    return rows[0];
  }
  private async operation(tenantId: string, id: string) {
    const rows = await this.db.select<Row[]>(
      'operation_records',
      `select=id,document_number,invoice_number,manifest_number,external_code,order_number,delivery_number,customer_name,record_type&tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null&limit=1`,
    );
    if (!rows.length)
      throw new BadRequestException('Operation does not belong to tenant.');
    return rows[0];
  }
  private operationOption(row: Row) {
    const first = (keys: string[]) =>
      keys
        .map((key) => row[key])
        .find((value) => typeof value === 'string' && value.trim()) as
        string | undefined;
    const reference = first([
      'invoice_number',
      'document_number',
      'manifest_number',
      'external_code',
      'order_number',
      'delivery_number',
    ]);
    const kind = first(['record_type']);
    const customer = first(['customer_name']);
    const label = reference
      ? `${reference}${customer ? ` · ${customer}` : ''}`
      : `Operação ${row.id.slice(0, 8)}${kind ? ` · ${kind}` : ''}`;
    const context = [
      row.invoice_number
        ? 'NF'
        : row.document_number
          ? 'Documento'
          : row.manifest_number
            ? 'Manifesto'
            : null,
      kind,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      id: row.id,
      label,
      ...(context ? { subtitle: context } : {}),
      document_number: first(['invoice_number', 'document_number']) ?? null,
      customer_name: customer ?? null,
      reference: reference ?? null,
    };
  }
  private async reason(tenantId: string, id: string) {
    const rows = await this.db.select<Row[]>(
      'occurrence_reasons',
      `select=id&tenant_id=eq.${tenantId}&id=eq.${id}&is_active=eq.true&limit=1`,
    );
    if (!rows.length)
      throw new BadRequestException(
        'Reason is inactive or does not belong to tenant.',
      );
  }
  private async validateRequirements(
    tenantId: string,
    reasonId: string,
    stage: string,
    body: Record<string, unknown>,
    operationIds: string[],
  ) {
    await this.reason(tenantId, reasonId);
    const requirements = await this.db.select<Row[]>(
      'occurrence_reason_requirements',
      `select=field_key&tenant_id=eq.${tenantId}&reason_id=eq.${reasonId}&stage=eq.${stage}&is_required=eq.true`,
    );
    const missing = requirements
      .map((r) => String(r.field_key))
      .filter((field) =>
        field === 'reason_id'
          ? false
          : field === 'operation_record_id'
            ? !operationIds.length
            : field === 'occurred_at'
              ? !body.occurred_at && !body.event_at
              : field === 'event_description'
                ? !this.present(body.event_description)
                : !this.present(body[field]),
      );
    if (missing.length)
      throw new BadRequestException(
        `Required fields for ${stage}: ${missing.join(', ')}.`,
      );
  }
  private present(v: unknown) {
    return v !== undefined && v !== null && v !== '' && v !== false;
  }
  private clean<T extends Record<string, unknown>>(payload: T) {
    return Object.fromEntries(
      Object.entries(payload).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );
  }
  private guidedMetadata(body: Record<string, unknown>) {
    return Object.fromEntries(
      guidedFields
        .filter((k) => body[k] !== undefined)
        .map((k) => [k, body[k]]),
    );
  }
  private stage(v: unknown) {
    const value = String(v);
    if (!stages.has(value))
      throw new BadRequestException('Invalid requirement stage.');
    return value;
  }
  private only(body: Record<string, unknown>, allowed: string[]) {
    const invalid = Object.keys(body).filter((k) => !allowed.includes(k));
    if (invalid.length)
      throw new BadRequestException(
        `Fields not allowed: ${invalid.join(', ')}`,
      );
  }
  private required(v: unknown, name: string) {
    if (typeof v !== 'string' || !v.trim())
      throw new BadRequestException(`${name} is required.`);
    return v.trim();
  }
  private optional(v: unknown) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  private optionalString(v: unknown, field: string) {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string')
      throw new BadRequestException(`${field} must be a string.`);
    return v.trim() || undefined;
  }
  private date(v: unknown, field: string) {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v)))
      throw new BadRequestException(`${field} must be a valid date.`);
    return new Date(v).toISOString();
  }
  private object(v: unknown) {
    if (v === undefined) return {};
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw new BadRequestException('metadata must be an object.');
    return v;
  }
  private stringArray(v: unknown) {
    if (v === undefined) return [] as string[];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x))
      throw new BadRequestException(
        'operation_record_ids must be a string array.',
      );
    return [...v] as string[];
  }
  private operationId(id: string) {
    const value = id.trim();
    if (!uuidPattern.test(value))
      throw new BadRequestException(invalidOperationMessage);
    return value;
  }
  private uuid(value: unknown, field: string) {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !uuidPattern.test(value.trim()))
      throw new BadRequestException(`${field} must be a valid UUID.`);
    return value.trim();
  }
  private status(v: unknown) {
    const value = String(v);
    if (!(OCCURRENCE_STATUSES as readonly string[]).includes(value))
      throw new BadRequestException('Invalid occurrence status.');
    return value;
  }
  private priority(v: unknown) {
    const value = String(v);
    if (!priorities.has(value))
      throw new BadRequestException('Invalid occurrence priority.');
    return value;
  }
}
