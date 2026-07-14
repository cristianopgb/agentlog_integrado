import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type TableName =
  | 'operation_records'
  | 'transport_records'
  | 'attendance_records'
  | 'finance_records'
  | 'warehouse_records'
  | 'team_records';
type Operation =
  | 'count'
  | 'count_distinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'ratio'
  | 'percentage'
  | 'group_by'
  | 'time_series'
  | 'ranking'
  | 'duration_avg';
type Field = {
  id: string;
  tenant_id: string | null;
  module_key: string;
  base_table: TableName;
  field_key: string;
  label: string;
  data_type: string;
  semantic_type: string;
  allowed_operations: string[];
  allowed_filters: string[];
  is_dimension: boolean;
  is_measure: boolean;
  is_active: boolean;
};
type MetricOperation = 'count' | 'sum' | 'avg' | 'min' | 'max';
type MetricConfig = {
  operation: MetricOperation;
  source_table: TableName;
  field: string;
};
type Config = {
  base_table: TableName;
  operation_key: Operation;
  operation: Operation;
  numerator?: MetricConfig;
  denominator?: MetricConfig;
  primary_field?: string;
  secondary_field?: string;
  numerator_field?: string;
  denominator_field?: string;
  numerator_operation?: MetricOperation;
  denominator_operation?: MetricOperation;
  allow_dashboard_period_filter?: boolean;
  default_date_field?: string;
  filters?: Array<{
    field: string;
    operator: string;
    value?: unknown;
    value_to?: unknown;
  }>;
  period?: { field?: string; preset?: string; from?: string; to?: string };
  grouping?: {
    dimension_field?: string;
    metric_field?: string;
    metric_operation?: MetricOperation;
    sort?: 'asc' | 'desc';
    limit?: number;
  };
};
const tables = [
  'operation_records',
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
] as const;
const ops = [
  'count',
  'count_distinct',
  'sum',
  'avg',
  'min',
  'max',
  'ratio',
  'percentage',
  'group_by',
  'time_series',
  'ranking',
  'duration_avg',
];
const statuses = ['draft', 'active', 'inactive'];
const formats = [
  'number',
  'currency',
  'percent',
  'decimal',
  'duration',
  'kg',
  'quantity',
];
const types = [
  'KPI numérico',
  'Valor monetário',
  'Percentual',
  'Tempo/duração',
  'Distribuição por categoria',
  'Série temporal',
  'Ranking/tabela',
];
const filterOps = [
  'igual a',
  'diferente de',
  'contém',
  'maior que',
  'menor que',
  'entre',
  'preenchido',
  'não preenchido',
];
const metricOps = ['count', 'sum', 'avg', 'min', 'max'];
const numericSemantics = ['money', 'weight', 'quantity', 'decimal', 'number'];
const dimensionSemantics = [
  'text',
  'enum',
  'status',
  'customer',
  'state',
  'location',
  'person',
  'identifier',
];
const blockedFields = [
  'raw_payload',
  'source_staging_record_id',
  'source_payload_hash',
  'tenant_id',
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'staging',
];
const freeFormulaError =
  'Fórmula livre não é permitida. Monte o indicador usando os campos e operações disponíveis.';
const operationCatalogAliases: Record<Operation | MetricOperation, string[]> = {
  count: ['count', 'CONTAGEM'],
  count_distinct: ['count_distinct', 'CONTAGEM_DISTINTA'],
  sum: ['sum', 'SOMA'],
  avg: ['avg', 'MÉDIA'],
  min: ['min', 'MÍNIMO'],
  max: ['max', 'MÁXIMO'],
  ratio: ['ratio', 'RAZÃO_DIVISÃO'],
  percentage: ['percentage', 'PERCENTUAL'],
  group_by: ['group_by', 'DISTRIBUIÇÃO_POR_CATEGORIA'],
  time_series: ['time_series', 'SÉRIE_TEMPORAL'],
  ranking: ['ranking', 'RANKING'],
  duration_avg: ['duration_avg', 'TEMPO_MÉDIO_ENTRE_DATAS'],
};
const friendlyCatalog: Array<{
  field: string;
  label: string;
  aliases?: string[];
}> = [
  { field: 'freight_value', label: 'Valor do frete' },
  { field: 'gross_weight', label: 'Peso total' },
  {
    field: 'delivery_number',
    label: 'Quantidade de entregas',
    aliases: ['Entregas'],
  },
  { field: 'occurrence_status', label: 'Ocorrências' },
  { field: 'customer_name', label: 'Cliente' },
  { field: 'driver_name', label: 'Motorista' },
  { field: 'destination_state', label: 'UF destino' },
  { field: 'issued_at', label: 'Data de emissão' },
  { field: 'expected_date', label: 'Data prevista' },
  { field: 'completed_at', label: 'Data de entrega' },
  { field: 'status', label: 'Status' },
];

@Injectable()
export class CustomIndicatorsService {
  constructor(private readonly supabase: SupabaseService) {}
  async fields(tenantId: string) {
    const allowed = new Set(friendlyCatalog.map((f) => f.field));
    const data = (await this.catalog(tenantId))
      .filter(
        (f) =>
          f.base_table === 'operation_records' &&
          allowed.has(f.field_key) &&
          !blockedFields.includes(f.field_key),
      )
      .map((f) => ({
        ...f,
        label:
          friendlyCatalog.find((x) => x.field === f.field_key)?.label ??
          f.label,
      }));
    return { data };
  }
  async list(tenantId: string) {
    return {
      data: await this.supabase.select(
        'custom_indicator_definitions',
        `select=*&tenant_id=eq.${tenantId}&order=updated_at.desc`,
      ),
    };
  }
  async detail(tenantId: string, id: string) {
    return this.get(tenantId, id);
  }
  async create(
    tenantId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const payload = this.payload(tenantId, userId, body, false);
    if (payload.status === 'active')
      await this.validate(tenantId, payload.calculation_config as Config);
    else
      await this.validateDraft(tenantId, payload.calculation_config as Config);
    const rows = await this.supabase.insert<Record<string, unknown>[]>(
      'custom_indicator_definitions',
      payload,
    );
    return rows[0];
  }
  async update(
    tenantId: string,
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    await this.get(tenantId, id);
    const payload = this.payload(tenantId, userId, body, true);
    if (payload.status === 'active')
      await this.validate(tenantId, payload.calculation_config as Config);
    else
      await this.validateDraft(tenantId, payload.calculation_config as Config);
    const rows = await this.supabase.update<Record<string, unknown>[]>(
      'custom_indicator_definitions',
      `tenant_id=eq.${tenantId}&id=eq.${id}`,
      payload,
    );
    return rows[0];
  }
  async status(
    tenantId: string,
    id: string,
    userId: string,
    body: { status?: string },
  ) {
    const row = (await this.get(tenantId, id)) as {
      calculation_config: Config;
    };
    if (!statuses.includes(String(body.status)))
      throw new BadRequestException('Status inválido.');
    if (String(body.status) === 'active')
      await this.validate(tenantId, row.calculation_config);
    const status = String(body.status);
    const rows = await this.supabase.update<Record<string, unknown>[]>(
      'custom_indicator_definitions',
      `tenant_id=eq.${tenantId}&id=eq.${id}`,
      {
        status,
        available_for_dashboard: status === 'active',
        available_for_reports: status === 'active',
        updated_by: userId,
      },
    );
    return rows[0];
  }
  async library(tenantId: string) {
    const nativeRows = await this.supabase.select<Record<string, unknown>[]>(
      'native_indicator_definitions',
      'select=*&status=eq.active&order=sort_order.asc',
    );
    const custom = await this.supabase.select<Record<string, unknown>[]>(
      'custom_indicator_definitions',
      `select=*&tenant_id=eq.${tenantId}&status=eq.active&available_for_dashboard=eq.true&order=updated_at.desc`,
    );
    return {
      data: [
        ...nativeRows.map((r) => ({ ...r, source: 'native' })),
        ...custom.map((r) => ({ ...r, source: 'custom' })),
      ],
    };
  }
  async previewUnsaved(
    tenantId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const normalized = this.payload(tenantId, userId, body, true);
    return this.previewConfig(
      tenantId,
      normalized.calculation_config as Config,
      undefined,
      userId,
    );
  }
  async previewSaved(tenantId: string, id: string, userId: string) {
    const row = (await this.get(tenantId, id)) as {
      calculation_config: Config;
    };
    return this.previewConfig(tenantId, row.calculation_config, id, userId);
  }
  private async get(tenantId: string, id: string) {
    const rows = await this.supabase.select<Record<string, unknown>[]>(
      'custom_indicator_definitions',
      `select=*&tenant_id=eq.${tenantId}&id=eq.${id}&limit=1`,
    );
    if (!rows[0])
      throw new NotFoundException('Indicador personalizado não encontrado.');
    return rows[0];
  }
  private payload(
    tenantId: string,
    userId: string,
    b: Record<string, unknown>,
    partial: boolean,
  ) {
    const status = String(b.status ?? 'draft');
    if (!partial && !String(b.name ?? '').trim())
      throw new BadRequestException('Nome obrigatório.');
    if (!statuses.includes(status))
      throw new BadRequestException('Status inválido.');
    if (!formats.includes(String(b.value_format)))
      throw new BadRequestException('Formato inválido.');
    if (!types.includes(String(b.indicator_type)))
      throw new BadRequestException('Tipo inválido.');
    const cfg = this.config(
      (b.calculation_config as Record<string, unknown>) ?? b,
    );
    const active = status === 'active';
    return {
      tenant_id: tenantId,
      name: String(b.name ?? '').trim(),
      description: b.description ? String(b.description) : null,
      module_key: String(b.module_key),
      family_key: String(b.family_key ?? 'Operacional'),
      indicator_type: String(b.indicator_type),
      value_format: String(b.value_format),
      base_table: cfg.base_table,
      operation_key: cfg.operation_key,
      calculation_config: cfg,
      formula_preview: this.formula(cfg),
      status,
      available_for_dashboard: active && b.available_for_dashboard !== false,
      available_for_reports: active && b.available_for_reports !== false,
      updated_by: userId,
      created_by: userId,
    };
  }
  private config(c: Record<string, unknown>): Config {
    const table = String(c.base_table || 'operation_records');
    if (
      'formula' in c ||
      'formula_ast' in c ||
      c.operation_key === 'FÓRMULA_CONTROLADA'
    )
      throw new BadRequestException(freeFormulaError);
    const op = String(c.operation ?? c.operation_key ?? 'count');
    if (!tables.includes(table as TableName))
      throw new BadRequestException('Base inválida.');
    if (!ops.includes(op)) throw new BadRequestException('Operação inválida.');
    const numerator = this.metricConfig(c.numerator);
    const denominator = this.metricConfig(c.denominator);
    return {
      base_table: table as TableName,
      operation_key: op as Operation,
      operation: op as Operation,
      numerator,
      denominator,
      primary_field: c.primary_field as string,
      secondary_field: c.secondary_field as string,
      numerator_field: numerator?.field ?? (c.numerator_field as string),
      denominator_field: denominator?.field ?? (c.denominator_field as string),
      numerator_operation:
        numerator?.operation ?? this.metricOp(c.numerator_operation),
      denominator_operation:
        denominator?.operation ?? this.metricOp(c.denominator_operation),
      allow_dashboard_period_filter: c.allow_dashboard_period_filter === true,
      default_date_field: c.default_date_field as string,
      filters: Array.isArray(c.filters) ? (c.filters as Config['filters']) : [],
      period: c.period as Config['period'],
      grouping: c.grouping as Config['grouping'],
    };
  }
  private async validateDraft(tenantId: string, cfg: Config) {
    return this.validate(tenantId, cfg);
  }
  private async validate(tenantId: string, cfg: Config) {
    const cat = await this.catalog(tenantId);
    const by = new Map(
      cat
        .filter((f) => f.base_table === cfg.base_table)
        .map((f) => [f.field_key, f]),
    );
    const used = [
      cfg.primary_field,
      cfg.secondary_field,
      cfg.numerator_field,
      cfg.denominator_field,
      cfg.grouping?.dimension_field,
      cfg.grouping?.metric_field,
      cfg.period?.field,
      ...(cfg.filters ?? []).map((f) => f.field),
    ].filter(Boolean) as string[];
    if (used.some((f) => blockedFields.includes(f)))
      throw new BadRequestException('Campo não permitido para indicador.');
    for (const f of used)
      if (!by.has(f))
        throw new BadRequestException('Campo fora do catálogo controlado.');
    for (const f of used) {
      const field = by.get(f);
      if (!field) continue;
      const aliases = operationCatalogAliases[cfg.operation_key] ?? [
        cfg.operation_key,
      ];
      if (
        !aliases.some((op) => field.allowed_operations.includes(op)) &&
        !['ratio', 'percentage'].includes(cfg.operation_key)
      )
        throw new BadRequestException('Operação fora da whitelist do campo.');
    }
    const primary = cfg.primary_field ? by.get(cfg.primary_field) : undefined;
    const secondary = cfg.secondary_field
      ? by.get(cfg.secondary_field)
      : undefined;
    const metric = cfg.grouping?.metric_field
      ? by.get(cfg.grouping.metric_field)
      : undefined;
    const dimension = cfg.grouping?.dimension_field
      ? by.get(cfg.grouping.dimension_field)
      : undefined;
    if (
      ['sum', 'avg', 'min', 'max'].includes(cfg.operation_key) &&
      !this.numeric(primary)
    )
      throw new BadRequestException(
        primary
          ? `${primary.label} é um campo de texto e não pode ser usado em ${cfg.operation_key}.`
          : 'Escolha um campo numérico para esta operação.',
      );
    if (cfg.operation_key === 'count' && !primary)
      throw new BadRequestException('Escolha um campo para contagem.');
    if (cfg.operation_key === 'count_distinct' && !this.dimension(primary))
      throw new BadRequestException(
        'Escolha uma dimensão para contagem distinta.',
      );
    if (
      ['ratio', 'percentage'].includes(cfg.operation_key) &&
      (!this.metric(
        cfg.numerator_operation,
        by.get(cfg.numerator_field ?? ''),
      ) ||
        !this.metric(
          cfg.denominator_operation,
          by.get(cfg.denominator_field ?? ''),
        ))
    )
      throw new BadRequestException(
        'Para razão, configure numerador e denominador com métricas compatíveis.',
      );
    if (cfg.operation_key === 'group_by') {
      if (!this.metric(cfg.grouping?.metric_operation, metric))
        throw new BadRequestException(
          'Escolha uma métrica compatível para a distribuição.',
        );
      if (!this.dimension(dimension))
        throw new BadRequestException(
          'Para distribuição, escolha uma dimensão de agrupamento.',
        );
    }
    if (cfg.operation_key === 'time_series') {
      if (!this.date(primary))
        throw new BadRequestException('Série temporal exige um campo de data.');
      if (!this.metric(cfg.grouping?.metric_operation, metric))
        throw new BadRequestException(
          'Série temporal exige uma métrica compatível.',
        );
    }
    if (
      cfg.operation_key === 'duration_avg' &&
      (!this.date(primary) || !this.date(secondary))
    )
      throw new BadRequestException(
        'Tempo médio entre datas exige campo inicial e final de data.',
      );
    for (const flt of cfg.filters ?? []) {
      const field = by.get(flt.field);
      if (
        !field ||
        !filterOps.includes(flt.operator) ||
        !field.allowed_filters.includes(flt.operator)
      )
        throw new BadRequestException('Filtro incompatível com o catálogo.');
    }
    return { cat, by };
  }
  private async previewConfig(
    tenantId: string,
    cfg: Config,
    indicatorId?: string,
    userId?: string,
  ) {
    try {
      const { by } = await this.validate(tenantId, cfg);
      const rows = await this.supabase.select<Record<string, unknown>[]>(
        cfg.base_table,
        `select=*&tenant_id=eq.${tenantId}&deleted_at=is.null&limit=10000`,
      );
      if (!rows.length)
        return this.result(
          'insufficient_data',
          null,
          [],
          [],
          0,
          cfg,
          by,
          'Configuração válida, mas ainda não há dados suficientes para calcular este indicador. Verifique se os campos escolhidos estão mapeados e preenchidos na base tratada.',
        );
      const r = this.calculate(rows, cfg);
      const status = r.value === null ? 'insufficient_data' : 'success';
      const res = this.result(
        status,
        r.value,
        r.series,
        r.table,
        rows.length,
        cfg,
        by,
        status === 'success'
          ? 'Configuração válida e calculada com dados tratados.'
          : 'Configuração válida, mas ainda não há dados suficientes para calcular este indicador. Verifique se os campos escolhidos estão mapeados e preenchidos na base tratada.',
      );
      await this.log(tenantId, indicatorId, userId, res);
      return res;
    } catch (e) {
      return this.result(
        'failed',
        null,
        [],
        [],
        0,
        cfg,
        new Map(),
        e instanceof Error
          ? e.message
          : 'Não foi possível calcular este indicador. Revise os seletores.',
      );
    }
  }
  private calculate(rows: Record<string, unknown>[], c: Config) {
    const f = c.primary_field ?? 'id';
    const nums = rows.map((r) => Number(r[f])).filter(Number.isFinite);
    if (c.operation_key === 'count')
      return { value: rows.length, series: [], table: [] };
    if (c.operation_key === 'count_distinct')
      return {
        value: new Set(rows.map((r) => r[f])).size,
        series: [],
        table: [],
      };
    if (c.operation_key === 'sum')
      return {
        value: nums.length ? nums.reduce((a, b) => a + b, 0) : null,
        series: [],
        table: [],
      };
    if (c.operation_key === 'avg')
      return {
        value: nums.length
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null,
        series: [],
        table: [],
      };
    if (c.operation_key === 'min')
      return {
        value: nums.length ? Math.min(...nums) : null,
        series: [],
        table: [],
      };
    if (c.operation_key === 'max')
      return {
        value: nums.length ? Math.max(...nums) : null,
        series: [],
        table: [],
      };
    if (c.operation_key === 'ratio' || c.operation_key === 'percentage') {
      const n = this.aggregate(rows, c.numerator_operation, c.numerator_field);
      const d = this.aggregate(
        rows,
        c.denominator_operation,
        c.denominator_field,
      );
      return {
        value: d
          ? (n / d) * (c.operation_key === 'percentage' ? 100 : 1)
          : null,
        series: [],
        table: [],
      };
    }
    return { value: null, series: [], table: [] };
  }
  private metricOp(value: unknown): MetricOperation {
    const op = String(value ?? 'sum');
    return metricOps.includes(op) ? (op as MetricOperation) : 'sum';
  }
  private metricConfig(value: unknown): MetricConfig | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as Record<string, unknown>;
    const source = String(v.source_table ?? 'operation_records');
    if (!tables.includes(source as TableName))
      throw new BadRequestException('Base inválida.');
    return {
      operation: this.metricOp(v.operation),
      source_table: source as TableName,
      field: String(v.field ?? ''),
    };
  }
  private numeric(field?: Field) {
    return (
      !!field &&
      (field.is_measure ||
        field.data_type === 'number' ||
        numericSemantics.includes(field.semantic_type))
    );
  }
  private date(field?: Field) {
    return (
      !!field &&
      (field.data_type === 'date' ||
        field.data_type === 'datetime' ||
        field.semantic_type === 'date')
    );
  }
  private dimension(field?: Field) {
    return (
      !!field &&
      field.is_dimension &&
      (field.data_type === 'text' ||
        dimensionSemantics.includes(field.semantic_type))
    );
  }
  private metric(op: unknown, field?: Field) {
    return String(op) === 'count' ? !!field : this.numeric(field);
  }
  private aggregate(
    rows: Record<string, unknown>[],
    op?: MetricOperation,
    field?: string,
  ) {
    if (op === 'count') return rows.length;
    const nums = rows
      .map((r) => Number(r[field ?? '']))
      .filter(Number.isFinite);
    if (!nums.length) return 0;
    if (op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (op === 'min') return Math.min(...nums);
    if (op === 'max') return Math.max(...nums);
    return nums.reduce((a, b) => a + b, 0);
  }
  private result(
    status: string,
    value: unknown,
    series: Record<string, unknown>[],
    table: Record<string, unknown>[],
    records: number,
    cfg: Config,
    by: Map<string, Field>,
    message: string,
  ) {
    const used = [
      cfg.primary_field,
      cfg.secondary_field,
      cfg.numerator_field,
      cfg.denominator_field,
      cfg.numerator?.field,
      cfg.denominator?.field,
      cfg.grouping?.dimension_field,
      cfg.grouping?.metric_field,
    ].filter(Boolean) as string[];
    return {
      status,
      value,
      series,
      table,
      records_considered: records,
      formula_preview: this.formula(cfg),
      fields_used: [...new Set(used)].map((f) => ({
        field: f,
        label: by.get(f)?.label ?? f,
      })),
      filters_used: [],
      message,
    };
  }
  private formula(c: Config) {
    const label = (field?: string) =>
      friendlyCatalog.find((f) => f.field === field)?.label ??
      field ??
      'Registros';
    const metric = (
      m?: MetricConfig,
      fallbackOp?: MetricOperation,
      fallbackField?: string,
    ) =>
      `${this.operationLabel(m?.operation ?? fallbackOp ?? 'count')}(${label(m?.field ?? fallbackField)})`;
    if (c.operation_key === 'ratio' || c.operation_key === 'percentage') {
      const text = `${metric(c.numerator, c.numerator_operation, c.numerator_field)} / ${metric(c.denominator, c.denominator_operation, c.denominator_field)}`;
      return c.operation_key === 'percentage' ? `${text} * 100` : text;
    }
    return metric(
      undefined,
      c.operation_key as MetricOperation,
      c.primary_field,
    );
  }
  private operationLabel(op: MetricOperation) {
    return (
      {
        count: 'CONTAGEM',
        sum: 'SOMA',
        avg: 'MÉDIA',
        min: 'MÍNIMO',
        max: 'MÁXIMO',
      } as Record<MetricOperation, string>
    )[op];
  }
  private async catalog(tenantId: string) {
    return this.supabase.select<Field[]>(
      'indicator_field_catalog',
      `select=*&is_active=eq.true&or=(tenant_id.is.null,tenant_id.eq.${tenantId})&order=base_table.asc,label.asc`,
    );
  }
  private async log(
    tenantId: string,
    custom_indicator_id: string | undefined,
    user_id: string | undefined,
    result: Record<string, unknown>,
  ) {
    await this.supabase.insert('custom_indicator_calculation_logs', {
      tenant_id: tenantId,
      custom_indicator_id: custom_indicator_id ?? null,
      user_id: user_id ?? null,
      status: result.status,
      records_considered: result.records_considered,
      formula_preview: result.formula_preview,
      fields_used: result.fields_used,
      filters_used: [],
      result_preview: {
        value: result.value,
        series: result.series,
        table: result.table,
      },
      message: result.message,
    });
  }
}
