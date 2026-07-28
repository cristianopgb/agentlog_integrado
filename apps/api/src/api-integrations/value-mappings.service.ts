import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { clearInvalidRecordStates } from './invalid-record-states';

type JsonRecord = Record<string, unknown>;
type ControlledField = { id: string; field_key: string; data_type: string };
type SourceMapping = { source_field_name: string; data_contract_field_id: string };
type SpreadsheetMapping = { data_contract_field_id: string; data_contract_field: { source_field_name: string } | null };
export type ActiveValueMapping = { data_contract_field_id: string; source_field_name: string; source_value: string; target_value: string };

@Injectable()
export class ValueMappingsService {
  constructor(private readonly db: SupabaseService) {}

  async list(tenantId: string, sourceId: string) {
    const contract = await this.contract(tenantId, sourceId);
    const [fields, sourceMappings, allowed, configured, configs, staging] = await Promise.all([
      this.db.select<ControlledField[]>('data_contract_fields', `select=id,field_key,data_type&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}`),
      this.sourceMappings(tenantId, sourceId, contract.id),
      this.db.select<Array<{ data_contract_field_id: string; value: string }>>('data_contract_allowed_values', `select=data_contract_field_id,value&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&is_active=eq.true&order=sort_order.asc`),
      this.active(tenantId, sourceId),
      this.db.select<Array<{ sample_preview: JsonRecord[] }>>('data_source_api_configs', `select=sample_preview&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`),
      this.db.select<Array<{ raw_payload: JsonRecord }>>('staging_records', `select=raw_payload,staging_batch:staging_batches!staging_records_batch_tenant_fk!inner(data_source_id)&tenant_id=eq.${tenantId}&staging_batch.data_source_id=eq.${sourceId}&order=created_at.desc&limit=200`),
    ]);
    const values = [...(configs[0]?.sample_preview ?? []), ...staging.map((row) => row.raw_payload)];
    return sourceMappings.flatMap((source) => {
      const field = fields.find((item) => item.id === source.data_contract_field_id);
      const allowedValues = allowed.filter((item) => item.data_contract_field_id === source.data_contract_field_id).map((item) => item.value);
      if (!field || (field.data_type !== 'enum' && !allowedValues.length)) return [];
      const distinct = [...new Set(values.filter((row) => Object.hasOwn(row, source.source_field_name) && row[source.source_field_name] != null).map((row) => String(row[source.source_field_name])))];
      return distinct.map((sourceValue) => {
        const mapping = configured.find((item) => item.data_contract_field_id === field.id && item.source_field_name === source.source_field_name && item.source_value === sourceValue);
        return { source_field_name: source.source_field_name, data_contract_field_id: field.id, field_key: field.field_key, source_value: sourceValue, target_value: mapping?.target_value ?? (allowedValues.includes(sourceValue) ? sourceValue : null), allowed_values: allowedValues, status: mapping ? 'mapped' : allowedValues.includes(sourceValue) ? 'exact_match' : 'pending' };
      });
    });
  }

  async save(tenantId: string, sourceId: string, userId: string, body: { mappings?: Array<{ source_field_name?: string; data_contract_field_id?: string; source_value?: string; target_value?: string | null }> }) {
    const contract = await this.contract(tenantId, sourceId);
    const sourceMappings = await this.sourceMappings(tenantId, sourceId, contract.id);
    const requested = body.mappings ?? [];
    if (!requested.length) throw new BadRequestException('Informe ao menos um De/Para.');
    const keys = new Set<string>();
    for (const item of requested) {
      if (!item.source_field_name || !item.data_contract_field_id || item.source_value == null || item.source_value === '') throw new BadRequestException('De/Para incompleto.');
      if (!sourceMappings.some((mapping) => mapping.source_field_name === item.source_field_name && mapping.data_contract_field_id === item.data_contract_field_id)) throw new BadRequestException('Campo recebido não está pareado ao campo nativo informado.');
      if (item.target_value) {
        const allowed = await this.db.select<unknown[]>('data_contract_allowed_values', `select=id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&data_contract_field_id=eq.${item.data_contract_field_id}&value=eq.${encodeURIComponent(item.target_value)}&is_active=eq.true&limit=1`);
        if (!allowed.length) throw new BadRequestException('target_value não pertence aos valores permitidos do campo nativo.');
      }
      const key = `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`;
      if (keys.has(key)) throw new BadRequestException('De/Para duplicado na solicitação.');
      keys.add(key);
    }
    for (const item of requested) {
      if (!item.target_value) {
        await this.db.update('data_source_value_mappings', `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_field_id=eq.${item.data_contract_field_id}&source_field_name=eq.${encodeURIComponent(item.source_field_name!)}&source_value=eq.${encodeURIComponent(item.source_value!)}`, { status: 'revoked', revoked_at: new Date().toISOString() });
        continue;
      }
      await this.db.upsert('data_source_value_mappings', { tenant_id: tenantId, data_source_id: sourceId, data_contract_id: contract.id, data_contract_field_id: item.data_contract_field_id!, source_field_name: item.source_field_name!, source_value: item.source_value!, target_value: item.target_value, status: 'active', revoked_at: null, created_by: userId }, 'tenant_id,data_source_id,data_contract_field_id,source_field_name,source_value');
    }
    await clearInvalidRecordStates(this.db, tenantId, sourceId);
    return this.list(tenantId, sourceId);
  }

  active(tenantId: string, sourceId: string) { return this.db.select<ActiveValueMapping[]>('data_source_value_mappings', `select=data_contract_field_id,source_field_name,source_value,target_value&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=eq.active`); }

  private async sourceMappings(tenantId: string, sourceId: string, contractId: string): Promise<SourceMapping[]> {
    const api = await this.db.select<SourceMapping[]>('data_source_api_field_mappings', `select=source_field_name,data_contract_field_id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_id=eq.${contractId}&status=eq.active`);
    if (api.length) return api;
    const spreadsheet = await this.db.select<SpreadsheetMapping[]>('field_mappings', `select=data_contract_field_id,data_contract_field:data_contract_fields!field_mappings_contract_field_tenant_fk(source_field_name)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&status=eq.active`);
    return spreadsheet.filter((mapping) => mapping.data_contract_field).map((mapping) => ({ data_contract_field_id: mapping.data_contract_field_id, source_field_name: mapping.data_contract_field!.source_field_name }));
  }
  private async contract(tenantId: string, sourceId: string) { const rows = await this.db.select<Array<{ id: string }>>('data_contracts', `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=eq.active&order=contract_version.desc&limit=1`); if (!rows[0]) throw new BadRequestException('Contrato nativo ativo não encontrado.'); return rows[0]; }
}
