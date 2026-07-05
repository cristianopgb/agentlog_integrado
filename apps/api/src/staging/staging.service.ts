import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const batchFields = 'id,tenant_id,data_source_id,data_contract_id,batch_code,source_reference,status,total_records,valid_records,invalid_records,error_count,metadata,received_at,validated_at,created_at,updated_at,data_source:data_sources!staging_batches_data_source_tenant_fk(id,name),data_contract:data_contracts!staging_batches_data_contract_tenant_fk(id,name)';
const recordFields = 'id,tenant_id,staging_batch_id,data_contract_id,row_number,raw_payload,normalized_payload,validation_status,error_count,validated_at,created_at,updated_at';
const errorFields = 'id,tenant_id,staging_batch_id,staging_record_id,data_contract_field_id,error_code,severity,field_key,source_field_name,raw_value,expected_rule,message,created_at';

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
  async listErrors(tenantId: string, batchId: string) { await this.getBatch(tenantId, batchId); return this.supabase.select('staging_errors', `select=${errorFields}&tenant_id=eq.${tenantId}&staging_batch_id=eq.${batchId}&order=created_at.asc`); }
  private async ensureExists(table: string, tenantId: string, id: string, message: string) { const rows = await this.supabase.select<unknown[]>(table, `select=id&tenant_id=eq.${tenantId}&id=eq.${id}&limit=1`); if (!rows.length) throw new NotFoundException(message); }
  private pick(body: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])); }
}
