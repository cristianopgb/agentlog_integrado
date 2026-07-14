import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type Status = 'available' | 'partial' | 'unavailable' | 'empty' | 'failed';
type FieldRef = { table: TableName; field: string };
type FieldGroup = { key: string; label: string; any_of: FieldRef[] };
type Definition = { id: string; module_key: string; family_key: string; indicator_key: string; name: string; description: string | null; indicator_type: string; visualization_type: string; value_format: string; calculation_type: string; calculation_config: Record<string, unknown>; required_fields: FieldGroup[]; optional_fields: FieldGroup[]; availability_rules: Record<string, unknown>; sort_order: number };
type TableName = keyof typeof tableColumns;

type PreviewScope = { scope: string; source_data_source_id?: string; source_data_source_name?: string | null; source_staging_batch_id?: string; date_from?: string; date_to?: string; status?: string; data_quality_status?: string };
type Preview = { status: Status; value: unknown; series: Array<Record<string, unknown>>; table: Array<Record<string, unknown>>; records_considered: number; records_used: number; records_ignored_missing_data: number; scope: PreviewScope; missing_fields: string[]; available_fields: string[]; message: string };

const allowedTables = ['operation_records', 'transport_records', 'attendance_records', 'finance_records', 'warehouse_records', 'team_records'] as const;
const tableColumns = {
  operation_records: new Set(['id','source_data_source_id','source_staging_batch_id','document_type','customer_name','customer_document','origin_state','destination_state','status','occurrence_status','gross_weight','cubed_weight','volume_count','total_value','freight_value','issued_at','expected_date','completed_at','data_quality_status','updated_at','delivery_number','driver_name','vehicle_plate']),
  transport_records: new Set(['id','transport_status','route_name','collected_at','delivered_at','delivery_performance_status','sla_status','updated_at']),
  attendance_records: new Set(['id','ticket_number','channel','occurrence_type','occurrence_reason','priority','attendance_status','opened_at','resolved_at','sla_due_at','updated_at']),
  finance_records: new Set(['id','billing_status','proof_of_delivery_status','ready_to_bill','blocked_amount','block_status','extra_cost_value','discount_value','total_amount','due_at','paid_at','updated_at']),
  warehouse_records: new Set(['id','product_code','sku','product_name','warehouse_code','location_code','quantity_available','quantity_reserved','quantity_blocked','last_movement_type','last_movement_at','warehouse_status','updated_at']),
  team_records: new Set(['id','employee_code','employee_name','department_name','position_name','team_status','admission_date','termination_date','workload_hours','overtime_hours','worked_at','updated_at']),
} satisfies Record<string, Set<string>>;

@Injectable()
export class NativeIndicatorsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(tenantId: string) {
    const defs = await this.definitions();
    const items = await Promise.all(defs.map(async (definition) => ({ ...this.publicDefinition(definition), availability: await this.availability(tenantId, definition) })));
    return { data: items };
  }

  async summary(tenantId: string) {
    const defs = await this.definitions();
    const statuses = await Promise.all(defs.map((definition) => this.availability(tenantId, definition)));
    return { total: defs.length, available: statuses.filter((s) => s.status === 'available').length, partial: statuses.filter((s) => s.status === 'partial').length, unavailable: statuses.filter((s) => s.status === 'unavailable').length, empty: statuses.filter((s) => s.status === 'empty').length };
  }

  async detail(tenantId: string, indicatorKey: string) {
    const definition = await this.definition(indicatorKey);
    const availability = await this.availability(tenantId, definition);
    const preview = availability.status === 'available' || availability.status === 'partial' ? await this.preview(tenantId, indicatorKey, undefined, false) : null;
    return { ...this.publicDefinition(definition), availability, preview };
  }

  async preview(tenantId: string, indicatorKey: string, userId?: string, log = false, filters: Record<string, unknown> = {}): Promise<Preview> {
    const definition = await this.definition(indicatorKey);
    let result: Preview;
    try {
      const availability = await this.availability(tenantId, definition);
      if (availability.status === 'empty' || availability.status === 'unavailable') result = { status: availability.status, value: null, series: [], table: [], records_considered: 0, records_used: 0, records_ignored_missing_data: 0, scope: { scope: 'all' }, missing_fields: availability.missing_fields, available_fields: availability.available_fields, message: this.longMessage(availability.status) };
      else result = await this.calculate(tenantId, definition, availability.status, filters);
    } catch {
      result = { status: 'failed', value: null, series: [], table: [], records_considered: 0, records_used: 0, records_ignored_missing_data: 0, scope: { scope: 'all' }, missing_fields: [], available_fields: [], message: 'Não foi possível calcular este indicador agora.' };
    }
    if (log) await this.log(tenantId, definition.id, userId, result);
    return result;
  }

  private async definitions() { return this.supabase.select<Definition[]>('native_indicator_definitions', 'select=*&status=eq.active&order=sort_order.asc'); }
  private async definition(indicatorKey: string) { const rows = await this.supabase.select<Definition[]>('native_indicator_definitions', `select=*&indicator_key=eq.${indicatorKey}&status=eq.active&limit=1`); if (!rows[0]) throw new NotFoundException('Indicador nativo não encontrado.'); return rows[0]; }
  private publicDefinition(d: Definition) { return { id: d.id, module_key: d.module_key, family_key: d.family_key, indicator_key: d.indicator_key, name: d.name, description: d.description, indicator_type: d.indicator_type, visualization_type: d.visualization_type, value_format: d.value_format, calculation_type: d.calculation_type, required_fields: d.required_fields ?? [], optional_fields: d.optional_fields ?? [], sort_order: d.sort_order }; }

  private async availability(tenantId: string, d: Definition) {
    const table = this.safeTable(String(d.calculation_config?.table ?? 'operation_records'));
    const total = await this.countRows(tenantId, table);
    if (!total) return { status: 'empty' as Status, records_considered: 0, missing_fields: [], available_fields: [], message: this.shortMessage('empty') };
    const required = d.required_fields ?? [];
    const results = await Promise.all(required.map((group) => this.groupAvailable(tenantId, group)));
    const available = results.filter((r) => r.available).flatMap((r) => r.labels);
    const missing = results.filter((r) => !r.available).map((r) => r.label);
    const status: Status = missing.length === 0 ? 'available' : (available.length > 0 && d.availability_rules?.partial_if_any_required ? 'partial' : 'unavailable');
    return { status, records_considered: total, missing_fields: missing, available_fields: available, message: this.shortMessage(status) };
  }

  private async groupAvailable(tenantId: string, group: FieldGroup) {
    for (const ref of group.any_of ?? []) {
      const table = this.safeTable(ref.table); const field = this.safeField(table, ref.field);
      const count = await this.countRows(tenantId, table, `${field}=not.is.null`);
      if (count > 0) return { available: true, label: group.label, labels: [`${table}.${field}`] };
    }
    return { available: false, label: group.label, labels: [] };
  }

  private async calculate(tenantId: string, d: Definition, status: Status, filters: Record<string, unknown>): Promise<Preview> {
    const cfg = d.calculation_config ?? {}; const table = this.safeTable(String(cfg.table)); const calc = d.calculation_type;
    const field = cfg.field ? this.safeField(table, String(cfg.field)) : 'id'; const rows = await this.rows(tenantId, table);
    const scoped = await this.applyPreviewScope(tenantId, rows, filters);
    const filtered = scoped.rows.filter((row) => this.matchesWhere(row, cfg.where as Record<string, unknown> | undefined));
    const nums = filtered.map((r) => Number(r[field])).filter(Number.isFinite);
    const ignored = filtered.length - nums.length;
    const base = { status, missing_fields: [], available_fields: [field], records_considered: filtered.length, records_used: calc === 'count' ? filtered.length : nums.length, records_ignored_missing_data: calc === 'count' ? 0 : ignored, scope: scoped.scope, message: this.scopeMessage(scoped.scope, ignored) };
    if (calc === 'count') return { ...base, value: filtered.length, series: [], table: [] };
    if (calc === 'sum') return { ...base, value: nums.reduce((a, b) => a + b, 0), series: [], table: [] };
    if (calc === 'avg') return { ...base, value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0, series: [], table: [] };
    if (calc === 'min') return { ...base, value: nums.length ? Math.min(...nums) : null, series: [], table: [] };
    if (calc === 'max') return { ...base, value: maxValue(filtered.map((r) => r[field])), series: [], table: [] };
    if (calc === 'latest') return { ...base, value: null, series: [], table: filtered.sort((a,b)=>String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))).slice(0, Number(cfg.limit) || 10) };
    if (calc === 'group_by' || calc === 'ranking') return { ...base, value: null, series: this.group(filtered, table, cfg), table: this.group(filtered, table, cfg) };
    if (calc === 'duration_avg') return { ...base, value: this.avgDuration(filtered, table, cfg), series: [], table: [] };
    if (calc === 'percentage' || calc === 'ratio') return { ...base, value: this.percentage(filtered, d.indicator_key), series: [], table: [] };
    return { status: 'unavailable', value: null, series: [], table: [], records_considered: 0, records_used: 0, records_ignored_missing_data: 0, scope: { scope: 'all' }, missing_fields: [], available_fields: [], message: 'Este indicador ainda não possui cálculo habilitado nesta versão.' };
  }

  private group(rows: Record<string, unknown>[], table: TableName, cfg: Record<string, unknown>) { const gf = this.safeField(table, String(cfg.group_field ?? cfg.field)); const af = cfg.aggregation_field && tableColumns[table].has(String(cfg.aggregation_field)) ? String(cfg.aggregation_field) : undefined; const map = new Map<string, number>(); rows.forEach((r) => { const label = String(r[gf] ?? 'Não informado'); const value = af ? Number(r[af]) || 0 : 1; map.set(label, (map.get(label) ?? 0) + value); }); return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value).slice(0, Number(cfg.limit) || 20); }
  private avgDuration(rows: Record<string, unknown>[], table: TableName, cfg: Record<string, unknown>) { const start = this.safeField(table, String(cfg.start_field ?? cfg.field)); const end = tableColumns[table].has(String(cfg.end_field)) ? String(cfg.end_field) : 'updated_at'; const diffs = rows.map((r) => Date.parse(String(r[end])) - Date.parse(String(r[start]))).filter(Number.isFinite).filter((n) => n >= 0); return diffs.length ? diffs.reduce((a,b)=>a+b,0) / diffs.length / 3600000 : 0; }
  private percentage(rows: Record<string, unknown>[], key: string) { if (!rows.length) return 0; if (key.includes('otd') || key.includes('sla')) return Math.round((rows.filter((r) => (r.completed_at && r.expected_date && String(r.completed_at) <= String(r.expected_date)) || ['met','on_time','cumprido'].includes(String(r.sla_status))).length / rows.length) * 10000) / 100; return 100; }
  private async applyPreviewScope(tenantId: string, rows: Record<string, unknown>[], filters: Record<string, unknown>) {
    const scope: PreviewScope = { scope: String(filters.scope ?? 'all') };
    let next = rows;
    if (scope.scope === 'last_batch') {
      const batches = await this.supabase.select<Array<{ id: string }>>('staging_batches', `select=id&tenant_id=eq.${tenantId}&order=created_at.desc&limit=1`);
      scope.source_staging_batch_id = batches[0]?.id;
      next = scope.source_staging_batch_id ? next.filter((r) => r.source_staging_batch_id === scope.source_staging_batch_id) : [];
    }
    if (typeof filters.source_data_source_id === 'string') { scope.source_data_source_id = filters.source_data_source_id; next = next.filter((r) => r.source_data_source_id === filters.source_data_source_id); }
    if (typeof filters.source_staging_batch_id === 'string') { scope.source_staging_batch_id = filters.source_staging_batch_id; next = next.filter((r) => r.source_staging_batch_id === filters.source_staging_batch_id); }
    if (typeof filters.status === 'string') { scope.status = filters.status; next = next.filter((r) => r.status === filters.status); }
    if (typeof filters.data_quality_status === 'string') { scope.data_quality_status = filters.data_quality_status; next = next.filter((r) => r.data_quality_status === filters.data_quality_status); }
    if (typeof filters.date_from === 'string') { scope.date_from = filters.date_from; next = next.filter((r) => String(r.issued_at ?? r.updated_at ?? '') >= String(filters.date_from)); }
    if (typeof filters.date_to === 'string') { scope.date_to = filters.date_to; next = next.filter((r) => String(r.issued_at ?? r.updated_at ?? '') <= String(filters.date_to)); }
    if (scope.source_data_source_id) { const src = await this.supabase.select<Array<{ name: string }>>('data_sources', `select=name&tenant_id=eq.${tenantId}&id=eq.${scope.source_data_source_id}&limit=1`); scope.source_data_source_name = src[0]?.name ?? null; }
    return { rows: next, scope };
  }
  private scopeMessage(scope: PreviewScope, ignored: number) { const parts = [scope.scope === 'last_batch' ? 'Cálculo realizado usando somente o último lote processado.' : scope.source_data_source_id ? 'Cálculo realizado usando somente a integração selecionada.' : (scope.date_from || scope.date_to) ? 'Cálculo realizado usando somente o período selecionado.' : 'Cálculo realizado usando todos os dados tratados disponíveis para este tenant.']; if (ignored > 0) parts.push(`${ignored} registros foram ignorados porque não possuem os campos necessários para este indicador.`); return parts.join(' '); }
  private matchesWhere(row: Record<string, unknown>, where?: Record<string, unknown>) { if (!where) return true; return Object.entries(where).every(([k, v]) => row[k] === v); }
  private async rows(tenantId: string, table: TableName) { return this.supabase.select<Record<string, unknown>[]>(table, `select=*&tenant_id=eq.${tenantId}&deleted_at=is.null&limit=10000`); }
  private async countRows(tenantId: string, table: TableName, extra?: string) { const q = [`select=id`, `tenant_id=eq.${tenantId}`, 'deleted_at=is.null']; if (extra) q.push(extra); const rows = await this.supabase.select<Array<{ id: string }>>(table, `${q.join('&')}&limit=10000`); return rows.length; }
  private safeTable(table: string): TableName { if ((allowedTables as readonly string[]).includes(table)) return table as TableName; return 'operation_records'; }
  private safeField(table: TableName, field: string) { const clean = field.includes('.') ? field.split('.').pop() ?? field : field; if (!tableColumns[table].has(clean)) throw new Error('Campo não permitido para indicador nativo.'); return clean; }
  private shortMessage(status: Status) { return ({ available: 'Indicador disponível.', partial: 'Indicador parcial. Mapeie mais campos para melhorar a análise.', unavailable: 'Indicador indisponível. Mapeie os campos necessários na integração para habilitar esta análise.', empty: 'Ainda não há dados tratados suficientes para este indicador.', failed: 'Não foi possível calcular este indicador agora.' })[status]; }
  private longMessage(status: Status) { if (status === 'partial') return 'Indicador parcial. O sistema calculou com os dados disponíveis, mas pode melhorar com mais campos mapeados.'; if (status === 'unavailable') return 'Indicador indisponível. Mapeie os campos necessários na integração para habilitar esta análise.'; return this.shortMessage(status); }
  private async log(tenantId: string, indicator_definition_id: string, user_id: string | undefined, result: Preview) { await this.supabase.insert('native_indicator_calculation_logs', { tenant_id: tenantId, indicator_definition_id, user_id: user_id ?? null, execution_type: 'preview', availability_status: result.status, records_considered: result.records_considered, result_preview: { value: result.value, series: result.series.slice(0, 20), table: result.table.slice(0, 20) }, message: result.message }); }
}
function maxValue(values: unknown[]) { const dates = values.map((v) => Date.parse(String(v))).filter(Number.isFinite); if (dates.length) return new Date(Math.max(...dates)).toISOString(); const nums = values.map(Number).filter(Number.isFinite); return nums.length ? Math.max(...nums) : null; }
