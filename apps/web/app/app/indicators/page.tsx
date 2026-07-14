'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
} from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission } from '../../../lib/rbac';
import { createBrowserSupabaseClient } from '../../../lib/supabase';
import {
  createCustomIndicator,
  listCustomIndicators,
  listIndicatorFields,
  listIndicators,
  previewCustomIndicator,
  previewIndicator,
  previewSavedCustomIndicator,
  setCustomIndicatorStatus,
  type CustomIndicator,
  type CustomPreview,
  type Indicator,
  type IndicatorField,
  type IndicatorPreview,
} from '../../../lib/indicators-api';

const moduleLabels: Record<string, string> = {
  core: 'Núcleo',
  transport: 'Transporte',
  finance: 'Financeiro',
  warehouse: 'Armazém',
  team: 'Equipes',
};
const modules = [
  { value: 'core', label: 'Núcleo' },
  { value: 'transport', label: 'Transporte' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'warehouse', label: 'Armazém' },
  { value: 'team', label: 'Equipes' },
];
const indicatorTypes = [
  'KPI numérico',
  'Valor monetário',
  'Percentual',
  'Tempo/duração',
];
const formatOptions = [
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Percentual' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'kg', label: 'Peso' },
  { value: 'quantity', label: 'Quantidade' },
  { value: 'duration', label: 'Tempo' },
];
const operationOptions = [
  { value: 'count', label: 'Contagem' },
  { value: 'count_distinct', label: 'Contagem distinta' },
  { value: 'sum', label: 'Soma' },
  { value: 'avg', label: 'Média' },
  { value: 'min', label: 'Mínimo' },
  { value: 'max', label: 'Máximo' },
  { value: 'ratio', label: 'Razão' },
  { value: 'percentage', label: 'Percentual' },
  { value: 'group_by', label: 'Agrupamento' },
  { value: 'time_series', label: 'Série temporal' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'duration_avg', label: 'Tempo médio' },
];
const metricOperationOptions = operationOptions.filter((o) =>
  ['count', 'sum', 'avg', 'min', 'max'].includes(o.value),
);
const operationPreviewLabels: Record<string, string> = {
  count: 'CONTAGEM',
  count_distinct: 'CONTAGEM_DISTINTA',
  sum: 'SOMA',
  avg: 'MÉDIA',
  min: 'MÍNIMO',
  max: 'MÁXIMO',
};
const friendlyFields = [
  { key: 'freight_value', label: 'Valor do frete' },
  { key: 'gross_weight', label: 'Peso total' },
  {
    key: 'delivery_number',
    label: 'Quantidade de entregas',
    aliases: ['Entregas'],
  },
  { key: 'occurrence_status', label: 'Ocorrências' },
  { key: 'customer_name', label: 'Cliente' },
  { key: 'driver_name', label: 'Motorista' },
  { key: 'destination_state', label: 'UF destino' },
  { key: 'issued_at', label: 'Data de emissão' },
  { key: 'expected_date', label: 'Data prevista' },
  { key: 'completed_at', label: 'Data de entrega' },
  { key: 'status', label: 'Status' },
];
const technicalBlocked = [
  'tenant_id',
  'id',
  'raw_payload',
  'staging',
  'source_staging_record_id',
  'source_payload_hash',
  'created_at',
  'updated_at',
  'deleted_at',
];
type FormState = {
  name: string;
  description: string;
  module_key: string;
  family_key: string;
  indicator_type: string;
  value_format: string;
  operation: string;
  primary_field: string;
  numerator_field: string;
  denominator_field: string;
  numerator_operation: string;
  denominator_operation: string;
  grouping_field: string;
  allow_dashboard_period_filter: boolean;
  default_date_field: string;
};
const initialForm: FormState = {
  name: '',
  description: '',
  module_key: 'transport',
  family_key: 'Operacional',
  indicator_type: 'KPI numérico',
  value_format: 'number',
  operation: 'ratio',
  primary_field: 'freight_value',
  numerator_field: 'freight_value',
  denominator_field: 'gross_weight',
  numerator_operation: 'sum',
  denominator_operation: 'sum',
  grouping_field: 'customer_name',
  allow_dashboard_period_filter: true,
  default_date_field: 'issued_at',
};

export default function IndicatorsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [tab, setTab] = useState<'native' | 'custom'>('native');
  const [native, setNative] = useState<Indicator[]>([]);
  const [custom, setCustom] = useState<CustomIndicator[]>([]);
  const [fields, setFields] = useState<IndicatorField[]>([]);
  const [message, setMessage] = useState('Carregando indicadores...');
  const [nativePreview, setNativePreview] = useState<IndicatorPreview | null>(
    null,
  );
  const [customPreview, setCustomPreview] = useState<CustomPreview | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setAllowed(false);
        setMessage('Usuário não autenticado.');
        return;
      }
      const { data: profile } = await supabase
        .from('users_profile')
        .select('active_tenant_id')
        .eq('id', data.user.id)
        .maybeSingle();
      const active =
        (profile as { active_tenant_id: string | null } | null)
          ?.active_tenant_id ?? null;
      setTenantId(active);
      const perms = await getCurrentUserPermissions(active);
      const view = hasPermission(perms, 'indicators.view');
      setCanManage(hasPermission(perms, 'indicators.manage'));
      setAllowed(view);
      if (!active || !view) {
        setMessage(
          'Você precisa da permissão indicators.view para acessar indicadores.',
        );
        return;
      }
      await reload(active);
    });
  }, []);
  async function reload(active = tenantId) {
    if (!active) return;
    try {
      const [n, c, f] = await Promise.all([
        listIndicators(active),
        listCustomIndicators(active),
        listIndicatorFields(active),
      ]);
      setNative(n.data);
      setCustom(c.data);
      setFields(f.data);
      setMessage('');
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Não foi possível carregar indicadores.',
      );
    }
  }
  const catalog = useMemo(
    () =>
      friendlyFields
        .map((item) => {
          const found = fields.find(
            (f) =>
              f.base_table === 'operation_records' && f.field_key === item.key,
          );
          return found && !technicalBlocked.includes(found.field_key)
            ? { ...found, label: item.label, aliases: item.aliases ?? [] }
            : null;
        })
        .filter(Boolean) as Array<IndicatorField & { aliases: string[] }>,
    [fields],
  );
  const formulaPreview = buildFormulaPreview(form, catalog);
  const validation = validateBuilder(form, catalog);
  const payload = (status: 'draft' | 'active') => ({
    name: form.name,
    description: form.description,
    module_key: form.module_key,
    family_key: form.family_key,
    indicator_type: form.indicator_type,
    value_format: form.value_format,
    status,
    available_for_dashboard: status === 'active',
    available_for_reports: status === 'active',
    calculation_config: buildCalculationConfig(form),
    formula_preview: formulaPreview,
  });
  async function testConfiguration() {
    if (!tenantId || !validation.ok) return;
    try {
      setCustomPreview(
        await previewCustomIndicator(tenantId, payload('draft')),
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Não foi possível testar a configuração.',
      );
    }
  }
  async function save(status: 'draft' | 'active') {
    if (!tenantId) return;
    if (status === 'active' && !validation.ok) {
      setMessage(validation.message);
      return;
    }
    try {
      await createCustomIndicator(tenantId, payload(status));
      await reload();
      setModalOpen(false);
      setTab('custom');
      setForm(initialForm);
      setCustomPreview(null);
      setMessage(
        status === 'draft'
          ? 'Rascunho salvo.'
          : 'Indicador salvo e disponibilizado.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }
  if (allowed === false)
    return (
      <Shell>
        <EmptyState
          title="Acesso bloqueado"
          description="Você precisa da permissão indicators.view para acessar indicadores."
        />
      </Shell>
    );
  return (
    <Shell>
      {message ? (
        <Card>
          <p className="text-sm text-slate-600">{message}</p>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Tab active={tab === 'native'} onClick={() => setTab('native')}>
          Indicadores nativos
        </Tab>
        <Tab active={tab === 'custom'} onClick={() => setTab('custom')}>
          Indicadores personalizados
        </Tab>
      </div>
      {tab === 'native' ? (
        <NativeSection
          items={native}
          tenantId={tenantId}
          preview={nativePreview}
          setPreview={setNativePreview}
        />
      ) : null}
      {tab === 'custom' ? (
        <CustomSection
          items={custom}
          tenantId={tenantId}
          canManage={canManage}
          openCreator={() => setModalOpen(true)}
          reload={() => reload()}
          setMessage={setMessage}
        />
      ) : null}
      {modalOpen ? (
        <CreatorModal
          form={form}
          setForm={setForm}
          fields={catalog}
          validation={validation}
          preview={customPreview}
          onClose={() => setModalOpen(false)}
          onTest={testConfiguration}
          onSave={save}
        />
      ) : null}
    </Shell>
  );
}
function validateBuilder(
  form: FormState,
  fields: Array<IndicatorField & { aliases: string[] }>,
) {
  const hasField = (key: string) => fields.some((f) => f.field_key === key);
  if (!operationOptions.some((o) => o.value === form.operation))
    return { ok: false, message: 'Escolha uma operação disponível.' };
  if (form.operation === 'ratio' || form.operation === 'percentage') {
    if (!hasField(form.numerator_field) || !hasField(form.denominator_field))
      return {
        ok: false,
        message: 'Configure numerador e denominador pelo catálogo.',
      };
    return {
      ok: true,
      message: 'Configuração válida para testar e disponibilizar.',
    };
  }
  if (!hasField(form.primary_field))
    return { ok: false, message: 'Escolha um campo principal do catálogo.' };
  return {
    ok: true,
    message: 'Configuração válida para testar e disponibilizar.',
  };
}
function buildCalculationConfig(form: FormState) {
  const base = {
    base_table: 'operation_records',
    operation: form.operation,
    operation_key: form.operation,
    allow_dashboard_period_filter: form.allow_dashboard_period_filter,
    default_date_field: form.default_date_field,
  };
  if (form.operation === 'ratio' || form.operation === 'percentage')
    return {
      ...base,
      numerator: {
        operation: form.numerator_operation,
        source_table: 'operation_records',
        field: form.numerator_field,
      },
      denominator: {
        operation: form.denominator_operation,
        source_table: 'operation_records',
        field: form.denominator_field,
      },
    };
  return {
    ...base,
    primary_field: form.primary_field,
    grouping: { dimension_field: form.grouping_field },
  };
}
function buildFormulaPreview(form: FormState, fields: IndicatorField[]) {
  const label = (key: string) =>
    fields.find((f) => f.field_key === key)?.label ?? key;
  const metric = (op: string, field: string) =>
    `${operationPreviewLabels[op] ?? op}(${label(field)})`;
  if (form.operation === 'ratio' || form.operation === 'percentage') {
    const text = `${metric(form.numerator_operation, form.numerator_field)} / ${metric(form.denominator_operation, form.denominator_field)}`;
    return form.operation === 'percentage' ? `${text} * 100` : text;
  }
  return metric(form.operation, form.primary_field);
}
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeader
        eyebrow="Indicadores"
        title="Indicadores"
        description="Indicador é regra de negócio; widget é apresentação; dashboard é composição visual."
      />
      {children}
    </div>
  );
}
function Tab({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
    >
      {children}
    </button>
  );
}
function NativeSection({
  items,
  tenantId,
  preview,
  setPreview,
}: {
  items: Indicator[];
  tenantId: string | null;
  preview: IndicatorPreview | null;
  setPreview: (p: IndicatorPreview) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-[62rem] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-slate-500">
            <th className="p-3">Nome</th>
            <th>Módulo</th>
            <th>Família</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.indicator_key} className="border-t">
              <td className="p-3 font-semibold">{i.name}</td>
              <td>{moduleLabels[i.module_key] ?? i.module_key}</td>
              <td>{i.family_key}</td>
              <td>
                <StatusBadge
                  tone={
                    i.availability.status === 'available'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {i.availability.status}
                </StatusBadge>
              </td>
              <td>
                <button
                  className="rounded bg-slate-100 px-2 py-1"
                  onClick={async () =>
                    tenantId &&
                    setPreview(
                      await previewIndicator(tenantId, i.indicator_key),
                    )
                  }
                >
                  Calcular prévia
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PreviewBox preview={preview as unknown as CustomPreview} />
    </Card>
  );
}
function CustomSection({
  items,
  tenantId,
  canManage,
  openCreator,
  reload,
  setMessage,
}: {
  items: CustomIndicator[];
  tenantId: string | null;
  canManage: boolean;
  openCreator: () => void;
  reload: () => void;
  setMessage: (m: string) => void;
}) {
  const [preview, setPreview] = useState<CustomPreview | null>(null);
  async function status(id: string, s: 'active' | 'inactive') {
    if (!tenantId) return;
    try {
      await setCustomIndicatorStatus(tenantId, id, s);
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao alterar status.');
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          disabled={!canManage}
          onClick={openCreator}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Criar novo indicador
        </button>
      </div>
      <Card className="overflow-x-auto">
        <table className="min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="p-3">Nome</th>
              <th>Módulo</th>
              <th>Família</th>
              <th>Tipo</th>
              <th>Formato</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3 font-semibold">{i.name}</td>
                <td>{moduleLabels[i.module_key] ?? i.module_key}</td>
                <td>{i.family_key}</td>
                <td>{i.indicator_type}</td>
                <td>{formatLabel(i.value_format)}</td>
                <td>{statusLabel(i.status)}</td>
                <td>{date(i.created_at)}</td>
                <td className="space-x-2">
                  <button
                    className="rounded bg-slate-100 px-2 py-1"
                    onClick={() =>
                      setMessage(`${i.name}: ${i.formula_preview}`)
                    }
                  >
                    Ver fórmula
                  </button>
                  <button
                    className="rounded bg-blue-50 px-2 py-1 text-blue-700"
                    onClick={async () =>
                      tenantId &&
                      setPreview(
                        await previewSavedCustomIndicator(tenantId, i.id),
                      )
                    }
                  >
                    Prévia
                  </button>
                  {i.status !== 'active' ? (
                    <button
                      disabled={!canManage}
                      className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 disabled:opacity-50"
                      onClick={() => status(i.id, 'active')}
                    >
                      Ativar
                    </button>
                  ) : (
                    <button
                      disabled={!canManage}
                      className="rounded bg-amber-50 px-2 py-1 text-amber-700 disabled:opacity-50"
                      onClick={() => status(i.id, 'inactive')}
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? (
          <EmptyState
            title="Nenhum indicador personalizado"
            description="Use o botão Criar novo indicador para montar um cálculo por seletores controlados."
          />
        ) : null}
        <PreviewBox preview={preview} />
      </Card>
    </div>
  );
}
function CreatorModal({
  form,
  setForm,
  fields,
  validation,
  preview,
  onClose,
  onTest,
  onSave,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  fields: Array<IndicatorField & { aliases: string[] }>;
  validation: { ok: boolean; message: string };
  preview: CustomPreview | null;
  onClose: () => void;
  onTest: () => void;
  onSave: (s: 'draft' | 'active') => void;
}) {
  const formulaPreview = buildFormulaPreview(form, fields);
  const numericFields = fields.filter(
    (f) => f.is_measure || f.data_type === 'number',
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5 sm:p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">
              Criar novo indicador
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Monte um campo calculado controlado, com campos tratados e funções
              permitidas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 font-bold"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="grid content-start gap-3">
              <Input
                label="Nome do indicador"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <Input
                label="Descrição"
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
              />
              <Select
                label="Módulo"
                value={form.module_key}
                onChange={(v) => setForm({ ...form, module_key: v })}
                options={modules}
              />
              <Input
                label="Família"
                value={form.family_key}
                onChange={(v) => setForm({ ...form, family_key: v })}
              />
              <Select
                label="Tipo"
                value={form.indicator_type}
                onChange={(v) => setForm({ ...form, indicator_type: v })}
                options={indicatorTypes.map((v) => ({ value: v, label: v }))}
              />
              <Select
                label="Formato de exibição"
                value={form.value_format}
                onChange={(v) => setForm({ ...form, value_format: v })}
                options={formatOptions}
              />
              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-700">
                  Filtros permitidos
                </p>
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.allow_dashboard_period_filter}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        allow_dashboard_period_filter: e.target.checked,
                      })
                    }
                  />{' '}
                  Permitir filtro de período no dashboard
                </label>
                <div className="mt-3">
                  <Select
                    label="Campo de data padrão"
                    value={form.default_date_field}
                    onChange={(v) =>
                      setForm({ ...form, default_date_field: v })
                    }
                    options={fields
                      .filter(
                        (f) =>
                          f.data_type === 'date' || f.data_type === 'datetime',
                      )
                      .map((f) => ({ value: f.field_key, label: f.label }))}
                  />
                </div>
              </div>
            </section>
            <section className="grid content-start gap-4">
              <div className="rounded-2xl border border-slate-200 p-3">
                <h3 className="font-bold text-slate-900">Builder controlado</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Selecione operação e campos do catálogo. Não existe campo
                  editável de fórmula.
                </p>
              </div>
              <Select
                label="Operação principal"
                value={form.operation}
                onChange={(v) => setForm({ ...form, operation: v })}
                options={operationOptions}
              />
              {form.operation === 'ratio' || form.operation === 'percentage' ? (
                <div className="grid gap-3 rounded-2xl border border-slate-200 p-3">
                  <p className="text-sm font-bold text-slate-700">Numerador</p>
                  <Select
                    label="Agregação do numerador"
                    value={form.numerator_operation}
                    onChange={(v) =>
                      setForm({ ...form, numerator_operation: v })
                    }
                    options={metricOperationOptions}
                  />
                  <Select
                    label="Campo do numerador"
                    value={form.numerator_field}
                    onChange={(v) => setForm({ ...form, numerator_field: v })}
                    options={numericFields.map((f) => ({
                      value: f.field_key,
                      label: f.label,
                    }))}
                  />
                  <p className="text-sm font-bold text-slate-700">
                    Denominador
                  </p>
                  <Select
                    label="Agregação do denominador"
                    value={form.denominator_operation}
                    onChange={(v) =>
                      setForm({ ...form, denominator_operation: v })
                    }
                    options={metricOperationOptions}
                  />
                  <Select
                    label="Campo do denominador"
                    value={form.denominator_field}
                    onChange={(v) => setForm({ ...form, denominator_field: v })}
                    options={numericFields.map((f) => ({
                      value: f.field_key,
                      label: f.label,
                    }))}
                  />
                </div>
              ) : (
                <Select
                  label="Campo principal"
                  value={form.primary_field}
                  onChange={(v) => setForm({ ...form, primary_field: v })}
                  options={fields.map((f) => ({
                    value: f.field_key,
                    label: f.label,
                  }))}
                />
              )}
              {['group_by', 'ranking'].includes(form.operation) ? (
                <Select
                  label="Agrupamento"
                  value={form.grouping_field}
                  onChange={(v) => setForm({ ...form, grouping_field: v })}
                  options={fields
                    .filter((f) => f.is_dimension)
                    .map((f) => ({ value: f.field_key, label: f.label }))}
                />
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Fórmula somente leitura gerada pelo sistema
                </p>
                <div className="mt-1 rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-800">
                  = {formulaPreview}
                </div>
                <p
                  className={`mt-2 rounded-xl p-3 text-sm ${validation.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
                >
                  {validation.message}
                </p>
              </div>
              <PreviewBox preview={preview} />
            </section>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={!validation.ok}
            className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            onClick={onTest}
          >
            Testar configuração
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-100 px-4 py-2 font-bold"
            onClick={() => onSave('draft')}
          >
            Salvar como rascunho
          </button>
          <button
            type="button"
            disabled={!validation.ok}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            onClick={() => onSave('active')}
          >
            Salvar e disponibilizar
          </button>
        </div>
      </div>
    </div>
  );
}
function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  empty?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function PreviewBox({ preview }: { preview: CustomPreview | null }) {
  if (!preview) return null;
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
      <p>
        <b>Valor calculado:</b> {format(preview.value)}
      </p>
      <p>
        <b>Registros considerados:</b> {preview.records_considered}
      </p>
      <p>
        <b>Fórmula interpretada:</b> {preview.formula_preview}
      </p>
      <p className="text-slate-600">
        {preview.message || 'Configuração válida.'}
      </p>
    </div>
  );
}
function format(v: unknown) {
  if (v === null || v === undefined) return 'Sem dados suficientes';
  return typeof v === 'number'
    ? Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v)
    : String(v);
}
function formatLabel(v: string) {
  return formatOptions.find((f) => f.value === v)?.label ?? v;
}
function statusLabel(v: string) {
  return v === 'draft' ? 'Rascunho' : v === 'active' ? 'Ativo' : 'Inativo';
}
function date(v: string) {
  return new Date(v).toLocaleString('pt-BR');
}
