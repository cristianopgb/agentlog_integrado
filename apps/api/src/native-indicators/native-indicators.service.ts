import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type Status = 'available' | 'partial' | 'unavailable' | 'empty' | 'failed';
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
  source_data_source_id?: string;
  source_data_source_name?: string | null;
  source_staging_batch_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  data_quality_status?: string;
  include_archived?: boolean;
};
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
    'source_data_source_id',
    'source_staging_batch_id',
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
  ]),
  transport_records: new Set([
    'id',
    'operation_record_id',
    'transport_status',
    'route_name',
    'collected_at',
    'delivered_at',
    'delivery_performance_status',
    'sla_status',
    'updated_at',
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
      unavailable: statuses.filter((s) => s.status === 'unavailable').length,
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
        availability.status === 'unavailable'
      )
        result = {
          status: availability.status,
          value: null,
          series: [],
          table: [],
          records_considered: 0,
          records_used: 0,
          records_ignored_missing_data: 0,
          scope: { scope: 'all' },
          missing_fields: availability.missing_fields,
          available_fields: availability.available_fields,
          message: this.longMessage(availability.status),
        };
      else
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
      };
    }
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
    };
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
          : 'unavailable';
    return {
      status,
      records_considered: total,
      missing_fields: missing,
      available_fields: available,
      message: this.shortMessage(status),
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
    const table = this.safeTable(String(cfg.table));
    const calc = d.calculation_type;
    const field = cfg.field ? this.safeField(table, String(cfg.field)) : 'id';
    const scoped = await this.scopedRows(tenantId, table, filters);
    const filtered = scoped.rows.filter((row) =>
      this.matchesWhere(row, cfg.where as Record<string, unknown> | undefined),
    );
    const nums = filtered.map((r) => Number(r[field])).filter(Number.isFinite);
    const ignored = filtered.length - nums.length;
    const base = {
      status,
      missing_fields: [],
      available_fields: this.configFields(table, cfg, field),
      records_considered: filtered.length,
      records_used: calc === 'count' ? filtered.length : nums.length,
      records_ignored_missing_data: calc === 'count' ? 0 : ignored,
      scope: scoped.scope,
      message: this.scopeMessage(scoped.scope, ignored),
    };
    if (calc === 'count')
      return {
        ...base,
        value: filtered.length,
        series: [],
        table: [],
        records_used: filtered.length,
        records_ignored_missing_data: 0,
      };
    if (calc === 'sum')
      return {
        ...base,
        value: this.aggregate(filtered, table, { operation: 'sum', field }),
        series: [],
        table: [],
      };
    if (calc === 'avg')
      return {
        ...base,
        value: this.aggregate(filtered, table, { operation: 'avg', field }),
        series: [],
        table: [],
      };
    if (calc === 'min')
      return {
        ...base,
        value: this.aggregate(filtered, table, { operation: 'min', field }),
        series: [],
        table: [],
      };
    if (calc === 'max')
      return {
        ...base,
        value: this.aggregate(filtered, table, { operation: 'max', field }),
        series: [],
        table: [],
      };
    if (calc === 'latest')
      return {
        ...base,
        value: null,
        series: [],
        table: filtered
          .sort((a, b) =>
            String(b.updated_at ?? '').localeCompare(
              String(a.updated_at ?? ''),
            ),
          )
          .slice(0, Number(cfg.limit) || 10),
      };
    if (calc === 'group_by' || calc === 'ranking') {
      const grouped = this.group(filtered, table, cfg);
      return {
        ...base,
        value: grouped.length ? (grouped[0]?.value ?? null) : null,
        series: grouped,
        table: grouped,
        records_used: grouped.reduce(
          (sum, row) => sum + Number(row.records ?? 0),
          0,
        ),
        records_ignored_missing_data:
          filtered.length -
          grouped.reduce((sum, row) => sum + Number(row.records ?? 0), 0),
      };
    }
    if (calc === 'duration_avg') {
      const duration = this.avgDuration(filtered, table, cfg);
      return {
        ...base,
        value: duration.value,
        series: [],
        table: [],
        records_used: duration.used,
        records_ignored_missing_data: filtered.length - duration.used,
      };
    }
    if (calc === 'ratio') {
      const ratio = this.ratio(filtered, table, cfg);
      return {
        ...base,
        value: ratio.value,
        series: [],
        table: [],
        records_used: ratio.used,
        records_ignored_missing_data: filtered.length - ratio.used,
      };
    }
    if (calc === 'percentage') {
      const pct = this.percentage(filtered, table, cfg);
      return {
        ...base,
        value: pct.value,
        series: [],
        table: [],
        records_used: pct.used,
        records_ignored_missing_data: filtered.length - pct.used,
      };
    }
    if (calc === 'time_series') {
      const series = this.timeSeries(filtered, table, cfg);
      return {
        ...base,
        value: series.length
          ? (series[series.length - 1]?.value ?? null)
          : null,
        series,
        table: series,
        records_used: series.reduce(
          (sum, row) => sum + Number(row.records ?? 0),
          0,
        ),
        records_ignored_missing_data:
          filtered.length -
          series.reduce((sum, row) => sum + Number(row.records ?? 0), 0),
      };
    }
    return {
      status: 'unavailable',
      value: null,
      series: [],
      table: [],
      records_considered: 0,
      records_used: 0,
      records_ignored_missing_data: 0,
      scope: { scope: 'all' },
      missing_fields: [],
      available_fields: [],
      message:
        'Este indicador ainda não possui cálculo habilitado nesta versão.',
    };
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
    if (scope.scope === 'last_batch') {
      const batchId = this.latestBatchId(next);
      scope.source_staging_batch_id = batchId;
      next = batchId
        ? next.filter((r) => r.source_staging_batch_id === batchId)
        : [];
    }
    if (typeof filters.source_data_source_id === 'string') {
      scope.source_data_source_id = filters.source_data_source_id;
      next = next.filter(
        (r) => r.source_data_source_id === filters.source_data_source_id,
      );
    }
    if (typeof filters.source_staging_batch_id === 'string') {
      scope.source_staging_batch_id = filters.source_staging_batch_id;
      next = next.filter(
        (r) => r.source_staging_batch_id === filters.source_staging_batch_id,
      );
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
    if (scope.source_data_source_id) {
      const src = await this.supabase.select<Array<{ name: string }>>(
        'data_sources',
        `select=name&tenant_id=eq.${tenantId}&id=eq.${scope.source_data_source_id}&limit=1`,
      );
      scope.source_data_source_name = src[0]?.name ?? null;
    }
    return { rows: next, scope };
  }
  private latestBatchId(rows: Record<string, unknown>[]) {
    return [...rows]
      .filter((r) => typeof r.source_staging_batch_id === 'string')
      .sort((a, b) =>
        String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
      )[0]?.source_staging_batch_id as string | undefined;
  }
  private hasValue(v: unknown) {
    return v !== null && v !== undefined && v !== '';
  }
  private async activeSourceIds(tenantId: string) {
    const rows = await this.supabase.select<Array<{ id: string }>>(
      'data_sources',
      `select=id&tenant_id=eq.${tenantId}&status=eq.active&limit=10000`,
    );
    return rows.map((r) => r.id);
  }

  private scopeMessage(scope: PreviewScope, ignored: number) {
    const parts = [
      scope.scope === 'last_batch'
        ? 'Cálculo realizado usando somente o último lote processado.'
        : scope.source_data_source_id
          ? 'Cálculo realizado usando somente a integração selecionada.'
          : scope.date_from || scope.date_to
            ? 'Cálculo realizado usando somente o período selecionado.'
            : 'Cálculo realizado usando todos os dados tratados disponíveis para este tenant.',
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
    const filters = [
      `select=*`,
      `tenant_id=eq.${tenantId}`,
      'deleted_at=is.null',
    ];
    if (!includeArchived) {
      const ids = await this.activeSourceIds(tenantId);
      if (!ids.length) return [];
      if (table === 'operation_records')
        filters.push(
          `source_data_source_id=in.(${ids.map((id) => `"${id}"`).join(',')})`,
        );
    }
    const rows = await this.supabase.select<Record<string, unknown>[]>(
      table,
      `${filters.join('&')}&limit=10000`,
    );
    if (!includeArchived && table !== 'operation_records') {
      const opIds = new Set(
        (await this.rows(tenantId, 'operation_records', false)).map((r) =>
          String(r.id),
        ),
      );
      return rows.filter((r) => opIds.has(String(r.operation_record_id)));
    }
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
      unavailable:
        'Indicador pronto; aguardando a base nativa receber os dados necessários.',
      empty: 'Indicador pronto; aguardando dados tratados na base nativa.',
      failed: 'Não foi possível calcular este indicador agora.',
    }[status];
  }
  private longMessage(status: Status) {
    if (status === 'partial')
      return 'Indicador pronto; cálculo executado com os dados nativos disponíveis.';
    if (status === 'unavailable')
      return 'Indicador pronto; aguardando a base nativa receber os dados necessários.';
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
