import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { ApiConnectorConfigService } from './api-connector-config.service';
import { ApiConfig } from './api-connector.types';
import { ValueMappingsService } from './value-mappings.service';
import { FieldParseRulesService } from './field-parse-rules.service';
import { parseFieldValue, ParseRule } from './field-value-parser';

type JsonRecord = Record<string, unknown>;
type FetchResult = {
  records: JsonRecord[];
  status: number;
  fields: string[];
  cursor: string | null;
};
type ContractField = {
  id: string;
  source_field_name: string;
  field_key: string;
  data_type: string;
  is_required: boolean;
  allow_null: boolean;
};
type ApiMapping = {
  id: string;
  api_source_field_name: string;
  data_contract_field_id: string;
  data_contract_field: ContractField;
};
type ApiContract = { id: string; entity_key: string };
type InsertedRecord = { id: string; row_number: number };
type StagingErrorPreview = {
  id: string;
  error_code: string;
  source_field_name: string | null;
  field_key: string | null;
  message: string;
  raw_value: string | null;
  staging_record: { row_number: number } | null;
};

@Injectable()
export class ApiConnectorSyncService {
  constructor(
    private readonly db: SupabaseService,
    private readonly configs: ApiConnectorConfigService,
    private readonly valueMappings: ValueMappingsService,
    private readonly fieldFormats: FieldParseRulesService,
  ) {}

  async test(tenantId: string, sourceId: string) {
    const result = await this.fetch(
      await this.requiredConfig(tenantId, sourceId),
      true,
    );
    return {
      ok: true,
      http_status: result.status,
      record_count: result.records.length,
      fields: result.fields,
      sample: result.records.slice(0, 5),
    };
  }

  async sample(tenantId: string, sourceId: string) {
    const config = await this.requiredConfig(tenantId, sourceId);
    const result = await this.fetch(config, true);
    const preview = result.records.slice(0, 5);
    await this.db.update(
      'data_source_api_configs',
      `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`,
      {
        detected_fields: result.fields,
        // The visual preview stays deliberately small, but De/Para needs the
        // complete bounded sample to discover controlled values before sync.
        sample_preview: result.records,
        sample_http_status: result.status,
      },
    );
    return {
      fields: result.fields,
      sample: preview,
      http_status: result.status,
    };
  }

  async listApiMappings(tenantId: string, sourceId: string) {
    const contract = await this.contract(tenantId, sourceId);
    const apiMappings=await this.db.select<Array<Record<string,unknown>>>(
      'data_source_api_field_mappings',
      `select=id,api_source_field_name:source_field_name,data_contract_field_id,status&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_id=eq.${contract.id}&status=eq.active&order=created_at.asc`,
    );
    if(!apiMappings.length)return [];
    const contractFieldIds=apiMappings.map(row=>String(row.data_contract_field_id));
    const mappings=await this.db.select<Array<Record<string,unknown>>>('field_mappings',`select=data_contract_field_id,canonical_entity_id,canonical_field_id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&data_contract_field_id=in.(${contractFieldIds.join(',')})&status=eq.active`);
    if(!mappings.length)return apiMappings;
    const entityIds=[...new Set(mappings.map(row=>String(row.canonical_entity_id)))];
    const fieldIds=[...new Set(mappings.map(row=>String(row.canonical_field_id)))];
    const [entities,canonicalFields]=await Promise.all([
      this.db.select<Array<{id:string;entity_key:string;name:string}>>('canonical_entities',`select=id,entity_key,name&tenant_id=eq.${tenantId}&id=in.(${entityIds.join(',')})`),
      this.db.select<Array<{id:string;field_key:string;name:string}>>('canonical_fields',`select=id,field_key,name&tenant_id=eq.${tenantId}&id=in.(${fieldIds.join(',')})`),
    ]);
    return apiMappings.map(apiMapping=>{
      const mapping=mappings.find(row=>row.data_contract_field_id===apiMapping.data_contract_field_id);
      if(!mapping)return apiMapping;
      const entity=entities.find(row=>row.id===mapping.canonical_entity_id);
      const field=canonicalFields.find(row=>row.id===mapping.canonical_field_id);
      return {...apiMapping,canonical_entity_id:mapping.canonical_entity_id,canonical_field_id:mapping.canonical_field_id,canonical_entity_key:entity?.entity_key??null,canonical_field_key:field?.field_key??null,canonical_entity_name:entity?.name??null,canonical_field_name:field?.name??null,label:entity&&field?`${entity.name} / ${field.name}`:null};
    });
  }

  async saveApiMappings(
    tenantId: string,
    sourceId: string,
    userId: string,
    body: {
      mappings?: Array<{
        source_field_name?: string;
        data_contract_field_id?: string;
        canonical_entity_id?: string;
        canonical_field_id?: string;
      }>;
    },
  ) {
    const contract = await this.contract(tenantId, sourceId);
    const config = await this.requiredConfig(tenantId, sourceId);
    const detected = new Set(config.detected_fields ?? []);
    const fields = await this.db.select<ContractField[]>(
      'data_contract_fields',
      `select=id,source_field_name,field_key,data_type,is_required,allow_null&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}`,
    );
    const fieldIds = new Set(fields.map((field) => field.id));
    const requested = body.mappings ?? [];
    if (!requested.length)
      throw new BadRequestException(
        'Pareie pelo menos um campo da API antes de confirmar.',
      );
    if (requested.some((item) => !item.source_field_name || !detected.has(item.source_field_name) || (!item.data_contract_field_id && !(item.canonical_entity_id&&item.canonical_field_id))))
      throw new BadRequestException(
        'Pareamento contém campo não detectado ou fora do contrato nativo.',
      );
    for(const item of requested.filter(item=>!item.data_contract_field_id)){
      const canonical=await this.db.select<Array<{id:string;canonical_entity_id:string;field_key:string;data_type:string;is_required:boolean}>>('canonical_fields',`select=id,canonical_entity_id,field_key,data_type,is_required&tenant_id=eq.${tenantId}&id=eq.${item.canonical_field_id}&canonical_entity_id=eq.${item.canonical_entity_id}&is_importable=eq.true&is_analytics_only=eq.false&limit=1`);
      if(!canonical[0])throw new BadRequestException('Destino canônico inválido ou fora do tenant.');
      const entities=await this.db.select<Array<{id:string;entity_key:string}>>('canonical_entities',`select=id,entity_key&tenant_id=eq.${tenantId}&id=eq.${item.canonical_entity_id}&limit=1`);
      if(!entities[0])throw new BadRequestException('Entidade canônica inválida ou fora do tenant.');
      const deterministicFieldKey=`${entities[0].entity_key}__${canonical[0].field_key}`;
      let contractField=fields.find(field=>field.field_key===deterministicFieldKey);
      if(!contractField){
        const [created]=await this.db.insert<ContractField[]>('data_contract_fields',{tenant_id:tenantId,data_contract_id:contract.id,field_key:deterministicFieldKey,source_field_name:deterministicFieldKey,data_type:canonical[0].data_type,is_required:false,allow_null:true});
        contractField=created;fields.push(created);fieldIds.add(created.id);
      }
      item.data_contract_field_id=contractField.id;
      const mapping=await this.db.select<Array<{id:string}>>('field_mappings',`select=id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&data_contract_field_id=eq.${contractField.id}&limit=1`);
      const operationalKeys=new Set(['delivery_number','document_number','external_code','manifest_number','invoice_number','cte_number','order_number']);
      const payload={tenant_id:tenantId,data_contract_id:contract.id,data_contract_field_id:contractField.id,canonical_entity_id:item.canonical_entity_id,canonical_field_id:item.canonical_field_id,mapping_type:'direct',status:'active',operational_key:entities[0].entity_key==='operation_records'&&operationalKeys.has(canonical[0].field_key),created_by:userId};
      if(mapping[0])await this.db.update('field_mappings',`tenant_id=eq.${tenantId}&id=eq.${mapping[0].id}`,payload);
      else await this.db.insert('field_mappings',payload);
    }
    if (
      new Set(requested.map((item) => item.data_contract_field_id)).size !==
      requested.length
    )
      throw new BadRequestException(
        'Cada campo nativo pode receber somente um campo da API.',
      );
    if (contract.entity_key === 'deliveries') {
      const deliveryNumber = fields.find(
        (field) =>
          field.field_key === 'numero_entrega' ||
          field.field_key === 'delivery_number',
      );
      const canonicalDelivery=requested.some(item=>item.canonical_field_id&&item.canonical_entity_id&&fields.find(field=>field.id===item.data_contract_field_id)?.field_key==='operation_records__delivery_number');
      if (
        !canonicalDelivery&&(!deliveryNumber ||
        !requested.some(
          (item) => item.data_contract_field_id === deliveryNumber.id,
        ))
      )
        throw new BadRequestException(
          'Pareie um campo da API com numero_entrega antes de avançar. Esta é a chave operacional delivery_number de entregas.',
        );
    }
    await this.db.delete(
      'data_source_api_field_mappings',
      `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`,
    );
    if (requested.length)
      await this.db.insert(
        'data_source_api_field_mappings',
        requested.map((item) => ({
          tenant_id: tenantId,
          data_source_id: sourceId,
          data_contract_id: contract.id,
          data_contract_field_id: item.data_contract_field_id,
          source_field_name: item.source_field_name,
          status: 'active',
          created_by: userId,
        })) as JsonRecord[],
      );
    return this.listApiMappings(tenantId, sourceId);
  }

  async sync(
    tenantId: string,
    sourceId: string,
    syncType: 'manual' | 'scheduled',
    userId?: string,
  ) {
    const config = await this.requiredConfig(tenantId, sourceId);
    const contract = await this.contract(tenantId, sourceId);
    const mappings = await this.activeMappings(tenantId, contract.id);
    if (!mappings.length)
      throw new BadRequestException(
        'Confirme o pareamento antes de sincronizar.',
      );
    const runs = await this.db.insert<Array<{ id: string }>>(
      'data_source_api_sync_runs',
      {
        tenant_id: tenantId,
        data_source_id: sourceId,
        sync_type: syncType,
        status: 'running',
        cursor_before: config.last_cursor,
      },
    );
    const runId = runs[0].id;
    try {
      const fetched = await this.fetch(config, false);
      const now = new Date().toISOString();
      const batches = await this.db.insert<Array<{ id: string }>>(
        'staging_batches',
        {
          tenant_id: tenantId,
          data_source_id: sourceId,
          data_contract_id: contract.id,
          batch_code: `api-${Date.now()}`,
          source_reference: 'api-pull',
          status: 'received',
          total_records: 0,
          metadata: { input_type: 'api', sync_type: syncType },
          received_at: now,
          created_by: userId ?? null,
          updated_by: userId ?? null,
        },
      );
      const batchId = batches[0].id;
      const accepted: JsonRecord[] = [];
      const stateRows: JsonRecord[] = [];
      let unchanged = 0;
      for (const record of fetched.records) {
        const hash = createHash('sha256')
          .update(JSON.stringify(this.stable(record)))
          .digest('hex');
        const externalValue = this.optionalPath(
          record,
          config.external_id_field,
        );
        const updatedValue = this.optionalPath(record, config.updated_at_field);
        const external =
          externalValue == null || externalValue === ''
            ? hash
            : String(externalValue);
        const updated =
          updatedValue == null || updatedValue === ''
            ? ''
            : String(updatedValue);
        const exists = await this.db.select<unknown[]>(
          'data_source_api_record_states',
          `select=id,staging_record:staging_records!inner(validation_status)&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&external_id=eq.${encodeURIComponent(external)}&source_updated_at=eq.${encodeURIComponent(updated)}&payload_hash=eq.${hash}&staging_record.validation_status=eq.valid&limit=1`,
        );
        if (exists.length) {
          unchanged++;
          continue;
        }
        accepted.push(record);
        stateRows.push({
          external_id: external,
          source_updated_at: updated,
          payload_hash: hash,
        });
      }
      const inserted = accepted.length
        ? await this.db.insert<InsertedRecord[]>(
            'staging_records',
            accepted.map((raw, index) => ({
              tenant_id: tenantId,
              staging_batch_id: batchId,
              data_contract_id: contract.id,
              row_number: index + 1,
              raw_payload: raw,
              normalized_payload: {},
            })),
          )
        : [];
      const validation = await this.validate(
        tenantId,
        sourceId,
        batchId,
        accepted,
        inserted,
        mappings,
      );
      for (const [index, state] of stateRows.entries())
        if ((inserted[index] as InsertedRecord & { valid?: boolean })?.valid)
          await this.db.insert('data_source_api_record_states', {
            tenant_id: tenantId,
            data_source_id: sourceId,
            ...state,
            staging_batch_id: batchId,
            staging_record_id: inserted[index]?.id,
          });
      const status = validation.rejected
        ? validation.valid
          ? 'partially_valid'
          : 'rejected'
        : 'validated';
      await this.db.update(
        'staging_batches',
        `tenant_id=eq.${tenantId}&id=eq.${batchId}`,
        {
          status,
          total_records: accepted.length,
          valid_records: validation.valid,
          invalid_records: validation.rejected,
          error_count: validation.errorCount,
          validated_at: now,
        },
      );
      const next =
        config.auto_sync_enabled && config.sync_frequency_minutes
          ? new Date(
              Date.now() + config.sync_frequency_minutes * 60000,
            ).toISOString()
          : null;
      await this.db.update(
        'data_source_api_configs',
        `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`,
        {
          ...(status === 'validated' ? { last_cursor: fetched.cursor } : {}),
          last_sync_at: now,
          last_success_at: now,
          last_error_safe: null,
          next_sync_at: next,
        },
      );
      await this.db.update(
        'data_source_api_sync_runs',
        `tenant_id=eq.${tenantId}&id=eq.${runId}`,
        {
          staging_batch_id: batchId,
          status: validation.rejected ? 'completed_with_errors' : 'completed',
          finished_at: now,
          http_status: fetched.status,
          received_count: fetched.records.length,
          accepted_count: validation.valid,
          rejected_count: validation.rejected,
          unchanged_count: unchanged,
          cursor_after: fetched.cursor,
        },
      );
      return {
        run_id: runId,
        staging_batch_id: batchId,
        received_count: fetched.records.length,
        accepted_count: validation.valid,
        rejected_count: validation.rejected,
        unchanged_count: unchanged,
      };
    } catch (error) {
      const message = this.safeError(error);
      const now = new Date().toISOString();
      await this.db.update(
        'data_source_api_sync_runs',
        `tenant_id=eq.${tenantId}&id=eq.${runId}`,
        { status: 'failed', finished_at: now, error_message_safe: message },
      );
      await this.db.update(
        'data_source_api_configs',
        `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`,
        { last_sync_at: now, last_failure_at: now, last_error_safe: message },
      );
      throw new BadRequestException(message);
    }
  }

  async listRuns(tenantId: string, sourceId: string) {
    const runs = await this.db.select<
      Array<
        Record<string, unknown> & {
          staging_batch_id: string | null;
          rejected_count: number;
        }
      >
    >(
      'data_source_api_sync_runs',
      `select=*&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&order=created_at.desc&limit=50`,
    );
    return Promise.all(
      runs.map(async (run) => {
        if (!run.staging_batch_id)
          return {
            ...run,
            normalization_status: null,
            latest_normalization_run_id: null,
            latest_normalization_status: null,
            latest_normalization_created_count: 0,
            latest_normalization_updated_count: 0,
            latest_normalization_skipped_count: 0,
            latest_normalization_error_count: 0,
            latest_normalization_finished_at: null,
            latest_normalization_error_code: null,
            latest_normalization_error_message: null,
            published_current_count: 0,
            not_published_count: 0,
            processed_successfully: false,
            needs_revalidation: false,
            has_processable_records: false,
            errors: [],
          };
        const errors = await this.db.select<StagingErrorPreview[]>(
          'staging_errors',
          `select=id,error_code,source_field_name,field_key,message,raw_value,staging_record:staging_records!staging_errors_record_tenant_fk(row_number)&tenant_id=eq.${tenantId}&staging_batch_id=eq.${run.staging_batch_id}&order=created_at.asc&limit=5`,
        );
        const batches = await this.db.select<
          Array<{ api_revalidated_at: string | null }>
        >(
          'staging_batches',
          `select=api_revalidated_at&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&id=eq.${run.staging_batch_id}&limit=1`,
        );
        const apiRevalidatedAt = batches[0]?.api_revalidated_at ?? null;
        const normalizationRuns = await this.db.select<
          Array<{
            id: string;
            status: string;
            total_records: number;
            processed_records: number;
            created_operation_records: number;
            updated_operation_records: number;
            created_extension_records: number;
            updated_extension_records: number;
            error_records: number;
            created_at: string;
            finished_at: string | null;
          }>
        >(
          'normalization_runs',
          `select=id,status,total_records,processed_records,created_operation_records,updated_operation_records,created_extension_records,updated_extension_records,error_records,created_at,finished_at&tenant_id=eq.${tenantId}&staging_batch_id=eq.${run.staging_batch_id}&order=created_at.desc&limit=1`,
        );
        const latest = normalizationRuns[0];
        const normalizationErrors = latest
          ? await this.db.select<
              Array<{ error_code: string; error_message: string }>
            >(
              'normalization_errors',
              `select=error_code,error_message&tenant_id=eq.${tenantId}&normalization_run_id=eq.${latest.id}&order=created_at.asc&limit=1`,
            )
          : [];
        const latestError =
          normalizationErrors[0] ??
          (latest && latest.error_records > 0
            ? {
                error_code: 'UNKNOWN_ERROR',
                error_message:
                  'A normalização registrou erro, mas o detalhe não foi encontrado.',
              }
            : undefined);
        const [publishedCurrent, notPublished] = await Promise.all([
          this.db.select<Array<{ id: string }>>(
            'operation_records',
            `select=id&tenant_id=eq.${tenantId}&source_staging_batch_id=eq.${run.staging_batch_id}&is_current=eq.true&canonical_validity_status=eq.valid`,
          ),
          this.db.select<Array<{ id: string }>>(
            'operation_records',
            `select=id&tenant_id=eq.${tenantId}&source_staging_batch_id=eq.${run.staging_batch_id}&is_current=eq.false&canonical_validity_status=in.(incomplete,pending_activation,superseded)`,
          ),
        ]);
        const publishedCurrentCount = publishedCurrent.length;
        const notPublishedCount = notPublished.length;
        const acceptedCount = Number(run.accepted_count ?? 0);
        const processedSuccessfully =
          latest?.status === 'completed' &&
          latest.error_records === 0 &&
          (acceptedCount === 0 || publishedCurrentCount > 0);
        const latestNormalizationAt = latest?.finished_at ?? latest?.created_at;
        const latestErrorIsStale = Boolean(
          latestError &&
          apiRevalidatedAt &&
          latestNormalizationAt &&
          new Date(latestNormalizationAt).getTime() <
            new Date(apiRevalidatedAt).getTime(),
        );
        const needsRevalidation =
          (latestError?.error_code === 'API_SCHEMA_INCOMPATIBLE' &&
            !latestErrorIsStale) ||
          errors.length > 0;
        return {
          ...run,
          normalization_status: latest?.status ?? null,
          latest_normalization_run_id: latest?.id ?? null,
          latest_normalization_status: latest?.status ?? null,
          latest_normalization_created_count: latest
            ? latest.created_operation_records +
              latest.created_extension_records
            : 0,
          latest_normalization_updated_count: latest
            ? latest.updated_operation_records +
              latest.updated_extension_records
            : 0,
          latest_normalization_skipped_count: latest
            ? Math.max(0, latest.total_records - latest.processed_records)
            : 0,
          latest_normalization_error_count: latest?.error_records ?? 0,
          latest_normalization_finished_at: latest?.finished_at ?? null,
          latest_normalization_error_code: latestError?.error_code ?? null,
          latest_normalization_error_message:
            latestError?.error_message ?? null,
          published_current_count: publishedCurrentCount,
          not_published_count: notPublishedCount,
          latest_normalization_error_is_stale: latestErrorIsStale,
          processed_successfully: processedSuccessfully,
          needs_revalidation: needsRevalidation,
          has_processable_records:
            acceptedCount > 0 && !processedSuccessfully && !needsRevalidation,
          errors: errors.map((error) => ({
            id: error.id,
            row_number: error.staging_record?.row_number ?? null,
            field: error.source_field_name ?? error.field_key,
            error_code: error.error_code,
            message: error.message,
            raw_value: error.raw_value,
          })),
        };
      }),
    );
  }

  async revalidateBatchWithCurrentRules(
    tenantId: string,
    sourceId: string,
    batchId: string,
    userId: string,
  ) {
    const batches = await this.db.select<
      Array<{
        id: string;
        data_contract_id: string;
        data_source: { source_type: string } | null;
      }>
    >(
      'staging_batches',
      `select=id,data_contract_id,data_source:data_sources!staging_batches_data_source_tenant_fk(source_type)&tenant_id=eq.${tenantId}&id=eq.${batchId}&data_source_id=eq.${sourceId}&limit=1`,
    );
    const batch = batches[0];
    if (!batch)
      throw new BadRequestException(
        'Lote API não encontrado para esta integração.',
      );
    if (batch.data_source?.source_type !== 'api')
      throw new BadRequestException(
        'Somente lotes de integração API podem ser revalidados por esta ação.',
      );
    const mappings = await this.activeMappings(
      tenantId,
      batch.data_contract_id,
      sourceId,
    );
    if (!mappings.length)
      throw new BadRequestException(
        'O contrato do lote não possui pareamentos API ativos.',
      );
    const records = await this.db.select<
      Array<InsertedRecord & { raw_payload: JsonRecord }>
    >(
      'staging_records',
      `select=id,row_number,raw_payload&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&order=row_number.asc`,
    );
    await this.db.delete(
      'staging_errors',
      `tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}`,
    );
    const validation = await this.validate(
      tenantId,
      sourceId,
      batchId,
      records.map((record) => record.raw_payload),
      records,
      mappings,
    );
    const status = validation.rejected
      ? validation.valid
        ? 'partially_valid'
        : 'rejected'
      : 'validated';
    const revalidatedAt = new Date().toISOString();
    await this.db.update(
      'staging_batches',
      `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&id=eq.${batchId}`,
      {
        status,
        total_records: records.length,
        valid_records: validation.valid,
        invalid_records: validation.rejected,
        error_count: validation.errorCount,
        validated_at: revalidatedAt,
        api_revalidated_at: revalidatedAt,
        api_revalidated_by: userId,
        updated_by: userId,
      },
    );
    await this.db.update(
      'data_source_api_sync_runs',
      `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&staging_batch_id=eq.${batchId}`,
      {
        status: validation.rejected ? 'completed_with_errors' : 'completed',
        accepted_count: validation.valid,
        rejected_count: validation.rejected,
      },
    );
    const config = await this.requiredConfig(tenantId, sourceId);
    for (const record of records) {
      if (!(record as InsertedRecord & { valid?: boolean }).valid) continue;
      const hash = createHash('sha256')
        .update(JSON.stringify(this.stable(record.raw_payload)))
        .digest('hex');
      const externalValue = this.optionalPath(
        record.raw_payload,
        config.external_id_field,
      );
      const updatedValue = this.optionalPath(
        record.raw_payload,
        config.updated_at_field,
      );
      await this.db.upsert(
        'data_source_api_record_states',
        {
          tenant_id: tenantId,
          data_source_id: sourceId,
          external_id:
            externalValue == null || externalValue === ''
              ? hash
              : String(externalValue),
          source_updated_at:
            updatedValue == null || updatedValue === ''
              ? ''
              : String(updatedValue),
          payload_hash: hash,
          staging_batch_id: batchId,
          staging_record_id: record.id,
        },
        'tenant_id,data_source_id,external_id,source_updated_at,payload_hash',
      );
    }
    return {
      staging_batch_id: batchId,
      status,
      accepted_count: validation.valid,
      rejected_count: validation.rejected,
      error_count: validation.errorCount,
    };
  }
  async syncDue(limit = 10) {
    const due = await this.db.select<
      Array<{ tenant_id: string; data_source_id: string }>
    >(
      'data_source_api_configs',
      `select=tenant_id,data_source_id&auto_sync_enabled=eq.true&next_sync_at=lte.${encodeURIComponent(new Date().toISOString())}&order=next_sync_at.asc&limit=${Math.min(25, Math.max(1, limit))}`,
    );
    const results = [];
    for (const row of due) {
      try {
        results.push(
          await this.sync(row.tenant_id, row.data_source_id, 'scheduled'),
        );
      } catch {
        results.push({ data_source_id: row.data_source_id, status: 'failed' });
      }
    }
    return { processed: results.length, results };
  }

  private async validate(
    tenantId: string,
    sourceId: string,
    batchId: string,
    records: JsonRecord[],
    inserted: InsertedRecord[],
    mappings: ApiMapping[],
  ) {
    const allowedRows = await this.db.select<
      Array<{ data_contract_field_id: string; value: string }>
    >(
      'data_contract_allowed_values',
      `select=data_contract_field_id,value&tenant_id=eq.${tenantId}&data_contract_field_id=in.(${mappings.map((mapping) => mapping.data_contract_field_id).join(',')})&is_active=eq.true`,
    );
    const valueMappings = await this.valueMappings.active(tenantId, sourceId);
    const parseRules = await this.fieldFormats.list(tenantId, sourceId);
    const errors: JsonRecord[] = [];
    let valid = 0;
    records.forEach((raw, index) => {
      const record = inserted[index];
      const normalized: JsonRecord = {};
      const add = (
        code: string,
        mapping: ApiMapping,
        rawValue: unknown,
        message: string,
      ) =>
        errors.push({
          tenant_id: tenantId,
          staging_batch_id: batchId,
          staging_record_id: record.id,
          data_contract_field_id: mapping.data_contract_field_id,
          error_code: code,
          severity: 'error',
          field_key: mapping.data_contract_field.field_key,
          source_field_name: mapping.api_source_field_name,
          raw_value: rawValue == null ? null : String(rawValue),
          message,
        });
      for (const mapping of mappings) {
        const field = mapping.data_contract_field;
        const present = Object.hasOwn(raw, mapping.api_source_field_name);
        const value = raw[mapping.api_source_field_name];
        if (!present && field.is_required) {
          add(
            'REQUIRED_FIELD_MISSING',
            mapping,
            null,
            `Campo nativo obrigatório ausente: ${field.field_key}.`,
          );
          continue;
        }
        if (!present) continue;
        if (value == null || value === '') {
          if (!field.allow_null)
            add(
              'NULL_NOT_ALLOWED',
              mapping,
              value,
              `Nulo não permitido em ${field.field_key}.`,
            );
          else normalized[field.field_key] = null;
          continue;
        }
        const allowed = allowedRows
          .filter((row) => row.data_contract_field_id === field.id)
          .map((row) => row.value);
        const controlled = field.data_type === 'enum' || allowed.length > 0;
        if (controlled) {
          if (!allowed.length) {
            add(
              'CONTROLLED_VALUES_NOT_CONFIGURED',
              mapping,
              value,
              `Valores controlados não estão configurados para o campo ${field.field_key}.`,
            );
            continue;
          }
          const sourceValue = String(value);
          const configured = valueMappings.find(
            (item) =>
              item.data_contract_field_id === field.id &&
              item.source_field_name === mapping.api_source_field_name &&
              item.source_value === sourceValue,
          );
          const target =
            configured?.target_value ??
            (allowed.includes(sourceValue) ? sourceValue : null);
          if (!target) {
            add(
              'VALUE_MAPPING_REQUIRED',
              mapping,
              value,
              `Valor recebido não possui De/Para configurado para o campo ${field.field_key}.`,
            );
            continue;
          }
          if (!allowed.includes(target)) {
            add(
              'VALUE_NOT_ALLOWED',
              mapping,
              value,
              `O De/Para configurado não pertence aos valores permitidos de ${field.field_key}.`,
            );
            continue;
          }
          normalized[field.field_key] = target;
          continue;
        }
        const rule = parseRules.find(
          (item) =>
            item.data_contract_field_id === field.id &&
            item.source_field_name === mapping.api_source_field_name,
        ) as ParseRule | undefined;
        const converted = [
          'date',
          'datetime',
          'decimal',
          'number',
          'integer',
          'boolean',
        ].includes(field.data_type)
          ? parseFieldValue(
              value,
              rule ?? {
                data_type: field.data_type,
                date_format: null,
                timezone: null,
                decimal_separator: null,
                thousand_separator: null,
                boolean_true_values: null,
                boolean_false_values: null,
              },
            )
          : this.convert(value, field.data_type);
        if (!converted.ok) {
          if ('required' in converted && converted.required) {
            add(
              'FIELD_FORMAT_REQUIRED',
              mapping,
              value,
              ['date', 'datetime'].includes(field.data_type)
                ? `Configure o formato de data/hora recebido para o campo ${field.field_key}.`
                : `Configure os separadores numéricos recebidos para o campo ${field.field_key}.`,
            );
          } else {
            const expected = rule?.date_format
              ? ` Valor não corresponde ao formato configurado ${rule.date_format}.`
              : ` Tipo esperado: ${field.data_type}.`;
            add('INVALID_TYPE', mapping, value, expected.trim());
          }
          continue;
        }
        normalized[field.field_key] = converted.value;
      }
      (record as InsertedRecord & { normalized: JsonRecord }).normalized =
        normalized;
      const count = errors.filter(
        (error) => error.staging_record_id === record.id,
      ).length;
      (record as InsertedRecord & { valid: boolean }).valid = count === 0;
      if (!count) valid++;
    });
    await Promise.all(
      inserted.map(async (record) => {
        const count = errors.filter(
          (error) => error.staging_record_id === record.id,
        ).length;
        await this.db.update(
          'staging_records',
          `tenant_id=eq.${tenantId}&id=eq.${record.id}`,
          {
            normalized_payload: (
              record as InsertedRecord & { normalized: JsonRecord }
            ).normalized,
            validation_status: count ? 'invalid' : 'valid',
            error_count: count,
            validated_at: new Date().toISOString(),
          },
        );
      }),
    );
    if (errors.length) await this.db.insert('staging_errors', errors);
    return {
      valid,
      rejected: records.length - valid,
      errorCount: errors.length,
    };
  }

  private async fetch(
    config: ApiConfig,
    sample: boolean,
  ): Promise<FetchResult> {
    const records: JsonRecord[] = [];
    let status = 0;
    let cursor = config.last_cursor;
    const maxPages = sample
      ? Math.min(10, Number(process.env.API_SAMPLE_MAX_PAGES ?? 5))
      : Math.min(50, Number(process.env.API_SYNC_MAX_PAGES ?? 20));
    const maxRecords = sample
      ? Math.min(1000, Number(process.env.API_SAMPLE_MAX_RECORDS ?? 500))
      : Math.min(10000, Number(process.env.API_SYNC_MAX_RECORDS ?? 5000));
    for (
      let page = 1;
      page <= maxPages && records.length < maxRecords;
      page++
    ) {
      const url = await this.configs.assertSafeUrl(
        config.base_url,
        config.endpoint_path,
      );
      if (config.page_param)
        url.searchParams.set(config.page_param, String(page));
      if (config.page_size_param)
        url.searchParams.set(
          config.page_size_param,
          String(Math.min(config.page_size, maxRecords - records.length)),
        );
      if (config.updated_since_param && config.last_cursor)
        url.searchParams.set(config.updated_since_param, config.last_cursor);
      const headers: Record<string, string> = { Accept: 'application/json' };
      const secret = this.configs.decrypt(config.credentials_encrypted);
      if (config.auth_type === 'bearer_token')
        headers.Authorization = `Bearer ${secret}`;
      if (config.auth_type === 'api_key_header')
        headers[config.auth_header_name || 'X-API-Key'] = secret;
      if (config.auth_type === 'basic')
        headers.Authorization = `Basic ${Buffer.from(secret).toString('base64')}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(
          Number(process.env.API_CONNECTOR_TIMEOUT_MS ?? 10000),
        ),
      });
      status = response.status;
      if (status >= 300 && status < 400)
        throw new Error('Redirecionamento do legado bloqueado.');
      if (status === 401 || status === 403)
        throw new BadRequestException(
          `Legado respondeu HTTP ${status}. Verifique autenticação, token ou header configurado.`,
        );
      if (!response.ok)
        throw new BadRequestException(`Legado respondeu HTTP ${status}.`);
      const json = (await response.json()) as unknown;
      const value = this.path(json, config.response_root_path);
      const pageRecords = (
        Array.isArray(value) ? value : Array.isArray(json) ? json : []
      ).filter(
        (item): item is JsonRecord =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      );
      records.push(...pageRecords.slice(0, maxRecords - records.length));
      if (config.updated_at_field)
        for (const item of pageRecords) {
          const candidate = this.path(item, config.updated_at_field);
          if (candidate != null && String(candidate) > (cursor ?? ''))
            cursor = String(candidate);
        }
      if (!config.page_param || pageRecords.length < config.page_size) break;
    }
    return {
      records,
      status,
      fields: [...new Set(records.flatMap(Object.keys))].slice(0, 200),
      cursor,
    };
  }

  private activeMappings(
    tenantId: string,
    contractId: string,
    sourceId?: string,
  ) {
    return this.db.select<ApiMapping[]>(
      'data_source_api_field_mappings',
      `select=id,api_source_field_name:source_field_name,data_contract_field_id,data_contract_field:data_contract_fields!api_field_mapping_contract_field_tenant_fk(id,field_key,source_field_name,data_type,is_required,allow_null)&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}${sourceId ? `&data_source_id=eq.${sourceId}` : ''}&status=eq.active`,
    );
  }
  private async requiredConfig(t: string, s: string) {
    const config = (await this.configs.get(t, s, true)) as ApiConfig | null;
    if (!config)
      throw new BadRequestException('Configure a conexão API primeiro.');
    return config;
  }
  private async contract(t: string, s: string) {
    const rows = await this.db.select<ApiContract[]>(
      'data_contracts',
      `select=id,entity_key&tenant_id=eq.${t}&data_source_id=eq.${s}&status=eq.active&order=contract_version.desc&limit=1`,
    );
    if (!rows[0])
      throw new BadRequestException('Contrato nativo ativo não encontrado.');
    return rows[0];
  }
  private path(value: unknown, path: string | null) {
    return path
      ? path
          .split('.')
          .reduce<unknown>(
            (current, key) =>
              current && typeof current === 'object'
                ? (current as JsonRecord)[key]
                : undefined,
            value,
          )
      : value;
  }
  private optionalPath(value: unknown, path: string | null) {
    if (!path?.trim()) return undefined;
    const result = this.path(value, path);
    return result !== null && typeof result === 'object' ? undefined : result;
  }
  private convert(
    value: unknown,
    type: string,
  ): { ok: boolean; value: unknown } {
    if (type === 'text')
      return {
        ok: ['string', 'number', 'boolean'].includes(typeof value),
        value: ['string', 'number', 'boolean'].includes(typeof value)
          ? String(value)
          : value,
      };
    if (type === 'integer') {
      const ok =
        typeof value === 'number'
          ? Number.isInteger(value)
          : typeof value === 'string' && /^[-+]?\d+$/.test(value.trim());
      return { ok, value: ok ? Number(value) : value };
    }
    if (type === 'decimal') {
      const ok =
        typeof value === 'number'
          ? Number.isFinite(value)
          : typeof value === 'string' &&
            /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()) &&
            Number.isFinite(Number(value));
      return { ok, value: ok ? Number(value) : value };
    }
    if (type === 'boolean') {
      const normalized =
        typeof value === 'string' ? value.trim().toLowerCase() : value;
      const ok =
        typeof normalized === 'boolean' ||
        normalized === 'true' ||
        normalized === 'false';
      return {
        ok,
        value:
          normalized === 'true'
            ? true
            : normalized === 'false'
              ? false
              : normalized,
      };
    }
    if (type === 'date') {
      const match =
        typeof value === 'string'
          ? value.match(/^(\d{4}-\d{2}-\d{2})(T.*)?$/)
          : null;
      const date = match ? new Date(`${match[1]}T00:00:00.000Z`) : null;
      const validIsoSuffix =
        !match?.[2] || !Number.isNaN(Date.parse(value as string));
      const ok = Boolean(
        match &&
        date &&
        validIsoSuffix &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === match[1],
      );
      return { ok, value: ok ? match![1] : value };
    }
    if (type === 'datetime') {
      const ok =
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T/.test(value) &&
        !Number.isNaN(Date.parse(value));
      return { ok, value };
    }
    if (type === 'json')
      return { ok: value !== null && typeof value === 'object', value };
    if (type === 'enum') return { ok: typeof value === 'string', value };
    return { ok: false, value };
  }
  private stable(value: unknown): unknown {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as JsonRecord)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, this.stable(item)]),
        )
      : Array.isArray(value)
        ? value.map((item) => this.stable(item))
        : value;
  }
  private safeError(error: unknown) {
    if (
      error instanceof Error &&
      (/^Legado respondeu HTTP \d+\.(?: Verifique autenticação, token ou header configurado\.)?$/.test(
        error.message,
      ) ||
        error.message === 'Redirecionamento do legado bloqueado.')
    )
      return error.message;
    return 'Não foi possível sincronizar com o legado.';
  }
}
