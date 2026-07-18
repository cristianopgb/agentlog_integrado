import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { Formula, Expr } from './calculated-fields.service';

type TableName =
  | 'operation_records'
  | 'transport_records'
  | 'attendance_records'
  | 'finance_records'
  | 'warehouse_records'
  | 'team_records';
type Operation =
  | 'PIVOT_CONTROLLED'
  | 'CONTAGEM'
  | 'CONTAGEM_DISTINTA'
  | 'SOMA'
  | 'MÉDIA'
  | 'MÍNIMO'
  | 'MÁXIMO'
  | 'PERCENTUAL'
  | 'RAZÃO_DIVISÃO'
  | 'DISTRIBUIÇÃO_POR_CATEGORIA'
  | 'SÉRIE_TEMPORAL'
  | 'RANKING'
  | 'TEMPO_MÉDIO_ENTRE_DATAS';
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
  records_in_scope?: number;
  records_with_data?: number;
  available_for_calculation?: boolean;
  field_role?: string;
  source?: 'native' | 'calculated';
  calculation_kind?: 'row_calculated_field' | 'aggregate_calculated_measure';
  formula_config?: Formula;
};
type MetricOperation = 'CONTAGEM' | 'SOMA' | 'MÉDIA' | 'MÍNIMO' | 'MÁXIMO';
type PivotItem = {
  field: string;
  label?: string;
  source?: 'native' | 'calculated';
  aggregation?: MetricOperation | 'CONTAGEM_DISTINTA' | 'VALOR_CALCULADO';
  format?: string;
};
type Config = {
  base_table: TableName;
  operation_key: Operation;
  values?: PivotItem[];
  rows?: PivotItem[];
  columns?: PivotItem[];
  rationale?: string;
  primary_field?: string;
  secondary_field?: string;
  numerator_field?: string;
  denominator_field?: string;
  numerator_operation?: MetricOperation;
  denominator_operation?: MetricOperation;
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
  'PIVOT_CONTROLLED',
  'CONTAGEM',
  'CONTAGEM_DISTINTA',
  'SOMA',
  'MÉDIA',
  'MÍNIMO',
  'MÁXIMO',
  'PERCENTUAL',
  'RAZÃO_DIVISÃO',
  'DISTRIBUIÇÃO_POR_CATEGORIA',
  'SÉRIE_TEMPORAL',
  'RANKING',
  'TEMPO_MÉDIO_ENTRE_DATAS',
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
  'weight',
  'days',
  'currency_per_kg',
  'currency_per_ton',
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
const filterOps: string[] = [
  'igual a',
  'diferente de',
  'contém',
  'maior que',
  'menor que',
  'entre',
  'preenchido',
  'não preenchido',
];
const pivotFilterOps: string[] = [
  'igual a',
  'diferente de',
  'contém',
  'maior que',
  'menor que',
  'preenchido',
  'não preenchido',
];
const pivotAggregations = [
  'SOMA',
  'MÉDIA',
  'CONTAGEM',
  'CONTAGEM_DISTINTA',
  'MÍNIMO',
  'MÁXIMO',
  'VALOR_CALCULADO',
];
const metricOps = ['CONTAGEM', 'SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO'];
const numericSemantics = [
  'money',
  'weight',
  'quantity',
  'decimal',
  'number',
  'duration',
  'days',
];
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
const blockedFields: string[] = [
  'raw_payload',
  'source_staging_record_id',
  'source_payload_hash',
  'tenant_id',
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'staging',
  'source_data_contract_id',
  'source_data_source_id',
  'source_staging_batch_id',
  'data_source',
  'upload',
  'integration',
  'origem',
  'lote',
];
const friendlyLabels: Record<string, string> = {
  freight_value: 'Frete',
  gross_weight: 'Peso total',
  volume_count: 'Volumes',
  total_value: 'Valor transportado',
  customer_name: 'Cliente',
  destination_state: 'UF destino',
  completed_at: 'Data de entrega',
  issued_at: 'Data de emissão',
  expected_date: 'Data prevista',
};

@Injectable()
export class CustomIndicatorsService {
  constructor(private readonly supabase: SupabaseService) {}
  async fields(tenantId: string) {
    const rows = await this.rows(tenantId, 'operation_records', false);
    const data = (await this.catalog(tenantId))
      .filter(
        (f) =>
          f.base_table === 'operation_records' &&
          !blockedFields.includes(f.field_key),
      )
      .map((f) => this.enrichField(f, rows));
    return { data: this.dedupeFields(data) };
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
  async previewSaved(
    tenantId: string,
    id: string,
    userId: string,
    filters: Record<string, unknown> = {},
  ) {
    const row = (await this.get(tenantId, id)) as {
      calculation_config: Config;
    };
    return this.previewConfig(
      tenantId,
      row.calculation_config,
      id,
      userId,
      filters,
    );
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
      formula_preview: this.previewText(cfg),
      status,
      available_for_dashboard: active && b.available_for_dashboard !== false,
      available_for_reports: active && b.available_for_reports !== false,
      updated_by: userId,
      created_by: userId,
    };
  }
  private config(c: Record<string, unknown>): Config {
    const table = String(c.base_table || 'operation_records');
    const op = String(c.operation_key || 'CONTAGEM');
    if (!tables.includes(table as TableName))
      throw new BadRequestException('Base inválida.');
    if (!ops.includes(op)) throw new BadRequestException('Operação inválida.');
    return {
      base_table: table as TableName,
      operation_key: op as Operation,
      primary_field: c.primary_field as string,
      secondary_field: c.secondary_field as string,
      numerator_field: c.numerator_field as string,
      denominator_field: c.denominator_field as string,
      numerator_operation: this.metricOp(c.numerator_operation),
      denominator_operation: this.metricOp(c.denominator_operation),
      default_date_field: c.default_date_field as string,
      filters: Array.isArray(c.filters) ? (c.filters as Config['filters']) : [],
      values: Array.isArray(c.values)
        ? (c.values as Config['values'])
        : undefined,
      rows: Array.isArray(c.rows) ? (c.rows as Config['rows']) : undefined,
      columns: Array.isArray(c.columns)
        ? (c.columns as Config['columns'])
        : undefined,
      rationale: c.rationale as string,
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
        .filter(
          (f) =>
            f.base_table === cfg.base_table &&
            !blockedFields.includes(f.field_key),
        )
        .map((f) => [f.field_key, f]),
    );
    const pivotUsed = [
      ...(cfg.values ?? []).map((v) => v.field),
      ...(cfg.rows ?? []).map((v) => v.field),
      ...(cfg.columns ?? []).map((v) => v.field),
    ];
    const used = [
      ...pivotUsed,
      cfg.primary_field,
      cfg.secondary_field,
      cfg.numerator_field,
      cfg.denominator_field,
      cfg.grouping?.dimension_field,
      cfg.grouping?.metric_field,
      cfg.period?.field,
      cfg.default_date_field,
      ...(cfg.filters ?? []).map((f) => f.field),
    ].filter(Boolean) as string[];
    if (used.some((f) => blockedFields.includes(f)))
      throw new BadRequestException('Campo não permitido para indicador.');
    for (const f of used)
      if (!by.has(f))
        throw new BadRequestException('Campo fora do catálogo controlado.');
    if (cfg.operation_key === 'PIVOT_CONTROLLED') {
      if ((cfg.columns ?? []).length > 1)
        throw new BadRequestException('Colunas aceitam no máximo um campo.');
      if ((cfg.rows ?? []).length > 1)
        throw new BadRequestException('Linhas aceitam no máximo um campo.');
      for (const v of cfg.values ?? []) {
        const field = by.get(v.field);
        const agg = String(v.aggregation ?? 'SOMA');
        if (!pivotAggregations.includes(agg))
          throw new BadRequestException('Agregação inválida para indicador.');
        if (!field)
          throw new BadRequestException('Campo fora do catálogo controlado.');
        if (
          field.field_key === 'freight_value' &&
          v.format === 'currency_per_ton'
        )
          throw new BadRequestException(
            'Formato não cria cálculo. Para R$/ton, use um campo calculado R$/ton.',
          );
        if (
          field.source === 'calculated' &&
          field.calculation_kind === 'aggregate_calculated_measure' &&
          agg !== 'VALOR_CALCULADO'
        )
          throw new BadRequestException(
            'Medida calculada agregada deve usar Valor calculado.',
          );
        if (
          agg === 'VALOR_CALCULADO' &&
          !(
            field.source === 'calculated' &&
            field.calculation_kind === 'aggregate_calculated_measure'
          )
        )
          throw new BadRequestException(
            'Valor calculado exige campo calculado agregado.',
          );
        if (['SOMA', 'MÉDIA'].includes(agg) && !this.numeric(field))
          throw new BadRequestException(
            'Soma e Média exigem número, moeda, peso, quantidade, dias ou campo calculado numérico.',
          );
        if (
          ['MÍNIMO', 'MÁXIMO'].includes(agg) &&
          !(this.numeric(field) || this.date(field))
        )
          throw new BadRequestException(
            'Mínimo e Máximo exigem número, duração/dias ou data.',
          );
      }
      for (const flt of cfg.filters ?? []) {
        const field = by.get(flt.field);
        if (flt.operator === 'entre')
          throw new BadRequestException(
            'Operador entre ainda não está disponível nesta tela.',
          );
        if (field?.source === 'calculated')
          throw new BadRequestException(
            'Filtros por campo calculado ainda não estão disponíveis. Use campos nativos em Filtros.',
          );
        if (!field || !pivotFilterOps.includes(flt.operator))
          throw new BadRequestException('Filtro incompatível com o catálogo.');
      }
      return { cat, by };
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
      ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO'].includes(cfg.operation_key) &&
      !this.numeric(primary)
    )
      throw new BadRequestException(
        primary
          ? `${primary.label} não pode ser usado em ${cfg.operation_key}.`
          : 'Escolha um campo numérico para esta operação.',
      );
    if (cfg.operation_key === 'CONTAGEM' && !primary)
      throw new BadRequestException('Escolha um campo para contagem.');
    if (cfg.operation_key === 'CONTAGEM_DISTINTA' && !this.dimension(primary))
      throw new BadRequestException(
        'Escolha uma dimensão para contagem distinta.',
      );
    if (
      ['RAZÃO_DIVISÃO', 'PERCENTUAL'].includes(cfg.operation_key) &&
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
    if (
      ['DISTRIBUIÇÃO_POR_CATEGORIA', 'RANKING'].includes(cfg.operation_key) &&
      (!this.metric(cfg.grouping?.metric_operation, metric) ||
        !this.dimension(dimension))
    )
      throw new BadRequestException('Escolha métrica e dimensão compatíveis.');
    if (
      cfg.operation_key === 'SÉRIE_TEMPORAL' &&
      (!this.date(primary) ||
        !this.metric(cfg.grouping?.metric_operation, metric))
    )
      throw new BadRequestException(
        'Série temporal exige data e métrica compatíveis.',
      );
    if (
      cfg.operation_key === 'TEMPO_MÉDIO_ENTRE_DATAS' &&
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
        !(field.allowed_filters as string[]).includes(flt.operator)
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
    filters: Record<string, unknown> = {},
  ) {
    try {
      const { by } = await this.validate(tenantId, cfg);
      const scope = await this.previewScope(
        tenantId,
        await this.rows(
          tenantId,
          cfg.base_table,
          filters.include_archived === true,
        ),
        filters,
      );
      scope.rows = this.applyConfigFilters(scope.rows, cfg);
      if (!scope.rows.length)
        return this.result(
          'empty',
          null,
          [],
          [],
          0,
          cfg,
          by,
          'Dados ainda não disponíveis para este indicador.',
          0,
          scope.scope,
        );
      const r = this.calculate(scope.rows, cfg, by);
      const res = this.result(
        'success',
        r.value,
        r.series,
        r.table,
        scope.rows.length,
        cfg,
        by,
        this.scopeMessage(scope.scope, r.ignored),
        r.ignored,
        scope.scope,
        'used' in r ? r.used : undefined,
      );
      await this.log(tenantId, indicatorId, userId, res);
      return res;
    } catch {
      return this.result(
        'failed',
        null,
        [],
        [],
        0,
        cfg,
        new Map(),
        'Não foi possível calcular este indicador. Revise os seletores controlados.',
        0,
        { scope: 'all' },
      );
    }
  }
  private calculate(
    rows: Record<string, unknown>[],
    c: Config,
    by: Map<string, Field>,
  ) {
    if (c.operation_key === 'PIVOT_CONTROLLED')
      return this.calculatePivot(rows, c, by);
    const f = c.primary_field ?? 'id';
    const calculatedField = c.primary_field
      ? by.get(c.primary_field)
      : undefined;
    const calc =
      calculatedField?.source === 'calculated' && calculatedField.formula_config
        ? this.calculateFormula(rows, calculatedField.formula_config)
        : undefined;
    const nums = calc
      ? []
      : rows.map((r) => Number(r[f])).filter(Number.isFinite);
    if (c.operation_key === 'CONTAGEM')
      return { value: rows.length, series: [], table: [], ignored: 0 };
    if (c.operation_key === 'CONTAGEM_DISTINTA')
      return {
        value: new Set(rows.map((r) => r[f])).size,
        series: [],
        table: [],
        ignored: 0,
      };
    if (calc && ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO'].includes(c.operation_key))
      return {
        value: calc.value,
        series: [],
        table: [],
        ignored: calc.ignored,
      };
    if (c.operation_key === 'SOMA')
      return {
        value: nums.reduce((a, b) => a + b, 0),
        series: [],
        table: [],
        ignored: rows.length - nums.length,
      };
    if (c.operation_key === 'MÉDIA')
      return {
        value: nums.length
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null,
        series: [],
        table: [],
        ignored: rows.length - nums.length,
      };
    if (c.operation_key === 'MÍNIMO')
      return {
        value: nums.length ? Math.min(...nums) : null,
        series: [],
        table: [],
        ignored: rows.length - nums.length,
      };
    if (c.operation_key === 'MÁXIMO')
      return {
        value: nums.length ? Math.max(...nums) : null,
        series: [],
        table: [],
        ignored: rows.length - nums.length,
      };
    if (
      c.operation_key === 'RAZÃO_DIVISÃO' ||
      c.operation_key === 'PERCENTUAL'
    ) {
      const n = this.aggregate(rows, c.numerator_operation, c.numerator_field);
      const d = this.aggregate(
        rows,
        c.denominator_operation,
        c.denominator_field,
      );
      return {
        value:
          n !== null && d
            ? (n / d) * (c.operation_key === 'PERCENTUAL' ? 100 : 1)
            : null,
        series: [],
        table: [],
        ignored: 0,
      };
    }
    if (
      ['DISTRIBUIÇÃO_POR_CATEGORIA', 'RANKING', 'SÉRIE_TEMPORAL'].includes(
        c.operation_key,
      )
    ) {
      const group =
        c.operation_key === 'SÉRIE_TEMPORAL' ? f : c.grouping?.dimension_field;
      const metric = c.grouping?.metric_field;
      const series = this.group(
        rows,
        group,
        metric,
        c.grouping?.metric_operation,
      );
      return { value: null, series, table: series, ignored: 0 };
    }
    return { value: null, series: [], table: [], ignored: 0 };
  }
  private calculatePivot(
    rows: Record<string, unknown>[],
    c: Config,
    by: Map<string, Field>,
  ) {
    const value = c.values?.[0];
    if (!value)
      return { value: null, series: [], table: [], ignored: 0, used: 0 };
    const row = c.rows?.[0]?.field;
    const column = c.columns?.[0]?.field;
    const measure = this.pivotMeasure(rows, value, by);
    if (row && column) {
      const rowMap = new Map<string, Record<string, unknown>[]>();
      rows.forEach((r) => {
        const key = String(r[row] ?? 'Não informado');
        rowMap.set(key, [...(rowMap.get(key) ?? []), r]);
      });
      const columnLabels = [
        ...new Set(rows.map((r) => String(r[column] ?? 'Não informado'))),
      ];
      const table = [...rowMap.entries()].map(([label, subset]) => {
        const item: Record<string, unknown> = { label };
        for (const col of columnLabels) {
          const cell = this.pivotMeasure(
            subset.filter((r) => String(r[column] ?? 'Não informado') === col),
            value,
            by,
          );
          item[col] = cell.value;
          item[`${col}_used_count`] = cell.used;
        }
        return item;
      });
      return {
        value: null,
        series: table,
        table,
        ignored: measure.ignored,
        used: measure.used,
      };
    }
    const groupField = row || column;
    if (groupField) {
      const map = new Map<string, Record<string, unknown>[]>();
      rows.forEach((r) => {
        const key = String(r[groupField] ?? 'Não informado');
        map.set(key, [...(map.get(key) ?? []), r]);
      });
      const table = [...map.entries()].map(([label, subset]) => {
        const grouped = this.pivotMeasure(subset, value, by);
        return {
          label,
          value: grouped.value,
          records_used_in_group: grouped.used,
          used_count: grouped.used,
        };
      });
      return {
        value: null,
        series: table,
        table,
        ignored: measure.ignored,
        used: measure.used,
      };
    }
    return { ...measure, series: [], table: [] };
  }
  private pivotMeasure(
    rows: Record<string, unknown>[],
    value: PivotItem,
    by: Map<string, Field>,
  ) {
    const field = by.get(value.field);
    const agg = value.aggregation as
      MetricOperation | 'CONTAGEM_DISTINTA' | 'VALOR_CALCULADO' | undefined;
    if (field?.source === 'calculated' && field.formula_config) {
      const calc = this.calculateFormulaForAggregation(
        rows,
        field.formula_config,
        agg,
      );
      return {
        value: calc.value,
        used: Math.max(rows.length - calc.ignored, 0),
        ignored: calc.ignored,
      };
    }
    if (agg === 'CONTAGEM')
      return { value: rows.length, used: rows.length, ignored: 0 };
    if (agg === 'CONTAGEM_DISTINTA') {
      const present = rows.filter((r) => this.filled(r[value.field]));
      return {
        value: new Set(present.map((r) => r[value.field])).size,
        used: present.length,
        ignored: rows.length - present.length,
      };
    }
    if (
      field &&
      this.date(field) &&
      ['MÍNIMO', 'MÁXIMO'].includes(String(agg))
    ) {
      const dates = rows
        .map((r) => this.dateValue(r[value.field]))
        .filter((v): v is { time: number; iso: string } => v !== null);
      const selected =
        agg === 'MÍNIMO'
          ? dates.reduce<{ time: number; iso: string } | null>(
              (min, item) => (!min || item.time < min.time ? item : min),
              null,
            )
          : dates.reduce<{ time: number; iso: string } | null>(
              (max, item) => (!max || item.time > max.time ? item : max),
              null,
            );
      return {
        value: selected?.iso ?? null,
        used: dates.length,
        ignored: rows.length - dates.length,
      };
    }
    const nums = rows
      .map((r) => this.numericValue(r[value.field]))
      .filter((v): v is number => v !== null);
    const result =
      agg === 'MÉDIA'
        ? nums.length
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null
        : agg === 'MÍNIMO'
          ? nums.length
            ? Math.min(...nums)
            : null
          : agg === 'MÁXIMO'
            ? nums.length
              ? Math.max(...nums)
              : null
            : nums.length
              ? nums.reduce((a, b) => a + b, 0)
              : null;
    return {
      value: result,
      used: nums.length,
      ignored: rows.length - nums.length,
    };
  }
  private calculateFormulaForAggregation(
    rows: Record<string, unknown>[],
    formula: Formula,
    op?: MetricOperation | 'CONTAGEM_DISTINTA' | 'VALOR_CALCULADO',
  ) {
    if (
      formula.kind === 'aggregate_calculated_measure' ||
      op === 'VALOR_CALCULADO'
    )
      return this.calculateFormula(rows, formula);
    const values = rows
      .map((row) => this.evalRowFormula(formula.expression, row))
      .filter(Number.isFinite);
    const value =
      op === 'MÉDIA'
        ? values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null
        : op === 'MÍNIMO'
          ? values.length
            ? Math.min(...values)
            : null
          : op === 'MÁXIMO'
            ? values.length
              ? Math.max(...values)
              : null
            : values.length
              ? values.reduce((a, b) => a + b, 0)
              : null;
    return { value, ignored: rows.length - values.length };
  }
  private group(
    rows: Record<string, unknown>[],
    group?: string,
    metric?: string,
    op?: MetricOperation,
  ) {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const label = String(r[group ?? ''] ?? 'Não informado');
      const value = this.aggregate([r], op, metric);
      map.set(label, (map.get(label) ?? 0) + (value ?? 0));
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }
  private metricOp(value: unknown): MetricOperation {
    const op = String(value ?? 'SOMA');
    return metricOps.includes(op) ? (op as MetricOperation) : 'SOMA';
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
    return String(op) === 'CONTAGEM' ? !!field : this.numeric(field);
  }
  private aggregate(
    rows: Record<string, unknown>[],
    op?: MetricOperation,
    field?: string,
  ) {
    if (op === 'CONTAGEM') return rows.length;
    const nums = rows
      .map((r) => this.numericValue(r[field ?? '']))
      .filter((v): v is number => v !== null);
    if (op === 'MÉDIA')
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    if (op === 'MÍNIMO') return nums.length ? Math.min(...nums) : null;
    if (op === 'MÁXIMO') return nums.length ? Math.max(...nums) : null;
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }
  private previewText(c: Config) {
    if (c.operation_key === 'PIVOT_CONTROLLED') {
      const v = c.values?.[0];
      const row = (c.rows ?? []).map((r) => r.label ?? r.field).join(', ');
      const col = (c.columns ?? []).map((r) => r.label ?? r.field).join(', ');
      const group = [row, col].filter(Boolean).join(' x ');
      return `${this.aggLabel(String(v?.aggregation ?? 'SOMA'))} de ${v?.label ?? v?.field ?? 'valor'}${group ? ' por ' + group : ''}`;
    }
    if (['RAZÃO_DIVISÃO', 'PERCENTUAL'].includes(c.operation_key))
      return `${c.operation_key}: ${c.numerator_operation}(${c.numerator_field}) / ${c.denominator_operation}(${c.denominator_field})`;
    if (c.grouping?.dimension_field)
      return `${c.operation_key}: ${c.grouping.metric_operation ?? 'CONTAGEM'}(${c.grouping.metric_field ?? c.primary_field}) por ${c.grouping.dimension_field}`;
    return `${c.operation_key}(${c.primary_field ?? 'Registros'})`;
  }
  private aggLabel(op: string) {
    return (
      (
        {
          SOMA: 'Soma',
          MÉDIA: 'Média',
          CONTAGEM: 'Contagem',
          CONTAGEM_DISTINTA: 'Contagem distinta',
          MÍNIMO: 'Mínimo',
          MÁXIMO: 'Máximo',
          VALOR_CALCULADO: 'Valor calculado',
        } as Record<string, string>
      )[op] ?? op
    );
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
    ignored = 0,
    scope: Record<string, unknown> = { scope: 'all' },
    usedOverride?: number,
  ) {
    const used =
      cfg.operation_key === 'PIVOT_CONTROLLED'
        ? [
            ...(cfg.values ?? []).map((v) => v.field),
            ...(cfg.rows ?? []).map((v) => v.field),
            ...(cfg.columns ?? []).map((v) => v.field),
          ]
        : ([
            cfg.primary_field,
            cfg.secondary_field,
            cfg.numerator_field,
            cfg.denominator_field,
            cfg.grouping?.dimension_field,
            cfg.grouping?.metric_field,
          ].filter(Boolean) as string[]);
    return {
      status,
      value,
      series,
      table,
      records_considered: records,
      formula_preview: this.previewText(cfg),
      fields_used: [...new Set(used)].map((f) => ({
        field: f,
        label: by.get(f)?.label ?? f,
      })),
      filters_used: [],
      records_used: usedOverride ?? Math.max(records - ignored, 0),
      records_ignored_missing_data: ignored,
      scope,
      message,
    };
  }
  private applyConfigFilters(rows: Record<string, unknown>[], cfg: Config) {
    return (cfg.filters ?? []).reduce(
      (current, filter) =>
        current.filter((row) =>
          this.matchesFilter(
            row[filter.field],
            filter.operator,
            filter.value,
            filter.value_to,
          ),
        ),
      rows,
    );
  }
  private matchesFilter(
    actual: unknown,
    operator: string,
    expected?: unknown,
    expectedTo?: unknown,
  ) {
    const value = String(actual ?? '');
    const filled = this.filled(actual);
    if (operator === 'preenchido') return filled;
    if (operator === 'não preenchido') return !filled;
    if (operator === 'igual a') return value === String(expected ?? '');
    if (operator === 'diferente de') return value !== String(expected ?? '');
    if (operator === 'contém')
      return value.toLowerCase().includes(String(expected ?? '').toLowerCase());
    const number = Number(actual);
    const from = Number(expected);
    const to = Number(expectedTo);
    if (operator === 'maior que')
      return Number.isFinite(number) && Number.isFinite(from) && number > from;
    if (operator === 'menor que')
      return Number.isFinite(number) && Number.isFinite(from) && number < from;
    if (operator === 'entre')
      return (
        Number.isFinite(number) &&
        Number.isFinite(from) &&
        Number.isFinite(to) &&
        number >= from &&
        number <= to
      );
    return false;
  }
  private filled(value: unknown) {
    return value !== null && value !== undefined && value !== '';
  }
  private dateValue(value: unknown) {
    if (!this.filled(value)) return null;
    const time = new Date(String(value)).getTime();
    if (!Number.isFinite(time)) return null;
    return { time, iso: new Date(time).toISOString() };
  }
  private async previewScope(
    tenantId: string,
    rows: Record<string, unknown>[],
    filters: Record<string, unknown>,
  ) {
    void tenantId;
    const scope: Record<string, unknown> = {
      scope: String(filters.scope ?? 'all'),
      include_archived: filters.include_archived === true,
    };
    let next = rows;
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
    next = this.applyDashboardFilters(next, filters);
    return { rows: next, scope };
  }

  private applyDashboardFilters(rows: Record<string, unknown>[], filters: Record<string, unknown>) {
    const list = Array.isArray(filters.global_filters) ? filters.global_filters : Array.isArray(filters.filters) ? filters.filters : [];
    return rows.filter((row) => list.every((item) => {
      const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return this.matchesFilter(row[String(f.field_key ?? f.field ?? '')], String(f.operator ?? ''), f.value, f.value_to);
    }));
  }

  private scopeMessage(scope: Record<string, unknown>, ignored: number) {
    const parts = [
      scope.date_from || scope.date_to
        ? 'Cálculo realizado usando somente o período selecionado na base nativa tratada.'
        : 'Cálculo realizado usando todos os dados nativos tratados ativos disponíveis para este tenant.',
    ];
    if (ignored > 0)
      parts.push(
        `${ignored} registros foram ignorados porque não possuem os campos necessários para este indicador.`,
      );
    return parts.join(' ');
  }
  private async catalog(tenantId: string) {
    const native = await this.supabase.select<Field[]>(
      'indicator_field_catalog',
      `select=*&is_active=eq.true&or=(tenant_id.is.null,tenant_id.eq.${tenantId})&order=base_table.asc,label.asc`,
    );
    const calculated = await this.supabase.select<
      Array<Record<string, unknown>>
    >(
      'custom_calculated_fields',
      `select=id,tenant_id,module_key,field_key,name,value_format,status,calculation_kind,formula_config&tenant_id=eq.${tenantId}&status=eq.active&available_for_indicators=eq.true&deleted_at=is.null&order=name.asc`,
    );
    const virtualFields: Field[] = calculated.map((f) => ({
      id: String(f.id),
      tenant_id: String(f.tenant_id),
      module_key: String(f.module_key),
      base_table: 'operation_records' as TableName,
      field_key: String(f.field_key),
      label: String(f.name),
      data_type: 'number',
      semantic_type: String(f.value_format ?? 'number'),
      allowed_operations: ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO'],
      allowed_filters: [],
      is_dimension: false,
      is_measure: true,
      is_active: true,
      field_role: 'métrica calculada',
      source: 'calculated',
      calculation_kind: f.calculation_kind as Field['calculation_kind'],
      formula_config: f.formula_config as Formula,
    }));
    return this.dedupeFields([
      ...native.map((f) => ({ ...f, source: 'native' as const })),
      ...virtualFields,
    ]);
  }
  private dedupeFields(fields: Field[]): Field[] {
    const map = new Map<string, Field>();
    for (const field of fields) {
      const key = `${field.base_table}:${field.field_key}`;
      const current = map.get(key);
      if (!current || (!current.tenant_id && field.tenant_id))
        map.set(key, field);
    }
    return [...map.values()];
  }
  private numericValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  private enrichField(f: Field, rows: Record<string, unknown>[]): Field {
    const recordsWithData = rows.filter(
      (r) =>
        r[f.field_key] !== null &&
        r[f.field_key] !== undefined &&
        r[f.field_key] !== '',
    ).length;
    const role = this.date(f)
      ? 'data'
      : this.numeric(f)
        ? 'métrica'
        : 'dimensão';
    return {
      ...f,
      label: friendlyLabels[f.field_key] ?? f.label,
      records_in_scope: rows.length,
      records_with_data: recordsWithData,
      available_for_calculation: recordsWithData > 0,
      field_role: role,
    };
  }
  private calculateFormula(rows: Record<string, unknown>[], formula: Formula) {
    return formula.kind === 'row_calculated_field'
      ? this.calculateRowFormula(rows, formula.expression)
      : this.calculateAggregateFormula(rows, formula.expression);
  }
  private calculateRowFormula(rows: Record<string, unknown>[], expr: Expr) {
    const values = rows
      .map((row) => this.evalRowFormula(expr, row))
      .filter(Number.isFinite);
    return {
      value: values.length ? values.reduce((a, b) => a + b, 0) : null,
      ignored: rows.length - values.length,
    };
  }
  private calculateAggregateFormula(
    rows: Record<string, unknown>[],
    expr: Expr,
  ) {
    const validRows = rows.filter((row) =>
      this.fieldKeys(expr).every(
        (field) =>
          row[field] !== null &&
          row[field] !== undefined &&
          row[field] !== '' &&
          Number.isFinite(Number(row[field])),
      ),
    );
    const value = validRows.length
      ? this.evalAggregateFormula(expr, validRows)
      : Number.NaN;
    return {
      value: validRows.length && Number.isFinite(value) ? value : null,
      ignored:
        rows.length -
        (validRows.length && Number.isFinite(value) ? validRows.length : 0),
    };
  }
  private evalRowFormula(expr: Expr, row: Record<string, unknown>): number {
    if ('type' in expr && expr.type === 'date_diff_days')
      return this.diffDays(row[expr.start.field], row[expr.end.field]);
    if ('constant' in expr) return Number(expr.constant);
    if ('field' in expr) return Number(row[expr.field.field]);
    if ('aggregate' in expr) return Number.NaN;
    if ('op' in expr)
      return this.applyFormula(
        expr.op,
        this.evalRowFormula(expr.left, row),
        this.evalRowFormula(expr.right, row),
      );
    return Number.NaN;
  }
  private evalAggregateFormula(
    expr: Expr,
    rows: Record<string, unknown>[],
  ): number {
    if ('constant' in expr) return Number(expr.constant);
    if ('aggregate' in expr) {
      const aggregateExpr = expr as unknown as {
        aggregate: string;
        field: { field: string };
      };
      return this.aggregateFormula(
        rows,
        aggregateExpr.aggregate,
        aggregateExpr.field.field,
      );
    }
    if ('field' in expr) return Number.NaN;
    if ('op' in expr)
      return this.applyFormula(
        expr.op,
        this.evalAggregateFormula(expr.left, rows),
        this.evalAggregateFormula(expr.right, rows),
      );
    return Number.NaN;
  }
  private aggregateFormula(
    rows: Record<string, unknown>[],
    op: string,
    field: string,
  ) {
    const present = rows.filter(
      (r) => r[field] !== null && r[field] !== undefined && r[field] !== '',
    );
    if (op === 'count') return present.length;
    const nums = present.map((r) => Number(r[field])).filter(Number.isFinite);
    if (!nums.length) return Number.NaN;
    if (op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (op === 'min') return Math.min(...nums);
    if (op === 'max') return Math.max(...nums);
    return nums.reduce((a, b) => a + b, 0);
  }
  private diffDays(start: unknown, end: unknown) {
    const s = new Date(String(start ?? '')).getTime();
    const e = new Date(String(end ?? '')).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return Number.NaN;
    return Math.round((e - s) / 86400000);
  }
  private applyFormula(op: string, left: number, right: number) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
    if (op === 'divide' && right === 0) return Number.NaN;
    if (op === 'add') return left + right;
    if (op === 'subtract') return left - right;
    if (op === 'multiply') return left * right;
    return left / right;
  }
  private fieldKeys(expr: Expr): string[] {
    if ('type' in expr && expr.type === 'date_diff_days')
      return [expr.start.field, expr.end.field];
    if ('constant' in expr) return [];
    if ('field' in expr) return [expr.field.field];
    if ('aggregate' in expr) {
      const aggregateExpr = expr as unknown as { field: { field: string } };
      return [aggregateExpr.field.field];
    }
    if ('op' in expr)
      return [
        ...new Set([
          ...this.fieldKeys(expr.left),
          ...this.fieldKeys(expr.right),
        ]),
      ];
    return [];
  }

  private async rows(
    tenantId: string,
    table: TableName,
    includeArchived = false,
  ) {
    const filters = [`select=*`, `tenant_id=eq.${tenantId}`];
    if (!includeArchived) filters.push('deleted_at=is.null');
    return this.supabase.select<Record<string, unknown>[]>(
      table,
      `${filters.join('&')}&limit=10000`,
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
