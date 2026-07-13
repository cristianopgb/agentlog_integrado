import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { parseTabularFile } from './file-parser';

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
      const insertedRecords = parsed.rows.length ? await this.supabase.insert<Array<{ id: string; row_number: number }>>('staging_records', parsed.rows.map((raw, index) => ({ tenant_id: tenantId, staging_batch_id: batchId, data_contract_id: contract.id, row_number: index + 1, raw_payload: raw, validation_status: 'valid', error_count: 0, validated_at: new Date().toISOString() }))) : [];
      await Promise.all(insertedRecords.map((record) => this.supabase.update('staging_records', `tenant_id=eq.${tenantId}&id=eq.${record.id}`, { validation_status: 'valid', error_count: 0, validated_at: new Date().toISOString() })));
      return this.getBatch(tenantId, batchId);
    }
    const allowedValues = await this.supabase.select<Array<{ data_contract_field_id: string; value: string; normalized_value: string | null; is_active: boolean }>>('data_contract_allowed_values', `select=data_contract_field_id,value,normalized_value,is_active&tenant_id=eq.${tenantId}&data_contract_id=eq.${contract.id}&is_active=eq.true`);
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
    const errors: Record<string, unknown>[] = [];
    for (const header of unknown) errors.push(this.batchError(tenantId, batchId, 'UNKNOWN_COLUMN', header, null, 'Coluna fora do contrato.', 'Arquivo rejeitado: existem colunas fora do contrato.'));
    for (const field of missing) errors.push(this.batchError(tenantId, batchId, 'MISSING_REQUIRED_COLUMN', field.source_field_name, field.field_key, 'Campo obrigatório presente no contrato.', 'Arquivo rejeitado: coluna obrigatória ausente.'));
    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 1;
      for (const field of fields) {
        if (!parsed.headers.includes(field.source_field_name)) continue;
        const value = row[field.source_field_name];
        const empty = value === null || value === undefined || String(value).trim() === '';
        const rowErrorsBefore = errors.length;
        if (empty && field.is_required && !field.allow_null) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'REQUIRED_VALUE', 'Valor obrigatório ausente.'));
        if (!empty && !this.matchesType(String(value), field.data_type)) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'INVALID_TYPE', `Tipo esperado: ${field.data_type}.`));
        const allowed = allowedValues.filter((item) => item.data_contract_field_id === field.id).map((item) => item.value);
        if (!empty && allowed.length && !allowed.includes(String(value))) errors.push(this.rowError(tenantId, batchId, recordByRow.get(rowNumber) ?? null, field, value, 'VALUE_NOT_ALLOWED', `Valores aceitos: ${allowed.join(', ')}.`));
        if (errors.length > rowErrorsBefore) recordErrors.set(rowNumber, (recordErrors.get(rowNumber) ?? 0) + errors.length - rowErrorsBefore);
      }
    });
    if (errors.length) await this.supabase.insert('staging_errors', errors);
    await Promise.all(insertedRecords.map((record) => {
      const lineErrors = structuralRejected ? 1 : recordErrors.get(record.row_number) ?? 0;
      return this.supabase.update('staging_records', `tenant_id=eq.${tenantId}&id=eq.${record.id}`, { validation_status: lineErrors ? 'invalid' : 'valid', error_count: lineErrors, validated_at: new Date().toISOString() });
    }));
    const invalidRecords = structuralRejected ? parsed.rows.length : recordErrors.size;
    const validRecords = structuralRejected ? 0 : Math.max(parsed.rows.length - invalidRecords, 0);
    const status = structuralRejected ? 'rejected' : invalidRecords > 0 ? 'partially_valid' : 'validated';
    await this.supabase.update('staging_batches', `tenant_id=eq.${tenantId}&id=eq.${batchId}`, { status, valid_records: validRecords, invalid_records: invalidRecords, error_count: errors.length, validated_at: new Date().toISOString(), updated_by: userId, metadata: { filename, file_type: extension, received_headers: parsed.headers, upload_mode: 'manual_file', rejection_reasons: rejectionReasons } });
    return this.getBatch(tenantId, batchId);
  }

  inactivateDataSource(tenantId: string, sourceId: string, userId: string) { return this.supabase.update('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}`, { status: 'inactive', updated_by: userId }); }
  async deleteDataSourceIfUnused(tenantId: string, sourceId: string) {
    const batches = await this.supabase.select<unknown[]>('staging_batches', `select=id&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`);
    if (batches.length) throw new BadRequestException('Integração com lotes vinculados só pode ser inativada.');
    return this.supabase.delete('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}`);
  }

  private matchesType(value: string, type: string) { if (['decimal','number','integer'].includes(type)) return !Number.isNaN(Number(value.replace(',', '.'))); if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value)); if (type === 'datetime') return !Number.isNaN(Date.parse(value)); if (type === 'boolean') return ['true','false','0','1','sim','não','nao'].includes(value.toLowerCase()); return true; }
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
