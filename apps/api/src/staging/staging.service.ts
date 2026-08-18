import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { parseTabularFile } from './file-parser';
import { parseFieldValue, ParseRule } from '../api-integrations/field-value-parser';

const batchFields = 'id,tenant_id,data_source_id,data_contract_id,batch_code,source_reference,status,total_records,valid_records,invalid_records,error_count,metadata,received_at,validated_at,created_at,updated_at,data_source:data_sources!staging_batches_data_source_tenant_fk(id,name),data_contract:data_contracts!staging_batches_data_contract_tenant_fk(id,name)';
const recordFields = 'id,tenant_id,staging_batch_id,data_contract_id,row_number,raw_payload,normalized_payload,validation_status,error_count,validated_at,created_at,updated_at';
const errorFields = 'id,tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,severity,field_key,source_field_name,raw_value,expected_rule,message,created_at';

type ContractField = {
  id: string;
  field_key: string;
  source_field_name: string;
  data_type: string;
  is_required: boolean;
  allow_null: boolean;
  date_format: string | null;
};

@Injectable()
export class StagingService {
  constructor(private readonly supabase: SupabaseService) {}
  listBatches(tenantId: string) { return this.supabase.select('staging_batches', `select=${batchFields}&tenant_id=eq.${tenantId}&order=created_at.desc`); }
  async getBatch(tenantId: string, batchId: string) { const rows = await this.supabase.select<unknown[]>('staging_batches', `select=${batchFields}&tenant_id=eq.${tenantId}&id=eq.${batchId}&limit=1`); if (!rows.length) throw new NotFoundException('Staging batch not found.'); return rows[0]; }
  async createBatch(tenantId: string, userId: string, body: Record<string, unknown>) {
    const payload = this.pick(body, ['data_source_id','data_contract_id','batch_code','source_reference','status','metadata']);
    if (!payload.data_source_id || !payload.data_contract_id) throw new BadRequestException('data_source_id and data_contract_id are required.');
    await this.ensureExists('data_sources', tenantId, String(payload.data_source_id), 'Data source not found for this tenant.');
    await this.ensureExists('data_contracts', tenantId, String(payload.data_contract_id), 'Data contract not found for this tenant.');
    return this.supabase.insert('staging_batches', { ...payload, tenant_id: tenantId, status: payload.status ?? 'draft', created_by: userId, updated_by: userId });
  }
  updateBatch(tenantId: string, batchId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('staging_batches', `tenant_id=eq.${tenantId}&id=eq.${batchId}`, { ...this.pick(body, ['batch_code','source_reference','status','metadata','received_at']), updated_by: userId }); }
  async validateBatch(tenantId: string, batchId: string) { await this.getBatch(tenantId, batchId); return this.supabase.rpc('validate_staging_batch', { p_batch_id: batchId }); }
  async listRecords(tenantId: string, batchId: string) { await this.getBatch(tenantId, batchId); return this.supabase.select('staging_records', `select=${recordFields}&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&order=row_number.asc`); }
  async createRecords(tenantId: string, batchId: string, body: Record<string, unknown>) {
    const batch = await this.getBatch(tenantId, batchId) as { data_contract_id: string };
    const records = Array.isArray(body.records) ? body.records : [body];
    if (!records.length) throw new BadRequestException('records are required.');
    const payload = records.map((item, index) => {
      const record = item as Record<string, unknown>;
      const raw = record.raw_payload ?? record;
      if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new BadRequestException('Each record must be a JSON object.');
      return { tenant_id: tenantId, staging_batch_id: batchId, data_contract_id: batch.data_contract_id, row_number: Number(record.row_number ?? index + 1), raw_payload: raw };
    });
    const inserted = await this.supabase.insert('staging_records', payload as unknown as Record<string, unknown>);
    await this.supabase.update('staging_batches', `tenant_id=eq.${tenantId}&id=eq.${batchId}`, { total_records: payload.length, status: 'received', received_at: new Date().toISOString() });
    return inserted;
  }
  async uploadDataSourceFile(tenantId: string, sourceId: string, userId: string, file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    const filename = file.originalname;
    const extension = filename.toLowerCase().split('.').pop();
    if (!extension || !['xlsx','csv'].includes(extension)) throw new BadRequestException('Apenas arquivos .xlsx e .csv são aceitos.');
    const sources = await this.supabase.select<Array<{ id: string; status: string; source_type: string; name: string; module_key: string }>>('data_sources', `select=id,status,source_type,name,module_key&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`);
    const source = sources[0];
    if (!source) throw new NotFoundException('Data source not found for this tenant.');
    if (source.status !== 'active') throw new BadRequestException('A integração precisa estar ativa para receber atualização de dados.');
    if (!['manual_file','spreadsheet'].includes(source.source_type)) throw new BadRequestException('Apenas integrações de arquivo/planilha aceitam upload manual.');
    const contracts = await this.supabase.select<Array<{ id: string; name: string; status: string; module_key: string }>>('data_contracts', `select=id,name,status,module_key&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=eq.active&order=contract_version.desc&limit=1`);
    const contract = contracts[0];
    if (!contract) throw new BadRequestException('Não existe contrato de dados ativo para esta integração.');
    let parsed: ReturnType<typeof parseTabularFile>;
    try {
      parsed = parseTabularFile(file.buffer, filename);
    } catch {
      throw new BadRequestException('Não foi possível ler as colunas do arquivo. Verifique o formato e tente novamente.');
    }
    const activeMappings = await this.supabase.select<Array<{ id: string }>>('field_mappings', `select=id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&status=eq.active&limit=1`);
    const isSetupUpload = activeMappings.length === 0;
    let fields = await this.supabase.select<ContractField[]>('data_contract_fields', `select=id,field_key,source_field_name,data_type,is_required,allow_null,date_format&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&order=sort_order.asc`);
    if (isSetupUpload) {
      fields = await this.syncSetupContractFields(tenantId, contract.id, parsed.headers);
      const batchRows = await this.supabase.insert<Array<{ id: string }>>('staging_batches', { tenant_id: tenantId, data_source_id: sourceId, data_contract_id: contract.id, batch_code: filename, source_reference: filename, status: 'validated', total_records: parsed.rows.length, valid_records: parsed.rows.length, invalid_records: 0, error_count: 0, metadata: { filename, file_type: extension, received_headers: parsed.headers, upload_mode: 'setup_file', setup_upload: true, message: 'Arquivo lido com sucesso. Revise o pareamento das colunas antes de processar.' }, received_at: new Date().toISOString(), validated_at: new Date().toISOString(), created_by: userId, updated_by: userId });
      const batchId = batchRows[0]?.id;
      if (!batchId) throw new BadRequestException('Não foi possível criar o lote de staging.');
      const insertedRecords = parsed.rows.length ? await this.supabase.insert<Array<{ id: string; row_number: number }>>('staging_records', parsed.rows.map((raw, index) => ({ tenant_id: tenantId, staging_batch_id: batchId, data_contract_id: contract.id, row_number: index + 1, raw_payload: raw, normalized_payload: Object.fromEntries(fields.filter((field) => Object.hasOwn(raw, field.source_field_name)).map((field) => [field.field_key, raw[field.source_field_name]])), validation_status: 'valid', error_count: 0, validated_at: new Date().toISOString() }))) : [];
      await Promise.all(insertedRecords.map((record) => this.supabase.update('staging_records', `tenant_id=eq.${tenantId}&id=eq.${record.id}`, { validation_status: 'valid', error_count: 0, validated_at: new Date().toISOString() })));
      return this.getBatch(tenantId, batchId);
    }
    const allowedValues = await this.supabase.select<Array<{ data_contract_field_id: string; value: string; normalized_value: string | null; is_active: boolean }>>('data_contract_allowed_values', `select=data_contract_field_id,value,normalized_value,is_active&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&is_active=eq.true`);
    const valueMappings = await this.supabase.select<Array<{ data_contract_field_id: string; source_field_name: string; source_value: string; target_value: string }>>('data_source_value_mappings', `select=data_contract_field_id,source_field_name,source_value,target_value&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_id=eq.${contract.id}&status=eq.active`);
    const parseRules = await this.supabase.select<Array<ParseRule & { data_contract_field_id: string; source_field_name: string }>>('data_source_field_parse_rules', `select=data_contract_field_id,source_field_name,data_type,date_format,timezone,decimal_separator,thousand_separator,boolean_true_values,boolean_false_values&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&data_contract_id=eq.${contract.id}&status=eq.active`);
    const expected = new Set(fields.map((field) => field.source_field_name));
    const unknown = parsed.headers.filter((header) => !expected.has(header));
    const missing = fields.filter((field) => field.is_required && !parsed.headers.includes(field.source_field_name));
    const structuralRejected = unknown.length > 0 || missing.length > 0;
    const rejectionReasons = [...(unknown.length ? ['unknown_columns'] : []), ...(missing.length ? ['missing_required_columns'] : [])];
    const batchRows = await this.supabase.insert<Array<{ id: string }>>('staging_batches', { tenant_id: tenantId, data_source_id: sourceId, data_contract_id: contract.id, batch_code: filename, source_reference: filename, status: 'uploaded', total_records: parsed.rows.length, valid_records: 0, invalid_records: 0, error_count: 0, metadata: { filename, file_type: extension, received_headers: parsed.headers, upload_mode: 'manual_file', rejection_reasons: rejectionReasons }, received_at: new Date().toISOString(), created_by: userId, updated_by: userId });
    const batchId = batchRows[0]?.id;
    if (!batchId) throw new BadRequestException('Não foi possível criar o lote de staging.');
    const insertedRecords = parsed.rows.length ? await this.supabase.insert<Array<{ id: string; row_number: number }>>('staging_records', parsed.rows.map((raw, index) => ({ tenant_id: tenantId, staging_batch_id: batchId, data_contract_id: contract.id, row_number: index + 1, raw_payload: raw }))) : [];
    const recordByRow = new Map(insertedRecords.map((record) => [record.row_number, record.id]));
    const recordErrors = new Map<number, number>();
    const normalizedByRow = new Map<number, Record<string, unknown>>();
    const errors: Record<string, unknown>[] = [];
    for (const header of unknown) errors.push(this.batchError(tenantId, batchId, 'UNKNOWN_COLUMN', header, null, 'Coluna fora do contrato.', 'Arquivo rejeitado: existem colunas fora do contrato.'));
    for (const field of missing) errors.push(this.batchError(tenantId, batchId, 'MISSING_REQUIRED_COLUMN', field.source_field_name, field.field_key, 'Campo obrigatório presente no contrato.', 'Arquivo rejeitado: coluna obrigatória ausente.'));
    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const normalized: Record<string, unknown> = {};
      normalizedByRow.set(rowNumber, normalized);
      for (const field of fields) {
        if (!parsed.headers.includes(field.source_field_name)) continue;
        const value = row[field.source_field_name];
        const empty = value === null || value === undefined || String(value).trim() === '';
        const rowErrorsBefore = errors.length;
        if (empty && field.is_required && !field.allow_null) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'REQUIRED_VALUE', 'Valor obrigatório ausente.'));
        const allowed = allowedValues.filter((item) => item.data_contract_field_id === field.id).map((item) => item.value);
        const controlled = field.data_type === 'enum' || allowed.length > 0;
        if (!empty && controlled && !allowed.length) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'CONTROLLED_VALUES_NOT_CONFIGURED', `Valores controlados não estão configurados para o campo ${field.field_key}.`));
        else if (!empty && controlled) {
          const sourceValue = String(value);
          const configured = valueMappings.find((item) => item.data_contract_field_id === field.id && item.source_field_name === field.source_field_name && item.source_value === sourceValue);
          const target = configured?.target_value ?? (allowed.includes(sourceValue) ? sourceValue : null);
          if (!target) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'VALUE_MAPPING_REQUIRED', `Valor recebido não possui De/Para configurado para o campo ${field.field_key}.`));
          else if (!allowed.includes(target)) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'VALUE_NOT_ALLOWED', `O De/Para configurado não pertence aos valores permitidos de ${field.field_key}.`));
          else normalized[field.field_key] = target;
        } else if (!empty && ['date','datetime','decimal','number','integer','boolean'].includes(field.data_type)) {
          const rule = parseRules.find((item) => item.data_contract_field_id === field.id && item.source_field_name === field.source_field_name) ?? { data_type: field.data_type, date_format: null, timezone: null, decimal_separator: null, thousand_separator: null, boolean_true_values: null, boolean_false_values: null };
          const converted = parseFieldValue(value, rule);
          if (!converted.ok) {
            const required = converted.required;
            const message = required ? (['date','datetime'].includes(field.data_type) ? `Configure o formato de data/hora recebido para o campo ${field.field_key}.` : `Configure os separadores numéricos recebidos para o campo ${field.field_key}.`) : (rule.date_format ? `Valor não corresponde ao formato configurado ${rule.date_format}.` : `Tipo esperado: ${field.data_type}.`);
            errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, required ? 'FIELD_FORMAT_REQUIRED' : 'INVALID_TYPE', message));
          } else normalized[field.field_key] = converted.value;
        } else if (!empty) normalized[field.field_key] = value;
        else if (field.allow_null) normalized[field.field_key] = null;
        if (errors.length > rowErrorsBefore) recordErrors.set(rowNumber, (recordErrors.get(rowNumber) ?? 0) + errors.length - rowErrorsBefore);
      }
    });
    if (errors.length) await this.supabase.insert('staging_errors', errors);
    await Promise.all(insertedRecords.map((record) => {
      const lineErrors = structuralRejected ? 1 : recordErrors.get(record.row_number) ?? 0;
      return this.supabase.update('staging_records', `tenant_id=eq.${tenantId}&id=eq.${record.id}`, { normalized_payload: normalizedByRow.get(record.row_number) ?? {}, validation_status: lineErrors ? 'invalid' : 'valid', error_count: lineErrors, validated_at: new Date().toISOString() });
    }));
    const invalidRecords = structuralRejected ? parsed.rows.length : recordErrors.size;
    const validRecords = structuralRejected ? 0 : Math.max(parsed.rows.length - invalidRecords, 0);
    const status = structuralRejected ? 'rejected' : invalidRecords > 0 ? 'partially_valid' : 'validated';
    await this.supabase.update('staging_batches', `tenant_id=eq.${tenantId}&id=eq.${batchId}`, { status, valid_records: validRecords, invalid_records: invalidRecords, error_count: errors.length, validated_at: new Date().toISOString(), updated_by: userId, metadata: { filename, file_type: extension, received_headers: parsed.headers, upload_mode: 'manual_file', rejection_reasons: rejectionReasons } });
    return this.getBatch(tenantId, batchId);
  }

  async archiveDataSource(tenantId: string, sourceId: string, userId: string, status = 'archived') {
    if (!['archived','inactive'].includes(String(status))) throw new BadRequestException('Status de arquivamento inválido.');
    await this.ensureExists('data_sources', tenantId, sourceId, 'Integração não encontrada para este tenant.');
    const rows = await this.supabase.update<Record<string, unknown>[]>('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}`, { status: String(status), updated_by: userId });
    await this.supabase.update(
      'operation_records',
      `tenant_id=eq.${tenantId}&source_data_source_id=eq.${sourceId}&deleted_at=is.null&is_current=eq.true`,
      {
        is_current: false,
        canonical_validity_status: 'superseded',
        superseded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    return { ...(rows[0] ?? {}), message: 'Esta integração possui histórico vinculado e foi arquivada para preservar a rastreabilidade.' };
  }

  async configureDataSource(tenantId: string, sourceId: string, userId: string, body: Record<string, unknown>) {
    const moduleKeys = [...new Set((Array.isArray(body.module_keys) ? body.module_keys : []).map(String).filter(Boolean))];
    if (!moduleKeys.length) throw new BadRequestException('Selecione ao menos um módulo alimentado pela integração.');
    const sources = await this.supabase.select<Array<{ id: string; metadata: Record<string, unknown> | null; source_type: string; status: string }>>(
      'data_sources',
      `select=id,metadata,source_type,status&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`,
    );
    if (!sources[0]) throw new NotFoundException('Integração não encontrada para este tenant.');
    const tenantModuleRows = await this.supabase.select<Array<{ module_id: string }>>(
      'tenant_modules',
      `select=module_id&tenant_id=eq.${tenantId}&is_active=eq.true`,
    );
    const enabledModules = tenantModuleRows.length
      ? await this.supabase.select<Array<{ key: string }>>(
          'modules',
          `select=key&id=in.(${tenantModuleRows.map((row) => `"${row.module_id}"`).join(',')})&is_active=eq.true`,
        )
      : [];
    const enabledModuleKeys = new Set(enabledModules.map((module) => module.key));
    const invalidModuleKeys = moduleKeys.filter((moduleKey) => !enabledModuleKeys.has(moduleKey));
    if (invalidModuleKeys.length)
      throw new BadRequestException(`Módulo inválido ou não habilitado para este tenant: ${invalidModuleKeys.join(', ')}.`);
    const contracts = await this.supabase.select<Array<{ entity_key: string }>>(
      'data_contracts',
      `select=entity_key&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&status=eq.active`,
    );
    const entityKeys = [...new Set(contracts.map((contract) => contract.entity_key))];
    const published = sources[0].source_type === 'api'
      ? await this.supabase.select<unknown[]>('operation_records', `select=id&tenant_id=eq.${tenantId}&source_data_source_id=eq.${sourceId}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&limit=1`)
      : [];
    const nextStatus = sources[0].source_type === 'api' && !published.length ? 'configuring' : 'active';
    if (nextStatus === 'active' && entityKeys.length) {
      const otherModules = await this.supabase.select<Array<{ data_source_id: string; module_key: string }>>(
        'data_source_modules',
        `select=data_source_id,module_key&tenant_id=eq.${tenantId}&module_key=in.(${moduleKeys.map((key) => `"${key}"`).join(',')})&data_source_id=neq.${sourceId}`,
      );
      for (const other of otherModules) {
        const activeSources = await this.supabase.select<Array<{ id: string }>>(
          'data_sources',
          `select=id&tenant_id=eq.${tenantId}&id=eq.${other.data_source_id}&status=eq.active&limit=1`,
        );
        if (!activeSources.length) continue;
        const conflicts = await this.supabase.select<Array<{ id: string }>>(
          'data_contracts',
          `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${other.data_source_id}&entity_key=in.(${entityKeys.map((key) => `"${key}"`).join(',')})&status=eq.active&limit=1`,
        );
        if (conflicts.length)
          throw new BadRequestException('Já existe uma integração ativa para este módulo. Arquive a fonte atual antes de ativar outra.');
      }
    }
    await this.supabase.delete('data_source_modules', `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`);
    await this.supabase.insert('data_source_modules', moduleKeys.map((moduleKey) => ({ tenant_id: tenantId, data_source_id: sourceId, module_key: moduleKey })) as unknown as Record<string, unknown>);
    const metadata = { ...(sources[0].metadata ?? {}), ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}), module_keys: moduleKeys };
    const rows = await this.supabase.update<Record<string, unknown>[]>('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}`, {
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined,
      module_key: moduleKeys.length > 1 ? 'core' : moduleKeys[0], metadata, status: nextStatus, updated_by: userId,
    });
    return rows[0];
  }
  async deleteDataSourceIfUnused(tenantId: string, sourceId: string) {
    const batches = await this.supabase.select<unknown[]>('staging_batches', `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`);
    if (batches.length) throw new BadRequestException('Integração com lotes vinculados só pode ser inativada.');
    return this.supabase.delete('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}`);
  }
  async removeIncompatibleApiContracts(tenantId: string, sourceId: string, body: Record<string, unknown>) {
    const moduleKey = String(body.module_key ?? '');
    const entityKey = String(body.entity_key ?? '');
    const validPair = (moduleKey === 'atendimento' && entityKey === 'occurrences') || (moduleKey === 'transporte' && entityKey === 'deliveries');
    if (!validPair) throw new BadRequestException('Módulo ou entidade inválida para o contrato inicial da API.');
    const sources = await this.supabase.select<Array<{ id: string; source_type: string }>>('data_sources', `select=id,source_type&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`);
    if (!sources[0]) throw new NotFoundException('Integração não encontrada para este tenant.');
    if (sources[0].source_type !== 'api') throw new BadRequestException('A fonte informada não é uma integração API.');
    const contracts = await this.supabase.select<Array<{ id: string; module_key: string; entity_key: string }>>('data_contracts', `select=id,module_key,entity_key&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}`);
    const incompatible = contracts.filter((contract) => contract.module_key !== moduleKey || contract.entity_key !== entityKey);
    if (!incompatible.length) return { removed: 0 };
    const contractFilter = incompatible.map((contract) => `"${contract.id}"`).join(',');
    const [batches, apiMappings, fieldMappings] = await Promise.all([
      this.supabase.select<unknown[]>('staging_batches', `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`),
      this.supabase.select<unknown[]>('data_source_api_field_mappings', `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`),
      this.supabase.select<unknown[]>('field_mappings', `select=id&tenant_id=eq.${tenantId}&data_contract_id=in.(${contractFilter})&limit=1`),
    ]);
    if (batches.length || apiMappings.length || fieldMappings.length) throw new BadRequestException('Esta integração possui contrato incompatível criado anteriormente. Arquive esta fonte e crie uma nova integração.');
    await this.supabase.delete('data_contracts', `tenant_id=eq.${tenantId}&id=in.(${contractFilter})`);
    return { removed: incompatible.length };
  }

  private async syncSetupContractFields(tenantId: string, contractId: string, headers: string[]) {
    await this.supabase.delete('data_contract_allowed_values', `tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}`);
    await this.supabase.delete('data_contract_fields', `tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}`);
    const seen = new Map<string, number>();
    const payload = headers.map((header, index) => {
      const baseKey = this.toFieldKey(header) || `campo_${index + 1}`;
      const count = seen.get(baseKey) ?? 0;
      seen.set(baseKey, count + 1);
      const fieldKey = count === 0 ? baseKey : `${baseKey}_${count + 1}`;
      return { tenant_id: tenantId, data_contract_id: contractId, field_key: fieldKey, source_field_name: header, data_type: 'text', is_required: false, is_unique: false, allow_null: true, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: (index + 1) * 10 };
    });
    if (!payload.length) return [];
    return this.supabase.insert<ContractField[]>('data_contract_fields', payload);
  }
  private toFieldKey(header: string) {
    return header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  }
  private batchError(tenantId: string, batchId: string, code: string, sourceField: string, fieldKey: string | null, expected: string, message: string) { return { tenant_id: tenantId, staging_batch_id: batchId, error_code: code, severity: 'error', source_field_name: sourceField, field_key: fieldKey, expected_rule: expected, message }; }
  private rowError(tenantId: string, batchId: string, recordId: string | null, field: { id: string; field_key: string; source_field_name: string }, raw: unknown, code: string, message: string) { return { tenant_id: tenantId, staging_batch_id: batchId, staging_record_id: recordId, data_contract_field_id: field.id, error_code: code, severity: 'error', field_key: field.field_key, source_field_name: field.source_field_name, raw_value: raw == null ? null : String(raw), expected_rule: message, message }; }

  async listErrors(tenantId: string, batchId: string) { await this.getBatch(tenantId, batchId); return this.supabase.select('staging_errors', `select=${errorFields}&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&order=created_at.asc`); }
  private async ensureExists(table: string, tenantId: string, id: string, message: string) { const rows = await this.supabase.select<unknown[]>(table, `select=id&tenant_id=eq.${tenantId}&id=eq.${id}&limit=1`); if (!rows.length) throw new NotFoundException(message); }
  private pick(body: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])); }
}
