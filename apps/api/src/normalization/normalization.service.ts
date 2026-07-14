import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

type Batch = {
  id: string;
  tenant_id: string;
  data_source_id: string | null;
  data_contract_id: string | null;
  status: string;
  source_reference?: string | null;
};
type RecordRow = {
  id: string;
  tenant_id: string;
  staging_batch_id: string;
  validation_status: string;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
};
type Mapping = {
  id: string;
  data_contract_id: string;
  data_contract_field_id: string;
  canonical_entity_id: string;
  canonical_field_id: string;
  mapping_type: string;
  status: string | null;
  notes: string | null;
  data_contract_field: {
    id: string;
    data_contract_id: string;
    field_key: string;
    source_field_name: string;
  } | null;
  canonical_field: {
    id: string;
    canonical_entity_id: string;
    field_key: string;
    data_type: string;
    is_required: boolean;
  } | null;
  canonical_entity: {
    id: string;
    entity_key: string;
    module_key: string;
  } | null;
};
type MappingLoadResult = {
  mappings: Mapping[];
  mappingsFoundCount: number;
  activeMappingsFoundCount: number;
};
type MappingLoadFailure = {
  code: 'FIELD_MAPPING_LOAD_FAILED';
  originalError: unknown;
};
type Run = { id: string };

type Counters = {
  total_records: number;
  processed_records: number;
  created_operation_records: number;
  updated_operation_records: number;
  created_extension_records: number;
  updated_extension_records: number;
  error_records: number;
};

const nativeEntities = new Set([
  'operation_records',
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
  'deliveries',
  'Entregas',
  'Entregas legado',
]);
const prioritizedEntities = new Set([
  'operation_records',
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
]);
const legacyEntities = new Set(['deliveries', 'Entregas', 'Entregas legado']);
const extensionEntities = new Set([
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
]);
const entityEventType: Record<string, string> = {
  operation_records: 'operation_record',
  transport_records: 'transport_record',
  attendance_records: 'attendance_record',
  finance_records: 'finance_record',
  warehouse_records: 'warehouse_record',
  team_records: 'team_record',
};
const entityModule: Record<string, string> = {
  transport_records: 'transporte',
  attendance_records: 'atendimento',
  finance_records: 'financeiro',
  warehouse_records: 'armazem',
  team_records: 'equipes',
};
const allowedStatuses = new Set(['validated', 'partially_valid']);
const operationColumns = new Set([
  'external_id',
  'external_code',
  'source_system',
  'module_origin',
  'record_type',
  'document_number',
  'document_type',
  'cte_number',
  'cte_key',
  'invoice_number',
  'invoice_key',
  'manifest_number',
  'order_number',
  'delivery_number',
  'customer_name',
  'customer_document',
  'shipper_name',
  'shipper_document',
  'recipient_name',
  'recipient_document',
  'payer_name',
  'payer_document',
  'origin_city',
  'origin_state',
  'destination_city',
  'destination_state',
  'vehicle_plate',
  'driver_name',
  'driver_document',
  'status',
  'status_updated_at',
  'occurrence_status',
  'last_event_at',
  'gross_weight',
  'cubed_weight',
  'volume_count',
  'total_value',
  'freight_value',
  'issued_at',
  'expected_date',
  'completed_at',
  'data_quality_status',
]);
const extensionColumns: Record<string, Set<string>> = {
  transport_records: new Set([
    'transport_status',
    'route_name',
    'trip_number',
    'vehicle_type',
    'driver_phone',
    'collected_at',
    'delivered_at',
    'delivery_performance_status',
    'sla_status',
    'cost_center',
  ]),
  attendance_records: new Set([
    'ticket_number',
    'channel',
    'subject',
    'description',
    'occurrence_code',
    'occurrence_type',
    'occurrence_reason',
    'priority',
    'attendance_status',
    'assigned_to',
    'opened_at',
    'first_response_at',
    'last_interaction_at',
    'resolved_at',
    'closed_at',
    'sla_due_at',
  ]),
  finance_records: new Set([
    'billing_reference',
    'billing_period',
    'billing_status',
    'proof_of_delivery_status',
    'proof_received_at',
    'ready_to_bill',
    'blocked_amount',
    'block_status',
    'block_reason',
    'extra_cost_value',
    'discount_value',
    'total_amount',
    'due_at',
    'paid_at',
  ]),
  warehouse_records: new Set([
    'product_code',
    'sku',
    'product_name',
    'warehouse_code',
    'warehouse_name',
    'location_code',
    'batch_number',
    'serial_number',
    'quantity_available',
    'quantity_reserved',
    'quantity_blocked',
    'unit_of_measure',
    'last_movement_type',
    'last_movement_at',
    'warehouse_status',
  ]),
  team_records: new Set([
    'employee_code',
    'employee_name',
    'employee_document',
    'email',
    'phone',
    'department_name',
    'position_name',
    'manager_name',
    'team_status',
    'admission_date',
    'termination_date',
    'shift_name',
    'workload_hours',
    'overtime_hours',
    'worked_at',
  ]),
};
const aliases: Record<string, string> = {
  delivery_status: 'status',
  expected_delivery_date: 'expected_date',
  delivered_at: 'completed_at',
};

const allowedDocumentTypes = new Set([
  'cte',
  'nfe',
  'nf',
  'order',
  'delivery',
  'manifest',
  'other',
]);
const allowedDataQualityStatuses = new Set([
  'valid',
  'invalid',
  'partial',
  'manual_review',
]);
const controlledFields = new Set([
  'document_type',
  'status',
  'data_quality_status',
  'occurrence_status',
  'delivery_performance_status',
  'sla_status',
  'transport_status',
]);

@Injectable()
export class NormalizationService {
  constructor(private readonly supabase: SupabaseService) {}

  listRuns(tenantId: string) {
    return this.supabase.select(
      'normalization_runs',
      `select=*,normalization_errors(*)&tenant_id=eq.${tenantId}&order=created_at.desc`,
    );
  }
  async getRun(tenantId: string, runId: string) {
    const rows = await this.supabase.select<unknown[]>(
      'normalization_runs',
      `select=*,normalization_errors(*)&tenant_id=eq.${tenantId}&id=eq.${runId}&limit=1`,
    );
    if (!rows.length)
      throw new NotFoundException('Normalization run not found.');
    return rows[0];
  }

  async normalizeBatch(tenantId: string, batchId: string, userId: string) {
    const batch = await this.getBatch(tenantId, batchId);
    if (!allowedStatuses.has(batch.status))
      throw new BadRequestException(
        'Staging batch must be validated before normalization.',
      );
    const [run] = await this.supabase.insert<Run[]>('normalization_runs', {
      tenant_id: tenantId,
      staging_batch_id: batchId,
      data_source_id: batch.data_source_id,
      data_contract_id: batch.data_contract_id,
      status: 'running',
      started_at: new Date().toISOString(),
      created_by: userId,
    });
    const counters: Counters = {
      total_records: 0,
      processed_records: 0,
      created_operation_records: 0,
      updated_operation_records: 0,
      created_extension_records: 0,
      updated_extension_records: 0,
      error_records: 0,
    };
    const errorSummary: Record<string, number> = {};
    const addError = async (
      code: string,
      message: string,
      details: Record<string, unknown> = {},
      recordId?: string | null,
      mapping?: Mapping,
    ) => {
      counters.error_records += 1;
      errorSummary[code] = (errorSummary[code] ?? 0) + 1;
      await this.supabase.insert('normalization_errors', {
        tenant_id: tenantId,
        normalization_run_id: run.id,
        staging_batch_id: batchId,
        staging_record_id: recordId ?? null,
        field_mapping_id: mapping?.id ?? null,
        canonical_entity_key: mapping?.canonical_entity?.entity_key ?? null,
        canonical_field_key: mapping?.canonical_field?.field_key ?? null,
        error_code: code,
        error_message: message,
        details,
      });
    };
    const addWarning = async (
      code: string,
      message: string,
      details: Record<string, unknown> = {},
      recordId?: string | null,
      mapping?: Mapping,
    ) => {
      await this.supabase.insert('normalization_errors', {
        tenant_id: tenantId,
        normalization_run_id: run.id,
        staging_batch_id: batchId,
        staging_record_id: recordId ?? null,
        field_mapping_id: mapping?.id ?? null,
        canonical_entity_key: mapping?.canonical_entity?.entity_key ?? null,
        canonical_field_key: mapping?.canonical_field?.field_key ?? null,
        error_code: code,
        error_message: message,
        details: { ...details, severity: 'warning' },
      });
    };
    try {
      const mappingsResult = await this.loadMappings(
        tenantId,
        batch.data_contract_id,
      );
      if ('code' in mappingsResult) {
        await addError(
          mappingsResult.code,
          'Não foi possível carregar os mapeamentos da integração para normalização.',
          { original_error: this.errorDetails(mappingsResult.originalError) },
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const mappings = mappingsResult.mappings;
      if (!mappings.length) {
        await addError(
          'NO_FIELD_MAPPINGS',
          'Não há mapeamentos ativos para o contrato do lote validado. Revise o mapeamento ou valide um novo lote com o contrato correto.',
          {
            tenant_id: tenantId,
            staging_batch_id: batchId,
            batch_data_contract_id: batch.data_contract_id,
            data_source_id: batch.data_source_id,
            mappings_found_count: mappingsResult.mappingsFoundCount,
            active_mappings_found_count:
              mappingsResult.activeMappingsFoundCount,
          },
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const records = await this.getValidRecords(tenantId, batchId);
      counters.total_records = records.length;
      if (!records.length) {
        await addError(
          'NO_VALID_RECORDS',
          'Não há staging_records válidos com normalized_payload para normalizar.',
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const enabledModules = await this.getEnabledModules(tenantId);
      for (const record of records) {
        const buckets: Record<string, Record<string, unknown>> = {
          operation_records: {},
        };
        let partial = false;
        for (const mapping of mappings) {
          const entityKey = mapping.canonical_entity?.entity_key;
          const fieldKey = mapping.canonical_field?.field_key;
          if (
            !entityKey ||
            !nativeEntities.has(entityKey) ||
            !mapping.canonical_field ||
            !mapping.data_contract_field
          ) {
            await addError(
              'INVALID_CANONICAL_ENTITY',
              'Entidade ou campo canônico inválido para normalização.',
              {},
              record.id,
              mapping,
            );
            continue;
          }
          if (mapping.mapping_type === 'ignored') continue;
          if (mapping.mapping_type === 'transformed') {
            await addError(
              'INVALID_CANONICAL_FIELD',
              'Transformação livre não é executada nesta sprint.',
              {},
              record.id,
              mapping,
            );
            continue;
          }
          const rawValue =
            mapping.mapping_type === 'default_value'
              ? this.defaultFromNotes(mapping)
              : this.valueFromRecord(record, mapping);
          if (rawValue === undefined || rawValue === null || rawValue === '') {
            partial = true;
            await addWarning(
              'SOURCE_VALUE_NOT_FOUND',
              'Valor da coluna pareada não foi encontrado no staging.',
              { source_field_name: mapping.data_contract_field.source_field_name, field_key: mapping.data_contract_field.field_key },
              record.id,
              mapping,
            );
            continue;
          }
          const converted = this.convertValue(
            rawValue,
            mapping.canonical_field.data_type,
          );
          if (!converted.ok) {
            await addError(
              'INVALID_VALUE_TYPE',
              'Valor não pôde ser convertido para o tipo canônico.',
              { value: rawValue, data_type: mapping.canonical_field.data_type },
              record.id,
              mapping,
            );
            continue;
          }
          const resolved = this.resolveTarget(entityKey, fieldKey as string);
          if (!resolved) {
            await addWarning(
              'TARGET_FIELD_NOT_FOUND',
              'Campo mapeado não corresponde a uma coluna nativa conhecida.',
              { entity_key: entityKey, field_key: fieldKey },
              record.id,
              mapping,
            );
            continue;
          }
          if (resolved.entity !== 'operation_records' && !enabledModules.has(entityModule[resolved.entity])) {
            await addWarning(
              'INVALID_TARGET_ENTITY',
              'Módulo da extensão não está habilitado para o tenant.',
              { module_key: entityModule[resolved.entity] },
              record.id,
              mapping,
            );
            continue;
          }
          const canonical = this.normalizeControlledValue(
            resolved.field,
            converted.value,
          );
          if (!canonical.ok) {
            await addWarning(
              canonical.code,
              canonical.message,
              {
                field: resolved.field,
                received_value: converted.value,
                expected_values: canonical.expected,
                user_message: canonical.message,
              },
              record.id,
              mapping,
            );
            partial = true;
            continue;
          }
          buckets[resolved.entity] = {
            ...(buckets[resolved.entity] ?? {}),
            [resolved.field]: canonical.value,
          };
        }
        if (
          Object.keys(buckets.operation_records).length === 0 &&
          Object.keys(buckets).some((key) => key !== 'operation_records')
        ) {
          partial = true;
          await addWarning(
            'MISSING_OPERATION_RECORD',
            'Registro criado com dados parciais. Mapeie campos do Núcleo operacional comum para enriquecer futuras análises.',
            {
              user_message:
                'Dados gravados parcialmente. Alguns indicadores futuros podem ficar indisponíveis até que mais campos sejam mapeados.',
            },
            record.id,
          );
        }
        const hasCoreValues = Object.keys(buckets.operation_records).length > 0;
        const hasDocumentKey = Boolean(
          buckets.operation_records.external_id ||
          buckets.operation_records.cte_key ||
          buckets.operation_records.invoice_key ||
          buckets.operation_records.delivery_number,
        );
        const op = await this.upsertOperation(
          tenantId,
          batch,
          record,
          buckets.operation_records,
          partial || !hasCoreValues || !hasDocumentKey,
        );
        counters[
          op.created ? 'created_operation_records' : 'updated_operation_records'
        ] += 1;
        await this.event(
          tenantId,
          'operation_records',
          op.id,
          op.created,
          batch,
          record,
          userId,
        );
        for (const entity of Object.keys(buckets).filter(
          (key) =>
            extensionEntities.has(key) && Object.keys(buckets[key]).length,
        )) {
          const ext = await this.upsertExtension(
            entity,
            tenantId,
            op.id,
            buckets[entity],
          );
          counters[
            ext.created
              ? 'created_extension_records'
              : 'updated_extension_records'
          ] += 1;
          await this.event(
            tenantId,
            entity,
            ext.id,
            ext.created,
            batch,
            record,
            userId,
          );
        }
        counters.processed_records += 1;
      }
      return this.finish(
        run.id,
        counters.error_records ? 'completed_with_errors' : 'completed',
        counters,
        errorSummary,
      );
    } catch (error) {
      await addError(
        'INVALID_CANONICAL_VALUE',
        'Não foi possível processar o lote porque alguns valores não seguem o padrão esperado da base nativa.',
        {
          internal_error: this.errorDetails(error),
          user_detail:
            'Revise os valores controlados do lote e tente processar novamente.',
        },
      );
      return this.finish(run.id, 'failed', counters, errorSummary);
    }
  }

  private async finish(
    runId: string,
    status: string,
    counters: Counters,
    errorSummary: Record<string, number>,
  ) {
    const [row] = await this.supabase.update<unknown[]>(
      'normalization_runs',
      `id=eq.${runId}`,
      {
        ...counters,
        status,
        error_summary: errorSummary,
        finished_at: new Date().toISOString(),
      },
    );
    return row;
  }
  private async getBatch(tenantId: string, batchId: string) {
    const rows = await this.supabase.select<Batch[]>(
      'staging_batches',
      `select=id,tenant_id,data_source_id,data_contract_id,status,source_reference&tenant_id=eq.${tenantId}&id=eq.${batchId}&limit=1`,
    );
    if (!rows.length) throw new NotFoundException('Staging batch not found.');
    return rows[0];
  }
  private getValidRecords(tenantId: string, batchId: string) {
    return this.supabase.select<RecordRow[]>(
      'staging_records',
      `select=id,tenant_id,staging_batch_id,validation_status,raw_payload,normalized_payload&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&validation_status=eq.valid&order=row_number.asc`,
    );
  }
  private async loadMappings(
    tenantId: string,
    contractId: string | null,
  ): Promise<MappingLoadResult | MappingLoadFailure> {
    try {
      return await this.getMappings(tenantId, contractId);
    } catch (error) {
      return { code: 'FIELD_MAPPING_LOAD_FAILED', originalError: error };
    }
  }
  private async getMappings(
    tenantId: string,
    contractId: string | null,
  ): Promise<MappingLoadResult> {
    if (!contractId)
      return {
        mappings: [],
        mappingsFoundCount: 0,
        activeMappingsFoundCount: 0,
      };
    const rows = await this.supabase.select<Mapping[]>(
      'field_mappings',
      `select=id,data_contract_id,data_contract_field_id,canonical_entity_id,canonical_field_id,mapping_type,status,notes,data_contract_field:data_contract_fields!field_mappings_contract_field_tenant_fk(id,data_contract_id,field_key,source_field_name),canonical_field:canonical_fields!field_mappings_canonical_field_tenant_fk(id,canonical_entity_id,field_key,data_type,is_required),canonical_entity:canonical_entities!field_mappings_entity_tenant_fk(id,entity_key,module_key)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}`,
    );
    const activeRows = rows.filter(
      (mapping) => mapping.status === 'active' || !mapping.status,
    );
    return {
      mappings: activeRows
        .filter(
          (mapping) =>
            mapping.data_contract_field?.data_contract_id === contractId,
        )
        .filter(
          (mapping) =>
            mapping.canonical_field?.canonical_entity_id ===
            mapping.canonical_entity_id,
        )
        .sort(
          (a, b) =>
            Number(
              prioritizedEntities.has(b.canonical_entity?.entity_key ?? ''),
            ) -
            Number(
              prioritizedEntities.has(a.canonical_entity?.entity_key ?? ''),
            ),
        ),
      mappingsFoundCount: rows.length,
      activeMappingsFoundCount: activeRows.length,
    };
  }
  private valueFromRecord(record: RecordRow, mapping: Mapping) {
    const field = mapping.data_contract_field;
    if (!field) return undefined;
    const normalizedByKey = record.normalized_payload?.[field.field_key];
    if (normalizedByKey !== undefined) return normalizedByKey;
    const rawBySourceName = record.raw_payload?.[field.source_field_name];
    if (rawBySourceName !== undefined) return rawBySourceName;
    return record.raw_payload?.[field.field_key];
  }
  private resolveTarget(entityKey: string, fieldKey: string) {
    const aliased = aliases[fieldKey] ?? fieldKey;
    if (legacyEntities.has(entityKey) || entityKey === 'operation_records') {
      return operationColumns.has(aliased) ? { entity: 'operation_records', field: aliased } : null;
    }
    if (extensionEntities.has(entityKey) && extensionColumns[entityKey]?.has(fieldKey)) {
      return { entity: entityKey, field: fieldKey };
    }
    if (operationColumns.has(aliased)) {
      return { entity: 'operation_records', field: aliased };
    }
    return null;
  }

  private errorDetails(error: unknown) {
    return error instanceof Error ? { message: error.message } : { error };
  }
  private async getEnabledModules(tenantId: string) {
    const rows = await this.supabase.select<Array<{ module: { key: string } }>>(
      'tenant_modules',
      `select=module:modules(key)&tenant_id=eq.${tenantId}&is_active=eq.true`,
    );
    return new Set(['core', ...rows.map((row) => row.module.key)]);
  }
  private async upsertOperation(
    tenantId: string,
    batch: Batch,
    record: RecordRow,
    values: Record<string, unknown>,
    partial: boolean,
  ) {
    const base = {
      ...values,
      tenant_id: tenantId,
      source_data_source_id: batch.data_source_id,
      source_data_contract_id: batch.data_contract_id,
      source_staging_batch_id: batch.id,
      source_staging_record_id: record.id,
      source_system: batch.source_reference ?? 'staging',
      source_payload_hash: createHash('sha256')
        .update(JSON.stringify(record.normalized_payload ?? {}))
        .digest('hex'),
      data_quality_status: this.normalizeDataQualityStatus(
        partial ? 'partial' : values.data_quality_status,
      ),
    };
    const existing = await this.findOperation(tenantId, base);
    if (existing) {
      const [row] = await this.supabase.update<Array<{ id: string }>>(
        'operation_records',
        `tenant_id=eq.${tenantId}&id=eq.${existing.id}`,
        base,
      );
      return { id: row.id, created: false };
    }
    const [row] = await this.supabase.insert<Array<{ id: string }>>(
      'operation_records',
      base,
    );
    return { id: row.id, created: true };
  }
  private async findOperation(tenantId: string, v: Record<string, unknown>) {
    const queries = [
      `source_staging_record_id=eq.${v.source_staging_record_id}`,
      v.external_id && v.source_data_source_id
        ? `external_id=eq.${v.external_id}&source_data_source_id=eq.${v.source_data_source_id}`
        : '',
      v.cte_key ? `cte_key=eq.${v.cte_key}` : '',
      v.invoice_key ? `invoice_key=eq.${v.invoice_key}` : '',
      v.delivery_number && v.customer_document
        ? `delivery_number=eq.${v.delivery_number}&customer_document=eq.${v.customer_document}`
        : '',
    ].filter(Boolean);
    for (const q of queries) {
      const rows = await this.supabase.select<Array<{ id: string }>>(
        'operation_records',
        `select=id&tenant_id=eq.${tenantId}&${q}&limit=1`,
      );
      if (rows.length) return rows[0];
    }
    return null;
  }
  private async upsertExtension(
    entity: string,
    tenantId: string,
    operationRecordId: string,
    values: Record<string, unknown>,
  ) {
    const rows = await this.supabase.select<Array<{ id: string }>>(
      entity,
      `select=id&tenant_id=eq.${tenantId}&operation_record_id=eq.${operationRecordId}&limit=1`,
    );
    const payload = {
      ...values,
      tenant_id: tenantId,
      operation_record_id: operationRecordId,
    };
    if (rows.length) {
      const [row] = await this.supabase.update<Array<{ id: string }>>(
        entity,
        `tenant_id=eq.${tenantId}&id=eq.${rows[0].id}`,
        payload,
      );
      return { id: row.id, created: false };
    }
    const [row] = await this.supabase.insert<Array<{ id: string }>>(
      entity,
      payload,
    );
    return { id: row.id, created: true };
  }
  private event(
    tenantId: string,
    entity: string,
    id: string,
    created: boolean,
    batch: Batch,
    record: RecordRow,
    userId: string,
  ) {
    return this.supabase.insert('entity_events', {
      tenant_id: tenantId,
      entity_type: entityEventType[entity],
      entity_id: id,
      event_type: created ? 'normalized_created' : 'normalized_updated',
      event_title: created
        ? 'Registro normalizado criado'
        : 'Registro normalizado atualizado',
      event_description:
        'Normalização determinística a partir de staging validado.',
      occurred_at: new Date().toISOString(),
      actor_user_id: userId,
      source_data_source_id: batch.data_source_id,
      source_staging_record_id: record.id,
    });
  }
  private normalizeControlledValue(
    field: string,
    value: unknown,
  ):
    | { ok: true; value: unknown }
    | { ok: false; code: string; message: string; expected: string[] } {
    if (!controlledFields.has(field)) return { ok: true, value };
    if (field === 'document_type') {
      const normalized = this.normalizeDocumentType(value);
      if (normalized === null || allowedDocumentTypes.has(normalized)) {
        return { ok: true, value: normalized };
      }
      return {
        ok: false,
        code: 'DOCUMENT_TYPE_NOT_ALLOWED',
        message:
          'Tipo de documento recebeu um valor que não pôde ser convertido para o padrão interno.',
        expected: [...allowedDocumentTypes],
      };
    }
    if (field === 'data_quality_status') {
      const normalized = this.normalizeDataQualityStatus(value);
      if (normalized === null || allowedDataQualityStatuses.has(normalized)) {
        return { ok: true, value: normalized };
      }
      return {
        ok: false,
        code: 'INVALID_CANONICAL_VALUE',
        message:
          'Qualidade do dado recebeu um valor que não pôde ser convertido para o padrão interno.',
        expected: [...allowedDataQualityStatuses],
      };
    }
    const normalized = this.normalizeStatusValue(value);
    if (normalized === null || this.isAllowedStatus(field, normalized)) {
      return { ok: true, value: normalized };
    }
    return {
      ok: false,
      code: 'STATUS_NOT_ALLOWED',
      message:
        'Status recebeu um valor que não pôde ser convertido para o padrão interno.',
      expected: this.expectedStatuses(field),
    };
  }

  private normalizeDocumentType(value: unknown) {
    const key = this.normalizeKey(value);
    if (!key) return null;
    const map: Record<string, string> = {
      cte: 'cte',
      conhecimentodetransporte: 'cte',
      nf: 'nf',
      notafiscal: 'nf',
      nfe: 'nfe',
      pedido: 'order',
      order: 'order',
      entrega: 'delivery',
      delivery: 'delivery',
      manifesto: 'manifest',
      mdfe: 'manifest',
    };
    return map[key] ?? 'other';
  }

  private normalizeDataQualityStatus(value: unknown) {
    const key = this.normalizeKey(value);
    if (!key) return 'valid';
    const map: Record<string, string> = {
      valid: 'valid',
      valido: 'valid',
      valida: 'valid',
      invalid: 'invalid',
      invalido: 'invalid',
      invalida: 'invalid',
      partial: 'partial',
      parcial: 'partial',
      manualreview: 'manual_review',
      revisaomanual: 'manual_review',
    };
    return map[key] ?? String(value);
  }

  private normalizeStatusValue(value: unknown) {
    const key = this.normalizeKey(value);
    if (!key) return null;
    const map: Record<string, string> = {
      delivered: 'delivered',
      entregue: 'delivered',
      finalizado: 'delivered',
      concluido: 'delivered',
      pending: 'pending',
      pendente: 'pending',
      canceled: 'canceled',
      cancelled: 'canceled',
      cancelado: 'canceled',
      delayed: 'delayed',
      atrasado: 'delayed',
      intransit: 'in_transit',
      emtransito: 'in_transit',
      ontime: 'on_time',
      noprazo: 'on_time',
      met: 'met',
      cumprido: 'met',
      notmet: 'not_met',
      descumprido: 'not_met',
      open: 'open',
      aberto: 'open',
      resolved: 'resolved',
      resolvido: 'resolved',
    };
    return map[key] ?? String(value).trim().toLowerCase();
  }

  private isAllowedStatus(field: string, value: string) {
    return this.expectedStatuses(field).includes(value);
  }

  private expectedStatuses(field: string) {
    if (field === 'sla_status') return ['met', 'not_met', 'on_time', 'delayed'];
    if (field === 'occurrence_status') return ['open', 'resolved', 'pending', 'canceled'];
    if (field === 'delivery_performance_status') return ['delivered', 'pending', 'canceled', 'delayed', 'on_time'];
    return ['delivered', 'pending', 'canceled', 'delayed', 'in_transit', 'on_time'];
  }

  private normalizeKey(value: unknown) {
    return String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private defaultFromNotes(mapping: Mapping) {
    const match = mapping.notes && /default=([^;]+)/.exec(mapping.notes);
    return match?.[1] ?? null;
  }
  private convertValue(
    value: unknown,
    dataType: string,
  ): { ok: true; value: unknown } | { ok: false } {
    if (dataType === 'text' || dataType === 'enum')
      return { ok: true, value: String(value) };
    if (dataType === 'integer') {
      const n = Number(value);
      return Number.isInteger(n) ? { ok: true, value: n } : { ok: false };
    }
    if (dataType === 'decimal') {
      const n = Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    if (dataType === 'boolean') {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === '1') return { ok: true, value: true };
      if (value === 'false' || value === '0') return { ok: true, value: false };
      return { ok: false };
    }
    if (dataType === 'date' || dataType === 'datetime') {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? { ok: false }
        : {
            ok: true,
            value:
              dataType === 'date'
                ? d.toISOString().slice(0, 10)
                : d.toISOString(),
          };
    }
    if (dataType === 'json') return { ok: true, value };
    return { ok: false };
  }
}
