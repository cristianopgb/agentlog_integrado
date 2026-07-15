import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type Query = { search?: string; quality?: string; source?: string; source_id?: string; batch_id?: string; date_from?: string; date_to?: string; include_archived?: string; limit?: string; offset?: string };
const qualities = new Set(['valid', 'partial', 'invalid', 'manual_review']);
const extensionTables = ['transport_records', 'attendance_records', 'finance_records', 'warehouse_records', 'team_records'] as const;
const operationColumns = 'id,tenant_id,external_id,external_code,source_system,source_data_source_id,source_data_contract_id,source_staging_batch_id,source_staging_record_id,source_payload_hash,module_origin,record_type,document_number,document_type,cte_number,invoice_number,manifest_number,order_number,delivery_number,customer_name,customer_document,shipper_name,shipper_document,recipient_name,recipient_document,payer_name,payer_document,origin_city,origin_state,destination_city,destination_state,vehicle_plate,driver_name,driver_document,status,status_updated_at,occurrence_status,last_event_at,gross_weight,cubed_weight,volume_count,total_value,freight_value,issued_at,expected_date,completed_at,data_quality_status,created_at,updated_at';

@Injectable()
export class NativeRecordsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(tenantId: string, query: Query) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const includeArchived = query.include_archived === 'true';
    const sourceIds = includeArchived ? [] : await this.activeSourceIds(tenantId);
    if (!includeArchived && !sourceIds.length) return this.emptyList(limit, offset);
    const filters = this.recordFilters(tenantId, query, sourceIds, `select=${operationColumns}`);
    const rows = await this.supabase.select<Record<string, unknown>[]>('operation_records', `${filters.join('&')}&order=updated_at.desc&limit=${limit}&offset=${offset}`);
    const names = await this.sourceNamesById(tenantId, [...new Set(rows.map((r) => r.source_data_source_id).filter((id): id is string => typeof id === 'string' && id.length > 0))]);
    const all = await this.supabase.select<Array<{ data_quality_status: string | null; updated_at: string | null }>>('operation_records', `${this.recordFilters(tenantId, query, sourceIds, 'select=data_quality_status,updated_at').join('&')}&order=updated_at.desc&limit=10000`);
    return { data: rows.map((row) => ({ ...clean(row), source_data_source_name: typeof row.source_data_source_id === 'string' ? names.get(row.source_data_source_id) ?? null : null })), pagination: { limit, offset, count: rows.length }, summary: this.summary(all) };
  }

  async filters(tenantId: string, includeArchived = false) {
    const sourceStatus = includeArchived ? '' : '&status=eq.active';
    const sources = await this.supabase.select<Array<{ id: string; name: string | null; status: string | null }>>('data_sources', `select=id,name,status&tenant_id=eq.${tenantId}${sourceStatus}&order=name.asc&limit=10000`);
    if (!includeArchived && !sources.length) return { sources: [], batches: [] };
    const sourceIds = sources.map((s) => s.id);
    const opFilters = [`select=id,source_staging_batch_id,source_data_source_id`, `tenant_id=eq.${tenantId}`, 'deleted_at=is.null'];
    if (!includeArchived) opFilters.push(`source_data_source_id=in.(${sourceIds.map((id) => `"${id}"`).join(',')})`);
    const ops = await this.supabase.select<Array<{ source_staging_batch_id: string | null; source_data_source_id: string | null }>>('operation_records', `${opFilters.join('&')}&limit=10000`);
    const counts = new Map<string, number>();
    ops.forEach((r) => { if (r.source_staging_batch_id) counts.set(r.source_staging_batch_id, (counts.get(r.source_staging_batch_id) ?? 0) + 1); });
    const batchIds = [...counts.keys()];
    const batches = batchIds.length ? await this.supabase.select<Array<{ id: string; data_source_id: string | null; batch_code: string | null; source_reference: string | null; received_at: string | null; created_at: string | null; total_records: number | null }>>('staging_batches', `select=id,data_source_id,batch_code,source_reference,received_at,created_at,total_records&tenant_id=eq.${tenantId}&id=in.(${batchIds.map((id) => `"${id}"`).join(',')})&order=created_at.desc&limit=10000`) : [];
    const sourceNames = new Map(sources.map((s) => [s.id, s.name ?? 'Integração sem nome']));
    return { sources: sources.map((s) => ({ id: s.id, name: s.name ?? 'Integração sem nome', status: s.status })), batches: batches.map((b) => ({ id: b.id, data_source_id: b.data_source_id, source_name: b.data_source_id ? sourceNames.get(b.data_source_id) ?? null : null, label: `${b.received_at ?? b.created_at ?? 'Sem data'} · ${b.data_source_id ? sourceNames.get(b.data_source_id) ?? 'Origem não informada' : 'Origem não informada'} · ${counts.get(b.id) ?? 0} registros`, batch_code: b.batch_code, source_reference: b.source_reference, records_count: counts.get(b.id) ?? 0, created_at: b.created_at, received_at: b.received_at })) };
  }

  private emptyList(limit: number, offset: number) { return { data: [], pagination: { limit, offset, count: 0 }, summary: this.summary([]) }; }
  private summary(rows: Array<{ data_quality_status: string | null; updated_at: string | null }>) { return { total: rows.length, complete: rows.filter((r) => r.data_quality_status === 'valid').length, partial: rows.filter((r) => r.data_quality_status === 'partial').length, lastNormalization: rows[0]?.updated_at ?? null, note: 'Registro parcial significa que a linha foi processada, mas algum campo mapeado veio vazio ou faltou uma chave operacional. Isso não é a mesma coisa que indicador parcial.' }; }
  private recordFilters(tenantId: string, query: Query, sourceIds: string[], select: string) { const filters = [select, `tenant_id=eq.${tenantId}`, 'deleted_at=is.null']; if (sourceIds.length) filters.push(`source_data_source_id=in.(${sourceIds.map((id) => `"${id}"`).join(',')})`); if (query.quality && qualities.has(query.quality)) filters.push(`data_quality_status=eq.${query.quality}`); if (query.source_id) filters.push(`source_data_source_id=eq.${query.source_id}`); if (query.batch_id) filters.push(`source_staging_batch_id=eq.${query.batch_id}`); if (query.source) filters.push(`source_system=eq.${encodeURIComponent(query.source)}`); if (query.date_from) filters.push(`updated_at=gte.${encodeURIComponent(query.date_from)}`); if (query.date_to) filters.push(`updated_at=lte.${encodeURIComponent(query.date_to)}`); if (query.search?.trim()) { const term = encodeURIComponent(`*${query.search.trim()}*`); filters.push(`or=(cte_number.ilike.${term},invoice_number.ilike.${term},document_number.ilike.${term},order_number.ilike.${term},delivery_number.ilike.${term},customer_name.ilike.${term},customer_document.ilike.${term},status.ilike.${term})`); } return filters; }
  async get(tenantId: string, recordId: string) { const rows = await this.supabase.select<Record<string, unknown>[]>('operation_records', `select=${operationColumns}&tenant_id=eq.${tenantId}&id=eq.${recordId}&deleted_at=is.null&limit=1`); if (!rows[0]) throw new NotFoundException('Registro tratado não encontrado para este tenant.'); return clean(rows[0]); }
  async events(tenantId: string, recordId: string) { await this.get(tenantId, recordId); const rows = await this.supabase.select<Record<string, unknown>[]>('entity_events', `select=id,entity_type,entity_id,event_type,event_title,event_description,occurred_at,source_system,source_data_source_id,source_staging_record_id,created_at&tenant_id=eq.${tenantId}&entity_type=eq.operation_record&entity_id=eq.${recordId}&order=occurred_at.desc&limit=100`); return rows.map(clean); }
  private async activeSourceIds(tenantId: string) { const rows = await this.supabase.select<Array<{ id: string }>>('data_sources', `select=id&tenant_id=eq.${tenantId}&status=eq.active&limit=10000`); return rows.map((r) => r.id); }
  private async sourceNamesById(tenantId: string, sourceIds: string[]) { if (!sourceIds.length) return new Map<string, string>(); const ids = sourceIds.map((id) => `"${id}"`).join(','); const rows = await this.supabase.select<Array<{ id: string; name: string | null }>>('data_sources', `select=id,name&tenant_id=eq.${tenantId}&id=in.(${ids})`); return new Map(rows.map((row) => [row.id, row.name ?? 'Origem não informada'])); }
  async extensions(tenantId: string, recordId: string) { await this.get(tenantId, recordId); const entries = await Promise.all(extensionTables.map(async (table) => { const rows = await this.supabase.select<Record<string, unknown>[]>(table, `select=*&tenant_id=eq.${tenantId}&operation_record_id=eq.${recordId}&deleted_at=is.null&order=updated_at.desc&limit=20`); return [table, rows.map(clean)] as const; })); return Object.fromEntries(entries); }
}
function clean<T extends Record<string, unknown>>(row: T): T { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === undefined ? null : value])) as T; }
