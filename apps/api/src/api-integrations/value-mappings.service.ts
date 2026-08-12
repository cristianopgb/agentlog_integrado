import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { clearInvalidRecordStates } from './invalid-record-states';
import { CanonicalValueDomainsService } from '../canonical/canonical-value-domains.service';

type JsonRecord = Record<string, unknown>;
type ControlledField = { id: string; field_key: string; data_type: string; is_required: boolean };
type SourceMapping = {
  source_field_name: string;
  data_contract_field_id: string;
};
type SpreadsheetMapping = {
  data_contract_field_id: string;
  data_contract_field: { source_field_name: string } | null;
};
export type ActiveValueMapping = {
  data_contract_field_id: string;
  source_field_name: string;
  source_value: string;
  target_value: string;
  status: 'active' | 'ignored_value';
};

@Injectable()
export class ValueMappingsService {
  constructor(private readonly db: SupabaseService, private readonly canonicalDomains: CanonicalValueDomainsService) {}

  async list(tenantId: string, sourceId: string) {
    const contract = await this.contract(tenantId, sourceId);
    let [
      fields,
      sourceMappings,
      allowed,
      configured,
      configs,
      staging,
      mappingErrors,
    ] = await Promise.all([
      this.db.select<ControlledField[]>(
        'data_contract_fields',
        `select=id,field_key,data_type,is_required&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}`,
      ),
      this.sourceMappings(tenantId, sourceId, contract.id),
      this.db.select<Array<{ data_contract_field_id: string; value: string }>>(
        'data_contract_allowed_values',
        `select=data_contract_field_id,value&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&is_active=eq.true&order=sort_order.asc`,
      ),
      this.active(tenantId, sourceId),
      this.db.select<Array<{ sample_preview: JsonRecord[] }>>(
        'data_source_api_configs',
        `select=sample_preview&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`,
      ),
      this.db.select<Array<{ raw_payload: JsonRecord }>>(
        'staging_records',
        `select=raw_payload,staging_batch:staging_batches!staging_records_batch_tenant_fk!inner(data_source_id)&tenant_id=eq.${tenantId}&staging_batch.data_source_id=eq.${sourceId}&order=created_at.desc&limit=200`,
      ),
      this.db.select<
        Array<{
          source_field_name: string | null;
          raw_value: string | null;
          staging_record: { raw_payload: JsonRecord } | null;
        }>
      >(
        'staging_errors',
        `select=source_field_name,raw_value,staging_record:staging_records!staging_errors_record_tenant_fk(raw_payload),staging_batch:staging_batches!staging_errors_batch_tenant_fk!inner(data_source_id)&tenant_id=eq.${tenantId}&staging_batch.data_source_id=eq.${sourceId}&error_code=eq.VALUE_MAPPING_REQUIRED&order=created_at.desc&limit=200`,
      ),
    ]);
    const resolved = await this.canonicalLabels(tenantId, contract.id);
    for (const source of sourceMappings) {
      const canonical = resolved.get(source.data_contract_field_id);
      if (canonical) await this.canonicalDomains.ensureAllowedValues(tenantId, contract.id, source.data_contract_field_id, String(canonical.canonical_entity_key), String(canonical.canonical_field_key));
    }
    allowed = await this.db.select<Array<{ data_contract_field_id: string; value: string }>>('data_contract_allowed_values', `select=data_contract_field_id,value&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&is_active=eq.true&order=sort_order.asc`);
    const values = [
      ...(configs[0]?.sample_preview ?? []),
      ...staging.map((row) => row.raw_payload),
    ];
    return sourceMappings.flatMap((source) => {
      const field = fields.find(
        (item) => item.id === source.data_contract_field_id,
      );
      const allowedValues = allowed
        .filter(
          (item) =>
            item.data_contract_field_id === source.data_contract_field_id,
        )
        .map((item) => item.value);
      if (!field || (field.data_type !== 'enum' && !allowedValues.length))
        return [];
      const errorValues = mappingErrors.flatMap((error) => {
        if (error.source_field_name !== source.source_field_name) return [];
        const fromPayload =
          error.staging_record?.raw_payload?.[source.source_field_name];
        return [error.raw_value, fromPayload]
          .filter(
            (value): value is string | number | boolean =>
              value !== null && value !== undefined,
          )
          .map(String);
      });
      const distinct = [
        ...new Set([
          ...values
            .filter(
              (row) =>
                Object.hasOwn(row, source.source_field_name) &&
                row[source.source_field_name] != null,
            )
            .map((row) => String(row[source.source_field_name])),
          ...errorValues,
        ]),
      ];
      return distinct.map((sourceValue) => {
        const mapping = configured.find(
          (item) =>
            item.data_contract_field_id === field.id &&
            item.source_field_name === source.source_field_name &&
            item.source_value === sourceValue,
        );
        return {
          source_field_name: source.source_field_name,
          data_contract_field_id: field.id,
          field_key: field.field_key,
          is_required: field.is_required || ['operation_records__delivery_number','deliveries__delivery_number','numero_entrega','documento_operacional'].includes(field.field_key),
          ...resolved.get(field.id),
          source_value: sourceValue,
          target_value:
            mapping?.status === 'active' ? mapping.target_value :
            (allowedValues.includes(sourceValue) ? sourceValue : null),
          allowed_values: allowedValues,
          status: mapping
            ? mapping.status === 'active' ? 'mapped' : 'ignored_value'
            : allowedValues.includes(sourceValue)
              ? 'exact_match'
              : 'pending',
        };
      });
    });
  }

  private async canonicalLabels(tenantId: string, contractId: string) {
    const mappings = await this.db.select<Array<{data_contract_field_id:string;canonical_entity_id:string;canonical_field_id:string}>>('field_mappings', `select=data_contract_field_id,canonical_entity_id,canonical_field_id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&status=eq.active`);
    const result = new Map<string,Record<string,unknown>>();
    for (const mapping of mappings) {
      const [entities, fields] = await Promise.all([
        this.db.select<Array<{entity_key:string;name:string}>>('canonical_entities', `select=entity_key,name&tenant_id=eq.${tenantId}&id=eq.${mapping.canonical_entity_id}&limit=1`),
        this.db.select<Array<{field_key:string;name:string}>>('canonical_fields', `select=field_key,name&tenant_id=eq.${tenantId}&id=eq.${mapping.canonical_field_id}&limit=1`),
      ]);
      if (entities[0] && fields[0]) result.set(mapping.data_contract_field_id,{canonical_entity_id:mapping.canonical_entity_id,canonical_field_id:mapping.canonical_field_id,canonical_entity_key:entities[0].entity_key,canonical_field_key:fields[0].field_key,canonical_entity_name:entities[0].name,canonical_field_name:fields[0].name,canonical_label:`${entities[0].name} / ${fields[0].name}`});
    }
    return result;
  }

  async save(
    tenantId: string,
    sourceId: string,
    userId: string,
    body: {
      mappings?: Array<{
        source_field_name?: string;
        data_contract_field_id?: string;
        source_value?: string;
        target_value?: string | null;
        decision?: 'mapped' | 'ignored_value' | 'ignored_field';
      }>;
    },
  ) {
    const contract = await this.contract(tenantId, sourceId);
    const sourceMappings = await this.sourceMappings(
      tenantId,
      sourceId,
      contract.id,
    );
    const requested = body.mappings ?? [];
    if (!requested.length)
      throw new BadRequestException('Informe ao menos um De/Para.');
    const keys = new Set<string>();
    for (const item of requested) {
      if (
        !item.source_field_name ||
        !item.data_contract_field_id ||
        (item.decision !== 'ignored_field' && (item.source_value == null || item.source_value === ''))
      )
        throw new BadRequestException('De/Para incompleto.');
      if (
        !sourceMappings.some(
          (mapping) =>
            mapping.source_field_name === item.source_field_name &&
            mapping.data_contract_field_id === item.data_contract_field_id,
        )
      )
        throw new BadRequestException(
          'Campo recebido não está pareado ao campo nativo informado.',
        );
      if (item.decision === 'ignored_field') {
        const field = await this.db.select<Array<{is_required:boolean;field_key:string}>>('data_contract_fields', `select=is_required,field_key&tenant_id=eq.${tenantId}&id=eq.${item.data_contract_field_id}&limit=1`);
        const essential = field[0]?.is_required || ['operation_records__delivery_number','deliveries__delivery_number','numero_entrega','documento_operacional'].includes(field[0]?.field_key ?? '');
        if (essential) throw new BadRequestException('Campo obrigatório mínimo não pode ser ignorado.');
      } else if (item.decision !== 'ignored_value' && item.target_value) {
        const allowed = await this.db.select<unknown[]>(
          'data_contract_allowed_values',
          `select=id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&data_contract_field_id=eq.${item.data_contract_field_id}&value=eq.${encodeURIComponent(item.target_value)}&is_active=eq.true&limit=1`,
        );
        if (!allowed.length)
          throw new BadRequestException(
            'target_value não pertence aos valores permitidos do campo nativo.',
          );
      }
      const key = `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`;
      if (keys.has(key))
        throw new BadRequestException('De/Para duplicado na solicitação.');
      keys.add(key);
    }
    for (const item of requested) {
      if (item.decision === 'ignored_field') {
        await this.db.update('data_source_api_field_mappings', `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_field_id=eq.${item.data_contract_field_id}&source_field_name=eq.${encodeURIComponent(item.source_field_name!)}`, { status: 'ignored_field', ignored_by: userId, ignored_at: new Date().toISOString() });
        continue;
      }
      if (item.decision === 'ignored_value') {
        await this.db.upsert('data_source_value_mappings', { tenant_id: tenantId, data_source_id: sourceId, data_contract_id: contract.id, data_contract_field_id: item.data_contract_field_id!, source_field_name: item.source_field_name!, source_value: item.source_value!, target_value: null, status: 'ignored_value', revoked_at: null, created_by: userId }, 'tenant_id,data_source_id,data_contract_field_id,source_field_name,source_value');
        continue;
      }
      if (!item.target_value) {
        await this.db.update(
          'data_source_value_mappings',
          `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_field_id=eq.${item.data_contract_field_id}&source_field_name=eq.${encodeURIComponent(item.source_field_name!)}&source_value=eq.${encodeURIComponent(item.source_value!)}`,
          { status: 'revoked', revoked_at: new Date().toISOString() },
        );
        continue;
      }
      await this.db.upsert(
        'data_source_value_mappings',
        {
          tenant_id: tenantId,
          data_source_id: sourceId,
          data_contract_id: contract.id,
          data_contract_field_id: item.data_contract_field_id!,
          source_field_name: item.source_field_name!,
          source_value: item.source_value!,
          target_value: item.target_value,
          status: 'active',
          revoked_at: null,
          created_by: userId,
        },
        'tenant_id,data_source_id,data_contract_field_id,source_field_name,source_value',
      );
    }
    await clearInvalidRecordStates(this.db, tenantId, sourceId);
    return this.list(tenantId, sourceId);
  }

  active(tenantId: string, sourceId: string) {
    return this.db.select<ActiveValueMapping[]>(
      'data_source_value_mappings',
      `select=data_contract_field_id,source_field_name,source_value,target_value,status&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=in.(active,ignored_value)`,
    );
  }

  private async sourceMappings(
    tenantId: string,
    sourceId: string,
    contractId: string,
  ): Promise<SourceMapping[]> {
    const api = await this.db.select<SourceMapping[]>(
      'data_source_api_field_mappings',
      `select=source_field_name,data_contract_field_id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_id=eq.${contractId}&status=eq.active`,
    );
    if (api.length) return api;
    const spreadsheet = await this.db.select<SpreadsheetMapping[]>(
      'field_mappings',
      `select=data_contract_field_id,data_contract_field:data_contract_fields!field_mappings_contract_field_tenant_fk(source_field_name)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&status=eq.active`,
    );
    return spreadsheet
      .filter((mapping) => mapping.data_contract_field)
      .map((mapping) => ({
        data_contract_field_id: mapping.data_contract_field_id,
        source_field_name: mapping.data_contract_field!.source_field_name,
      }));
  }
  private async contract(tenantId: string, sourceId: string) {
    const rows = await this.db.select<Array<{ id: string }>>(
      'data_contracts',
      `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=eq.active&order=contract_version.desc&limit=1`,
    );
    if (!rows[0])
      throw new BadRequestException('Contrato nativo ativo não encontrado.');
    return rows[0];
  }
}
