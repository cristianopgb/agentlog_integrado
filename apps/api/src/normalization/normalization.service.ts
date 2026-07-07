import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

type Batch = { id: string; tenant_id: string; data_source_id: string | null; data_contract_id: string | null; status: string; source_reference?: string | null };
type RecordRow = { id: string; tenant_id: string; staging_batch_id: string; validation_status: string; normalized_payload: Record<string, unknown> | null };
type Mapping = { id: string; mapping_type: string; status: string; notes: string | null; data_contract_field: { field_key: string } | null; canonical_field: { field_key: string; data_type: string; is_required: boolean } | null; canonical_entity: { entity_key: string; module_key: string } | null };
type Run = { id: string };

type Counters = { total_records: number; processed_records: number; created_operation_records: number; updated_operation_records: number; created_extension_records: number; updated_extension_records: number; error_records: number };

const nativeEntities = new Set(['operation_records', 'transport_records', 'attendance_records', 'finance_records', 'warehouse_records', 'team_records', 'deliveries', 'Entregas']);
const extensionEntities = new Set(['transport_records', 'attendance_records', 'finance_records', 'warehouse_records', 'team_records']);
const entityEventType: Record<string, string> = { operation_records: 'operation_record', transport_records: 'transport_record', attendance_records: 'attendance_record', finance_records: 'finance_record', warehouse_records: 'warehouse_record', team_records: 'team_record' };
const entityModule: Record<string, string> = { transport_records: 'transporte', attendance_records: 'atendimento', finance_records: 'financeiro', warehouse_records: 'armazem', team_records: 'equipes' };
const allowedStatuses = new Set(['validated', 'partially_valid']);
const operationColumns = new Set(['external_id','external_code','source_system','module_origin','record_type','document_number','document_type','cte_number','cte_key','invoice_number','invoice_key','manifest_number','order_number','delivery_number','customer_name','customer_document','shipper_name','shipper_document','recipient_name','recipient_document','payer_name','payer_document','origin_city','origin_state','destination_city','destination_state','vehicle_plate','driver_name','driver_document','status','status_updated_at','occurrence_status','last_event_at','gross_weight','cubed_weight','volume_count','total_value','freight_value','issued_at','expected_date','completed_at','data_quality_status']);
const extensionColumns: Record<string, Set<string>> = {
  transport_records: new Set(['transport_status','route_name','trip_number','vehicle_type','driver_phone','collected_at','delivered_at','delivery_performance_status','sla_status','cost_center']),
  attendance_records: new Set(['ticket_number','channel','subject','description','occurrence_code','occurrence_type','occurrence_reason','priority','attendance_status','assigned_to','opened_at','first_response_at','last_interaction_at','resolved_at','closed_at','sla_due_at']),
  finance_records: new Set(['billing_reference','billing_period','billing_status','proof_of_delivery_status','proof_received_at','ready_to_bill','blocked_amount','block_status','block_reason','extra_cost_value','discount_value','total_amount','due_at','paid_at']),
  warehouse_records: new Set(['product_code','sku','product_name','warehouse_code','warehouse_name','location_code','batch_number','serial_number','quantity_available','quantity_reserved','quantity_blocked','unit_of_measure','last_movement_type','last_movement_at','warehouse_status']),
  team_records: new Set(['employee_code','employee_name','employee_document','email','phone','department_name','position_name','manager_name','team_status','admission_date','termination_date','shift_name','workload_hours','overtime_hours','worked_at']),
};
const aliases: Record<string, string> = { delivery_status: 'status', expected_delivery_date: 'expected_date', delivered_at: 'completed_at' };

@Injectable()
export class NormalizationService {
  constructor(private readonly supabase: SupabaseService) {}

  listRuns(tenantId: string) { return this.supabase.select('normalization_runs', `select=*,normalization_errors(*)&tenant_id=eq.${tenantId}&order=created_at.desc`); }
  async getRun(tenantId: string, runId: string) { const rows = await this.supabase.select<unknown[]>('normalization_runs', `select=*,normalization_errors(*)&tenant_id=eq.${tenantId}&id=eq.${runId}&limit=1`); if (!rows.length) throw new NotFoundException('Normalization run not found.'); return rows[0]; }

  async normalizeBatch(tenantId: string, batchId: string, userId: string) {
    const batch = await this.getBatch(tenantId, batchId);
    if (!allowedStatuses.has(batch.status)) throw new BadRequestException('Staging batch must be validated before normalization.');
    const [run] = await this.supabase.insert<Run[]>('normalization_runs', { tenant_id: tenantId, staging_batch_id: batchId, data_source_id: batch.data_source_id, data_contract_id: batch.data_contract_id, status: 'running', started_at: new Date().toISOString(), created_by: userId });
    const counters: Counters = { total_records: 0, processed_records: 0, created_operation_records: 0, updated_operation_records: 0, created_extension_records: 0, updated_extension_records: 0, error_records: 0 };
    const errorSummary: Record<string, number> = {};
    const addError = async (code: string, message: string, details: Record<string, unknown> = {}, recordId?: string | null, mapping?: Mapping) => { counters.error_records += 1; errorSummary[code] = (errorSummary[code] ?? 0) + 1; await this.supabase.insert('normalization_errors', { tenant_id: tenantId, normalization_run_id: run.id, staging_batch_id: batchId, staging_record_id: recordId ?? null, field_mapping_id: mapping?.id ?? null, canonical_entity_key: mapping?.canonical_entity?.entity_key ?? null, canonical_field_key: mapping?.canonical_field?.field_key ?? null, error_code: code, error_message: message, details }); };
    try {
      const mappings = await this.getMappings(tenantId, batch.data_contract_id);
      if (!mappings.length) { await addError('NO_FIELD_MAPPINGS', 'Não há field_mappings ativos para o contrato do lote.'); return this.finish(run.id, 'failed', counters, errorSummary); }
      const records = await this.getValidRecords(tenantId, batchId);
      counters.total_records = records.length;
      if (!records.length) { await addError('NO_VALID_RECORDS', 'Não há staging_records válidos com normalized_payload para normalizar.'); return this.finish(run.id, 'failed', counters, errorSummary); }
      const enabledModules = await this.getEnabledModules(tenantId);
      for (const record of records) {
        const buckets: Record<string, Record<string, unknown>> = { operation_records: {} };
        let partial = false;
        for (const mapping of mappings) {
          const entityKey = mapping.canonical_entity?.entity_key;
          const fieldKey = mapping.canonical_field?.field_key;
          if (!entityKey || !nativeEntities.has(entityKey) || !mapping.canonical_field || !mapping.data_contract_field) { await addError('INVALID_CANONICAL_ENTITY', 'Entidade ou campo canônico inválido para normalização.', {}, record.id, mapping); continue; }
          if (mapping.mapping_type === 'ignored') continue;
          if (mapping.mapping_type === 'transformed') { await addError('INVALID_CANONICAL_FIELD', 'Transformação livre não é executada nesta sprint.', {}, record.id, mapping); continue; }
          const rawValue = mapping.mapping_type === 'default_value' ? this.defaultFromNotes(mapping) : record.normalized_payload?.[mapping.data_contract_field.field_key];
          if ((rawValue === undefined || rawValue === null || rawValue === '') && mapping.canonical_field.is_required) { partial = true; await addError('REQUIRED_VALUE_MISSING', 'Valor obrigatório ausente.', { contract_field_key: mapping.data_contract_field.field_key }, record.id, mapping); continue; }
          if (rawValue === undefined || rawValue === null || rawValue === '') continue;
          const converted = this.convertValue(rawValue, mapping.canonical_field.data_type);
          if (!converted.ok) { await addError('INVALID_VALUE_TYPE', 'Valor não pôde ser convertido para o tipo canônico.', { value: rawValue, data_type: mapping.canonical_field.data_type }, record.id, mapping); continue; }
          const targetEntity = entityKey === 'deliveries' || entityKey === 'Entregas' ? 'operation_records' : entityKey;
          const targetField = aliases[fieldKey as string] ?? fieldKey;
          if (targetEntity === 'operation_records') { if (operationColumns.has(targetField)) buckets.operation_records[targetField] = converted.value; else await addError('INVALID_CANONICAL_FIELD', 'Campo não pertence à base operacional nativa.', { field_key: fieldKey }, record.id, mapping); }
          else { if (!enabledModules.has(entityModule[targetEntity])) { await addError('MODULE_NOT_ENABLED', 'Módulo da extensão não está habilitado para o tenant.', { module_key: entityModule[targetEntity] }, record.id, mapping); continue; } if (extensionColumns[targetEntity]?.has(targetField)) buckets[targetEntity] = { ...(buckets[targetEntity] ?? {}), [targetField]: converted.value }; else await addError('INVALID_CANONICAL_FIELD', 'Campo não pertence à extensão nativa.', { field_key: fieldKey }, record.id, mapping); }
        }
        if (Object.keys(buckets.operation_records).length === 0 && Object.keys(buckets).some((key) => key !== 'operation_records')) { partial = true; await addError('MISSING_OPERATION_RECORD', 'Extensão mapeada sem campos do núcleo; operation_record mínimo será criado.', {}, record.id); }
        const op = await this.upsertOperation(tenantId, batch, record, buckets.operation_records, partial);
        counters[op.created ? 'created_operation_records' : 'updated_operation_records'] += 1;
        await this.event(tenantId, 'operation_records', op.id, op.created, batch, record, userId);
        for (const entity of Object.keys(buckets).filter((key) => extensionEntities.has(key) && Object.keys(buckets[key]).length)) {
          const ext = await this.upsertExtension(entity, tenantId, op.id, buckets[entity]);
          counters[ext.created ? 'created_extension_records' : 'updated_extension_records'] += 1;
          await this.event(tenantId, entity, ext.id, ext.created, batch, record, userId);
        }
        counters.processed_records += 1;
      }
      return this.finish(run.id, counters.error_records ? 'completed_with_errors' : 'completed', counters, errorSummary);
    } catch (error) {
      await addError('UNKNOWN_ERROR', error instanceof Error ? error.message : 'Erro desconhecido.');
      return this.finish(run.id, 'failed', counters, errorSummary);
    }
  }

  private async finish(runId: string, status: string, counters: Counters, errorSummary: Record<string, number>) { const [row] = await this.supabase.update<unknown[]>('normalization_runs', `id=eq.${runId}`, { ...counters, status, error_summary: errorSummary, finished_at: new Date().toISOString() }); return row; }
  private async getBatch(tenantId: string, batchId: string) { const rows = await this.supabase.select<Batch[]>('staging_batches', `select=id,tenant_id,data_source_id,data_contract_id,status,source_reference&tenant_id=eq.${tenantId}&id=eq.${batchId}&limit=1`); if (!rows.length) throw new NotFoundException('Staging batch not found.'); return rows[0]; }
  private getValidRecords(tenantId: string, batchId: string) { return this.supabase.select<RecordRow[]>('staging_records', `select=id,tenant_id,staging_batch_id,validation_status,normalized_payload&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&validation_status=eq.valid&normalized_payload=not.is.null&order=row_number.asc`); }
  private getMappings(tenantId: string, contractId: string | null) { if (!contractId) return []; return this.supabase.select<Mapping[]>('field_mappings', `select=id,mapping_type,status,notes,data_contract_field:data_contract_fields(field_key),canonical_field:canonical_fields(field_key,data_type,is_required),canonical_entity:canonical_entities(entity_key,module_key)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&status=eq.active`); }
  private async getEnabledModules(tenantId: string) { const rows = await this.supabase.select<Array<{ module: { key: string } }>>('tenant_modules', `select=module:modules(key)&tenant_id=eq.${tenantId}&is_active=eq.true`); return new Set(['core', ...rows.map((row) => row.module.key)]); }
  private async upsertOperation(tenantId: string, batch: Batch, record: RecordRow, values: Record<string, unknown>, partial: boolean) { const base = { ...values, tenant_id: tenantId, source_data_source_id: batch.data_source_id, source_data_contract_id: batch.data_contract_id, source_staging_batch_id: batch.id, source_staging_record_id: record.id, source_system: batch.source_reference ?? 'staging', source_payload_hash: createHash('sha256').update(JSON.stringify(record.normalized_payload ?? {})).digest('hex'), data_quality_status: partial ? 'partial' : String(values.data_quality_status ?? 'valid') }; const existing = await this.findOperation(tenantId, base); if (existing) { const [row] = await this.supabase.update<Array<{ id: string }>>('operation_records', `tenant_id=eq.${tenantId}&id=eq.${existing.id}`, base); return { id: row.id, created: false }; } const [row] = await this.supabase.insert<Array<{ id: string }>>('operation_records', base); return { id: row.id, created: true }; }
  private async findOperation(tenantId: string, v: Record<string, unknown>) { const queries = [`source_staging_record_id=eq.${v.source_staging_record_id}`, v.external_id && v.source_data_source_id ? `external_id=eq.${v.external_id}&source_data_source_id=eq.${v.source_data_source_id}` : '', v.cte_key ? `cte_key=eq.${v.cte_key}` : '', v.invoice_key ? `invoice_key=eq.${v.invoice_key}` : '', v.delivery_number && v.customer_document ? `delivery_number=eq.${v.delivery_number}&customer_document=eq.${v.customer_document}` : ''].filter(Boolean); for (const q of queries) { const rows = await this.supabase.select<Array<{ id: string }>>('operation_records', `select=id&tenant_id=eq.${tenantId}&${q}&limit=1`); if (rows.length) return rows[0]; } return null; }
  private async upsertExtension(entity: string, tenantId: string, operationRecordId: string, values: Record<string, unknown>) { const rows = await this.supabase.select<Array<{ id: string }>>(entity, `select=id&tenant_id=eq.${tenantId}&operation_record_id=eq.${operationRecordId}&limit=1`); const payload = { ...values, tenant_id: tenantId, operation_record_id: operationRecordId }; if (rows.length) { const [row] = await this.supabase.update<Array<{ id: string }>>(entity, `tenant_id=eq.${tenantId}&id=eq.${rows[0].id}`, payload); return { id: row.id, created: false }; } const [row] = await this.supabase.insert<Array<{ id: string }>>(entity, payload); return { id: row.id, created: true }; }
  private event(tenantId: string, entity: string, id: string, created: boolean, batch: Batch, record: RecordRow, userId: string) { return this.supabase.insert('entity_events', { tenant_id: tenantId, entity_type: entityEventType[entity], entity_id: id, event_type: created ? 'normalized_created' : 'normalized_updated', event_title: created ? 'Registro normalizado criado' : 'Registro normalizado atualizado', event_description: 'Normalização determinística a partir de staging validado.', occurred_at: new Date().toISOString(), actor_user_id: userId, source_data_source_id: batch.data_source_id, source_staging_record_id: record.id }); }
  private defaultFromNotes(mapping: Mapping) { const match = mapping.notes && /default=([^;]+)/.exec(mapping.notes); return match?.[1] ?? null; }
  private convertValue(value: unknown, dataType: string): { ok: true; value: unknown } | { ok: false } { if (dataType === 'text' || dataType === 'enum') return { ok: true, value: String(value) }; if (dataType === 'integer') { const n = Number(value); return Number.isInteger(n) ? { ok: true, value: n } : { ok: false }; } if (dataType === 'decimal') { const n = Number(value); return Number.isFinite(n) ? { ok: true, value: n } : { ok: false }; } if (dataType === 'boolean') { if (typeof value === 'boolean') return { ok: true, value }; if (value === 'true' || value === '1') return { ok: true, value: true }; if (value === 'false' || value === '0') return { ok: true, value: false }; return { ok: false }; } if (dataType === 'date' || dataType === 'datetime') { const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: dataType === 'date' ? d.toISOString().slice(0, 10) : d.toISOString() }; } if (dataType === 'json') return { ok: true, value }; return { ok: false }; }
}
