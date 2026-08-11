'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, StatusBadge } from '../ui';
import {
  getApiConfig,
  listApiFieldMappings,
  listApiRuns,
  listValueMappings,
  listFieldParseRules,
  saveApiConfig,
  saveApiFieldMappings,
  saveValueMappings,
  saveFieldParseRules,
  syncApiNow,
  revalidateApiBatch,
  testApi,
  useApiSample,
  type ApiConnectorConfig,
  type ApiSyncRun,
  type ValueMappingItem,
  type FieldParseRule,
  normalizeFieldParseRule,
} from '../../lib/api-connector-api';
import type { DataContractField } from '../../lib/data-contracts-api';
import { listCanonicalMappingTargets, type CanonicalMappingTarget } from '../../lib/canonical-api';
import type { TenantModuleOption } from '../../lib/modules-api';
import { updateIntegrationConnection } from '../../lib/integrations-api';
import {
  listNormalizationErrors,
  processNormalization,
  type NormalizationError,
} from '../../lib/normalization-api';

type Phase =
  'connection' | 'sample' | 'mapping' | 'values' | 'formats' | 'sync' | 'done';
type Action =
  | 'save'
  | 'test'
  | 'sample'
  | 'mapping'
  | 'values'
  | 'formats'
  | 'sync'
  | 'revalidate'
  | null;
const phases: Array<{ key: Phase; label: string }> = [
  { key: 'connection', label: 'Conexão' },
  { key: 'sample', label: 'Amostra' },
  { key: 'mapping', label: 'Pareamento' },
  { key: 'values', label: 'De/Para de valores' },
  { key: 'formats', label: 'Formato dos campos' },
  { key: 'sync', label: 'Sincronização para staging' },
  { key: 'done', label: 'Pronto' },
];
const buttonText: Record<Exclude<Action, null>, [string, string]> = {
  save: ['Salvar e ir para amostra', 'Salvando...'],
  test: ['Testar conexão', 'Testando...'],
  sample: ['Usar amostra para pareamento', 'Preparando...'],
  mapping: ['Confirmar pareamento', 'Confirmando...'],
  values: ['Salvar De/Para', 'Salvando...'],
  formats: ['Salvar formatos', 'Salvando...'],
  sync: ['Sincronizar para staging', 'Sincronizando...'],
  revalidate: ['Revalidar com regras atuais', 'Revalidando...'],
};
const dateFormats = [
  ['iso_auto', 'ISO automático'],
  ['yyyy_mm_dd', 'AAAA-MM-DD'],
  ['yyyy_mm_dd_hh_mm_ss', 'AAAA-MM-DD HH:mm:ss'],
  ['yyyy_mm_dd_t_hh_mm_ss', 'AAAA-MM-DDTHH:mm:ss'],
  ['dd_mm_yyyy', 'DD/MM/AAAA'],
  ['dd_mm_yyyy_hh_mm_ss', 'DD/MM/AAAA HH:mm:ss'],
] as const;
const entityOrder = [
  'operation_records', 'transport_records', 'occurrences', 'attendance_records',
  'finance_records', 'warehouse_records', 'team_records', 'deliveries',
];
const entityLabels: Record<string, string> = {
  operation_records: 'Operações', transport_records: 'Transporte', occurrences: 'Ocorrências',
  attendance_records: 'Atendimento', finance_records: 'Financeiro operacional', warehouse_records: 'Armazém',
  team_records: 'Equipes', deliveries: 'Entregas legado',
};
const essentialTargets = [
  { label: 'Operações / Número da entrega', legacy: ['numero_entrega', 'delivery_number'], canonical: ['operation_records.delivery_number', 'deliveries.delivery_number'] },
  { label: 'Operações / Documento do cliente', legacy: ['documento_cliente'], canonical: ['operation_records.customer_document'] },
  { label: 'Operações / Nome do cliente', legacy: ['nome_cliente'], canonical: ['operation_records.customer_name'] },
  { label: 'Operações / Status da entrega', legacy: ['status_entrega'], canonical: ['operation_records.delivery_status', 'operation_records.status'] },
];
const preferredFieldOrder: Record<string, string[]> = {
  operation_records: ['delivery_number', 'document_number', 'customer_document', 'customer_name', 'delivery_status', 'carrier_name', 'driver_name', 'vehicle', 'origin_city', 'origin_state', 'destination_city', 'destination_state', 'gross_weight', 'volume_m3', 'volume_count', 'total_value'],
  transport_records: ['driver_name', 'driver_phone', 'driver_whatsapp', 'vehicle', 'vehicle_plate', 'vehicle_type', 'pod_status'],
  occurrences: ['occurrence_number', 'title', 'description', 'priority', 'origin_channel', 'opened_at', 'due_at', 'linked_document_number', 'linked_invoice_number', 'linked_cte_number', 'linked_delivery_number'],
  finance_records: ['freight_value', 'total_value', 'cte_number', 'billing_status', 'payment_status', 'billing_block_status'],
};
function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function sourceGroup(source: string) {
  const prefix = source.split('_', 1)[0]?.toLowerCase();
  return prefix === 'carga' ? 'Carga' : prefix === 'entrega' ? 'Entrega' : prefix === 'financeiro' ? 'Financeiro' : 'Outros';
}
function canonicalValue(target: CanonicalMappingTarget) {
  return `canonical:${target.canonical_entity_id}:${target.canonical_field_id}`;
}
function rankTarget(target: CanonicalMappingTarget) {
  const preferred = preferredFieldOrder[target.canonical_entity_key] ?? [];
  const index = preferred.indexOf(target.field_key);
  return index < 0 ? 1000 + target.field_sort_order : index;
}
function suggestTarget(source: string, targets: CanonicalMappingTarget[]) {
  const tokens = new Set(normalizeSearch(source).split(/[^a-z0-9]+/).filter((token) => token.length > 1));
  const aliases: Record<string, string[]> = { nro: ['numero', 'documento'], doc: ['documento'], motorista: ['driver'], telefone: ['phone'], veiculo: ['vehicle'], placa: ['plate'], transportadora: ['carrier'], volume: ['volume'], frete: ['freight'], cte: ['cte'], entrega: ['delivery'], status: ['status'], whatsapp: ['whatsapp'] };
  let best: { target: CanonicalMappingTarget; score: number } | null = null;
  for (const target of targets) {
    const haystack = normalizeSearch(`${target.canonical_entity_key} ${target.field_key} ${target.label}`);
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length + 2;
      for (const alias of aliases[token] ?? []) if (haystack.includes(alias)) score += token.length + 1;
    }
    if (tokens.has('telefone') && target.field_key === 'driver_phone') score += 20;
    if (tokens.has('whatsapp') && target.field_key === 'driver_whatsapp') score += 25;
    if (tokens.has('frete') && target.field_key === 'freight_value') score += 20;
    if (tokens.has('status') && tokens.has('entrega') && target.field_key === 'delivery_status') score += 20;
    if (!best || score > best.score) best = { target, score };
  }
  return best && best.score >= 8 ? best.target : null;
}

function TargetCombobox({ value, targets, legacyFields, onChange }: { value: string; targets: CanonicalMappingTarget[]; legacyFields: DataContractField[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const selected = targets.find((target) => canonicalValue(target) === value);
  const legacy = legacyFields.find((field) => field.id === value);
  const filtered = targets.filter((target) => normalizeSearch(`${target.label} ${target.field_key}`).includes(normalizeSearch(query)));
  const groups = entityOrder.map((key) => ({ key, items: filtered.filter((target) => target.canonical_entity_key === key).sort((a, b) => rankTarget(a) - rankTarget(b)) })).filter((group) => group.items.length);
  return <div ref={root} className="relative mt-3">
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-xl border bg-white p-2 text-left text-sm">
      <span>{selected?.label ?? (legacy ? `Mapeamento anterior / ${legacy.field_key}` : 'Não parear')}</span><span aria-hidden>⌄</span>
    </button>
    {open ? <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border bg-white p-2 shadow-xl">
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar destino por nome ou chave..." aria-label="Buscar destino canônico" className="mb-2 w-full rounded-lg border p-2 text-sm" />
      <button type="button" role="option" onClick={() => { onChange(''); setOpen(false); }} className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-slate-100">Não parear</button>
      {groups.map((group) => <div key={group.key} className="mt-2 border-t pt-2">
        <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">{entityLabels[group.key] ?? group.items[0].canonical_entity_name}</p>
        {group.items.map((target) => <button type="button" role="option" aria-selected={value === canonicalValue(target)} key={target.canonical_field_id} onClick={() => { onChange(canonicalValue(target)); setOpen(false); setQuery(''); }} className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-blue-50"><span className="font-medium">{target.label}</span></button>)}
      </div>)}
      {!groups.length ? <p className="p-3 text-sm text-slate-500">Nenhum destino encontrado.</p> : null}
      {legacy ? <button type="button" role="option" onClick={() => setOpen(false)} className="mt-2 w-full border-t px-2 py-2 text-left text-sm text-slate-600">Mapeamento anterior / {legacy.field_key}</button> : null}
    </div> : null}
  </div>;
}
function valuePreview(value: unknown) {
  if (value == null) return 'Sem valor na amostra';
  return typeof value === 'object'
    ? JSON.stringify(value).slice(0, 90)
    : String(value).slice(0, 90);
}
function inferredType(value: unknown) {
  if (value == null) return 'desconhecido';
  if (Array.isArray(value)) return 'lista';
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'inteiro' : 'decimal';
  return typeof value;
}
function numericPreview(
  value: unknown,
  decimal: string | null | undefined,
  thousand: string | null | undefined,
) {
  if (typeof value !== 'string' || (!decimal && !thousand)) return null;
  let normalized = value.trim();
  if (thousand) normalized = normalized.split(thousand).join('');
  if (decimal && decimal !== '.') normalized = normalized.replace(decimal, '.');
  if (!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const converted = Number(normalized);
  if (!Number.isFinite(converted)) return null;
  const received = Number(value);
  const suspicious =
    Number.isFinite(received) &&
    received !== 0 &&
    (Math.abs(converted / received) >= 100 ||
      Math.abs(received / converted) >= 100);
  return { converted, suspicious };
}
function ActionButton({
  action,
  busy,
  disabled,
  onClick,
}: {
  action: Exclude<Action, null>;
  busy: Action;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={action === 'save' ? 'submit' : 'button'}
      onClick={onClick}
      disabled={disabled || busy !== null}
      className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {buttonText[action][busy === action ? 1 : 0]}
    </button>
  );
}

export function ApiConnectionPanel({
  tenantId,
  sourceId,
  fields,
  modules,
  source,
}: {
  tenantId: string;
  sourceId: string;
  fields: DataContractField[];
  modules: TenantModuleOption[];
  source: {
    name: string;
    module_key: string;
    metadata?: Record<string, unknown> | null;
  };
}) {
  const [phase, setPhase] = useState<Phase>('connection');
  const [config, setConfig] = useState<ApiConnectorConfig | null>(null);
  const [runs, setRuns] = useState<ApiSyncRun[]>([]);
  const [canonicalTargets,setCanonicalTargets]=useState<CanonicalMappingTarget[]>([]);
  const [valueMappings, setValueMappings] = useState<ValueMappingItem[]>([]);
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});
  const [formatDraft, setFormatDraft] = useState<
    Record<string, FieldParseRule>
  >({});
  const [result, setResult] = useState<{
    http_status: number;
    record_count: number;
    fields: string[];
    sample?: Record<string, unknown>[];
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mappingFilter, setMappingFilter] = useState<'all' | 'pending' | 'suggestions'>('all');
  const [msg, setMsg] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>(
    'success',
  );
  const [busy, setBusy] = useState<Action>(null);
  const [processing, setProcessing] = useState(false);
  const [processingErrors, setProcessingErrors] = useState<
    NormalizationError[]
  >([]);
  async function load() {
    const [current, history, mappings, values, formats, targets] = await Promise.all([
      getApiConfig(tenantId, sourceId),
      listApiRuns(tenantId, sourceId),
      listApiFieldMappings(tenantId, sourceId),
      listValueMappings(tenantId, sourceId),
      listFieldParseRules(tenantId, sourceId),
      listCanonicalMappingTargets(tenantId),
    ]);
    setCanonicalTargets(targets);
    setConfig(current);
    setRuns(history);
    setDraft(
      Object.fromEntries(
        mappings.map((mapping) => [
          mapping.api_source_field_name,
          mapping.canonical_entity_id&&mapping.canonical_field_id
            ?`canonical:${mapping.canonical_entity_id}:${mapping.canonical_field_id}`
            :mapping.data_contract_field_id,
        ]),
      ),
    );
    setValueMappings(values);
    setValueDraft(
      Object.fromEntries(
        values
          .filter((item) => item.target_value)
          .map((item) => [
            `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`,
            item.target_value!,
          ]),
      ),
    );
    setFormatDraft(
      Object.fromEntries(
        formats.map((rule) => [
          `${rule.data_contract_field_id}\0${rule.source_field_name}`,
          normalizeFieldParseRule(rule),
        ]),
      ),
    );
  }
  useEffect(() => {
    if (tenantId)
      load().catch((error: Error) => {
        setMessageTone('error');
        setMsg(error.message);
      });
  }, [tenantId, sourceId]);
  async function act(
    action: Exclude<Action, null>,
    operation: () => Promise<void>,
  ) {
    setBusy(action);
    setMsg('');
    try {
      await operation();
      setMessageTone('success');
    } catch (error) {
      setMessageTone('error');
      setMsg((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act('save', async () => {
      const moduleKeys = form.getAll('module_keys').map(String);
      if (!moduleKeys.length)
        throw new Error(
          'Selecione ao menos um módulo alimentado pela integração.',
        );
      await updateIntegrationConnection(tenantId, sourceId, {
        name: source.name,
        source_type: 'api',
        module_key: moduleKeys[0],
        metadata: { ...(source.metadata ?? {}), module_keys: moduleKeys },
      });
      await saveApiConfig(
        tenantId,
        sourceId,
        Object.fromEntries(form.entries()),
      );
      await load();
      setMsg('Conexão salva com sucesso e segredo protegido.');
      setPhase('sample');
    });
  }
  const test = () =>
    act('test', async () => {
      const response = await testApi(tenantId, sourceId);
      setResult(response);
      setMsg(
        'Conexão realizada com sucesso. A amostra está pronta para revisão.',
      );
    });
  const sample = () =>
    act('sample', async () => {
      const response = await useApiSample(tenantId, sourceId);
      setResult({
        http_status: response.http_status,
        record_count: response.sample.length,
        fields: response.fields,
        sample: response.sample,
      });
      await load();
      setMsg('Amostra preparada com sucesso, sem alterar o contrato nativo.');
      setPhase('mapping');
    });
  const detected = result?.fields ?? config?.detected_fields ?? [];
  const sampleRows = result?.sample ?? config?.sample_preview ?? [];
  const duplicates = useMemo(() => {
    const counts = Object.values(draft)
      .filter(Boolean)
      .reduce<Record<string, number>>(
        (all, id) => ({ ...all, [id]: (all[id] ?? 0) + 1 }),
        {},
      );
    return new Set(Object.keys(counts).filter((id) => counts[id] > 1));
  }, [draft]);
  const mappedCount = detected.filter((source) =>
    Boolean(draft[source]),
  ).length;
  const unmappedCount = detected.length - mappedCount;
  const selectedCanonicalKeys = new Set(Object.values(draft).flatMap((value) => {
    if (!value.startsWith('canonical:')) return [];
    const target = canonicalTargets.find((item) => canonicalValue(item) === value);
    return target ? [`${target.canonical_entity_key}.${target.field_key}`] : [];
  }));
  const selectedLegacyKeys = new Set(fields.filter((field) => Object.values(draft).includes(field.id)).map((field) => field.field_key));
  const missingEssential = essentialTargets.filter((essential) =>
    !essential.legacy.some((key) => selectedLegacyKeys.has(key)) &&
    !essential.canonical.some((key) => selectedCanonicalKeys.has(key)),
  );
  const essentialMappedCount = essentialTargets.length - missingEssential.length;
  const deliveryOperationalField = fields.find(
    (field) =>
      field.field_key === 'numero_entrega' ||
      field.field_key === 'delivery_number',
  );
  const missingDeliveryOperationalKey = Boolean(deliveryOperationalField) && missingEssential[0]?.label === essentialTargets[0].label;
  const groupedDetected = ['Carga', 'Entrega', 'Financeiro', 'Outros'].map((label) => ({
    label,
    fields: detected.filter((source) => sourceGroup(source) === label).filter((source) => {
      const suggestion = suggestTarget(source, canonicalTargets);
      return mappingFilter === 'all' || (mappingFilter === 'pending' ? !draft[source] : !draft[source] && Boolean(suggestion));
    }),
  })).filter((group) => group.fields.length);
  const confirmMappings = () =>
    act('mapping', async () => {
      await saveApiFieldMappings(
        tenantId,
        sourceId,
        Object.entries(draft)
          .filter(([, target]) => target)
          .map(([source_field_name, target]) => {
            if(target.startsWith('canonical:')){
              const [,canonical_entity_id,canonical_field_id]=target.split(':');
              return {source_field_name,data_contract_field_id:'',canonical_entity_id,canonical_field_id};
            }
            return {source_field_name,data_contract_field_id:target};
          }),
      );
      await load();
      setMsg(
        'Pareamento parcial confirmado. Campos não pareados serão ignorados operacionalmente.',
      );
      setPhase('values');
    });
  const saveValues = () =>
    act('values', async () => {
      const pendingCount = valueMappings.filter(
        (item) =>
          item.status === 'pending' &&
          !valueDraft[
            `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`
          ],
      ).length;
      if (
        pendingCount > 0 &&
        !window.confirm(
          'Existem valores pendentes conhecidos que podem rejeitar registros. Deseja salvar parcialmente e avançar?',
        )
      )
        return;
      const mappings = valueMappings
        .filter((item) => item.status !== 'exact_match')
        .map((item) => ({
          source_field_name: item.source_field_name,
          data_contract_field_id: item.data_contract_field_id,
          source_value: item.source_value,
          target_value:
            valueDraft[
              `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`
            ] || null,
        }));
      if (mappings.length)
        await saveValueMappings(tenantId, sourceId, mappings);
      await load();
      setMsg(
        'Configuração salva. Revalide os lotes pendentes ou sincronize novamente para aplicar as regras atuais.',
      );
      setPhase('formats');
    });
  const formatRows = Object.entries(draft).flatMap(([source, id]) => {
    const field = fields.find((item) => item.id === id);
    return field &&
      ['date', 'datetime', 'decimal', 'number', 'integer', 'boolean'].includes(
        field.data_type,
      )
      ? [{ source, field }]
      : [];
  });
  const updateFormat = (
    source: string,
    field: DataContractField,
    change: Partial<FieldParseRule>,
  ) => {
    const key = `${field.id}\0${source}`;
    setFormatDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        source_field_name: source,
        data_contract_field_id: field.id,
        data_type: field.data_type,
        date_format: current[key]?.date_format ?? null,
        timezone: current[key]?.timezone ?? null,
        decimal_separator: current[key]?.decimal_separator ?? null,
        thousand_separator: current[key]?.thousand_separator ?? null,
        boolean_true_values: current[key]?.boolean_true_values ?? null,
        boolean_false_values: current[key]?.boolean_false_values ?? null,
        ...change,
      },
    }));
  };
  const saveFormats = () =>
    act('formats', async () => {
      await saveFieldParseRules(tenantId, sourceId, Object.values(formatDraft));
      await load();
      setMsg(
        'Configuração salva. Revalide os lotes pendentes ou sincronize novamente para aplicar as regras atuais.',
      );
      setPhase('sync');
    });
  const sync = () =>
    act('sync', async () => {
      const response = await syncApiNow(tenantId, sourceId);
      await load();
      setMsg(
        `Sincronização concluída: ${response.accepted_count} aceitos, ${response.rejected_count} rejeitados e ${response.unchanged_count} sem alteração.`,
      );
      setPhase('done');
    });
  const processAccepted = async (batchId: string) => {
    setProcessing(true);
    setMsg('');
    setProcessingErrors([]);
    try {
      const run = await processNormalization(tenantId, batchId);
      const errors =
        run.status === 'completed'
          ? []
          : await listNormalizationErrors(tenantId, run.id);
      setProcessingErrors(errors.slice(0, 5));
      setMessageTone(run.status === 'completed' ? 'success' : 'error');
      const counts = `${run.created_count} criados · ${run.updated_count} atualizados · ${run.skipped_count} ignorados · ${run.error_count} erros.`;
      const missingCanonicalMapping = errors.some(
        (error) => error.error_code === 'NO_CANONICAL_FIELD_MAPPINGS',
      );
      setMsg(
        missingCanonicalMapping
          ? `${counts} Os dados foram validados em staging, mas ainda não possuem mapeamento canônico para publicação no modelo tratado.`
          : run.created_count + run.updated_count === 0
            ? `Nenhum registro tratado foi criado ou atualizado. ${counts}`
            : `${counts} ${run.status === 'completed' ? 'Dados tratados processados com sucesso.' : 'O processamento terminou com inconsistências; veja os primeiros erros abaixo.'}`,
      );
      await load();
    } catch (error) {
      setMessageTone('error');
      setMsg((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };
  const revalidate = (batchId: string) =>
    act('revalidate', async () => {
      const response = await revalidateApiBatch(tenantId, sourceId, batchId);
      await load();
      setMsg(
        `Lote API revalidado com as regras atuais: ${response.accepted_count} aceitos e ${response.rejected_count} rejeitados.`,
      );
    });
  const revalidateAndProcess = async (batchId: string) => {
    setProcessing(true);
    setMsg('');
    setProcessingErrors([]);
    try {
      const validation = await revalidateApiBatch(tenantId, sourceId, batchId);
      if (validation.accepted_count === 0) {
        setMessageTone('error');
        setMsg(
          `O lote foi revalidado, mas nenhum registro está apto ao processamento (${validation.rejected_count} rejeitados).`,
        );
        await load();
        return;
      }
      const run = await processNormalization(tenantId, batchId);
      const errors =
        run.status === 'completed'
          ? []
          : await listNormalizationErrors(tenantId, run.id);
      setProcessingErrors(errors.slice(0, 5));
      setMessageTone(run.status === 'completed' ? 'success' : 'error');
      setMsg(
        run.status === 'completed'
          ? `Lote revalidado e reprocessado com as regras atuais: ${validation.accepted_count} aceitos · ${run.created_count} criados · ${run.updated_count} atualizados.`
          : `O lote foi revalidado, mas o reprocessamento terminou com ${run.error_count} erro(s).`,
      );
      await load();
    } catch (error) {
      setMessageTone('error');
      setMsg((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };
  const sampleValue = (source: string) =>
    sampleRows.find((row) => Object.hasOwn(row, source))?.[source];
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-7">
        {phases.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPhase(item.key)}
            className={`rounded-xl border p-3 text-left ${phase === item.key ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}
          >
            <span className="text-xs font-bold text-slate-500">
              {index + 1}
            </span>
            <p className="font-bold">{item.label}</p>
          </button>
        ))}
      </div>
      {msg ? (
        <p
          role={messageTone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border p-3 text-sm ${messageTone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          {msg}
        </p>
      ) : null}
      {processingErrors.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p className="font-bold">Primeiros erros da normalização</p>
          <ul className="mt-2 space-y-2">
            {processingErrors.map((error) => (
              <li key={error.id}>
                <b>{error.canonical_field_key ?? 'campo não informado'}</b> ·{' '}
                {error.canonical_entity_key ?? 'entidade não informada'} ·{' '}
                <span className="font-mono">{error.error_code}</span>
                <br />
                {error.error_message}
                {error.error_code === 'NO_CANONICAL_FIELD_MAPPINGS' &&
                Array.isArray(error.details.normalized_payload_keys) ? (
                  <span className="mt-1 block">
                    Chaves do normalized_payload:{' '}
                    {error.details.normalized_payload_keys
                      .map(String)
                      .join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {phase === 'connection' ? (
        <Card>
          <h2 className="text-xl font-bold">Conexão de leitura</h2>
          <p className="mt-1 text-sm text-slate-600">
            Somente GET. O segredo nunca é devolvido ao navegador.
          </p>
          <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2">
            <fieldset className="text-sm font-semibold md:col-span-2">
              <legend>Módulos que esta integração alimenta</legend>
              <div className="mt-2 grid gap-2 rounded-xl border p-3 font-normal md:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={(event) =>
                      event.currentTarget.form
                        ?.querySelectorAll<HTMLInputElement>(
                          'input[name="module_keys"]',
                        )
                        .forEach((input) => {
                          input.checked = event.currentTarget.checked;
                        })
                    }
                  />
                  Todos
                </label>
                {modules.map((module) => (
                  <label key={module.key} className="flex items-center gap-2">
                    <input
                      name="module_keys"
                      type="checkbox"
                      value={module.key}
                      defaultChecked={(
                        (source.metadata?.module_keys as
                          string[] | undefined) ?? [source.module_key]
                      ).includes(module.key)}
                    />
                    {module.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {[
              ['base_url', 'URL base', 'https://legado.exemplo.com'],
              ['endpoint_path', 'Endpoint', '/api/entregas'],
              ['response_root_path', 'Raiz da resposta', 'data'],
              ['external_id_field', 'Identificador externo', 'id'],
              ['updated_at_field', 'Campo de atualização', 'updated_at'],
              [
                'updated_since_param',
                'Parâmetro updated since',
                'updated_since',
              ],
              ['page_param', 'Parâmetro de página', 'page'],
              ['page_size_param', 'Parâmetro de limite', 'limit'],
            ].map(([name, label, placeholder]) => (
              <label key={name} className="text-sm font-semibold">
                {label}
                <input
                  name={name}
                  required={name === 'base_url' || name === 'endpoint_path'}
                  defaultValue={String(
                    config?.[name as keyof ApiConnectorConfig] ?? '',
                  )}
                  placeholder={placeholder}
                  className="mt-1 w-full rounded-xl border p-3 font-normal"
                />
              </label>
            ))}
            <label className="text-sm font-semibold">
              Autenticação
              <select
                name="auth_type"
                defaultValue={config?.auth_type ?? 'none'}
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              >
                <option value="none">Nenhuma</option>
                <option value="bearer_token">Bearer token</option>
                <option value="api_key_header">API key em header</option>
                <option value="basic">Basic</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Nome do header
              <input
                name="auth_header_name"
                defaultValue={config?.auth_header_name ?? ''}
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Token/segredo
              <input
                name="secret"
                type="password"
                placeholder={
                  config?.credentials_configured
                    ? 'Configurado — vazio mantém o segredo'
                    : 'Obrigatório quando houver autenticação'
                }
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Limite por página
              <input
                name="page_size"
                type="number"
                min="1"
                max="500"
                defaultValue={config?.page_size ?? 100}
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                name="auto_sync_enabled"
                type="checkbox"
                value="true"
                defaultChecked={config?.auto_sync_enabled}
              />
              Atualização automática
            </label>
            <label className="text-sm font-semibold">
              Periodicidade
              <select
                name="sync_frequency_minutes"
                defaultValue={config?.sync_frequency_minutes ?? ''}
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              >
                <option value="">Manual</option>
                <option value="15">A cada 15 min</option>
                <option value="60">A cada hora</option>
                <option value="1440">Diária</option>
              </select>
            </label>
            <ActionButton action="save" busy={busy} />
          </form>
        </Card>
      ) : null}
      {phase === 'sample' ? (
        <Card>
          <h2 className="text-xl font-bold">Amostra</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              action="test"
              busy={busy}
              disabled={!config}
              onClick={test}
            />
            <ActionButton
              action="sample"
              busy={busy}
              disabled={!result}
              onClick={sample}
            />
          </div>
          {result ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
              <b>HTTP {result.http_status}</b> · {result.record_count} registros
              <p className="mt-2">
                Campos: {result.fields.join(', ') || 'nenhum'}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}
      {phase === 'mapping' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <h2 className="text-lg font-bold">Campos da API</h2>
            <p className="mt-1 text-sm text-slate-600">
              Campos brutos detectados, organizados pelo prefixo da origem.
            </p>
            <div className="mt-4 space-y-3">
              {groupedDetected.map((group) => <section key={group.label}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{group.label} · {group.fields.length}</h3>
                <div className="space-y-3">{group.fields.map((source) => {
                  const value = sampleValue(source);
                  const target = canonicalTargets.find((item) => canonicalValue(item) === draft[source]);
                  const suggestion = !draft[source] ? suggestTarget(source, canonicalTargets) : null;
                  return <div key={source} className="rounded-2xl border p-3">
                    <div className="flex justify-between gap-2">
                      <StatusBadge tone={draft[source] ? 'success' : 'neutral'}>
                        {draft[source] ? 'pareado' : 'não pareado'}
                      </StatusBadge>
                      <span className="text-xs text-slate-500">
                        {inferredType(value)}
                      </span>
                    </div>
                    <p className="mt-2 break-all font-mono text-sm font-semibold">
                      {source}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-600">
                      Exemplo: {valuePreview(value)}
                    </p>
                    <p className="mt-2 text-xs"><span className="text-slate-500">Destino atual:</span> <b>{target?.label ?? (draft[source] ? 'Mapeamento anterior preservado' : 'Não pareado')}</b></p>
                    {suggestion ? <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800">Sugestão: <b>{suggestion.label}</b></p> : null}
                  </div>;
                })}</div>
              </section>)}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Pareamento</h2>
            <p className="mt-1 text-sm text-slate-600">
              Você não precisa parear todos os campos recebidos da API. Campos
              não pareados serão ignorados operacionalmente. Quanto mais campos
              forem pareados, mais recursos ficarão disponíveis.
            </p>
            <div className="mt-4 space-y-3">
              {groupedDetected.flatMap((group) => group.fields).map((source) => {
                const duplicate = Boolean(
                  draft[source] && duplicates.has(draft[source]),
                );
                const suggestion = !draft[source] ? suggestTarget(source, canonicalTargets) : null;
                return (
                  <div
                    key={source}
                    className={`block rounded-2xl border p-3 ${duplicate ? 'border-rose-400 bg-rose-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="break-all font-mono text-sm">
                        {source}
                      </span>
                      <StatusBadge
                        tone={
                          duplicate
                            ? 'warning'
                            : draft[source]
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {duplicate
                          ? 'duplicado'
                          : draft[source]
                            ? 'pareado'
                            : 'não pareado'}
                      </StatusBadge>
                    </div>
                    <TargetCombobox
                      value={draft[source] ?? ''}
                      targets={canonicalTargets}
                      legacyFields={fields.filter((field) => Object.values(draft).includes(field.id))}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          [source]: value,
                        }))
                      }
                    />
                    {suggestion ? <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800"><span>Sugestão: <b>{suggestion.label}</b></span><button type="button" onClick={() => setDraft((current) => current[source] ? current : ({ ...current, [source]: canonicalValue(suggestion) }))} className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 font-bold text-white">Aplicar sugestão</button></div> : null}
                    {duplicate ? (
                      <p className="mt-2 text-xs font-semibold text-rose-700">
                        Erro: este campo nativo já recebe outro campo da API.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Plano / Normalização</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <b className="block text-xl">{detected.length}</b>detectados
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <b className="block text-xl">{mappedCount}</b>pareados
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <b className="block text-xl">{unmappedCount}</b>não pareados
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-emerald-50 p-3"><b className="block text-xl">{essentialMappedCount}</b>essenciais pareados</div>
              <div className="rounded-xl bg-amber-50 p-3"><b className="block text-xl">{missingEssential.length}</b>essenciais pendentes</div>
            </div>
            <div className="mt-4 rounded-2xl border p-3 text-sm">
              <p className="font-semibold">Resumo da amostra</p>
              <p className="mt-1 text-slate-600">
                {sampleRows.length} registro(s) disponíveis para preview.
              </p>
            </div>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Pendências de qualidade</p>
              {missingEssential.length ? <><p className="mt-1">Alguns campos essenciais ainda não foram pareados. Isso não bloqueia o avanço, mas pode reduzir indicadores e validações.</p><ul className="mt-2 list-disc pl-5">{missingEssential.map((item) => <li key={item.label}>{item.label} <span className="font-normal">· recomendado para qualidade de dados</span></li>)}</ul></> : <p className="mt-1">Todos os campos essenciais estão pareados.</p>}
            </div>
            {missingEssential.length ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMappingFilter('pending')} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Filtrar campos pendentes</button><button type="button" onClick={() => setMappingFilter('suggestions')} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Ver sugestões</button>{mappingFilter !== 'all' ? <button type="button" onClick={() => setMappingFilter('all')} className="rounded-xl px-3 py-2 text-sm text-slate-600">Mostrar todos</button> : null}</div> : null}
            <div className="mt-3 rounded-2xl border p-3 text-sm"><p className="font-semibold">Próximos passos</p><p className="mt-1 text-slate-600">Revise as sugestões, confirme os pareamentos e prossiga para configurar valores e formatos.</p></div>
            {duplicates.size ? (
              <p className="mt-3 text-sm font-semibold text-rose-700">
                Corrija os pareamentos duplicados antes de confirmar.
              </p>
            ) : null}
            {missingDeliveryOperationalKey ? (
              <p className="mt-3 text-sm font-semibold text-amber-800">
                Pendência recomendada: pareie Operações / Número da entrega para melhorar a identificação operacional. O avanço permanece disponível.
              </p>
            ) : null}
            <div className="mt-4">
              <ActionButton
                action="mapping"
                busy={busy}
                disabled={
                  !detected.length ||
                  duplicates.size > 0
                }
                onClick={confirmMappings}
              />
            </div>
          </Card>
        </div>
      ) : null}
      {phase === 'values' ? (
        <Card>
          <h2 className="text-xl font-bold">De/Para de valores controlados</h2>
          <p className="mt-2 text-sm text-slate-600">
            Configure como os valores recebidos da fonte serão convertidos para
            os valores nativos do sistema. O sistema não adivinha valores
            operacionais.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <p className="rounded-xl bg-slate-50 p-3">
              <b>
                {
                  valueMappings.filter((item) => item.status === 'mapped')
                    .length
                }
              </b>
              <br />
              <span className="text-xs">configurados</span>
            </p>
            <p className="rounded-xl bg-amber-50 p-3">
              <b>
                {
                  valueMappings.filter((item) => item.status === 'pending')
                    .length
                }
              </b>
              <br />
              <span className="text-xs">pendentes</span>
            </p>
            <p className="rounded-xl bg-emerald-50 p-3">
              <b>
                {
                  valueMappings.filter((item) => item.status === 'exact_match')
                    .length
                }
              </b>
              <br />
              <span className="text-xs">correspondência exata</span>
            </p>
            <p className="rounded-xl bg-blue-50 p-3">
              <b>{valueMappings.length}</b>
              <br />
              <span className="text-xs">total conhecidos</span>
            </p>
          </div>
          {valueMappings.some((item) => item.status === 'pending') ? (
            <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Valores pendentes conhecidos podem rejeitar registros na próxima
              sincronização. Novos valores podem surgir futuramente conforme o
              legado envie novos status.
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {valueMappings.length ? (
              valueMappings.map((item) => {
                const key = `${item.data_contract_field_id}\0${item.source_field_name}\0${item.source_value}`;
                return (
                  <div
                    key={key}
                    className="grid gap-3 rounded-2xl border p-3 md:grid-cols-4"
                  >
                    <div>
                      <span className="text-xs text-slate-500">
                        Campo da fonte
                      </span>
                      <p className="break-all font-mono text-sm">
                        {item.source_field_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">
                        Campo nativo
                      </span>
                      <p className="font-semibold">{item.field_key}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">
                        Valor recebido
                      </span>
                      <p className="break-all font-semibold">
                        {item.source_value}
                      </p>
                    </div>
                    <label className="text-xs text-slate-500">
                      Mapear para
                      <select
                        value={valueDraft[key] ?? ''}
                        disabled={item.status === 'exact_match'}
                        onChange={(event) =>
                          setValueDraft((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border p-2 text-sm text-slate-900"
                      >
                        <option value="">Selecione</option>
                        {item.allowed_values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <StatusBadge
                        tone={item.status === 'pending' ? 'warning' : 'success'}
                      >
                        {item.status === 'pending'
                          ? 'pendente'
                          : item.status === 'mapped'
                            ? 'configurado'
                            : 'correspondência exata'}
                      </StatusBadge>
                    </label>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm">
                Nenhum valor controlado foi encontrado na amostra ou no staging.
              </p>
            )}
          </div>
          <div className="mt-4">
            <ActionButton action="values" busy={busy} onClick={saveValues} />
          </div>
        </Card>
      ) : null}
      {phase === 'formats' ? (
        <Card>
          <h2 className="text-xl font-bold">Formato dos campos</h2>
          <p className="mt-2 text-sm text-slate-600">
            Configure como datas, horas e números recebidos da fonte devem ser
            lidos. O sistema não altera o legado e não adivinha formatos
            ambíguos.
          </p>
          <div className="mt-4 space-y-3">
            {formatRows.map(({ source, field }) => {
              const key = `${field.id}\0${source}`;
              const rule = formatDraft[key];
              const sample = sampleValue(source);
              const automatic =
                (field.data_type === 'date' ||
                  field.data_type === 'datetime') &&
                typeof sample === 'string' &&
                /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(sample);
              const numeric = numericPreview(
                sample,
                rule?.decimal_separator,
                rule?.thousand_separator,
              );
              const jsonNumberWithTextSeparators =
                typeof sample === 'number' &&
                Boolean(rule?.decimal_separator || rule?.thousand_separator);
              return (
                <div
                  key={key}
                  className="grid gap-3 rounded-2xl border p-3 lg:grid-cols-6"
                >
                  <div>
                    <span className="text-xs text-slate-500">
                      Campo da fonte
                    </span>
                    <p className="break-all font-mono text-sm">{source}</p>
                    <p className="text-xs text-slate-500">
                      Exemplo: {valuePreview(sample)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Campo nativo</span>
                    <p className="font-semibold">{field.field_key}</p>
                    <StatusBadge
                      tone={automatic || rule ? 'success' : 'warning'}
                    >
                      {automatic
                        ? 'automático ISO'
                        : rule
                          ? 'configurado'
                          : 'pendente'}
                    </StatusBadge>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">
                      Tipo esperado
                    </span>
                    <p>{field.data_type}</p>
                  </div>
                  {field.data_type === 'date' ||
                  field.data_type === 'datetime' ? (
                    <>
                      <label className="text-xs text-slate-500">
                        Formato
                        <select
                          value={rule?.date_format ?? ''}
                          onChange={(e) =>
                            updateFormat(source, field, {
                              date_format: e.target.value || null,
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        >
                          <option value="">Selecione</option>
                          {dateFormats.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-500">
                        Timezone
                        <input
                          value={rule?.timezone ?? 'UTC'}
                          onChange={(e) =>
                            updateFormat(source, field, {
                              timezone: e.target.value || 'UTC',
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        />
                      </label>
                    </>
                  ) : field.data_type === 'boolean' ? (
                    <>
                      <label className="text-xs text-slate-500">
                        Valores verdadeiros
                        <input
                          value={(rule?.boolean_true_values ?? []).join(', ')}
                          placeholder="S, SIM, 1"
                          onChange={(e) =>
                            updateFormat(source, field, {
                              boolean_true_values: e.target.value
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Valores falsos
                        <input
                          value={(rule?.boolean_false_values ?? []).join(', ')}
                          placeholder="N, NÃO, 0"
                          onChange={(e) =>
                            updateFormat(source, field, {
                              boolean_false_values: e.target.value
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="text-xs text-slate-500">
                        Separador decimal
                        <select
                          value={rule?.decimal_separator ?? ''}
                          onChange={(e) =>
                            updateFormat(source, field, {
                              decimal_separator: e.target.value || null,
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        >
                          <option value="">Selecione</option>
                          <option value=".">ponto (.)</option>
                          <option value=",">vírgula (,)</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-500">
                        Separador de milhar
                        <select
                          value={rule?.thousand_separator ?? ''}
                          onChange={(e) =>
                            updateFormat(source, field, {
                              thousand_separator: e.target.value || null,
                            })
                          }
                          className="mt-1 w-full rounded-xl border p-2 text-sm"
                        >
                          <option value="">sem milhar</option>
                          <option value=".">ponto (.)</option>
                          <option value=",">vírgula (,)</option>
                        </select>
                      </label>
                    </>
                  )}
                  <div>
                    <span className="text-xs text-slate-500">Preview</span>
                    <p className="break-all text-sm">
                      {sample == null || sample === ''
                        ? field.allow_null
                          ? 'Sem valor na amostra'
                          : 'Aguardando amostra'
                        : automatic && sample
                          ? new Date(
                              String(sample).length === 10
                                ? `${sample}T00:00:00Z`
                                : String(sample),
                            ).toISOString()
                          : jsonNumberWithTextSeparators
                            ? String(sample)
                            : numeric
                              ? String(numeric.converted)
                              : rule
                                ? 'Formato configurado; amostra não convertível'
                                : 'Configure o formato'}
                    </p>
                    {numeric?.suspicious ? (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        O valor convertido parece muito diferente do valor
                        recebido. Verifique separadores.
                      </p>
                    ) : null}
                    {jsonNumberWithTextSeparators ? (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        Este valor veio como número JSON. Separadores de texto
                        não serão aplicados; eles só valem para valores
                        recebidos como texto.
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <ActionButton action="formats" busy={busy} onClick={saveFormats} />
          </div>
        </Card>
      ) : null}
      {phase === 'sync' ? (
        <Card>
          <h2 className="text-xl font-bold">Sincronização</h2>
          <p className="mt-2 text-sm text-slate-600">
            Esta ação busca dados da fonte e cria um lote em staging.
            Indicadores e dashboards só serão atualizados após validação e
            processamento dos dados tratados. O payload bruto completo será
            preservado para auditoria.
          </p>
          <div className="mt-4">
            <ActionButton
              action="sync"
              busy={busy}
              disabled={!config || mappedCount === 0}
              onClick={sync}
            />
          </div>
          <p className="mt-3 text-sm">
            Automática: {config?.auto_sync_enabled ? 'ativa' : 'inativa'} ·
            Próxima: {config?.next_sync_at ?? '—'}
          </p>
        </Card>
      ) : null}
      {phase === 'done' ? (
        <Card>
          <h2 className="text-xl font-bold">Resultado da sincronização</h2>
          <p className="mt-2 text-sm">
            Última sync: {config?.last_sync_at ?? '—'} · Próxima:{' '}
            {config?.next_sync_at ?? '—'}
          </p>
          <div className="mt-3 space-y-2">
            {runs.slice(0, 8).map((run, index) => (
              <div
                key={run.id}
                className={`rounded-xl border p-3 text-sm ${index === 0 ? 'border-blue-400 bg-blue-50/40' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {index === 0 ? 'Mais recente · ' : 'Histórico · '}
                    {run.sync_type} ·{' '}
                    {new Date(run.created_at).toLocaleString('pt-BR')}
                  </span>
                  <StatusBadge
                    tone={
                      run.status === 'completed'
                        ? 'success'
                        : run.status === 'failed'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {run.status}
                  </StatusBadge>
                </div>
                <p className="mt-2">
                  {run.received_count} recebidos · {run.accepted_count} aceitos
                  · {run.rejected_count} rejeitados · {run.unchanged_count} sem
                  alteração
                </p>
                <p className="mt-1 font-semibold">
                  {run.processed_successfully
                    ? 'Dados tratados processados'
                    : run.latest_normalization_status === 'completed' &&
                        run.accepted_count > 0 &&
                        run.published_current_count === 0
                      ? 'Registros tratados criados, mas ainda não publicados. Verifique chave operacional.'
                      : run.accepted_count === 0 && run.rejected_count === 0
                        ? 'Sem novos registros para processar'
                        : run.needs_revalidation
                          ? 'Este lote precisa ser revalidado antes do processamento tratado.'
                          : 'Dados tratados ainda não processados'}
                </p>
                {run.latest_normalization_status === 'completed' ? (
                  <p className="mt-1 text-slate-600">
                    {run.latest_normalization_created_count} criados ·{' '}
                    {run.latest_normalization_updated_count} atualizados ·{' '}
                    {run.latest_normalization_skipped_count} ignorados ·{' '}
                    {run.latest_normalization_error_count} erros
                    {' · '}
                    {run.published_current_count} publicados ·{' '}
                    {run.not_published_count} não publicados
                  </p>
                ) : null}
                {run.latest_normalization_status === 'completed' &&
                run.accepted_count > 0 &&
                run.not_published_count > 0 &&
                run.published_current_count === 0 ? (
                  <>
                    <p className="mt-2 font-semibold text-amber-800">
                      Os registros foram tratados antes da correção do
                      pareamento. Revalide e reprocesse com as regras atuais.
                    </p>
                    {run.staging_batch_id ? (
                      <button
                        type="button"
                        disabled={processing || busy !== null}
                        onClick={() =>
                          revalidateAndProcess(run.staging_batch_id!)
                        }
                        className="mt-3 mr-2 rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white disabled:bg-slate-300"
                      >
                        {processing
                          ? 'Revalidando e reprocessando...'
                          : 'Revalidar e reprocessar com regras atuais'}
                      </button>
                    ) : null}
                  </>
                ) : null}
                {run.needs_revalidation && run.staging_batch_id ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => revalidate(run.staging_batch_id!)}
                    className="mt-3 mr-2 rounded-xl border border-amber-500 px-4 py-2 font-semibold text-amber-900 disabled:opacity-50"
                  >
                    {busy === 'revalidate'
                      ? 'Revalidando...'
                      : 'Revalidar com regras atuais'}
                  </button>
                ) : null}
                {run.has_processable_records && run.staging_batch_id ? (
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => processAccepted(run.staging_batch_id!)}
                    className="mt-3 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:bg-slate-300"
                  >
                    {processing
                      ? 'Processando...'
                      : run.latest_normalization_status === 'completed' &&
                          run.published_current_count === 0
                        ? 'Reprocessar publicação'
                        : 'Processar dados tratados'}
                  </button>
                ) : null}
                {run.error_message_safe ? (
                  <p className="mt-2 text-rose-700">
                    Erro: {run.error_message_safe}
                  </p>
                ) : null}
                {run.latest_normalization_error_is_stale &&
                !run.processed_successfully ? (
                  <p className="mt-2 text-amber-700">
                    Erro anterior resolvido por revalidação. Processe os dados
                    tratados.
                  </p>
                ) : null}
                {run.latest_normalization_error_message &&
                !run.latest_normalization_error_is_stale ? (
                  <p className="mt-2 text-rose-700">
                    Erro tratado: {run.latest_normalization_error_message}
                  </p>
                ) : null}
                {run.rejected_count > 0 && run.errors.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <p className="font-semibold text-rose-800">
                      Primeiros erros do lote
                    </p>
                    <table className="mt-2 min-w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="pr-3">Linha</th>
                          <th className="pr-3">Campo</th>
                          <th className="pr-3">Código</th>
                          <th>Mensagem</th>
                          <th className="pl-3">Valor recebido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.errors.map((error) => (
                          <tr key={error.id} className="border-t">
                            <td className="py-2 pr-3">
                              {error.row_number ?? '—'}
                            </td>
                            <td className="pr-3">{error.field ?? '—'}</td>
                            <td className="pr-3 font-mono">
                              {error.error_code}
                            </td>
                            <td>{error.message}</td>
                            <td className="pl-3 font-mono">
                              {error.raw_value ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
