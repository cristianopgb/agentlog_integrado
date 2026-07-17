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
  createCalculatedField,
  createCustomIndicator,
  listCalculatedFields,
  listCustomIndicators,
  listIndicatorFields,
  listIndicators,
  previewCalculatedField,
  previewCustomIndicator,
  previewIndicator,
  previewSavedCustomIndicator,
  setCustomIndicatorStatus,
  type CalculatedField,
  type CustomIndicator,
  type CustomPreview,
  type Indicator,
  type IndicatorField,
  type IndicatorPreview,
  type IndicatorPreviewFilters,
} from '../../../lib/indicators-api';
const moduleLabels: Record<string, string> = {
  core: 'Qualidade da base',
  attendance: 'Atendimento',
  transport: 'Transporte',
  finance: 'Financeiro',
  warehouse: 'Armazém',
  team: 'Equipes',
};
const familyLabels: Record<string, string> = {
  qualidade: 'Qualidade da base',
  qualidade_base: 'Qualidade da base',
  volume: 'Volume da base',
  auditoria: 'Auditoria técnica',
  sla: 'SLA e vencimentos',
  operacional: 'Operacional',
  peso_volume: 'Peso e volumetria',
  peso_volumetria: 'Peso e volumetria',
  valor: 'Valores',
  frete: 'Frete',
  entregas: 'Entregas',
  ocorrencias: 'Ocorrências',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  equipe: 'Equipe',
};
const hiddenNativeIndicatorKeys = new Set([
  'total_freight_informed',
  'freight_per_kg',
  'total_weight_informed',
  'total_cubed_weight',
  'total_volumes_informed',
  'weight_by_destination_state',
  'total_value_informed',
  'value_per_kg',
  'latest_treated_records',
]);
const nativeIndicatorNameOverrides: Record<string, string> = {
  attendance_overdue_tickets: 'Tickets vencidos',
};
const modules = [
  { value: 'core', label: 'Qualidade da base' },
  { value: 'transport', label: 'Transporte' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'attendance', label: 'Atendimento' },
  { value: 'warehouse', label: 'Armazém' },
  { value: 'team', label: 'Equipes' },
];
const formatOptions = [
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Percentual' },
  { value: 'weight', label: 'Peso' },
  { value: 'quantity', label: 'Quantidade' },
  { value: 'days', label: 'Dias' },
  { value: 'currency_per_kg', label: 'R$/kg' },
  { value: 'currency_per_ton', label: 'R$/ton' },
];
const builderOperations = [
  { value: 'SOMA', label: 'Soma' },
  { value: 'MÉDIA', label: 'Média' },
  { value: 'CONTAGEM', label: 'Contagem' },
  { value: 'CONTAGEM_DISTINTA', label: 'Contagem distinta' },
  { value: 'MÍNIMO', label: 'Mínimo' },
  { value: 'MÁXIMO', label: 'Máximo' },
  { value: 'VALOR_CALCULADO', label: 'Valor calculado' },
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
type ValueItem = {
  field: string;
  aggregation: string;
  format: string;
  label: string;
};
type FormState = {
  name: string;
  description: string;
  rationale: string;
  rationaleEdited: boolean;
  module_key: string;
  family_key: string;
  indicator_type: string;
  row: string;
  column: string;
  value: ValueItem;
};
type CalcForm = {
  name: string;
  description: string;
  module_key: string;
  calculation_kind: 'row_calculated_field' | 'aggregate_calculated_measure';
  template: 'math' | 'date_diff_days';
  left_field: string;
  right_field: string;
  operator: 'add' | 'subtract' | 'multiply' | 'divide';
  constant: string;
  value_format: string;
  decimal_places: string;
};
const initialCalcForm: CalcForm = {
  name: '',
  description: '',
  module_key: 'transport',
  calculation_kind: 'row_calculated_field',
  template: 'math',
  left_field: 'gross_weight',
  right_field: '',
  operator: 'divide',
  constant: '1000',
  value_format: 'number',
  decimal_places: '2',
};
const initialForm: FormState = {
  name: '',
  description: '',
  rationale: '',
  rationaleEdited: false,
  module_key: 'transport',
  family_key: 'Operacional',
  indicator_type: 'KPI numérico',
  row: '',
  column: '',
  value: { field: '', aggregation: 'SOMA', format: 'currency', label: '' },
};
export default function IndicatorsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [tab, setTab] = useState<'native' | 'custom'>('native');
  const [native, setNative] = useState<Indicator[]>([]);
  const [custom, setCustom] = useState<CustomIndicator[]>([]);
  const [, setCalculated] = useState<CalculatedField[]>([]);
  const [fields, setFields] = useState<IndicatorField[]>([]);
  const [message, setMessage] = useState('Carregando indicadores...');
  const [nativePreview, setNativePreview] = useState<IndicatorPreview | null>(
    null,
  );
  const [customPreview, setCustomPreview] = useState<CustomPreview | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [calcForm, setCalcForm] = useState<CalcForm>(initialCalcForm);
  const [calcPreview, setCalcPreview] = useState<CustomPreview | null>(null);
  const [calcTarget, setCalcTarget] = useState<'value' | 'standalone'>(
    'standalone',
  );
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
      const [n, c, f, cf] = await Promise.all([
        listIndicators(active),
        listCustomIndicators(active),
        listIndicatorFields(active),
        listCalculatedFields(active),
      ]);
      setNative(n.data);
      setCustom(c.data);
      setCalculated(cf.data);
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
      fields.filter(
        (f) =>
          f.base_table === 'operation_records' &&
          !technicalBlocked.includes(f.field_key),
      ),
    [fields],
  );
  useEffect(() => {
    if (!catalog.length) return;
    setForm((current) => {
      const valueExists = catalog.some(
        (f) => f.field_key === current.value.field,
      );
      const freight = catalog.find((f) => f.field_key === 'freight_value');
      const fallback = catalog[0];
      const valueField = valueExists
        ? current.value.field
        : ((freight ?? fallback)?.field_key ?? '');
      const row = catalog.some((f) => f.field_key === current.row)
        ? current.row
        : '';
      const column = catalog.some((f) => f.field_key === current.column)
        ? current.column
        : '';
      if (valueExists && row === current.row && column === current.column)
        return current;
      return {
        ...current,
        row,
        column,
        value: {
          ...current.value,
          field: valueField,
          label:
            catalog.find((f) => f.field_key === valueField)?.label ??
            current.value.label,
        },
      };
    });
  }, [catalog]);
  const calcPayload = (status: 'draft' | 'active') => {
    const expression =
      calcForm.template === 'date_diff_days'
        ? {
            type: 'date_diff_days',
            start: { table: 'operation_records', field: calcForm.left_field },
            end: { table: 'operation_records', field: calcForm.right_field },
          }
        : (() => {
            const rightBase = calcForm.right_field
              ? calcForm.calculation_kind === 'aggregate_calculated_measure'
                ? {
                    aggregate: 'sum',
                    field: {
                      table: 'operation_records',
                      field: calcForm.right_field,
                    },
                  }
                : {
                    field: {
                      table: 'operation_records',
                      field: calcForm.right_field,
                    },
                  }
              : { constant: Number(calcForm.constant) };
            const right =
              calcForm.calculation_kind === 'aggregate_calculated_measure' &&
              calcForm.right_field &&
              Number(calcForm.constant)
                ? {
                    op: 'divide',
                    left: rightBase,
                    right: { constant: Number(calcForm.constant) },
                  }
                : rightBase;
            const left =
              calcForm.calculation_kind === 'aggregate_calculated_measure'
                ? {
                    aggregate: 'sum',
                    field: {
                      table: 'operation_records',
                      field: calcForm.left_field,
                    },
                  }
                : {
                    field: {
                      table: 'operation_records',
                      field: calcForm.left_field,
                    },
                  };
            return { op: calcForm.operator, left, right };
          })();
    const kind =
      calcForm.template === 'date_diff_days'
        ? 'row_calculated_field'
        : calcForm.calculation_kind;
    const format =
      calcForm.template === 'date_diff_days' ? 'days' : calcForm.value_format;
    return {
      name: calcForm.name,
      description: calcForm.description,
      module_key: calcForm.module_key,
      calculation_kind: kind,
      value_format: format,
      decimal_places: Number(calcForm.decimal_places),
      status,
      formula_config: { version: 1, kind, expression, format },
    };
  };
  async function testCalc() {
    if (!tenantId) return;
    try {
      setCalcPreview(
        await previewCalculatedField(tenantId, calcPayload('draft')),
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Não foi possível pré-visualizar campo calculado.',
      );
    }
  }
  async function saveCalc(status: 'draft' | 'active') {
    if (!tenantId) return;
    try {
      const created = await createCalculatedField(
        tenantId,
        calcPayload(status),
      );
      await reload();
      if (calcTarget === 'value' && status === 'active')
        setForm((current) => ({
          ...current,
          value: {
            ...current.value,
            field: created.field_key,
            label: created.name,
            format: created.value_format,
          },
        }));
      setCalcModalOpen(false);
      setCalcForm(initialCalcForm);
      setCalcPreview(null);
      setMessage(
        status === 'draft'
          ? 'Campo calculado salvo como rascunho.'
          : 'Campo calculado salvo e disponibilizado.',
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Não foi possível salvar campo calculado.',
      );
    }
  }
  const validation = validateBuilder(form, catalog);
  const payload = (status: 'draft' | 'active') => ({
    name: form.name,
    description: form.description,
    module_key: form.module_key,
    family_key: form.family_key,
    indicator_type: form.indicator_type,
    value_format: form.value.format,
    status,
    available_for_dashboard: status === 'active',
    available_for_reports: status === 'active',
    calculation_config: {
      base_table: 'operation_records',
      operation_key: 'PIVOT_CONTROLLED',
      rationale: form.rationale,
      values: [
        {
          field: form.value.field,
          source:
            catalog.find((f) => f.field_key === form.value.field)?.source ??
            'native',
          aggregation: form.value.aggregation,
          format: form.value.format,
          label:
            form.value.label ||
            catalog.find((f) => f.field_key === form.value.field)?.label,
        },
      ],
      rows: form.row
        ? [
            {
              field: form.row,
              label:
                catalog.find((f) => f.field_key === form.row)?.label ??
                form.row,
            },
          ]
        : [],
      columns: form.column
        ? [
            {
              field: form.column,
              label:
                catalog.find((f) => f.field_key === form.column)?.label ??
                form.column,
            },
          ]
        : [],
    },
  });
  async function testBuilder() {
    if (!tenantId || !validation.ok) return;
    try {
      setCustomPreview(
        await previewCustomIndicator(tenantId, payload('draft')),
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Não foi possível testar o indicador.',
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
      {calcModalOpen ? (
        <CalcModal
          form={calcForm}
          setForm={setCalcForm}
          fields={catalog.filter((f) => f.source !== 'calculated')}
          preview={calcPreview}
          onClose={() => setCalcModalOpen(false)}
          onTest={testCalc}
          onSave={saveCalc}
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
          onOpenCalc={() => {
            setCalcTarget('value');
            setCalcModalOpen(true);
          }}
          onTest={testBuilder}
          onSave={save}
        />
      ) : null}
    </Shell>
  );
}
function validateBuilder(form: FormState, fields: IndicatorField[]) {
  const valueField = fields.find((f) => f.field_key === form.value.field);
  if (!form.name.trim())
    return { ok: false, message: 'Informe o nome do indicador.' };
  if (!valueField) return { ok: false, message: 'Escolha um campo em Valor.' };
  if (form.row && !fields.some((f) => f.field_key === form.row))
    return { ok: false, message: 'Linha fora do catálogo controlado.' };
  if (form.column && !fields.some((f) => f.field_key === form.column))
    return { ok: false, message: 'Coluna fora do catálogo controlado.' };
  if (
    form.value.field === 'freight_value' &&
    form.value.format === 'currency_per_ton'
  )
    return {
      ok: false,
      message:
        'Formato não cria cálculo. Para R$/ton, use um campo calculado R$/ton.',
    };
  const kind = (valueField as IndicatorField & { calculation_kind?: string })
    .calculation_kind;
  const agg = form.value.aggregation;
  if (
    valueField.source === 'calculated' &&
    kind === 'aggregate_calculated_measure' &&
    agg !== 'VALOR_CALCULADO'
  )
    return {
      ok: false,
      message: 'Medida calculada agregada deve usar Valor calculado.',
    };
  if (
    agg === 'VALOR_CALCULADO' &&
    !(
      valueField.source === 'calculated' &&
      kind === 'aggregate_calculated_measure'
    )
  )
    return {
      ok: false,
      message: 'Valor calculado exige um campo calculado agregado.',
    };
  const numeric =
    valueField.is_measure ||
    ['number', 'decimal'].includes(valueField.data_type) ||
    [
      'money',
      'weight',
      'quantity',
      'decimal',
      'number',
      'duration',
      'days',
    ].includes(valueField.semantic_type) ||
    valueField.source === 'calculated';
  const date =
    valueField.data_type === 'date' ||
    valueField.data_type === 'datetime' ||
    valueField.semantic_type === 'date';
  if (['SOMA', 'MÉDIA'].includes(agg) && !numeric)
    return {
      ok: false,
      message:
        'Soma e Média aceitam número, moeda, peso, quantidade, dias ou campo calculado numérico.',
    };
  if (['MÍNIMO', 'MÁXIMO'].includes(agg) && !(numeric || date))
    return {
      ok: false,
      message: 'Mínimo e Máximo aceitam número, duração/dias ou data.',
    };
  return {
    ok: true,
    message: 'Indicador montado por payload controlado sobre a base nativa.',
  };
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
  const [filters, setFilters] = useState<IndicatorPreviewFilters>({
    scope: 'all',
  });
  const [module, setModule] = useState('all');
  const [family, setFamily] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [technical, setTechnical] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const catalogItems = items.filter(
    (i) => !hiddenNativeIndicatorKeys.has(i.indicator_key),
  );
  const visible = catalogItems.filter(
    (i) =>
      (module === 'all' || i.module_key === module) &&
      (family === 'all' || i.family_key === family) &&
      (status === 'all' || i.availability.status === status) &&
      (!search ||
        `${nativeIndicatorLabel(i)} ${i.description ?? ''} ${familyLabel(i.family_key)}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const selected =
    visible.find((i) => i.indicator_key === selectedKey) ??
    visible[0] ??
    catalogItems[0];
  const families = [...new Set(catalogItems.map((i) => i.family_key))];
  return (
    <div className="space-y-4">
      <Card>
        <ScopeFilters filters={filters} setFilters={setFilters} nativeCatalog />
        <div className="grid gap-3 md:grid-cols-5">
          <Select
            label="Módulo"
            value={module}
            onChange={setModule}
            options={[{ value: 'all', label: 'Todos' }, ...modules]}
          />
          <Select
            label="Família"
            value={family}
            onChange={setFamily}
            options={[
              { value: 'all', label: 'Todas' },
              ...families.map((f) => ({ value: f, label: familyLabel(f) })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'available', label: 'Disponível' },
              { value: 'partial', label: 'Parcial' },
              { value: 'waiting_data', label: 'Aguardando dados' },
              { value: 'empty', label: 'Sem dados' },
            ]}
          />
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Busca
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar indicador nativo"
            />
          </label>
        </div>
        <div className="mt-4">
          <Select
            label="Selecione um indicador nativo"
            value={selected?.indicator_key ?? ''}
            onChange={setSelectedKey}
            options={visible.map((i) => ({
              value: i.indicator_key,
              label: nativeIndicatorLabel(i),
            }))}
          />
        </div>
      </Card>
      {selected ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                {nativeIndicatorLabel(selected)}
              </h2>
              <p className="text-sm text-slate-600">
                {moduleLabels[selected.module_key] ?? selected.module_key} ·{' '}
                {familyLabel(selected.family_key)}
              </p>
            </div>
            <StatusBadge
              tone={
                selected.availability.status === 'available'
                  ? 'success'
                  : selected.availability.status === 'empty'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {indicatorStatusLabel(selected.availability.status)}
            </StatusBadge>
          </div>
          <p className="mt-4 text-sm text-slate-700">
            {selected.description ?? 'Indicador nativo do sistema.'}
          </p>
          <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <b>Racional:</b>{' '}
            {selected.rationale ??
              'Cálculo feito pela configuração nativa controlada.'}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Info
              title="Dados nativos usados"
              value={
                (
                  selected.native_data_used ??
                  selected.required_fields.map((g) => g.label)
                ).join(', ') || 'Sem requisito obrigatório'
              }
            />
            <Info
              title="Dados já recebidos"
              value={
                selected.availability.available_fields.join(', ') ||
                'Nenhum campo encontrado no escopo'
              }
            />
            <Info
              title="Dados aguardando"
              value={
                selected.availability.missing_fields.join(', ') || 'Nenhum'
              }
            />
            <Info title="Escopo" value={scopeLabel(filters)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
              onClick={async () =>
                tenantId &&
                setPreview(
                  await previewIndicator(
                    tenantId,
                    selected.indicator_key,
                    filters,
                  ),
                )
              }
            >
              Calcular indicador
            </button>
            <button
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold"
              onClick={() => setTechnical(!technical)}
            >
              Ver lista técnica
            </button>
          </div>
          {technical ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="p-2">Nome</th>
                    <th>Status</th>
                    <th>Campos</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr key={i.indicator_key} className="border-t">
                      <td className="p-2 font-semibold">
                        {nativeIndicatorLabel(i)}
                      </td>
                      <td>{indicatorStatusLabel(i.availability.status)}</td>
                      <td>
                        {i.required_fields.map((g) => g.label).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <NativePreviewBox preview={preview} />
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Nenhum indicador encontrado"
            description="Ajuste os filtros para selecionar um indicador nativo."
          />
        </Card>
      )}
    </div>
  );
}
function nativeIndicatorLabel(indicator: Indicator) {
  return (
    nativeIndicatorNameOverrides[indicator.indicator_key] ?? indicator.name
  );
}
function familyLabel(key: string) {
  return familyLabels[key] ?? key.replaceAll('_', ' ');
}
function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-400">{title}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}
function scopeLabel(filters: IndicatorPreviewFilters) {
  if (filters.scope === 'period')
    return `Período ${filters.date_from ?? 'início'} a ${filters.date_to ?? 'fim'}`;
  return 'Todos os dados nativos';
}
function ScopeFilters({
  filters,
  setFilters,
  nativeCatalog = false,
}: {
  filters: IndicatorPreviewFilters;
  setFilters: (f: IndicatorPreviewFilters) => void;
  nativeCatalog?: boolean;
}) {
  return (
    <div className="mb-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-4">
      <label className="text-sm font-semibold">
        Escopo
        <select
          className="mt-1 w-full rounded-xl border p-2 font-normal"
          value={filters.scope ?? 'all'}
          onChange={(e) =>
            setFilters({ scope: e.target.value, include_archived: false })
          }
        >
          <option value="all">
            {nativeCatalog ? 'Todos os dados nativos' : 'Todos os dados ativos'}
          </option>
          {nativeCatalog ? null : (
            <>
              <option value="last_batch">Último lote tratado</option>
              <option value="source">Integração</option>
            </>
          )}
          <option value="period">Período</option>
        </select>
      </label>
      {!nativeCatalog && filters.scope === 'source' ? (
        <label className="text-sm font-semibold">
          ID da integração
          <input
            className="mt-1 w-full rounded-xl border p-2 font-normal"
            value={filters.source_data_source_id ?? ''}
            onChange={(e) =>
              setFilters({ ...filters, source_data_source_id: e.target.value })
            }
          />
        </label>
      ) : null}
      {filters.scope === 'period' ? (
        <>
          <label className="text-sm font-semibold">
            De
            <input
              type="date"
              className="mt-1 w-full rounded-xl border p-2 font-normal"
              value={filters.date_from ?? ''}
              onChange={(e) =>
                setFilters({ ...filters, date_from: e.target.value })
              }
            />
          </label>
          <label className="text-sm font-semibold">
            Até
            <input
              type="date"
              className="mt-1 w-full rounded-xl border p-2 font-normal"
              value={filters.date_to ?? ''}
              onChange={(e) =>
                setFilters({ ...filters, date_to: e.target.value })
              }
            />
          </label>
        </>
      ) : null}
    </div>
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
  const [filters, setFilters] = useState<IndicatorPreviewFilters>({
    scope: 'all',
  });
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
        <ScopeFilters filters={filters} setFilters={setFilters} />
        <table className="min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="p-3">Nome</th>
              <th>Módulo</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3 font-semibold">{i.name}</td>
                <td>{moduleLabels[i.module_key] ?? i.module_key}</td>
                <td>{i.indicator_type}</td>
                <td>{statusLabel(i.status)}</td>
                <td className="space-x-2">
                  <button
                    className="rounded bg-slate-100 px-2 py-1"
                    onClick={() =>
                      setMessage(`${i.name}: ${i.formula_preview}`)
                    }
                  >
                    Ver regra
                  </button>
                  <button
                    className="rounded bg-blue-50 px-2 py-1 text-blue-700"
                    onClick={async () =>
                      tenantId &&
                      setPreview(
                        await previewSavedCustomIndicator(
                          tenantId,
                          i.id,
                          filters,
                        ),
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
            description="Use o botão Criar novo indicador para montar seletores controlados."
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
  onOpenCalc,
  onTest,
  onSave,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  fields: IndicatorField[];
  validation: { ok: boolean; message: string };
  preview: CustomPreview | null;
  onClose: () => void;
  onOpenCalc: () => void;
  onTest: () => void;
  onSave: (s: 'draft' | 'active') => void;
}) {
  const valueField = fields.find((f) => f.field_key === form.value.field);
  const rowField = fields.find((f) => f.field_key === form.row);
  const columnField = fields.find((f) => f.field_key === form.column);
  const group = [rowField?.label, columnField?.label]
    .filter(Boolean)
    .join(' x ');
  const visual = valueField
    ? `${aggregationLabel(form.value.aggregation)} de ${valueField.label}${group ? ` por ${group}` : ''}`
    : '';
  const suggested = valueField
    ? `Este indicador ${aggregationPhrase(form.value.aggregation)} ${valueField.label.toLowerCase()}${group ? ` agrupado por ${group}` : ''}, considerando somente registros tratados da base nativa.`
    : '';
  useEffect(() => {
    if (!form.rationaleEdited && form.rationale !== suggested)
      setForm({ ...form, rationale: suggested });
  }, [suggested]);
  function pickValue(field: string) {
    const f = fields.find((x) => x.field_key === field);
    const agg =
      f?.source === 'calculated' &&
      (f as IndicatorField & { calculation_kind?: string }).calculation_kind ===
        'aggregate_calculated_measure'
        ? 'VALOR_CALCULADO'
        : 'SOMA';
    setForm({
      ...form,
      value: {
        ...form.value,
        field,
        aggregation: agg,
        format:
          f?.semantic_type === 'money'
            ? 'currency'
            : f?.semantic_type === 'days'
              ? 'days'
              : form.value.format,
        label: f?.label ?? '',
      },
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5 sm:p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">
              Criar novo indicador
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Indicador personalizado sobre campos tratados da base
              nativa/canônica.
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
          <section className="mb-5 rounded-2xl border p-4">
            <h3 className="font-bold">A) Informações do indicador</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input
                label="Nome"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <Input
                label="Descrição"
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
              />
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Racional
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
                  value={form.rationale}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rationale: e.target.value,
                      rationaleEdited: true,
                    })
                  }
                />
              </label>
            </div>
          </section>
          <section className="mb-5 rounded-2xl border p-4">
            <h3 className="font-bold">B) Parâmetros do indicador</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Select
                label="Linha"
                value={form.row}
                onChange={(v) => setForm({ ...form, row: v })}
                options={[
                  { value: '', label: 'Sem linha' },
                  ...fields.map(fieldOption),
                ]}
              />
              <Select
                label="Coluna"
                value={form.column}
                onChange={(v) => setForm({ ...form, column: v })}
                options={[
                  { value: '', label: 'Sem coluna' },
                  ...fields.map(fieldOption),
                ]}
              />
              <div className="md:col-span-2">
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <Select
                    label="Valor"
                    value={form.value.field}
                    onChange={pickValue}
                    options={fields.map(fieldOption)}
                  />
                  <button
                    type="button"
                    onClick={onOpenCalc}
                    className="mt-6 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                  >
                    + Criar campo calculado
                  </button>
                </div>
              </div>
              <Select
                label="Operação"
                value={form.value.aggregation}
                onChange={(v) =>
                  setForm({ ...form, value: { ...form.value, aggregation: v } })
                }
                options={builderOperations}
              />
              <Select
                label="Formato"
                value={form.value.format}
                onChange={(v) =>
                  setForm({ ...form, value: { ...form.value, format: v } })
                }
                options={formatOptions}
              />
              {form.value.field === 'freight_value' &&
              form.value.format === 'currency_per_ton' ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 md:col-span-2">
                  Formato não cria cálculo. Para R$/ton, use um campo calculado
                  R$/ton.
                </p>
              ) : null}
            </div>
          </section>
          <section className="rounded-2xl border p-4">
            <h3 className="font-bold">C) Prévia</h3>
            <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
              <b>Regra visual:</b>{' '}
              {visual || 'Selecione Valor, Operação, Linha e/ou Coluna'}
            </p>
            <p
              className={`mt-3 rounded-xl p-3 text-sm ${validation.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
            >
              {validation.message}
            </p>
            <PreviewBox preview={preview} />
          </section>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:justify-end">
          <button
            disabled={!validation.ok}
            className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            onClick={onTest}
          >
            Testar indicador
          </button>
          <button
            className="rounded-xl bg-slate-100 px-4 py-2 font-bold"
            onClick={() => onSave('draft')}
          >
            Salvar como rascunho
          </button>
          <button
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
function fieldOption(f: IndicatorField) {
  return {
    value: f.field_key,
    label: `${f.label} · ${f.source === 'calculated' ? 'Calculado' : 'Nativo'} · ${fieldTypeLabel(f)}`,
  };
}
function fieldTypeLabel(f: IndicatorField) {
  return (
    (
      {
        money: 'Moeda',
        weight: 'Peso',
        quantity: 'Quantidade',
        date: 'Data',
        datetime: 'Data',
        days: 'Dias',
        number: 'Número',
        decimal: 'Número',
        text: 'Texto',
      } as Record<string, string>
    )[f.semantic_type] ??
    (
      {
        number: 'Número',
        date: 'Data',
        datetime: 'Data',
        text: 'Texto',
      } as Record<string, string>
    )[f.data_type] ??
    f.semantic_type
  );
}
function aggregationLabel(op: string) {
  return builderOperations.find((o) => o.value === op)?.label ?? op;
}
function aggregationPhrase(op: string) {
  return (
    (
      {
        SOMA: 'soma',
        MÉDIA: 'calcula a média de',
        CONTAGEM: 'conta',
        CONTAGEM_DISTINTA: 'conta valores distintos de',
        MÍNIMO: 'calcula o mínimo de',
        MÁXIMO: 'calcula o máximo de',
        VALOR_CALCULADO: 'calcula',
      } as Record<string, string>
    )[op] ?? 'calcula'
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function NativePreviewBox({ preview }: { preview: IndicatorPreview | null }) {
  if (!preview) return null;
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
      <p>
        <b>Resultado:</b> {formatNativePreviewValue(preview)}
      </p>
      <p>
        <b>Registros considerados:</b> {preview.records_considered}
      </p>
      <p>
        <b>Registros usados:</b> {preview.records_used}
      </p>
      <p>
        <b>Registros ignorados:</b> {preview.records_ignored_missing_data}
      </p>
      <p className="text-slate-600">{preview.message}</p>
    </div>
  );
}
function CalcModal({
  form,
  setForm,
  fields,
  preview,
  onClose,
  onTest,
  onSave,
}: {
  form: CalcForm;
  setForm: (f: CalcForm) => void;
  fields: IndicatorField[];
  preview: CustomPreview | null;
  onClose: () => void;
  onTest: () => void;
  onSave: (s: 'draft' | 'active') => void;
}) {
  const dateFields = fields.filter(
    (f) =>
      f.data_type === 'date' ||
      f.data_type === 'datetime' ||
      f.semantic_type === 'date',
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex justify-between">
          <h2 className="text-2xl font-bold">Criar campo calculado</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 font-bold"
          >
            ×
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input
            label="Nome"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <Input
            label="Descrição"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
          />
          <Select
            label="Tipo/modelo"
            value={form.template}
            onChange={(v) =>
              setForm({
                ...form,
                template: v as CalcForm['template'],
                calculation_kind:
                  v === 'date_diff_days'
                    ? 'row_calculated_field'
                    : form.calculation_kind,
                value_format:
                  v === 'date_diff_days' ? 'days' : form.value_format,
              })
            }
            options={[
              { value: 'math', label: 'Operação matemática' },
              { value: 'date_diff_days', label: 'Diferença entre datas' },
            ]}
          />
          {form.template === 'date_diff_days' ? (
            <>
              <Select
                label="Data inicial"
                value={form.left_field}
                onChange={(v) => setForm({ ...form, left_field: v })}
                options={dateFields.map((f) => ({
                  value: f.field_key,
                  label: f.label,
                }))}
              />
              <Select
                label="Data final"
                value={form.right_field}
                onChange={(v) => setForm({ ...form, right_field: v })}
                options={dateFields.map((f) => ({
                  value: f.field_key,
                  label: f.label,
                }))}
              />
              <Select
                label="Unidade"
                value="days"
                onChange={() => undefined}
                options={[{ value: 'days', label: 'Dias' }]}
              />
              <Select
                label="Formato"
                value="days"
                onChange={() => undefined}
                options={[{ value: 'days', label: 'Dias' }]}
              />
              <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 md:col-span-2">
                Data final - Data inicial, em dias.
              </p>
            </>
          ) : (
            <>
              <Select
                label="Tipo"
                value={form.calculation_kind}
                onChange={(v) =>
                  setForm({
                    ...form,
                    calculation_kind: v as CalcForm['calculation_kind'],
                  })
                }
                options={[
                  {
                    value: 'row_calculated_field',
                    label: 'Calculado por registro',
                  },
                  {
                    value: 'aggregate_calculated_measure',
                    label: 'Medida calculada agregada',
                  },
                ]}
              />
              <Select
                label="Campo esquerdo"
                value={form.left_field}
                onChange={(v) => setForm({ ...form, left_field: v })}
                options={fields.map((f) => ({
                  value: f.field_key,
                  label: f.label,
                }))}
              />
              <Select
                label="Operador"
                value={form.operator}
                onChange={(v) =>
                  setForm({ ...form, operator: v as CalcForm['operator'] })
                }
                options={[
                  { value: 'add', label: 'Somar' },
                  { value: 'subtract', label: 'Subtrair' },
                  { value: 'multiply', label: 'Multiplicar' },
                  { value: 'divide', label: 'Dividir' },
                ]}
              />
              <Select
                label="Campo direito"
                value={form.right_field}
                onChange={(v) => setForm({ ...form, right_field: v })}
                options={[
                  { value: '', label: 'Usar constante' },
                  ...fields.map((f) => ({
                    value: f.field_key,
                    label: f.label,
                  })),
                ]}
              />
              <Input
                label="Constante"
                value={form.constant}
                onChange={(v) => setForm({ ...form, constant: v })}
              />
              <Select
                label="Formato"
                value={form.value_format}
                onChange={(v) => setForm({ ...form, value_format: v })}
                options={formatOptions}
              />
            </>
          )}
        </div>
        <PreviewBox preview={preview} />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white"
            onClick={onTest}
          >
            Testar
          </button>
          <button
            className="rounded-xl bg-slate-100 px-4 py-2 font-bold"
            onClick={() => onSave('draft')}
          >
            Salvar rascunho
          </button>
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white"
            onClick={() => onSave('active')}
          >
            Salvar ativo
          </button>
        </div>
      </div>
    </div>
  );
}
function PreviewBox({ preview }: { preview: CustomPreview | null }) {
  if (!preview) return null;
  const table =
    Array.isArray(preview.table) && preview.table.length
      ? preview.table
      : Array.isArray(preview.series)
        ? preview.series
        : [];
  const valueField = String(preview.fields_used?.[0]?.label ?? 'Valor');
  const metricLabel = preview.formula_preview?.includes(' de ')
    ? preview.formula_preview.split(' por ')[0]
    : valueField;
  const labelHeader = preview.formula_preview?.includes(' por ')
    ? preview.formula_preview.split(' por ')[1]?.split(' x ')[0] ||
      'Linha/Coluna'
    : 'Linha/Coluna';
  const columns: string[] = table.length
    ? [
        'label',
        ...Array.from(
          new Set(
            table.flatMap((row) =>
              Object.keys(row).filter(
                (key) => key !== 'label' && key !== 'used_count',
              ),
            ),
          ),
        ),
      ].filter((key) => table.some((row) => key in row))
    : [];
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
      <p>
        <b>
          {preview.value === null && table.length
            ? 'Resultado em tabela/matriz'
            : 'Valor calculado:'}
        </b>{' '}
        {preview.value === null && table.length ? '' : format(preview.value)}
      </p>
      {table.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-100 text-xs uppercase text-slate-500">
                {columns.map((column) => (
                  <th key={column} className="p-2">
                    {column === 'label'
                      ? labelHeader
                      : column === 'value'
                        ? metricLabel
                        : column === 'records_used_in_group'
                          ? 'Registros usados'
                          : column.endsWith('_used_count')
                            ? `${column.replace(/_used_count$/, '')} usados`
                            : column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={column} className="p-2">
                      {format(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p>
        <b>Registros no escopo:</b> {preview.records_considered}
      </p>
      <p>
        <b>Registros usados:</b>{' '}
        {preview.records_used ?? preview.records_considered}
      </p>
      <p>
        <b>Registros ignorados:</b> {preview.records_ignored_missing_data ?? 0}
      </p>
      <p className="text-slate-600">{preview.message}</p>
    </div>
  );
}
function format(v: unknown) {
  if (v === null || v === undefined) return '—';
  return typeof v === 'number'
    ? Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v)
    : String(v);
}
function formatNativePreviewValue(preview: IndicatorPreview) {
  const value = preview.value;
  if (value === null || value === undefined) return 'Sem valor disponível';
  if (preview.display_value) return preview.display_value;
  if (typeof value !== 'number') return String(value);
  const key = preview.debug?.indicator_key;
  if (key === 'total_freight_informed')
    return Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  if (key === 'freight_per_kg')
    return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 5 }).format(
      value,
    );
  if (key === 'total_weight_informed' || key === 'total_volumes_informed')
    return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(
      value,
    );
  return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}
function indicatorStatusLabel(v: string) {
  return (
    (
      {
        available: 'Disponível',
        partial: 'Parcial',
        waiting_data: 'Aguardando dados',
        empty: 'Sem dados',
        failed: 'Falhou',
      } as Record<string, string>
    )[v] ?? v
  );
}
function statusLabel(v: string) {
  return v === 'draft' ? 'Rascunho' : v === 'active' ? 'Disponível' : 'Inativo';
}
