import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type Status = 'available' | 'partial' | 'waiting_data' | 'empty' | 'failed';
type FieldRef = { table: TableName; field: string };
type FieldGroup = { key: string; label: string; any_of: FieldRef[] };
type Definition = {
  id: string;
  module_key: string;
  family_key: string;
  indicator_key: string;
  name: string;
  description: string | null;
  indicator_type: string;
  visualization_type: string;
  value_format: string;
  calculation_type: string;
  calculation_config: Record<string, unknown>;
  required_fields: FieldGroup[];
  optional_fields: FieldGroup[];
  availability_rules: Record<string, unknown>;
  sort_order: number;
};
type TableName = keyof typeof tableColumns;

type PreviewScope = {
  scope: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  data_quality_status?: string;
  include_archived?: boolean;
};
type JoinedRow = Record<string, unknown> & { __operation: Record<string, unknown> };
type Preview = {
  status: Status;
  value: unknown;
  series: Array<Record<string, unknown>>;
  table: Array<Record<string, unknown>>;
  records_considered: number;
  records_used: number;
  records_ignored_missing_data: number;
  scope: PreviewScope;
  missing_fields: string[];
  available_fields: string[];
  message: string;
  calculation_type: string;
  display_value?: string | null;
  debug?: {
    indicator_key: string;
    calculation_type: string;
    records_considered: number;
    records_used: number;
    value: unknown;
    table_length: number;
    series_length: number;
  };
};

const allowedTables = [
  'operation_records',
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
] as const;
const tableColumns = {
  operation_records: new Set([
    'id',
    'document_type',
    'customer_name',
    'customer_document',
    'origin_state',
    'destination_state',
    'status',
    'occurrence_status',
    'gross_weight',
    'cubed_weight',
    'volume_count',
    'total_value',
    'freight_value',
    'issued_at',
    'expected_date',
    'completed_at',
    'data_quality_status',
    'updated_at',
    'delivery_number',
    'driver_name',
    'vehicle_plate',
    'deleted_at',
  ]),
  transport_records: new Set([
    'id',
    'operation_record_id',
    'transport_status',
    'route_name',
    'trip_number',
    'vehicle_type',
    'driver_phone',
    'collected_at',
    'delivered_at',
    'delivery_performance_status',
    'sla_status',
    'cost_center',
    'updated_at',
    'deleted_at',
  ]),
  attendance_records: new Set([
    'id',
    'operation_record_id',
    'ticket_number',
    'channel',
    'occurrence_type',
    'occurrence_reason',
    'priority',
    'attendance_status',
    'opened_at',
    'resolved_at',
    'sla_due_at',
     'updated_at',
    'deleted_at',
  ]),
  finance_records: new Set([
    'id',
    'operation_record_id',
    'billing_status',
    'proof_of_delivery_status',
    'ready_to_bill',
    'blocked_amount',
    'block_status',
    'extra_cost_value',
    'discount_value',
    'total_amount',
    'due_at',
    'paid_at',
     'updated_at',
    'deleted_at',
  ]),
  warehouse_records: new Set([
    'id',
    'operation_record_id',
    'product_code',
    'sku',
    'product_name',
    'warehouse_code',
    'location_code',
    'quantity_available',
    'quantity_reserved',
    'quantity_blocked',
    'last_movement_type',
    'last_movement_at',
    'warehouse_status',
     'updated_at',
    'deleted_at',
  ]),
  team_records: new Set([
    'id',
    'operation_record_id',
    'employee_code',
    'employee_name',
    'department_name',
    'position_name',
    'team_status',
    'admission_date',
    'termination_date',
    'workload_hours',
    'overtime_hours',
    'worked_at',
     'updated_at',
    'deleted_at',
  ]),
} satisfies Record<string, Set<string>>;

@Injectable()
export class NativeIndicatorsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(tenantId: string) {
    const defs = await this.definitions();
    const items = await Promise.all(
      defs.map(async (definition) => ({
        ...this.publicDefinition(definition),
        availability: await this.availability(tenantId, definition),
      })),
    );
    return { data: items };
  }

  async summary(tenantId: string) {
    const defs = await this.definitions();
    const statuses = await Promise.all(
      defs.map((definition) => this.availability(tenantId, definition)),
    );
    return {
      total: defs.length,
      available: statuses.filter((s) => s.status === 'available').length,
      partial: statuses.filter((s) => s.status === 'partial').length,
      waiting_data: statuses.filter((s) => s.status === 'waiting_data').length,
      empty: statuses.filter((s) => s.status === 'empty').length,
    };
  }

  async detail(tenantId: string, indicatorKey: string) {
    const definition = await this.definition(indicatorKey);
    const availability = await this.availability(tenantId, definition);
    const preview =
      availability.status === 'available' || availability.status === 'partial'
        ? await this.preview(tenantId, indicatorKey, undefined, false)
        : null;
    return { ...this.publicDefinition(definition), availability, preview };
  }

  async preview(
    tenantId: string,
    indicatorKey: string,
    userId?: string,
    log = false,
    filters: Record<string, unknown> = {},
  ): Promise<Preview> {
    const definition = await this.definition(indicatorKey);
    let result: Preview;
    try {
      const availability = await this.availability(
        tenantId,
        definition,
        filters,
      );
      if (
        availability.status === 'empty' ||
        availability.status === 'waiting_data'
      ) {
        result = {
          status: availability.status,
          value: null,
          series: [],
          table: [],
          records_considered: availability.records_considered,
          records_used: 0,
          records_ignored_missing_data: 0,
          scope: availability.scope,
          missing_fields: availability.missing_fields,
          available_fields: availability.available_fields,
          message: this.longMessage(availability.status),
          calculation_type: definition.calculation_type,
        };
      } else
        result = await this.calculate(
          tenantId,
          definition,
          availability.status,
          filters,
        );
    } catch {
      result = {
        status: 'failed',
        value: null,
        series: [],
        table: [],
        records_considered: 0,
        records_used: 0,
        records_ignored_missing_data: 0,
        scope: { scope: 'all' },
        missing_fields: [],
        available_fields: [],
        message: 'Não foi possível calcular este indicador agora.',
        calculation_type: definition.calculation_type,
      };
      result.calculation_type = definition.calculation_type;
    }
    result.calculation_type = definition.calculation_type;
    result.debug = this.previewDebug(definition, result);
    if (log) await this.log(tenantId, definition.id, userId, result);
    return result;
  }

  private async definitions() {
    return this.supabase.select<Definition[]>(
      'native_indicator_definitions',
      'select=*&status=eq.active&order=sort_order.asc',
    );
  }
  private async definition(indicatorKey: string) {
    const rows = await this.supabase.select<Definition[]>(
      'native_indicator_definitions',
      `select=*&indicator_key=eq.${indicatorKey}&status=eq.active&limit=1`,
    );
    if (!rows[0])
      throw new NotFoundException('Indicador nativo não encontrado.');
    return rows[0];
  }
  private publicDefinition(d: Definition) {
    return {
      id: d.id,
      module_key: d.module_key,
      family_key: d.family_key,
      indicator_key: d.indicator_key,
      name: d.name,
      description: d.description,
      indicator_type: d.indicator_type,
      visualization_type: d.visualization_type,
      value_format: d.value_format,
      calculation_type: d.calculation_type,
      required_fields: d.required_fields ?? [],
      optional_fields: d.optional_fields ?? [],
      sort_order: d.sort_order,
      rationale: this.rationale(d),
      native_data_used: this.configFieldsFromRefs(d.calculation_config ?? {}),
    };
  }

  private rationale(d: Definition) {
    const cfg = d.calculation_config ?? {};
    const field = this.friendly(String((cfg.metric as Record<string, unknown> | undefined)?.field ?? cfg.field ?? 'registros'));
    const dimension = this.friendly(String((cfg.dimension as Record<string, unknown> | undefined)?.field ?? cfg.group_field ?? 'dimensão'));
    if (d.calculation_type === 'sum') return `Soma o campo nativo de ${field} nos registros da base nativa dentro do escopo selecionado.`;
    if (d.calculation_type === 'avg') return `Calcula a média do campo nativo de ${field} nos registros da base nativa dentro do escopo selecionado.`;
    if (d.calculation_type === 'count') return 'Conta registros existentes na base nativa dentro do escopo selecionado.';
    if (d.calculation_type === 'count_distinct') return `Conta valores distintos do campo nativo de ${field} na base nativa.`;
    if (d.calculation_type === 'ratio') return 'Divide métricas calculadas exclusivamente sobre campos da base nativa.';
    if (d.calculation_type === 'group_by' || d.calculation_type === 'ranking') return `Calcula a métrica nativa selecionada agrupando pelo campo nativo de ${dimension}.`;
    if (d.calculation_type === 'duration_avg') return 'Calcula a média do tempo entre campos nativos de data disponíveis na base nativa.';
    if (d.calculation_type === 'percentage') return 'Calcula o percentual usando numerador e denominador definidos por campos nativos.';
    if (d.calculation_type === 'time_series') return 'Calcula a evolução por período usando campos nativos de data da base nativa.';
    return 'Calcula o indicador conforme configuração controlada sobre a base nativa.';
  }

  private friendly(field: string) {
    return ({ id: 'registros', gross_weight: 'peso bruto', freight_value: 'valor do frete', volume_count: 'volumes', total_value: 'valor total', cubed_weight: 'peso cubado', customer_name: 'cliente', document_type: 'tipo de documento', origin_state: 'UF de origem', destination_state: 'UF de destino', route_name: 'rota', vehicle_type: 'tipo de veículo', driver_name: 'motorista', vehicle_plate: 'veículo', delivered_at: 'data de entrega', completed_at: 'data de conclusão', expected_date: 'data prevista' } as Record<string, string>)[field] ?? field.replaceAll('_', ' ');
  }

  private async availability(
    tenantId: string,
    d: Definition,
    filters: Record<string, unknown> = {},
  ) {
    const table = this.safeTable(
      String(d.calculation_config?.table ?? 'operation_records'),
    );
    const scopeRows = await this.scopedRows(tenantId, table, filters);
    const total = scopeRows.rows.length;
    if (!total)
      return {
        status: 'empty' as Status,
        records_considered: 0,
        missing_fields: [],
        available_fields: [],
        message: this.shortMessage('empty'),
        scope: scopeRows.scope,
      };
    const required = d.required_fields ?? [];
    const results = await Promise.all(
      required.map((group) => this.groupAvailable(tenantId, group, filters)),
    );
    const available = results
      .filter((r) => r.available)
      .flatMap((r) => r.labels);
    const missing = results.filter((r) => !r.available).map((r) => r.label);
    const status: Status =
      missing.length === 0
        ? 'available'
        : available.length > 0
          ? 'partial'
          : 'waiting_data';
    return {
      status,
      records_considered: total,
      missing_fields: missing,
      available_fields: available,
      message: this.shortMessage(status),
      scope: scopeRows.scope,
    };
  }

  private async groupAvailable(
    tenantId: string,
    group: FieldGroup,
    filters: Record<string, unknown>,
  ) {
    for (const ref of group.any_of ?? []) {
      const table = this.safeTable(ref.table);
      const field = this.safeField(table, ref.field);
      const scoped = await this.scopedRows(tenantId, table, filters);
      const count = scoped.rows.filter((r) => this.hasValue(r[field])).length;
      if (count > 0)
        return {
          available: true,
          label: group.label,
          labels: [`${table}.${field} (${count} registros)`],
        };
    }
    return { available: false, label: group.label, labels: [] };
  }

  private async calculate(
    tenantId: string,
    d: Definition,
    status: Status,
    filters: Record<string, unknown>,
  ): Promise<Preview> {
    const cfg = d.calculation_config ?? {};
    const calc = d.calculation_type;
    const scoped = await this.scopedRows(tenantId, 'operation_records', filters);
    const joined = await this.joinedRows(tenantId, scoped.rows, filters);
    const filtered = this.filteredJoinedRows(joined, cfg.filter ?? cfg.where);
    const base = {
      status,
      missing_fields: [],
      available_fields: this.configFieldsFromRefs(cfg),
      records_considered: filtered.length,
      records_used: filtered.length,
      records_ignored_missing_data: 0,
      scope: scoped.scope,
      message: this.scopeMessage(scoped.scope, 0),
      calculation_type: calc,
    };
    if (calc === 'count') return { ...base, value: filtered.length, series: [], table: [] };
    if (calc === 'count_distinct') {
      const ref = this.valueRef(cfg, 'operation_records', 'id');
      const values = new Set(filtered.map((r) => this.valueAt(r, ref)).filter((v) => this.hasValue(v)).map(String));
      return { ...base, value: values.size, series: [], table: [], records_used: values.size, records_ignored_missing_data: filtered.length - values.size };
    }
    if (['sum', 'avg', 'min', 'max'].includes(calc)) {
      const metric = this.metricRef(cfg, calc);
      const agg = this.aggregateJoined(filtered, metric);
      return { ...base, value: agg.value, series: [], table: [], records_used: agg.used, records_ignored_missing_data: filtered.length - agg.used, message: this.scopeMessage(scoped.scope, filtered.length - agg.used) };
    }
    if (calc === 'group_by' || calc === 'ranking') {
      const grouped = this.groupJoined(filtered, cfg);
      const used = grouped.reduce((sum, row) => sum + Number(row.records ?? 0), 0);
      return { ...base, value: grouped[0]?.value ?? null, series: grouped, table: grouped, records_used: used, records_ignored_missing_data: filtered.length - used, message: this.scopeMessage(scoped.scope, filtered.length - used) };
    }
    if (calc === 'duration_avg') {
      const duration = this.avgDurationJoined(filtered, cfg);
      const ignored = filtered.length - duration.used;
      return { ...base, value: duration.value, display_value: duration.display_value, series: [], table: [], records_used: duration.used, records_ignored_missing_data: ignored, message: duration.used ? this.scopeMessage(scoped.scope, ignored) : 'Ainda não há par de datas suficiente para calcular este indicador.' } as Preview;
    }
    if (calc === 'ratio') {
      const ratio = this.ratioJoined(filtered, cfg);
      return { ...base, value: ratio.value, series: [], table: [], records_used: ratio.used, records_ignored_missing_data: filtered.length - ratio.used };
    }
    if (calc === 'percentage') {
      const pct = this.percentageJoined(filtered, cfg);
      return { ...base, value: pct.value, series: [], table: [], records_used: pct.used, records_ignored_missing_data: filtered.length - pct.used };
    }
    if (calc === 'time_series') {
      const series = this.timeSeriesJoined(filtered, cfg);
      const used = series.reduce((sum, row) => sum + Number(row.records ?? 0), 0);
      return { ...base, value: series.at(-1)?.value ?? null, series, table: series, records_used: used, records_ignored_missing_data: filtered.length - used };
    }
    return { ...base, status: 'waiting_data', value: null, series: [], table: [], message: 'Este indicador está aguardando dados nativos compatíveis para cálculo.' };
  }

  private async joinedRows(tenantId: string, operations: Record<string, unknown>[], filters: Record<string, unknown>): Promise<JoinedRow[]> {
    const rows = operations.map((operation) => ({ __operation: operation, ...this.prefixRow('operation_records', operation) })) as JoinedRow[];
    for (const table of allowedTables) {
      if (table === 'operation_records') continue;
      const scoped = await this.scopedRows(tenantId, table, filters);
      const byOperation = new Map(scoped.rows.map((row) => [String(row.operation_record_id), row]));
      rows.forEach((row) => Object.assign(row, this.prefixRow(table, byOperation.get(String(row.__operation.id)) ?? {})));
    }
    return rows;
  }

  private prefixRow(table: TableName, row: Record<string, unknown>) {
    return Object.fromEntries([...tableColumns[table]].map((field) => [this.key(table, field), row[field]]));
  }

  private valueRef(cfg: Record<string, unknown>, fallbackTable: TableName, fallbackField: string): FieldRef {
    const table = this.safeTable(String(cfg.table ?? fallbackTable));
    return { table, field: this.safeField(table, String(cfg.field ?? fallbackField)) };
  }

  private metricRef(cfg: Record<string, unknown> | undefined, fallbackOperation = 'sum') {
    const source = cfg ?? {};
    const metric = (source.metric as Record<string, unknown> | undefined) ?? source;
    const table = this.safeTable(String(metric.table ?? source.table ?? 'operation_records'));
    return { table, field: this.safeField(table, String(metric.field ?? source.field ?? 'id')), operation: String(metric.aggregation ?? metric.operation ?? fallbackOperation) };
  }

  private dimensionRef(cfg: Record<string, unknown>) {
    const dimension = (cfg.dimension as Record<string, unknown> | undefined) ?? cfg;
    const table = this.safeTable(String(dimension.table ?? cfg.table ?? 'operation_records'));
    return { table, field: this.safeField(table, String(dimension.field ?? cfg.group_field ?? cfg.field ?? 'id')) };
  }

  private key(table: TableName, field: string) { return `${table}.${field}`; }
  private valueAt(row: JoinedRow, ref: FieldRef) { return row[this.key(ref.table, ref.field)]; }

  private aggregateJoined(rows: JoinedRow[], metric: FieldRef & { operation?: string }) {
    if (metric.operation === 'count') {
      const used = rows.filter((r) => this.hasValue(this.valueAt(r, metric))).length;
      return { value: used, used };
    }
    const nums = rows.map((r) => Number(this.valueAt(r, metric))).filter(Number.isFinite);
    if (metric.operation === 'avg') return { value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, used: nums.length };
    if (metric.operation === 'min') return { value: nums.length ? Math.min(...nums) : null, used: nums.length };
    if (metric.operation === 'max') return { value: nums.length ? Math.max(...nums) : null, used: nums.length };
    return { value: nums.reduce((a, b) => a + b, 0), used: nums.length };
  }

  private groupJoined(rows: JoinedRow[], cfg: Record<string, unknown>) {
    const dimension = this.dimensionRef(cfg);
    const metric = this.metricRef((cfg.metric as Record<string, unknown> | undefined) ?? cfg, 'count');
    const map = new Map<string, { values: number[]; records: number }>();
    rows.forEach((row) => {
      const labelValue = this.valueAt(row, dimension);
      if (!this.hasValue(labelValue)) return;
      const value = metric.operation === 'count' ? 1 : Number(this.valueAt(row, metric));
      if (!Number.isFinite(value)) return;
      const current = map.get(String(labelValue)) ?? { values: [], records: 0 };
      current.values.push(value); current.records += 1; map.set(String(labelValue), current);
    });
    return [...map.entries()].map(([label, data]) => ({ label, value: this.finishAggregation(data.values, metric.operation), records: data.records })).sort((a, b) => Number(b.value) - Number(a.value)).slice(0, Number(cfg.limit) || 20);
  }

  private finishAggregation(values: number[], operation?: string) {
    if (operation === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
    if (operation === 'min') return Math.min(...values);
    if (operation === 'max') return Math.max(...values);
    return values.reduce((a, b) => a + b, 0);
  }

  private avgDurationJoined(rows: JoinedRow[], cfg: Record<string, unknown>) {
    const pairs = Array.isArray(cfg.date_pairs) ? cfg.date_pairs as Array<Record<string, Record<string, string>>> : [];
    const fallback = pairs.length ? pairs : [{ start: { table: cfg.table ?? 'operation_records', field: cfg.start_field ?? cfg.field }, end: { table: cfg.table ?? 'operation_records', field: cfg.end_field } }];
    const unit = String(cfg.unit ?? 'hours');
    const diffs = rows.map((row) => {
      for (const pair of fallback) {
        const start = pair.start; const end = pair.end;
        if (!start?.field || !end?.field) continue;
        const startTable = this.safeTable(String(start.table ?? 'operation_records'));
        const endTable = this.safeTable(String(end.table ?? 'operation_records'));
        const diff = Date.parse(String(this.valueAt(row, { table: endTable, field: this.safeField(endTable, String(end.field)) }))) - Date.parse(String(this.valueAt(row, { table: startTable, field: this.safeField(startTable, String(start.field)) })));
        if (Number.isFinite(diff) && diff >= 0) return diff;
      }
      return Number.NaN;
    }).filter(Number.isFinite);
    const divisor = unit === 'days' ? 86400000 : 3600000;
    const value = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length / divisor : null;
    return { value, used: diffs.length, display_value: value === null ? null : unit === 'days' ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} dias` : value >= 24 ? `${(value / 24).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} dias` : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} horas` };
  }

  private ratioJoined(rows: JoinedRow[], cfg: Record<string, unknown>) {
    const n = this.aggregateJoined(rows, this.metricRef(cfg.numerator as Record<string, unknown> | undefined, 'sum'));
    const d = this.aggregateJoined(rows, this.metricRef(cfg.denominator as Record<string, unknown> | undefined, 'sum'));
    return { value: Number(d.value) ? Number(n.value) / Number(d.value) : null, used: Math.min(n.used, d.used) };
  }

  private percentageJoined(rows: JoinedRow[], cfg: Record<string, unknown>) {
    const denominator = this.filteredJoinedRows(rows, (cfg.denominator as Record<string, unknown> | undefined)?.filter ?? cfg.denominator_filter);
    const numerator = this.filteredJoinedRows(denominator, (cfg.numerator as Record<string, unknown> | undefined)?.filter ?? cfg.numerator_filter);
    return { value: denominator.length ? Math.round((numerator.length / denominator.length) * 10000) / 100 : null, used: denominator.length };
  }

  private timeSeriesJoined(rows: JoinedRow[], cfg: Record<string, unknown>) {
    const dateRef = this.valueRef({ table: cfg.table, field: cfg.date_field ?? cfg.group_field ?? cfg.field }, 'operation_records', 'updated_at');
    const metric = this.metricRef(cfg.aggregation as Record<string, unknown> | undefined, 'count');
    const granularity = String(cfg.granularity ?? 'day');
    const map = new Map<string, { values: number[]; records: number }>();
    rows.forEach((row) => {
      const label = this.dateBucket(this.valueAt(row, dateRef), granularity); if (!label) return;
      const value = metric.operation === 'count' ? 1 : Number(this.valueAt(row, metric)); if (!Number.isFinite(value)) return;
      const current = map.get(label) ?? { values: [], records: 0 }; current.values.push(value); current.records += 1; map.set(label, current);
    });
    return [...map.entries()].map(([label, data]) => ({ label, period: label, value: this.finishAggregation(data.values, metric.operation), records: data.records })).sort((a, b) => a.label.localeCompare(b.label)).slice(0, Number(cfg.limit) || 100);
  }

  private filteredJoinedRows(rows: JoinedRow[], filter: unknown) {
    if (!filter) return rows;
    const filters = Array.isArray(filter) ? filter : [filter];
    return rows.filter((row) => filters.every((item) => this.matchesJoinedCondition(row, item as Record<string, unknown>)));
  }

  private matchesJoinedCondition(row: JoinedRow, condition: Record<string, unknown>) {
    const table = this.safeTable(String(condition.table ?? 'operation_records'));
    const field = this.safeField(table, String(condition.field));
    const value = this.valueAt(row, { table, field });
    const operator = String(condition.operator ?? 'eq');
    const compare = typeof condition.compare_field === 'string' ? this.valueAt(row, { table, field: this.safeField(table, condition.compare_field) }) : condition.value;
    if (operator === 'not_null') return this.hasValue(value);
    if (operator === 'is_null') return !this.hasValue(value);
    if (operator === 'eq') return value === compare;
    if (operator === 'neq') return value !== compare;
    if (operator === 'in') return Array.isArray(condition.value) && condition.value.includes(value);
    if (operator === 'not_in') return Array.isArray(condition.value) && !condition.value.includes(value);
    if (['lt','lte','gt','gte','lt_field','lte_field','gt_field','gte_field'].includes(operator)) {
      const left = this.comparable(value); const right = this.comparable(compare);
      if (left === null || right === null) return false;
      if (operator.startsWith('lt')) return left < right; if (operator.startsWith('lte')) return left <= right; if (operator.startsWith('gt')) return left > right; return left >= right;
    }
    return false;
  }

  private comparable(value: unknown) {
    if (!this.hasValue(value)) return null;
    const date = Date.parse(String(value)); if (Number.isFinite(date) && /[-:T]/.test(String(value))) return date;
    const num = Number(value); return Number.isFinite(num) ? num : String(value);
  }

  private configFieldsFromRefs(cfg: Record<string, unknown>) {
    const labels = new Set<string>();
    const visit = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (typeof obj.table === 'string' && typeof obj.field === 'string') labels.add(`${obj.table}.${obj.field}`);
        Object.values(obj).forEach(visit);
      }
    };
    visit(cfg); return [...labels];
  }

  private previewDebug(d: Definition, result: Preview) {
    return {
      indicator_key: d.indicator_key,
      calculation_type: d.calculation_type,
      records_considered: result.records_considered,
      records_used: result.records_used,
      value: result.value,
      table_length: result.table.length,
      series_length: result.series.length,
    };
  }
  private ignoredForCalculation(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
    calc: string,
    field: string,
  ) {
    if (calc === 'count') return 0;
    if (['sum', 'avg', 'min', 'max'].includes(calc))
      return rows.filter((r) => !Number.isFinite(Number(r[field]))).length;
    if (calc === 'ratio') {
      const numerator = this.metricConfig(table, cfg.numerator as Record<string, unknown> | undefined);
      const denominator = this.metricConfig(table, cfg.denominator as Record<string, unknown> | undefined);
      if (!numerator || !denominator) return rows.length;
      return rows.filter((r) => !Number.isFinite(this.rowMetric(r, numerator)) || !Number.isFinite(this.rowMetric(r, denominator))).length;
    }
    if (calc === 'percentage') {
      const denominatorCfg = cfg.denominator as Record<string, unknown> | undefined;
      const denominatorRows = this.filteredRowsByConfig(rows, table, denominatorCfg?.filter ?? cfg.denominator_filter);
      return rows.length - denominatorRows.length;
    }
    if (calc === 'time_series') {
      const df = this.safeField(table, String(cfg.date_field ?? cfg.group_field ?? cfg.field));
      return rows.filter((r) => !this.dateBucket(r[df], String(cfg.granularity ?? 'day'))).length;
    }
    if (calc === 'group_by' || calc === 'ranking') {
      const gf = this.safeField(table, String(cfg.group_field ?? cfg.field));
      const agg = this.metricConfig(table, cfg.aggregation as Record<string, unknown> | undefined, cfg.aggregation_field ? String(cfg.aggregation_field) : undefined);
      return rows.filter((r) => !this.hasValue(r[gf]) || (agg ? !Number.isFinite(this.rowMetric(r, agg)) : false)).length;
    }
    return 0;
  }
  private group(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
  ) {
    const gf = this.safeField(table, String(cfg.group_field ?? cfg.field));
    const agg = this.metricConfig(
      table,
      cfg.aggregation as Record<string, unknown> | undefined,
      cfg.aggregation_field ? String(cfg.aggregation_field) : undefined,
    );
    const map = new Map<string, { value: number; records: number }>();
    rows.forEach((r) => {
      const rawLabel = r[gf];
      if (!this.hasValue(rawLabel)) return;
      const label = String(rawLabel);
      const value = agg ? this.rowMetric(r, agg) : 1;
      if (!Number.isFinite(value)) return;
      const current = map.get(label) ?? { value: 0, records: 0 };
      map.set(label, {
        value: current.value + value,
        records: current.records + 1,
      });
    });
    return [...map.entries()]
      .map(([label, data]) => ({
        label,
        value: data.value,
        records: data.records,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, Number(cfg.limit) || 20);
  }
  private timeSeries(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
  ) {
    const df = this.safeField(
      table,
      String(cfg.date_field ?? cfg.group_field ?? cfg.field),
    );
    const agg = this.metricConfig(
      table,
      cfg.aggregation as Record<string, unknown> | undefined,
      cfg.aggregation_field ? String(cfg.aggregation_field) : undefined,
    );
    const granularity = String(cfg.granularity ?? 'day');
    const map = new Map<string, { value: number; records: number }>();
    rows.forEach((r) => {
      const bucket = this.dateBucket(r[df], granularity);
      if (!bucket) return;
      const value = agg ? this.rowMetric(r, agg) : 1;
      if (!Number.isFinite(value)) return;
      const current = map.get(bucket) ?? { value: 0, records: 0 };
      map.set(bucket, {
        value: current.value + value,
        records: current.records + 1,
      });
    });
    return [...map.entries()]
      .map(([label, data]) => ({
        label,
        value: data.value,
        records: data.records,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, Number(cfg.limit) || 100);
  }
  private avgDuration(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
  ) {
    const start = this.safeField(table, String(cfg.start_field ?? cfg.field));
    const end = tableColumns[table].has(String(cfg.end_field))
      ? String(cfg.end_field)
      : 'updated_at';
    const diffs = rows
      .map((r) => Date.parse(String(r[end])) - Date.parse(String(r[start])))
      .filter(Number.isFinite)
      .filter((n) => n >= 0);
    return {
      value: diffs.length
        ? diffs.reduce((a, b) => a + b, 0) / diffs.length / 3600000
        : null,
      used: diffs.length,
    };
  }
  private ratio(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
  ) {
    const numerator = this.metricConfig(
      table,
      cfg.numerator as Record<string, unknown> | undefined,
    );
    const denominator = this.metricConfig(
      table,
      cfg.denominator as Record<string, unknown> | undefined,
    );
    if (!numerator || !denominator) return { value: null, used: 0 };
    const n = this.aggregate(rows, table, numerator);
    const d = this.aggregate(rows, table, denominator);
    const used = rows.filter(
      (r) =>
        Number.isFinite(this.rowMetric(r, numerator)) &&
        Number.isFinite(this.rowMetric(r, denominator)),
    ).length;
    const numeratorValue = Number(n);
    const denominatorValue = Number(d);
    return {
      value: denominatorValue ? numeratorValue / denominatorValue : null,
      used,
    };
  }
  private percentage(
    rows: Record<string, unknown>[],
    table: TableName,
    cfg: Record<string, unknown>,
  ) {
    const numeratorCfg = cfg.numerator as Record<string, unknown> | undefined;
    const denominatorCfg = cfg.denominator as
      Record<string, unknown> | undefined;
    const numeratorRows = this.filteredRowsByConfig(
      rows,
      table,
      numeratorCfg?.filter ?? cfg.numerator_filter,
    );
    const denominatorRows = this.filteredRowsByConfig(
      rows,
      table,
      denominatorCfg?.filter ?? cfg.denominator_filter,
    );
    if (!denominatorRows.length) return { value: null, used: 0 };
    return {
      value:
        Math.round((numeratorRows.length / denominatorRows.length) * 10000) /
        100,
      used: denominatorRows.length,
    };
  }
  private aggregate(
    rows: Record<string, unknown>[],
    table: TableName,
    metric: { operation?: unknown; field?: unknown },
  ) {
    const op = String(metric.operation ?? 'sum');
    const f = metric.field ? this.safeField(table, String(metric.field)) : 'id';
    if (op === 'count') return rows.filter((r) => this.hasValue(r[f])).length;
    const nums = rows.map((r) => Number(r[f])).filter(Number.isFinite);
    if (op === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (op === 'avg')
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    if (op === 'min') return nums.length ? Math.min(...nums) : null;
    if (op === 'max') return maxValue(rows.map((r) => r[f]));
    return nums.reduce((a, b) => a + b, 0);
  }
  private metricConfig(
    table: TableName,
    cfg?: Record<string, unknown>,
    fallbackField?: string,
  ) {
    const field = cfg?.field ?? fallbackField;
    if (!field) return undefined;
    return {
      operation: cfg?.operation ?? 'sum',
      field: this.safeField(table, String(field)),
    };
  }
  private rowMetric(
    row: Record<string, unknown>,
    metric: { operation?: unknown; field?: unknown },
  ) {
    if (String(metric.operation ?? 'sum') === 'count')
      return this.hasValue(row[String(metric.field)]) ? 1 : Number.NaN;
    return Number(row[String(metric.field)]);
  }
  private filteredRowsByConfig(
    rows: Record<string, unknown>[],
    table: TableName,
    filter: unknown,
  ) {
    if (!filter) return rows;
    if (!Array.isArray(filter))
      return rows.filter((row) =>
        this.matchesWhere(row, filter as Record<string, unknown>),
      );
    return rows.filter((row) =>
      filter.every((condition) =>
        this.matchesCondition(row, table, condition as Record<string, unknown>),
      ),
    );
  }
  private matchesCondition(
    row: Record<string, unknown>,
    table: TableName,
    condition: Record<string, unknown>,
  ) {
    const field = this.safeField(table, String(condition.field));
    const operator = String(condition.operator ?? 'eq');
    const value = row[field];
    const compare =
      typeof condition.compare_field === 'string'
        ? row[this.safeField(table, condition.compare_field)]
        : condition.value;
    if (operator === 'not_null') return this.hasValue(value);
    if (operator === 'eq') return value === compare;
    if (operator === 'in')
      return Array.isArray(condition.value) && condition.value.includes(value);
    if (operator === 'lte_field')
      return (
        this.hasValue(value) &&
        this.hasValue(compare) &&
        String(value) <= String(compare)
      );
    if (operator === 'gte_field')
      return (
        this.hasValue(value) &&
        this.hasValue(compare) &&
        String(value) >= String(compare)
      );
    return false;
  }
  private dateBucket(value: unknown, granularity: string) {
    const time = Date.parse(String(value));
    if (!Number.isFinite(time)) return null;
    const date = new Date(time);
    if (granularity === 'month') return date.toISOString().slice(0, 7);
    if (granularity === 'year') return date.toISOString().slice(0, 4);
    return date.toISOString().slice(0, 10);
  }
  private configFields(
    table: TableName,
    cfg: Record<string, unknown>,
    field: string,
  ) {
    const fields = new Set<string>([field]);
    [
      'group_field',
      'aggregation_field',
      'date_field',
      'start_field',
      'end_field',
    ].forEach((key) => {
      const value = cfg[key];
      if (typeof value === 'string' && tableColumns[table].has(value))
        fields.add(value);
    });
    [cfg.numerator, cfg.denominator, cfg.aggregation].forEach((item) => {
      const value = (item as Record<string, unknown> | undefined)?.field;
      if (typeof value === 'string' && tableColumns[table].has(value))
        fields.add(value);
    });
    return [...fields];
  }
  private async scopedRows(
    tenantId: string,
    table: TableName,
    filters: Record<string, unknown>,
  ): Promise<{ rows: Record<string, unknown>[]; scope: PreviewScope }> {
    const scope: PreviewScope = {
      scope: String(filters.scope ?? 'all'),
      include_archived: filters.include_archived === true,
    };
    let next = await this.rows(tenantId, table, scope.include_archived);
    if (table !== 'operation_records') {
      const operationScope = await this.scopedRows(
        tenantId,
        'operation_records',
        filters,
      );
      const opIds = new Set(operationScope.rows.map((r) => String(r.id)));
      return {
        rows: next.filter((r) => opIds.has(String(r.operation_record_id))),
        scope: operationScope.scope,
      };
    }
    if (typeof filters.status === 'string') {
      scope.status = filters.status;
      next = next.filter((r) => r.status === filters.status);
    }
    if (typeof filters.data_quality_status === 'string') {
      scope.data_quality_status = filters.data_quality_status;
      next = next.filter(
        (r) => r.data_quality_status === filters.data_quality_status,
      );
    }
    if (typeof filters.date_from === 'string') {
      scope.date_from = filters.date_from;
      next = next.filter(
        (r) =>
          String(r.issued_at ?? r.updated_at ?? '') >=
          String(filters.date_from),
      );
    }
    if (typeof filters.date_to === 'string') {
      scope.date_to = filters.date_to;
      next = next.filter(
        (r) =>
          String(r.issued_at ?? r.updated_at ?? '') <= String(filters.date_to),
      );
    }
    return { rows: next, scope };
  }
  private hasValue(v: unknown) {
    return v !== null && v !== undefined && v !== '';
  }

  private scopeMessage(scope: PreviewScope, ignored: number) {
    const parts = [
      scope.date_from || scope.date_to
        ? 'Cálculo realizado usando somente o período selecionado da base nativa.'
        : 'Cálculo realizado usando todos os dados nativos disponíveis para este tenant.',
    ];
    if (ignored > 0)
      parts.push(
        `${ignored} registros foram ignorados porque não possuem os campos necessários para este indicador.`,
      );
    return parts.join(' ');
  }
  private matchesWhere(
    row: Record<string, unknown>,
    where?: Record<string, unknown>,
  ) {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => row[k] === v);
  }
  private async rows(
    tenantId: string,
    table: TableName,
    includeArchived = false,
  ): Promise<Record<string, unknown>[]> {
    void includeArchived;
    const filters = [
      `select=*`,
      `tenant_id=eq.${tenantId}`,
      'deleted_at=is.null',
    ];
    const rows = await this.supabase.select<Record<string, unknown>[]>(
      table,
      `${filters.join('&')}&limit=10000`,
    );
    return rows;
  }
  private async countRows(tenantId: string, table: TableName, extra?: string) {
    const q = [`select=id`, `tenant_id=eq.${tenantId}`, 'deleted_at=is.null'];
    if (extra) q.push(extra);
    const rows = await this.supabase.select<Array<{ id: string }>>(
      table,
      `${q.join('&')}&limit=10000`,
    );
    return rows.length;
  }
  private safeTable(table: string): TableName {
    if ((allowedTables as readonly string[]).includes(table))
      return table as TableName;
    return 'operation_records';
  }
  private safeField(table: TableName, field: string) {
    const clean = field.includes('.')
      ? (field.split('.').pop() ?? field)
      : field;
    if (!tableColumns[table].has(clean))
      throw new Error('Campo não permitido para indicador nativo.');
    return clean;
  }
  private shortMessage(status: Status) {
    return {
      available: 'Indicador disponível.',
      partial:
        'Indicador pronto; cálculo executado com os dados nativos disponíveis.',
      waiting_data:
        'Indicador pronto; aguardando dados nos campos nativos necessários.',
      empty: 'Indicador pronto; aguardando dados tratados na base nativa.',
      failed: 'Não foi possível calcular este indicador agora.',
    }[status];
  }
  private longMessage(status: Status) {
    if (status === 'partial')
      return 'Indicador pronto; cálculo executado com os dados nativos disponíveis.';
    if (status === 'waiting_data')
      return 'Indicador pronto; aguardando dados nos campos nativos necessários. A ausência de dados não bloqueia operação, integração, pareamento ou normalização.';
    return this.shortMessage(status);
  }
  private async log(
    tenantId: string,
    indicator_definition_id: string,
    user_id: string | undefined,
    result: Preview,
  ) {
    await this.supabase.insert('native_indicator_calculation_logs', {
      tenant_id: tenantId,
      indicator_definition_id,
      user_id: user_id ?? null,
      execution_type: 'preview',
      availability_status: result.status,
      records_considered: result.records_considered,
      result_preview: {
        value: result.value,
        series: result.series.slice(0, 20),
        table: result.table.slice(0, 20),
      },
      message: result.message,
    });
  }
}
function maxValue(values: unknown[]) {
  const dates = values
    .map((v) => Date.parse(String(v)))
    .filter(Number.isFinite);
  if (dates.length) return new Date(Math.max(...dates)).toISOString();
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}
