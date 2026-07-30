import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DATE_FORMATS, parseFieldValue, ParseRule } from './field-value-parser';
import { clearInvalidRecordStates } from './invalid-record-states';
type Rule = ParseRule & {
  id: string;
  data_contract_field_id: string;
  source_field_name: string;
  field_key?: string;
  status: string;
};
@Injectable()
export class FieldParseRulesService {
  constructor(private readonly db: SupabaseService) {}
  async list(t: string, s: string) {
    const rows = await this.db.select<Rule[]>(
      'data_source_field_parse_rules',
      `select=id,data_contract_field_id,source_field_name,data_type,date_format,timezone,decimal_separator,thousand_separator,boolean_true_values,boolean_false_values,status,data_contract_field:data_contract_fields!field_parse_rule_contract_field_tenant_fk(field_key)&tenant_id=eq.${t}&data_source_id=eq.${s}&status=eq.active&order=created_at.asc`,
    );
    return rows.map((r) => ({
      ...r,
      field_key: (
        r as unknown as { data_contract_field?: { field_key: string } }
      ).data_contract_field?.field_key,
    }));
  }
  async save(
    t: string,
    s: string,
    user: string,
    body: { rules?: Array<Partial<Rule>> },
  ) {
    const contracts = await this.db.select<Array<{ id: string }>>(
      'data_contracts',
      `select=id&tenant_id=eq.${t}&data_source_id=eq.${s}&status=eq.active&order=contract_version.desc&limit=1`,
    );
    if (!contracts[0])
      throw new BadRequestException('Contrato ativo não encontrado.');
    const fields = await this.db.select<
      Array<{
        id: string;
        data_type: string;
        field_key: string;
        source_field_name: string;
        allow_null: boolean;
      }>
    >(
      'data_contract_fields',
      `select=id,data_type,field_key,source_field_name,allow_null&tenant_id=eq.${t}&data_contract_id=eq.${contracts[0].id}`,
    );
    const configs = await this.db.select<
      Array<{ sample_preview?: Record<string, unknown>[] }>
    >(
      'data_source_api_configs',
      `select=sample_preview&tenant_id=eq.${t}&data_source_id=eq.${s}&limit=1`,
    );
    const map = new Map(fields.map((f) => [f.id, f]));
    for (const rule of body.rules ?? []) {
      const field = map.get(rule.data_contract_field_id ?? '');
      if (
        !field ||
        !rule.source_field_name ||
        rule.data_type !== field.data_type
      )
        throw new BadRequestException(
          'Regra de formato fora do contrato da fonte.',
        );
      if (
        rule.date_format &&
        !DATE_FORMATS.includes(
          rule.date_format as (typeof DATE_FORMATS)[number],
        )
      )
        throw this.formatError(
          rule,
          field,
          null,
          'Formato de data/hora não suportado.',
        );
      if (rule.timezone) {
        try {
          new Intl.DateTimeFormat('pt-BR', { timeZone: rule.timezone });
        } catch {
          throw new BadRequestException('Timezone inválido.');
        }
      }
      if (
        rule.decimal_separator &&
        !['.', ','].includes(rule.decimal_separator)
      )
        throw new BadRequestException('Separador decimal inválido.');
      if (
        rule.thousand_separator &&
        !['.', ','].includes(rule.thousand_separator)
      )
        throw new BadRequestException('Separador de milhar inválido.');
      if (
        rule.decimal_separator &&
        rule.decimal_separator === rule.thousand_separator
      )
        throw new BadRequestException(
          'Separadores decimal e de milhar devem ser diferentes.',
        );
      const trueValues = rule.boolean_true_values ?? [];
      const falseValues = rule.boolean_false_values ?? [];
      if (trueValues.some((value) => falseValues.includes(value)))
        throw new BadRequestException(
          'Um valor booleano não pode representar verdadeiro e falso ao mesmo tempo.',
        );
      const sample = (configs[0]?.sample_preview ?? [])
        .map((row) => row[rule.source_field_name!])
        .find((value) => value !== null && value !== undefined && value !== '');
      if (
        sample !== undefined &&
        ['date', 'datetime', 'decimal', 'number', 'integer'].includes(
          field.data_type,
        ) &&
        !parseFieldValue(sample, {
          ...rule,
          data_type: field.data_type,
        } as ParseRule).ok
      )
        throw this.formatError(
          rule,
          field,
          sample,
          `O valor da amostra não é conversível para ${field.data_type} com o formato selecionado.`,
        );
      await this.db.upsert(
        'data_source_field_parse_rules',
        {
          tenant_id: t,
          data_source_id: s,
          data_contract_id: contracts[0].id,
          data_contract_field_id: rule.data_contract_field_id,
          source_field_name: rule.source_field_name,
          data_type: field.data_type,
          date_format: rule.date_format || null,
          timezone: rule.timezone || null,
          decimal_separator: rule.decimal_separator || null,
          thousand_separator: rule.thousand_separator || null,
          boolean_true_values: rule.boolean_true_values ?? null,
          boolean_false_values: rule.boolean_false_values ?? null,
          status: 'active',
          created_by: user,
        },
        'tenant_id,data_source_id,data_contract_field_id,source_field_name',
      );
    }
    await clearInvalidRecordStates(this.db, t, s);
    return this.list(t, s);
  }
  convert(value: unknown, rule: Rule) {
    return parseFieldValue(value, rule);
  }
  private formatError(
    rule: Partial<Rule>,
    field: { field_key: string; source_field_name: string },
    sample: unknown,
    reason: string,
  ) {
    return new BadRequestException({
      message: reason,
      field_key: field.field_key,
      source_field_name: rule.source_field_name ?? field.source_field_name,
      received_format: rule.date_format ?? null,
      allowed_formats: DATE_FORMATS,
      sample_value: sample ?? null,
      motivo: reason,
    });
  }
}
