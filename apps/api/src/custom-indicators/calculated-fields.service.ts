import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type CalcKind = 'row_calculated_field' | 'aggregate_calculated_measure';
type Op = 'add' | 'subtract' | 'multiply' | 'divide';
type Agg = 'sum' | 'avg' | 'count' | 'max' | 'min';
type FieldRef = { table: 'operation_records'; field: string };
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
    const rows = await this.rows(tenantId);
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
    if (ref.table !== 'operation_records')
      throw new BadRequestException(
        'Campos calculados devem usar somente a base nativa/canônica operation_records.',
      );
    const field = cat.get(ref.field);
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
      `select=base_table,field_key,label,data_type,semantic_type,is_measure,is_dimension,is_active&is_active=eq.true&base_table=eq.operation_records&or=(tenant_id.is.null,tenant_id.eq.${tenantId})`,
    );
    return new Map(
      rows
        .filter((f) => !blocked.includes(f.field_key))
        .map((f) => [f.field_key, f]),
    );
  }

  private validateDateRef(ref: FieldRef, cat: Map<string, CatalogField>) {
    if (ref.table !== 'operation_records')
      throw new BadRequestException(
        'Campos calculados devem usar somente operation_records.',
      );
    const field = cat.get(ref.field);
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
  private async rows(tenantId: string) {
    return this.supabase.select<Record<string, unknown>[]>(
      'operation_records',
      `select=*&tenant_id=eq.${tenantId}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&limit=10000`,
    );
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
      return this.diffDays(row[expr.start.field], row[expr.end.field]);
    if ('constant' in expr) return Number(expr.constant);
    if ('field' in expr) return Number(row[expr.field.field]);
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
        aggregateExpr.field.field,
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
        this.diffDays(row[expr.start.field], row[expr.end.field]),
      );
    const fields = this.fieldKeys(expr);
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
