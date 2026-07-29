'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
} from '../../lib/api-connector-api';
import type { DataContractField } from '../../lib/data-contracts-api';
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
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm:ss.SSS',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'DD/MM/YYYY',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY HH:mm:ss',
  'MM/DD/YYYY',
  'MM/DD/YYYY HH:mm',
  'MM/DD/YYYY HH:mm:ss',
];
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
}: {
  tenantId: string;
  sourceId: string;
  fields: DataContractField[];
}) {
  const [phase, setPhase] = useState<Phase>('connection');
  const [config, setConfig] = useState<ApiConnectorConfig | null>(null);
  const [runs, setRuns] = useState<ApiSyncRun[]>([]);
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
    const [current, history, mappings, values, formats] = await Promise.all([
      getApiConfig(tenantId, sourceId),
      listApiRuns(tenantId, sourceId),
      listApiFieldMappings(tenantId, sourceId),
      listValueMappings(tenantId, sourceId),
      listFieldParseRules(tenantId, sourceId),
    ]);
    setConfig(current);
    setRuns(history);
    setDraft(
      Object.fromEntries(
        mappings.map((mapping) => [
          mapping.api_source_field_name,
          mapping.data_contract_field_id,
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
          rule,
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
  const missingRequired = fields.filter(
    (field) => field.is_required && !Object.values(draft).includes(field.id),
  );
  const confirmMappings = () =>
    act('mapping', async () => {
      await saveApiFieldMappings(
        tenantId,
        sourceId,
        Object.entries(draft)
          .filter(([, target]) => target)
          .map(([source_field_name, data_contract_field_id]) => ({
            source_field_name,
            data_contract_field_id,
          })),
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
              Campos detectados na amostra recebida.
            </p>
            <div className="mt-4 space-y-3">
              {detected.map((source) => {
                const value = sampleValue(source);
                return (
                  <div key={source} className="rounded-2xl border p-3">
                    <div className="flex justify-between gap-2">
                      <StatusBadge>
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
                  </div>
                );
              })}
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
              {detected.map((source) => {
                const duplicate = Boolean(
                  draft[source] && duplicates.has(draft[source]),
                );
                return (
                  <label
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
                    <select
                      value={draft[source] ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [source]: event.target.value,
                        }))
                      }
                      className="mt-3 w-full rounded-xl border p-2"
                    >
                      <option value="">Não parear</option>
                      {fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.field_key}
                          {field.is_required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                    {duplicate ? (
                      <p className="mt-2 text-xs font-semibold text-rose-700">
                        Erro: este campo nativo já recebe outro campo da API.
                      </p>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Preview / Sincronização</h2>
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
            <div className="mt-4 rounded-2xl border p-3 text-sm">
              <p className="font-semibold">Resumo da amostra</p>
              <p className="mt-1 text-slate-600">
                {sampleRows.length} registro(s) disponíveis para preview.
              </p>
            </div>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Pendências de qualidade</p>
              <p className="mt-1">
                {missingRequired.length
                  ? `${missingRequired.length} campo(s) nativo(s) obrigatório(s) ainda não pareado(s): ${missingRequired.map((field) => field.field_key).join(', ')}. Isso não bloqueia a sincronização.`
                  : 'Nenhuma pendência de completude.'}
              </p>
            </div>
            {duplicates.size ? (
              <p className="mt-3 text-sm font-semibold text-rose-700">
                Corrija os pareamentos duplicados antes de confirmar.
              </p>
            ) : null}
            <div className="mt-4">
              <ActionButton
                action="mapping"
                busy={busy}
                disabled={!detected.length || duplicates.size > 0}
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
                          <option value="">Somente ISO automático</option>
                          {dateFormats.map((format) => (
                            <option key={format}>{format}</option>
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
                      {automatic && sample
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
                    : run.accepted_count === 0 && run.rejected_count === 0
                      ? 'Sem novos registros para processar'
                      : run.needs_revalidation
                        ? 'Este lote precisa ser revalidado antes do processamento tratado.'
                        : 'Dados tratados ainda não processados'}
                </p>
                {run.processed_successfully ? (
                  <p className="mt-1 text-slate-600">
                    {run.latest_normalization_created_count} criados ·{' '}
                    {run.latest_normalization_updated_count} atualizados ·{' '}
                    {run.latest_normalization_skipped_count} ignorados ·{' '}
                    {run.latest_normalization_error_count} erros
                  </p>
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
                    {processing ? 'Processando...' : 'Processar dados tratados'}
                  </button>
                ) : null}
                {run.error_message_safe ? (
                  <p className="mt-2 text-rose-700">
                    Erro: {run.error_message_safe}
                  </p>
                ) : null}
                {run.latest_normalization_error_message ? (
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
