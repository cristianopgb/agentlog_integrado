import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type CalcKind = 'row_calculated_field' | 'aggregate_calculated_measure';
type Op = 'add' | 'subtract' | 'multiply' | 'divide';
type Agg = 'sum' | 'avg' | 'count' | 'max' | 'min';
export type SafeAnalyticsTable =
  | 'operation_records'
  | 'transport_records'
  | 'finance_records'
  | 'occurrence_analytics_view';
type FieldRef = { table: SafeAnalyticsTable; field: string };
export type Expr =
  | { op: Op; left: Expr; right: Expr }
  | { field: FieldRef }
  | { aggregate: Agg; field: FieldRef }
  | { constant: number }
  | { type: 'date_diff_days'; start: FieldRef; end: FieldRef };
export type Formula = {
  version: 1;
  kind: CalcKind;
  expression: Expr;
  format?: string;
};
type CatalogField = {
  base_table: string;
  field_key: string;
  label: string;
  data_type: string;
  semantic_type: string;
  is_measure: boolean;
  is_dimension: boolean;
  is_active: boolean;
};

type CalcResult = { value: number | null; used: number; ignored: number };

const kinds: CalcKind[] = [
  'row_calculated_field',
  'aggregate_calculated_measure',
];
const statuses = ['draft', 'active', 'inactive'];
const formats = [
  'number',
  'currency',
  'percent',
  'weight',
  'quantity',
  'days',
  'currency_per_kg',
  'currency_per_ton',
];
const operators: Op[] = ['add', 'subtract', 'multiply', 'divide'];
const aggregates: Agg[] = ['sum', 'avg', 'count', 'max', 'min'];
const safeTables = new Set<SafeAnalyticsTable>([
  'operation_records',
  'transport_records',
  'finance_records',
  'occurrence_analytics_view',
]);
const blocked = [
  'raw_payload',
  'staging',
  'source_staging_record_id',
  'source_payload_hash',
  'source_data_source_id',
  'source_data_contract_id',
  'source_staging_batch_id',
  'data_source',
  'upload',
  'integration',
  'origem',
  'lote',
  'tenant_id',
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'occurrence_id',
  'primary_operation_record_id',
  'metadata',
  'storage_path',
  'external_url',
  'created_by',
  'updated_by',
  'responsible_user_id',
];
const sqlJs =
  /\b(select|insert|update|delete|drop|alter|from|where|join|union|script|function|eval|return|new\s+Function|javascript)\b|=>/i;

@Injectable()
export class CalculatedFieldsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(tenantId: string) {
    const rows = await this.supabase.select<Record<string, unknown>[]>(
      'custom_calculated_fields',
      `select=*&tenant_id=eq.${tenantId}&deleted_at=is.null&order=updated_at.desc`,
    );
    return { data: rows };
  }

  async preview(tenantId: string, body: Record<string, unknown>) {
    const formula = await this.normalizeAndValidate(tenantId, body);
    const rows = await this.formulaRows(tenantId, formula.expression);
    const result = this.calculate(rows, formula);
    return {
      status: result.used ? 'success' : 'insufficient_data',
      value: result.value,
      records_considered: rows.length,
      records_used: result.used,
      records_ignored_missing_data: result.ignored,
      formula_preview: this.previewText(formula.expression),
      message: result.used
        ? 'Prévia calculada somente com a base nativa tratada.'
        : 'Dados insuficientes: os campos selecionados ainda não possuem dados suficientes.',
      fields_used: this.fieldKeys(formula.expression),
      series: [],
      table: [],
      filters_used: [],
    };
  }

  async create(
    tenantId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const formula = await this.normalizeAndValidate(tenantId, body);
    const status = String(body.status ?? 'draft');
    if (!statuses.includes(status))
      throw new BadRequestException('Status inválido.');
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('Nome obrigatório.');
    const fieldKey = this.fieldKey(body.field_key, name);
    const format = String(body.value_format ?? formula.format ?? 'number');
    if (!formats.includes(format))
      throw new BadRequestException('Formato inválido.');
    const active = status === 'active';
    const rows = await this.supabase.insert<Record<string, unknown>[]>(
      'custom_calculated_fields',
      {
        tenant_id: tenantId,
        name,
        description: body.description ? String(body.description) : null,
        module_key: String(body.module_key ?? 'transport'),
        field_key: fieldKey,
        calculation_kind: formula.kind,
        formula_config: formula,
        formula_preview: this.previewText(formula.expression),
        value_format: format,
        decimal_places: Number(body.decimal_places ?? 2),
        status,
        available_for_indicators: active,
        available_for_dashboard: active,
        available_for_reports: active,
        created_by: userId,
      },
    );
    return rows[0];
  }

  async status(tenantId: string, id: string, body: { status?: string }) {
    await this.get(tenantId, id);
    const status = String(body.status ?? '');
    if (!statuses.includes(status))
      throw new BadRequestException('Status inválido.');
    const active = status === 'active';
    const rows = await this.supabase.update<Record<string, unknown>[]>(
      'custom_calculated_fields',
      `tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null`,
      {
        status,
        available_for_indicators: active,
        available_for_dashboard: active,
        available_for_reports: active,
      },
    );
    return rows[0];
  }

  async activeFields(tenantId: string) {
    return this.supabase.select<Record<string, unknown>[]>(
      'custom_calculated_fields',
      `select=*&tenant_id=eq.${tenantId}&status=eq.active&available_for_indicators=eq.true&deleted_at=is.null&order=name.asc`,
    );
  }

  calculate(rows: Record<string, unknown>[], formula: Formula): CalcResult {
    return formula.kind === 'row_calculated_field'
      ? this.calculateRow(rows, formula.expression)
      : this.calculateAggregate(rows, formula.expression);
  }

  private async get(tenantId: string, id: string) {
    const rows = await this.supabase.select<Record<string, unknown>[]>(
      'custom_calculated_fields',
      `select=*&tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null&limit=1`,
    );
    if (!rows[0])
      throw new NotFoundException('Campo calculado não encontrado.');
    return rows[0];
  }

  private async normalizeAndValidate(
    tenantId: string,
    body: Record<string, unknown>,
  ): Promise<Formula> {
    const raw = body.formula_config as Formula;
    if (!raw || typeof raw !== 'object')
      throw new BadRequestException('Fórmula controlada obrigatória.');
    this.validateSafeStrings(raw);
    if (raw.version !== 1 || !kinds.includes(raw.kind))
      throw new BadRequestException('Tipo de cálculo inválido.');
    const cat = await this.catalog(tenantId);
    this.walk(raw.expression, raw.kind, cat);
    return raw;
  }

  private validateSafeStrings(value: unknown): void {
    if (typeof value === 'string') {
      const lowered = value.toLowerCase();
      if (
        blocked.some((b) => lowered === b || lowered.includes(`${b}.`)) ||
        sqlJs.test(value)
      )
        throw new BadRequestException(
          'Fórmula livre, SQL, JavaScript ou campos técnicos não são permitidos.',
        );
      return;
    }
    if (Array.isArray(value))
      value.forEach((item) => this.validateSafeStrings(item));
    else if (value && typeof value === 'object')
      Object.values(value).forEach((item) => this.validateSafeStrings(item));
  }

  private walk(
    expr: Expr,
    kind: CalcKind,
    cat: Map<string, CatalogField>,
  ): void {
    if ('type' in expr && expr.type === 'date_diff_days') {
      if (kind !== 'row_calculated_field')
        throw new BadRequestException(
          'Diferença entre datas deve ser campo calculado por registro.',
        );
      this.validateDateRef(expr.start, cat);
      this.validateDateRef(expr.end, cat);
      return;
    }
    if ('constant' in expr) {
      if (!Number.isFinite(Number(expr.constant)))
        throw new BadRequestException('Constante numérica inválida.');
      return;
    }
    if ('op' in expr) {
      if (!operators.includes(expr.op))
        throw new BadRequestException('Operador não permitido.');
      this.walk(expr.left, kind, cat);
      this.walk(expr.right, kind, cat);
      return;
    }
    const aggregateExpr = expr as unknown as {
      aggregate?: Agg;
      field: FieldRef;
    };
    const ref = aggregateExpr.field;
    if (!safeTables.has(ref.table))
      throw new BadRequestException('Base analítica fora da lista controlada.');
    const field = cat.get(`${ref.table}:${ref.field}`);
    if (!field || blocked.includes(ref.field))
      throw new BadRequestException('Campo fora do catálogo controlado.');
    if ('aggregate' in expr) {
      if (
        kind !== 'aggregate_calculated_measure' ||
        !aggregates.includes(aggregateExpr.aggregate as Agg)
      )
        throw new BadRequestException(
          'Agregação inválida para o tipo de cálculo.',
        );
    } else if (kind !== 'row_calculated_field')
      throw new BadRequestException(
        'Medida agregada exige agregações controladas.',
      );
  }

  private async catalog(tenantId: string) {
    const rows = await this.supabase.select<CatalogField[]>(
      'indicator_field_catalog',
      `select=base_table,field_key,label,data_type,semantic_type,is_measure,is_dimension,is_active&is_active=eq.true&base_table=in.(${[...safeTables].join(',')})&or=(tenant_id.is.null,tenant_id.eq.${tenantId})`,
    );
    return new Map(
      rows
        .filter((f) => !blocked.includes(f.field_key))
        .map((f) => [`${f.base_table}:${f.field_key}`, f]),
    );
  }

  private validateDateRef(ref: FieldRef, cat: Map<string, CatalogField>) {
    if (!safeTables.has(ref.table))
      throw new BadRequestException('Base analítica fora da lista controlada.');
    const field = cat.get(`${ref.table}:${ref.field}`);
    if (!field || blocked.includes(ref.field))
      throw new BadRequestException('Campo fora do catálogo controlado.');
    if (!(
      field.data_type === 'date' ||
      field.data_type === 'datetime' ||
      field.semantic_type === 'date'
    ))
      throw new BadRequestException(
        'Diferença entre datas aceita somente campos de data.',
      );
  }
  private async rows(tenantId: string, table: SafeAnalyticsTable) {
    const filters = [`select=*`, `tenant_id=eq.${tenantId}`];
    if (table !== 'occurrence_analytics_view')
      filters.push('deleted_at=is.null');
    if (table === 'operation_records')
      filters.push(
        'is_current=eq.true',
        'canonical_validity_status=eq.valid',
        await this.supabase.activeOperationalSourceFilter(tenantId),
      );
    return this.supabase.select<Record<string, unknown>[]>(
      table,
      `${filters.join('&')}&limit=10000`,
    );
  }
  private formulaTable(expr: Expr): SafeAnalyticsTable {
    const refs = this.fieldRefs(expr);
    const tables = [...new Set(refs.map((ref) => ref.table))];
    if (!this.safeRelation(tables))
      throw new BadRequestException(
        'Essa combinação de campos ainda não possui relação canônica segura.',
      );
    return tables[0] ?? 'operation_records';
  }
  private fieldRefs(expr: Expr): FieldRef[] {
    if ('type' in expr) return [expr.start, expr.end];
    if ('field' in expr) return [expr.field];
    if ('aggregate' in expr)
      return [(expr as unknown as { aggregate: Agg; field: FieldRef }).field];
    if ('op' in expr)
      return [...this.fieldRefs(expr.left), ...this.fieldRefs(expr.right)];
    return [];
  }
  private safeRelation(tables: SafeAnalyticsTable[]) {
    const names = [...new Set(tables)];
    return (
      names.length <= 1 ||
      (names.length === 2 &&
        names.includes('operation_records') &&
        names.some((name) =>
          [
            'finance_records',
            'transport_records',
            'occurrence_analytics_view',
          ].includes(name),
        ))
    );
  }
  private async formulaRows(tenantId: string, expr: Expr) {
    const tables = [...new Set(this.fieldRefs(expr).map((ref) => ref.table))];
    if (!this.safeRelation(tables))
      throw new BadRequestException(
        'Essa combinação de campos ainda não possui relação canônica segura.',
      );
    if (tables.length <= 1) {
      const table = this.formulaTable(expr);
      return (await this.rows(tenantId, table)).map((row) =>
        this.qualify(table, row),
      );
    }
    const related = tables.find((table) => table !== 'operation_records')!;
    const [operations, relatedRows] = await Promise.all([
      this.rows(tenantId, 'operation_records'),
      this.rows(tenantId, related),
    ]);
    const byId = new Map(operations.map((row) => [String(row.id), row]));
    const relationKey =
      related === 'occurrence_analytics_view'
        ? 'primary_operation_record_id'
        : 'operation_record_id';
    return relatedRows.flatMap((row) => {
      const operation = byId.get(String(row[relationKey] ?? ''));
      return operation
        ? [
            {
              ...this.qualify('operation_records', operation),
              ...this.qualify(related, row),
            },
          ]
        : [];
    });
  }
  private qualify(table: SafeAnalyticsTable, row: Record<string, unknown>) {
    return {
      ...row,
      ...Object.fromEntries(
        Object.entries(row).map(([key, value]) => [`${table}:${key}`, value]),
      ),
    };
  }
  private calculateRow(rows: Record<string, unknown>[], expr: Expr) {
    let used = 0;
    let sum = 0;
    for (const row of rows) {
      const v = this.evalRow(expr, row);
      if (Number.isFinite(v)) {
        used += 1;
        sum += v;
      }
    }
    return {
      value: used ? sum / used : null,
      used,
      ignored: rows.length - used,
    };
  }
  private calculateAggregate(rows: Record<string, unknown>[], expr: Expr) {
    const validRows = rows.filter((row) =>
      this.rowHasDataForExpression(row, expr),
    );
    const value = validRows.length
      ? this.evalAggregate(expr, validRows)
      : Number.NaN;
    return {
      value: validRows.length && Number.isFinite(value) ? value : null,
      used: validRows.length && Number.isFinite(value) ? validRows.length : 0,
      ignored:
        rows.length -
        (validRows.length && Number.isFinite(value) ? validRows.length : 0),
    };
  }
  private evalRow(expr: Expr, row: Record<string, unknown>): number {
    if ('type' in expr && expr.type === 'date_diff_days')
      return this.diffDays(
        row[`${expr.start.table}:${expr.start.field}`],
        row[`${expr.end.table}:${expr.end.field}`],
      );
    if ('constant' in expr) return Number(expr.constant);
    if ('field' in expr)
      return Number(row[`${expr.field.table}:${expr.field.field}`]);
    if ('aggregate' in expr) return Number.NaN;
    if ('op' in expr)
      return this.apply(
        expr.op,
        this.evalRow(expr.left, row),
        this.evalRow(expr.right, row),
      );
    return Number.NaN;
  }
  private evalAggregate(expr: Expr, rows: Record<string, unknown>[]): number {
    if ('constant' in expr) return Number(expr.constant);
    if ('aggregate' in expr) {
      const aggregateExpr = expr as unknown as {
        aggregate: Agg;
        field: FieldRef;
      };
      return this.aggregate(
        rows,
        aggregateExpr.aggregate,
        `${aggregateExpr.field.table}:${aggregateExpr.field.field}`,
      );
    }
    if ('field' in expr) return Number.NaN;
    if ('op' in expr)
      return this.apply(
        expr.op,
        this.evalAggregate(expr.left, rows),
        this.evalAggregate(expr.right, rows),
      );
    return Number.NaN;
  }
  private aggregate(rows: Record<string, unknown>[], agg: Agg, field: string) {
    const present = rows.filter(
      (r) => r[field] !== null && r[field] !== undefined && r[field] !== '',
    );
    if (agg === 'count') return present.length;
    const nums = present.map((r) => Number(r[field])).filter(Number.isFinite);
    if (!nums.length) return Number.NaN;
    if (agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (agg === 'max') return Math.max(...nums);
    if (agg === 'min') return Math.min(...nums);
    return nums.reduce((a, b) => a + b, 0);
  }
  private apply(op: Op, left: number, right: number) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
    if (op === 'divide' && right === 0) return Number.NaN;
    if (op === 'add') return left + right;
    if (op === 'subtract') return left - right;
    if (op === 'multiply') return left * right;
    return left / right;
  }
  private rowHasDataForExpression(
    row: Record<string, unknown>,
    expr: Expr,
  ): boolean {
    if ('type' in expr && expr.type === 'date_diff_days')
      return Number.isFinite(
        this.diffDays(
          row[`${expr.start.table}:${expr.start.field}`],
          row[`${expr.end.table}:${expr.end.field}`],
        ),
      );
    const fields = this.fieldRefs(expr).map(
      (ref) => `${ref.table}:${ref.field}`,
    );
    return fields.every(
      (field) =>
        row[field] !== null &&
        row[field] !== undefined &&
        row[field] !== '' &&
        Number.isFinite(Number(row[field])),
    );
  }
  private previewText(expr: Expr): string {
    if ('type' in expr && expr.type === 'date_diff_days')
      return `${expr.end.field} - ${expr.start.field}, em dias`;
    if ('constant' in expr) return String(expr.constant);
    if ('field' in expr) return expr.field.field;
    if ('aggregate' in expr) {
      const aggregateExpr = expr as unknown as {
        aggregate: Agg;
        field: FieldRef;
      };
      return `${aggregateExpr.aggregate}(${aggregateExpr.field.field})`;
    }
    if ('op' in expr) {
      const sign = { add: '+', subtract: '-', multiply: '*', divide: '/' }[
        expr.op
      ];
      return `(${this.previewText(expr.left)} ${sign} ${this.previewText(expr.right)})`;
    }
    return '';
  }
  private fieldKeys(expr: Expr): string[] {
    if ('type' in expr && expr.type === 'date_diff_days')
      return [expr.start.field, expr.end.field];
    if ('constant' in expr) return [];
    if ('field' in expr) return [expr.field.field];
    if ('aggregate' in expr) {
      const aggregateExpr = expr as unknown as {
        aggregate: Agg;
        field: FieldRef;
      };
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
  private diffDays(start: unknown, end: unknown) {
    const s = new Date(String(start ?? '')).getTime();
    const e = new Date(String(end ?? '')).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return Number.NaN;
    return Math.round((e - s) / 86400000);
  }
  private fieldKey(value: unknown, name: string) {
    return String(
      value ||
        name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
    ).slice(0, 60);
  }
}
