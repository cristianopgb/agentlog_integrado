import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type Query = { search?: string; quality?: string; source?: string; limit?: string; offset?: string };
const qualities = new Set(['valid', 'partial', 'invalid', 'manual_review']);
const extensionTables = ['transport_records', 'attendance_records', 'finance_records', 'warehouse_records', 'team_records'] as const;
const operationColumns = 'id,tenant_id,external_id,external_code,source_system,source_data_source_id,source_data_contract_id,source_staging_batch_id,source_staging_record_id,source_payload_hash,module_origin,record_type,document_number,document_type,cte_number,invoice_number,manifest_number,order_number,delivery_number,customer_name,customer_document,shipper_name,shipper_document,recipient_name,recipient_document,payer_name,payer_document,origin_city,origin_state,destination_city,destination_state,vehicle_plate,driver_name,driver_document,status,status_updated_at,occurrence_status,last_event_at,gross_weight,cubed_weight,volume_count,total_value,freight_value,issued_at,expected_date,completed_at,data_quality_status,created_at,updated_at';

@Injectable()
export class NativeRecordsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(tenantId: string, query: Query) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const filters = [`select=${operationColumns}`, `tenant_id=eq.${tenantId}`, 'deleted_at=is.null'];
    if (query.quality && qualities.has(query.quality)) filters.push(`data_quality_status=eq.${query.quality}`);
    if (query.source) filters.push(`source_system=eq.${encodeURIComponent(query.source)}`);
    if (query.search?.trim()) {
      const term = encodeURIComponent(`*${query.search.trim()}*`);
      filters.push(`or=(cte_number.ilike.${term},invoice_number.ilike.${term},document_number.ilike.${term},order_number.ilike.${term},delivery_number.ilike.${term},customer_name.ilike.${term},customer_document.ilike.${term},status.ilike.${term})`);
    }
    const rows = await this.supabase.select<Record<string, unknown>[]>('operation_records', `${filters.join('&')}&order=updated_at.desc&limit=${limit}&offset=${offset}`);
    const all = await this.supabase.select<Array<{ data_quality_status: string | null; updated_at: string | null }>>('operation_records', `select=data_quality_status,updated_at&tenant_id=eq.${tenantId}&deleted_at=is.null&order=updated_at.desc&limit=10000`);
    return { data: rows.map(clean), pagination: { limit, offset, count: rows.length }, summary: { total: all.length, complete: all.filter((r) => r.data_quality_status === 'valid').length, partial: all.filter((r) => r.data_quality_status === 'partial').length, lastNormalization: all[0]?.updated_at ?? null } };
  }

  async get(tenantId: string, recordId: string) {
    const rows = await this.supabase.select<Record<string, unknown>[]>('operation_records', `select=${operationColumns}&tenant_id=eq.${tenantId}&id=eq.${recordId}&deleted_at=is.null&limit=1`);
    if (!rows[0]) throw new NotFoundException('Registro tratado não encontrado para este tenant.');
    return clean(rows[0]);
  }

  async events(tenantId: string, recordId: string) {
    await this.get(tenantId, recordId);
    const rows = await this.supabase.select<Record<string, unknown>[]>('entity_events', `select=id,entity_type,entity_id,event_type,event_title,event_description,occurred_at,source_system,source_data_source_id,source_staging_record_id,created_at&tenant_id=eq.${tenantId}&entity_type=eq.operation_record&entity_id=eq.${recordId}&order=occurred_at.desc&limit=100`);
    return rows.map(clean);
  }

  async extensions(tenantId: string, recordId: string) {
    await this.get(tenantId, recordId);
    const entries = await Promise.all(extensionTables.map(async (table) => {
      const rows = await this.supabase.select<Record<string, unknown>[]>(table, `select=*&tenant_id=eq.${tenantId}&operation_record_id=eq.${recordId}&deleted_at=is.null&order=updated_at.desc&limit=20`);
      return [table, rows.map(clean)] as const;
    }));
    return Object.fromEntries(entries);
  }
}

function clean<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === undefined ? null : value])) as T;
}
