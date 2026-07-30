import {
  BadRequestException,
  Injectable,
  Logger,
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
  batch_code?: string | null;
};
type DataSource = { id: string; source_type: string };
type DataContract = { id: string; entity_key: string; module_key: string };
type ContractField = {
  id: string;
  data_contract_id: string;
  field_key: string;
  data_type: string;
  is_required: boolean;
};
type CanonicalIntegration = { id: string; active_schema_signature: string };
type RecordRow = {
  id: string;
  tenant_id: string;
  staging_batch_id: string;
  validation_status: string;
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
  operational_key: boolean;
  data_contract_field: {
    id: string;
    data_contract_id: string;
    field_key: string;
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
const allowedStatuses = new Set(['validated', 'partially_valid', 'completed']);
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
  'shipper_external_id',
  'carrier_external_id',
  'carrier_name',
  'service_taker_external_id',
  'service_taker_name',
  'scheduled_at',
  'vehicle_profile',
  'pending_volume_count',
  'pending_total_value',
  'pending_gross_weight',
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

@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

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
    const insertNormalizationIssue = async (
      code: string,
      message: string,
      details: Record<string, unknown>,
      recordId: string | null | undefined,
      mapping: Mapping | undefined,
      severity: 'error' | 'warning',
    ) => {
      errorSummary[code] = (errorSummary[code] ?? 0) + 1;
      try {
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
          details: { ...details, severity },
        });
      } catch (error) {
        const logDetails = this.errorDetails(error);
        errorSummary.NORMALIZATION_ERROR_LOG_FAILED =
          (errorSummary.NORMALIZATION_ERROR_LOG_FAILED ?? 0) + 1;
        this.logger.error(
          `Falha ao registrar ${severity} de normalização ${code} para o lote ${batchId}.`,
          JSON.stringify({
            tenant_id: tenantId,
            normalization_run_id: run.id,
            staging_batch_id: batchId,
            staging_record_id: recordId ?? null,
            error_code: code,
            severity,
            log_error: logDetails,
          }),
        );
      }
    };
    const addError = async (
      code: string,
      message: string,
      details: Record<string, unknown> = {},
      recordId?: string | null,
      mapping?: Mapping,
    ) => {
      counters.error_records += 1;
      await insertNormalizationIssue(
        code,
        message,
        details,
        recordId,
        mapping,
        'error',
      );
    };
    const addWarning = async (
      code: string,
      message: string,
      details: Record<string, unknown> = {},
      recordId?: string | null,
      mapping?: Mapping,
    ) =>
      insertNormalizationIssue(
        code,
        message,
        details,
        recordId,
        mapping,
        'warning',
      );
    try {
      const [dataSource, contract, contractFields, records] = await Promise.all(
        [
          this.getDataSource(tenantId, batch.data_source_id),
          this.getContract(tenantId, batch.data_contract_id),
          this.getContractFields(tenantId, batch.data_contract_id),
          this.getValidRecords(tenantId, batchId),
        ],
      );
      counters.total_records = records.length;
      if (!records.length) {
        await addError(
          'NO_VALID_STAGING_RECORDS',
          'Não há staging_records válidos neste lote para processar.',
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const recordsWithPayload = records.filter(
        (record) => Object.keys(record.normalized_payload ?? {}).length > 0,
      );
      if (!recordsWithPayload.length) {
        await addError(
          'EMPTY_NORMALIZED_PAYLOAD',
          'Os staging_records válidos não possuem normalized_payload preenchido.',
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      for (const record of records.filter(
        (item) => Object.keys(item.normalized_payload ?? {}).length === 0,
      )) {
        await addError(
          'EMPTY_NORMALIZED_PAYLOAD',
          'O staging_record válido não possui normalized_payload preenchido.',
          {},
          record.id,
        );
      }

      // A API já concluiu pareamento de origem e tratamento no staging. Neste
      // ponto field_mappings é exclusivamente o mapa contrato -> modelo canônico.
      const loaded = await this.loadMappings(tenantId, batch.data_contract_id);
      if ('code' in loaded) {
        await addError(
          loaded.code,
          'Não foi possível carregar os mapeamentos canônicos para normalização.',
          { original_error: this.errorDetails(loaded.originalError) },
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const mappingsResult = loaded;
      const payloadKeys = [
        ...new Set(
          recordsWithPayload.flatMap((record) =>
            Object.keys(record.normalized_payload ?? {}),
          ),
        ),
      ];
      const contractFieldKeys = contractFields.map((field) => field.field_key);
      const recordMappings = loaded.mappings.filter((mapping) =>
        payloadKeys.includes(mapping.data_contract_field?.field_key ?? ''),
      );
      const canonicalSourceKey = this.canonicalSourceKey(
        batch,
        dataSource.source_type,
      );
      if (!recordMappings.length) {
        await addError(
          dataSource.source_type === 'api'
            ? 'API_SCHEMA_INCOMPATIBLE'
            : 'NO_FIELD_MAPPINGS',
          dataSource.source_type === 'api'
            ? 'Os campos nativos do normalized_payload não possuem mapeamento canônico ativo para publicação no modelo tratado.'
            : 'Não há mapeamentos ativos para o contrato do lote validado.',
          {
            normalized_payload_keys: payloadKeys,
            contract_field_keys: contractFieldKeys,
            data_contract_id: contract.id,
            data_source_id: dataSource.id,
            canonical_source_key: canonicalSourceKey,
            source_type: dataSource.source_type,
            active_mapping_field_keys: loaded.mappings.map(
              (mapping) => mapping.data_contract_field?.field_key ?? '',
            ),
            schema_signature_mode:
              dataSource.source_type === 'api'
                ? 'active_contract_mappings'
                : 'payload_fields',
            staging_batch_id: batchId,
            mappings_found_count: mappingsResult.mappingsFoundCount,
            active_mappings_found_count:
              mappingsResult.activeMappingsFoundCount,
          },
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      // API batches are incremental and can contain only a subset of the
      // contract. Their signature represents the active canonical contract,
      // while file snapshots retain their payload-shaped signature.
      const signatureMappings =
        dataSource.source_type === 'api' ? loaded.mappings : recordMappings;
      const datasetRole = this.datasetRole(signatureMappings);
      const schemaSignature = this.schemaSignature(signatureMappings);
      const integration = await this.resolveCanonicalIntegration(
        tenantId,
        batch,
        dataSource.source_type,
        canonicalSourceKey,
        datasetRole,
        schemaSignature,
      );
      if ('incompatible' in integration) {
        await addError(
          dataSource.source_type === 'api'
            ? 'API_SCHEMA_INCOMPATIBLE'
            : 'SCHEMA_INCOMPATIBLE',
          dataSource.source_type === 'api'
            ? 'O lote API foi validado com uma configuração incompatível com a publicação canônica atual. Revalide o lote com as regras atuais antes de processar.'
            : 'O arquivo enviado possui um schema diferente da integração ativa. Para proteger os dados operacionais, esta atualização foi bloqueada. Crie uma nova integração ou uma nova versão de contrato/pareamento para este arquivo.',
          {
            data_source_id: dataSource.id,
            data_contract_id: contract.id,
            canonical_source_key: canonicalSourceKey,
            source_type: dataSource.source_type,
            normalized_payload_keys: payloadKeys,
            active_mapping_field_keys: loaded.mappings.map(
              (mapping) => mapping.data_contract_field?.field_key ?? '',
            ),
            schema_signature_mode:
              dataSource.source_type === 'api'
                ? 'active_contract_mappings'
                : 'payload_fields',
            expected_schema_signature: integration.expected,
            received_schema_signature: schemaSignature,
          },
        );
        return this.finish(run.id, 'failed', counters, errorSummary);
      }
      const enabledModules = await this.getEnabledModules(tenantId);
      let hasPendingActivation = false;
      for (const record of recordsWithPayload) {
        const buckets: Record<string, Record<string, unknown>> = {
          operation_records: {},
        };
        let partial = false;
        for (const mapping of recordMappings) {
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
              {
                field_key: mapping.data_contract_field.field_key,
              },
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
          if (
            resolved.entity !== 'operation_records' &&
            !enabledModules.has(entityModule[resolved.entity])
          ) {
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
            const details = {
              field: resolved.field,
              received_value: converted.value,
              expected_values: canonical.expected,
              user_message: canonical.message,
            };
            if (mapping.canonical_field.is_required) {
              await addError(
                canonical.code,
                canonical.message,
                details,
                record.id,
                mapping,
              );
            } else {
              await addWarning(
                canonical.code,
                canonical.message,
                details,
                record.id,
                mapping,
              );
            }
            partial = true;
            continue;
          }
          buckets[resolved.entity] = {
            ...(buckets[resolved.entity] ?? {}),
            [resolved.field]: canonical.value,
          };
        }
        this.applyOperationDateFallbacks(buckets);
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
        const operationalKeysUsed = recordMappings
          .filter(
            (mapping) =>
              mapping.operational_key && mapping.mapping_type !== 'ignored',
          )
          .flatMap((mapping) => {
            const entityKey = mapping.canonical_entity?.entity_key;
            const fieldKey = mapping.canonical_field?.field_key;
            const target =
              entityKey && fieldKey
                ? this.resolveTarget(entityKey, fieldKey)
                : null;
            return target?.entity === 'operation_records' &&
              this.hasOperationalIdentifier(
                buckets.operation_records[target.field],
              )
              ? [target.field]
              : [];
          });
        const hasDocumentKey = operationalKeysUsed.length > 0;
        if (hasDocumentKey)
          this.logger.log(
            JSON.stringify({
              event: 'canonical_operational_key_selected',
              staging_record_id: record.id,
              operational_keys: operationalKeysUsed,
            }),
          );
        const op = await this.upsertOperation(
          tenantId,
          batch,
          record,
          buckets.operation_records,
          partial || !hasCoreValues || !hasDocumentKey,
          hasDocumentKey,
          canonicalSourceKey,
          integration.id,
          datasetRole,
          operationalKeysUsed,
        );
        counters[
          op.created ? 'created_operation_records' : 'updated_operation_records'
        ] += 1;
        hasPendingActivation ||= op.pendingActivation;
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
      if (
        !counters.error_records &&
        counters.processed_records &&
        hasPendingActivation
      ) {
        if (dataSource.source_type === 'api' && batch.data_source_id)
          await this.assertApiSourceActivationAllowed(
            tenantId,
            batch.data_source_id,
            contract.module_key,
            contract.entity_key,
          );
        await this.activateBatch(
          tenantId,
          integration.id,
          batchId,
          dataSource.source_type,
        );
        if (dataSource.source_type === 'api' && batch.data_source_id)
          await this.activateApiSource(tenantId, batch.data_source_id);
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
    const [row] = await this.supabase.update<Record<string, unknown>[]>(
      'normalization_runs',
      `id=eq.${runId}`,
      {
        ...counters,
        status,
        error_summary: errorSummary,
        finished_at: new Date().toISOString(),
      },
    );
    return {
      ...row,
      created_count:
        counters.created_operation_records + counters.created_extension_records,
      updated_count:
        counters.updated_operation_records + counters.updated_extension_records,
      skipped_count: Math.max(
        0,
        counters.total_records - counters.processed_records,
      ),
      error_count: counters.error_records,
    };
  }
  private async getBatch(tenantId: string, batchId: string) {
    const rows = await this.supabase.select<Batch[]>(
      'staging_batches',
      `select=id,tenant_id,data_source_id,data_contract_id,status,source_reference,batch_code&tenant_id=eq.${tenantId}&id=eq.${batchId}&limit=1`,
    );
    if (!rows.length) throw new NotFoundException('Staging batch not found.');
    return rows[0];
  }
  private getValidRecords(tenantId: string, batchId: string) {
    return this.supabase.select<RecordRow[]>(
      'staging_records',
      `select=id,tenant_id,staging_batch_id,validation_status,normalized_payload&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&validation_status=eq.valid&order=row_number.asc`,
    );
  }
  private async getDataSource(tenantId: string, sourceId: string | null) {
    const rows = sourceId
      ? await this.supabase.select<DataSource[]>(
          'data_sources',
          `select=id,source_type&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`,
        )
      : [];
    if (!rows.length) throw new NotFoundException('Data source not found.');
    return rows[0];
  }
  private async getContract(tenantId: string, contractId: string | null) {
    const rows = contractId
      ? await this.supabase.select<DataContract[]>(
          'data_contracts',
          `select=id,entity_key,module_key&tenant_id=eq.${tenantId}&id=eq.${contractId}&limit=1`,
        )
      : [];
    if (!rows.length) throw new NotFoundException('Data contract not found.');
    return rows[0];
  }
  private getContractFields(tenantId: string, contractId: string | null) {
    if (!contractId) return Promise.resolve([] as ContractField[]);
    return this.supabase.select<ContractField[]>(
      'data_contract_fields',
      `select=id,data_contract_id,field_key,data_type,is_required&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&order=sort_order.asc`,
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
      `select=id,data_contract_id,data_contract_field_id,canonical_entity_id,canonical_field_id,mapping_type,status,notes,operational_key,data_contract_field:data_contract_fields!field_mappings_contract_field_tenant_fk(id,data_contract_id,field_key),canonical_field:canonical_fields!field_mappings_canonical_field_tenant_fk(id,canonical_entity_id,field_key,data_type,is_required),canonical_entity:canonical_entities!field_mappings_entity_tenant_fk(id,entity_key,module_key)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}`,
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
    return normalizedByKey;
  }
  private resolveTarget(entityKey: string, fieldKey: string) {
    const aliased = aliases[fieldKey] ?? fieldKey;
    if (legacyEntities.has(entityKey) || entityKey === 'operation_records') {
      return operationColumns.has(aliased)
        ? { entity: 'operation_records', field: aliased }
        : null;
    }
    if (
      extensionEntities.has(entityKey) &&
      extensionColumns[entityKey]?.has(fieldKey)
    ) {
      return { entity: entityKey, field: fieldKey };
    }
    if (operationColumns.has(aliased)) {
      return { entity: 'operation_records', field: aliased };
    }
    return null;
  }

  private applyOperationDateFallbacks(
    buckets: Record<string, Record<string, unknown>>,
  ) {
    const operation = buckets.operation_records ?? {};
    const transport = buckets.transport_records ?? {};

    if (
      this.isEmptyCanonicalValue(operation.issued_at) &&
      transport.collected_at
    ) {
      operation.issued_at = transport.collected_at;
    }
    if (
      this.isEmptyCanonicalValue(operation.completed_at) &&
      transport.delivered_at
    ) {
      operation.completed_at = transport.delivered_at;
    }

    buckets.operation_records = operation;
  }

  private isEmptyCanonicalValue(value: unknown) {
    return value === undefined || value === null || value === '';
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
    hasOperationalKey: boolean,
    canonicalSourceKey: string,
    canonicalIntegrationId: string,
    datasetRole: string,
    operationalKeys: string[],
  ) {
    const incrementalApi = Boolean(
      batch.data_source_id && canonicalSourceKey.startsWith('api:'),
    );
    const existing = await this.findOperation(
      tenantId,
      { ...values, source_staging_record_id: record.id },
      datasetRole,
      canonicalIntegrationId,
      incrementalApi,
      operationalKeys,
    );
    const canActivate =
      hasOperationalKey &&
      !(existing && 'ambiguous' in existing && existing.ambiguous);
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
      data_quality_status: partial
        ? 'partial'
        : (values.data_quality_status ?? 'valid'),
      canonical_source_key: canonicalSourceKey,
      canonical_integration_id: canonicalIntegrationId,
      is_current: false,
      canonical_validity_status: canActivate
        ? 'pending_activation'
        : 'incomplete',
      superseded_at: canActivate ? null : new Date().toISOString(),
      superseded_by_staging_batch_id: null,
    };
    if (existing) {
      if ('linked' in existing && existing.linked)
        return { id: existing.id, created: false, pendingActivation: false };
      if ('ambiguous' in existing && existing.ambiguous) {
        const [row] = await this.supabase.insert<Array<{ id: string }>>(
          'operation_records',
          base,
        );
        return { id: row.id, created: true, pendingActivation: false };
      }
      // API updates are immutable versions: retire the current row and insert
      // the replacement. This preserves audit history and lets activation be
      // atomic from the consumers' perspective.
      if (incrementalApi && canActivate) {
        await this.supabase.update(
          'operation_records',
          `tenant_id=eq.${tenantId}&id=eq.${existing.id}`,
          {
            is_current: false,
            canonical_validity_status: 'superseded',
            superseded_at: new Date().toISOString(),
            superseded_by_staging_batch_id: batch.id,
          },
        );
        const [row] = await this.supabase.insert<Array<{ id: string }>>(
          'operation_records',
          base,
        );
        return { id: row.id, created: true, pendingActivation: true };
      }
      const [row] = await this.supabase.update<Array<{ id: string }>>(
        'operation_records',
        `tenant_id=eq.${tenantId}&id=eq.${existing.id}`,
        base,
      );
      return { id: row.id, created: false, pendingActivation: canActivate };
    }
    const [row] = await this.supabase.insert<Array<{ id: string }>>(
      'operation_records',
      base,
    );
    return { id: row.id, created: true, pendingActivation: canActivate };
  }
  private async findOperation(
    tenantId: string,
    v: Record<string, unknown>,
    datasetRole: string,
    canonicalIntegrationId: string,
    incrementalApi: boolean,
    operationalKeys: string[],
  ) {
    const queries = [
      `source_staging_record_id=eq.${v.source_staging_record_id}`,
    ].filter(Boolean);
    for (const q of queries) {
      const rows = await this.supabase.select<Array<{ id: string }>>(
        'operation_records',
        `select=id&tenant_id=eq.${tenantId}&${q}&limit=1`,
      );
      if (rows.length) return rows[0];
    }
    if (datasetRole === 'deliveries' && !incrementalApi) return null;
    if (incrementalApi && operationalKeys.length) {
      const operationalFilter = operationalKeys
        .map((field) => `${field}=eq.${encodeURIComponent(String(v[field]))}`)
        .join('&');
      const rows = await this.supabase.select<Array<{ id: string }>>(
        'operation_records',
        `select=id&tenant_id=eq.${tenantId}&canonical_integration_id=eq.${canonicalIntegrationId}&${operationalFilter}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&limit=2`,
      );
      if (rows.length === 1) return rows[0];
      if (rows.length > 1) return { id: '', ambiguous: true };
      return null;
    }
    const matchFields = incrementalApi
      ? operationalKeys
      : [
          'manifest_number',
          'invoice_number',
          'cte_number',
          'delivery_number',
          'order_number',
          'external_code',
        ];
    for (const field of matchFields) {
      if (!this.hasOperationalIdentifier(v[field])) continue;
      const rows = await this.supabase.select<Array<{ id: string }>>(
        'operation_records',
        `select=id&tenant_id=eq.${tenantId}&${field}=eq.${encodeURIComponent(String(v[field]))}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&limit=2`,
      );
      if (rows.length === 1) return { ...rows[0], linked: true };
      if (rows.length > 1) return { id: '', ambiguous: true };
    }
    return null;
  }
  private canonicalSourceKey(batch: Batch, sourceType: string) {
    if (sourceType === 'api' && batch.data_source_id)
      return `api:${batch.data_source_id}`;
    return (
      batch.source_reference?.trim() ||
      batch.batch_code?.trim() ||
      batch.data_source_id ||
      'staging'
    ).slice(0, 500);
  }
  private hasOperationalIdentifier(value: unknown) {
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    return false;
  }
  private datasetRole(mappings: Mapping[]) {
    const entity = mappings
      .map((m) => m.canonical_entity?.entity_key)
      .find(
        (key) => key && key !== 'operation_records' && key !== 'deliveries',
      );
    return entity === 'attendance_records'
      ? 'occurrences'
      : entity === 'finance_records'
        ? 'finance'
        : entity === 'warehouse_records'
          ? 'warehouse'
          : entity === 'team_records'
            ? 'team'
            : 'deliveries';
  }
  private schemaSignature(mappings: Mapping[]) {
    const schema = mappings
      .map((m) => ({
        field: m.data_contract_field?.field_key ?? '',
        entity: m.canonical_entity?.entity_key ?? '',
        canonical: m.canonical_field?.field_key ?? '',
        type: m.canonical_field?.data_type ?? '',
        required: Boolean(m.canonical_field?.is_required),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
  }
  private async resolveCanonicalIntegration(
    tenantId: string,
    batch: Batch,
    integrationType: string,
    sourceKey: string,
    datasetRole: string,
    signature: string,
  ): Promise<CanonicalIntegration | { incompatible: true; expected: string }> {
    const rows = await this.supabase.select<CanonicalIntegration[]>(
      'canonical_integrations',
      `select=id,active_schema_signature&tenant_id=eq.${tenantId}&integration_type=eq.${encodeURIComponent(integrationType)}&canonical_source_key=eq.${encodeURIComponent(sourceKey)}&dataset_role=eq.${datasetRole}&status=eq.active&limit=1`,
    );
    if (rows[0]) {
      if (
        integrationType === 'api' ||
        rows[0].active_schema_signature === 'legacy-pending-signature'
      ) {
        await this.supabase.update(
          'canonical_integrations',
          `tenant_id=eq.${tenantId}&id=eq.${rows[0].id}`,
          {
            active_schema_signature: signature,
            active_data_contract_id: batch.data_contract_id,
            updated_at: new Date().toISOString(),
          },
        );
        return { ...rows[0], active_schema_signature: signature };
      }
      return rows[0].active_schema_signature === signature
        ? rows[0]
        : { incompatible: true, expected: rows[0].active_schema_signature };
    }
    const [created] = await this.supabase.insert<CanonicalIntegration[]>(
      'canonical_integrations',
      {
        tenant_id: tenantId,
        integration_type: integrationType,
        canonical_source_key: sourceKey,
        dataset_role: datasetRole,
        module_scope: datasetRole === 'deliveries' ? 'transporte' : datasetRole,
        active_data_contract_id: batch.data_contract_id,
        active_schema_signature: signature,
        status: 'active',
      },
    );
    await this.supabase.update(
      'operation_records',
      `tenant_id=eq.${tenantId}&canonical_source_key=eq.${encodeURIComponent(sourceKey)}&canonical_integration_id=is.null&deleted_at=is.null`,
      { canonical_integration_id: created.id },
    );
    return created;
  }
  private async activateBatch(
    tenantId: string,
    integrationId: string,
    newBatchId: string,
    sourceType: string,
  ) {
    await this.supabase.update(
      'operation_records',
      `tenant_id=eq.${tenantId}&canonical_integration_id=eq.${integrationId}&source_staging_batch_id=eq.${newBatchId}&deleted_at=is.null&canonical_validity_status=eq.pending_activation`,
      {
        is_current: true,
        canonical_validity_status: 'valid',
        superseded_at: null,
        superseded_by_staging_batch_id: null,
      },
    );
    if (sourceType === 'api') return;
    await this.supabase.update(
      'operation_records',
      `tenant_id=eq.${tenantId}&canonical_integration_id=eq.${integrationId}&source_staging_batch_id=neq.${newBatchId}&deleted_at=is.null&is_current=eq.true`,
      {
        is_current: false,
        canonical_validity_status: 'superseded',
        superseded_at: new Date().toISOString(),
        superseded_by_staging_batch_id: newBatchId,
      },
    );
  }
  private async assertApiSourceActivationAllowed(
    tenantId: string,
    sourceId: string,
    moduleKey: string,
    entityKey: string,
  ) {
    const source = await this.supabase.select<Array<{ status: string }>>(
      'data_sources',
      `select=status&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`,
    );
    if (!source[0] || !['configuring', 'active'].includes(source[0].status))
      throw new BadRequestException(
        'A integração não está em configuração e não pode ser ativada automaticamente.',
      );
    const modules = await this.supabase.select<
      Array<{ data_source_id: string }>
    >(
      'data_source_modules',
      `select=data_source_id&tenant_id=eq.${tenantId}&module_key=eq.${encodeURIComponent(moduleKey)}&data_source_id=neq.${sourceId}`,
    );
    for (const candidate of modules) {
      const conflicts = await this.supabase.select<Array<{ id: string }>>(
        'data_sources',
        `select=id,data_contracts!inner(id)&tenant_id=eq.${tenantId}&id=eq.${candidate.data_source_id}&status=eq.active&data_contracts.entity_key=eq.${encodeURIComponent(entityKey)}&data_contracts.status=eq.active&limit=1`,
      );
      if (conflicts.length)
        throw new BadRequestException(
          'Já existe uma fonte ativa para este módulo e entidade operacional. Arquive-a antes de ativar esta integração.',
        );
    }
  }
  private async activateApiSource(tenantId: string, sourceId: string) {
    await this.supabase.update(
      'data_sources',
      `tenant_id=eq.${tenantId}&id=eq.${sourceId}&status=eq.configuring`,
      { status: 'active', updated_at: new Date().toISOString() },
    );
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
    _field: string,
    value: unknown,
  ):
    | { ok: true; value: unknown }
    | { ok: false; code: string; message: string; expected: string[] } {
    // Staging already validated controlled values against the contract and its
    // configured De/Para. Never reinterpret legacy text in the native layer.
    return { ok: true, value };
  }

  private defaultFromNotes(mapping: Mapping) {
    const match = mapping.notes && /default=([^;]+)/.exec(mapping.notes);
    return match?.[1] ?? null;
  }
  private parseCanonicalDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return this.dateFromExcelSerial(value);
    }
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^-?\d+(?:[,.]\d+)?$/.test(trimmed)) {
      return this.dateFromExcelSerial(Number(trimmed.replace(',', '.')));
    }

    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return this.validUtcDate(Number(year), Number(month), Number(day));
    }

    const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (brDate) {
      const [, day, month, year] = brDate;
      return this.validUtcDate(Number(year), Number(month), Number(day));
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private dateFromExcelSerial(serial: number): Date | null {
    if (!Number.isFinite(serial)) return null;
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + serial * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private validUtcDate(year: number, month: number, day: number): Date | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? date
      : null;
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
      const d = this.parseCanonicalDate(value);
      return !d
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
