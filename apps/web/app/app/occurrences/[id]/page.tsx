'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, SectionHeader, StatusBadge } from '../../../../components/ui';
import { getSessionContext } from '../../../../lib/setup-api';
import {
  addOccurrenceEvent,
  addOperationLink,
  assignOccurrence,
  changeOccurrenceStatus,
  listOccurrenceReasons,
  occurrenceDetail,
  reasonRequirements,
  removeOperationLink,
  type Occurrence,
  type OccurrenceReason,
  type OperationOption,
  type ReasonRequirement,
  occurrenceItemsApi,
  occurrenceFinancialEntriesApi,
  occurrenceDocumentsApi,
  occurrenceAttachmentsApi,
  occurrenceItemLabels,
  occurrenceFinancialTypeLabels,
  occurrenceFinancialStatusLabels,
  occurrenceDocumentLabels,
  occurrenceAttachmentLabels,
  occurrenceEventLabels,
} from '../../../../lib/occurrences-api';
import {
  occurrencePriorityLabel,
  occurrenceStatusLabel,
} from '../../../../lib/occurrence-labels';
import { OperationPicker } from '../operation-picker';
export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<string | null>(null),
    [row, setRow] = useState<Occurrence | null>(null),
    [reasons, setReasons] = useState<OccurrenceReason[]>([]),
    [requirements, setRequirements] = useState<ReasonRequirement[]>([]),
    [event, setEvent] = useState<Record<string, string>>({
      stage: 'update',
      event_type: 'note',
      reason_id: '',
      event_description: '',
    }),
    [owner, setOwner] = useState(''),
    [selectedOperation, setSelectedOperation] =
      useState<OperationOption | null>(null),
    [relationship, setRelationship] = useState('affected'),
    [isPrimary, setIsPrimary] = useState(false),
    [linkError, setLinkError] = useState(''),
    [isLoadingOperations, setIsLoadingOperations] = useState(false),
    [isLinking, setIsLinking] = useState(false),
    [error, setError] = useState(''),
    [eventError, setEventError] = useState(''),
    [isSavingEvent, setIsSavingEvent] = useState(false);
  const load = (t: string) =>
    occurrenceDetail(t, id)
      .then(setRow)
      .catch((e: Error) => setError(e.message));
  const set = (key: string, value: string) =>
    setEvent((v) => ({ ...v, [key]: value }));
  useEffect(() => {
    getSessionContext().then((c) => {
      setTenant(c.tenantId);
      if (c.tenantId) {
        load(c.tenantId);
        listOccurrenceReasons(c.tenantId).then(setReasons);
      }
    });
  }, [id]);
  useEffect(() => {
    if (tenant && event.reason_id)
      reasonRequirements(tenant, event.reason_id, event.stage).then(
        setRequirements,
      );
  }, [tenant, event.reason_id, event.stage]);
  if (!row)
    return (
      <div className="app-page">
        <Card>{error || 'Carregando ocorrência...'}</Card>
      </div>
    );
  return (
    <div className="page-stack app-page">
      <SectionHeader
        eyebrow={row.occurrence_number}
        title={row.title}
        description={row.description ?? 'Sem descrição.'}
      />
      {error && <Card>{error}</Card>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p>Status</p>
          <StatusBadge>{occurrenceStatusLabel(row.current_status)}</StatusBadge>
          <select
            className="mt-3 w-full rounded-lg border p-2"
            value={row.current_status}
            onChange={async (e) => {
              if (tenant) {
                await changeOccurrenceStatus(tenant, id, e.target.value);
                load(tenant);
              }
            }}
          >
            {[
              'open',
              'triage',
              'in_progress',
              'waiting_driver',
              'waiting_customer',
              'waiting_carrier',
              'waiting_approval',
              'waiting_document',
              'waiting_payment',
              'waiting_redelivery',
              'waiting_return',
              'partially_resolved',
              'resolved',
              'closed',
              'canceled',
              'reopened',
            ].map((s) => (
              <option key={s} value={s}>
                {occurrenceStatusLabel(s)}
              </option>
            ))}
          </select>
        </Card>
        <Card>
          <p>Prioridade</p>
          <strong>{occurrencePriorityLabel(row.current_priority)}</strong>
        </Card>
        <Card>
          <p>Responsável</p>
          <strong>{row.current_owner_id ?? 'Não atribuído'}</strong>
          <div className="mt-3 flex">
            <input
              className="min-w-0 flex-1 rounded-l-lg border p-2"
              placeholder="UUID do usuário"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
            <button
              className="rounded-r-lg bg-blue-600 px-3 text-white"
              onClick={async () => {
                if (tenant) {
                  await assignOccurrence(tenant, id, owner || null);
                  setOwner('');
                  load(tenant);
                }
              }}
            >
              Atribuir
            </button>
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="font-bold">Operações tratadas vinculadas</h2>
        <p className="mt-1 text-sm text-slate-600">
          Busque uma operação já tratada pelo sistema por NF, manifesto, pedido,
          entrega, cliente ou código operacional.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <OperationPicker
            tenant={tenant}
            selected={selectedOperation}
            onSelect={setSelectedOperation}
            onLoadingChange={setIsLoadingOperations}
          />
          <select
            className="rounded-lg border p-2"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          >
            <option value="primary">Principal</option>
            <option value="affected">Afetada</option>
            <option value="source">Origem</option>
            <option value="related">Relacionada</option>
            <option value="return">Retorno</option>
            <option value="complementary">Complementar</option>
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />{' '}
            Marcar como principal
          </label>
        </div>
        {linkError && (
          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
            {linkError}
          </p>
        )}
        <button
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          disabled={!selectedOperation?.id || isLoadingOperations || isLinking}
          onClick={async () => {
            if (
              !tenant ||
              !selectedOperation?.id ||
              isLoadingOperations ||
              isLinking
            )
              return;
            setLinkError('');
            setIsLinking(true);
            try {
              await addOperationLink(tenant, id, {
                operation_record_id: selectedOperation.id,
                relationship_type: relationship,
                is_primary: isPrimary,
              });
              setSelectedOperation(null);
              setRelationship('affected');
              setIsPrimary(false);
              await load(tenant);
            } catch (e) {
              setLinkError((e as Error).message);
            } finally {
              setIsLinking(false);
            }
          }}
        >
          {isLinking ? 'Vinculando...' : 'Vincular operação'}
        </button>
        {row.operation_links?.length ? (
          <ul className="mt-4 space-y-2">
            {row.operation_links.map((l) => (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border p-2"
                key={l.id}
              >
                <span>
                  {l.is_primary ? 'Principal · ' : ''}
                  {l.operation_record_id} · {l.relationship_type}
                </span>
                <button
                  className="text-sm text-red-700 underline"
                  onClick={async () => {
                    if (!tenant) return;
                    setLinkError('');
                    try {
                      await removeOperationLink(tenant, id, l.id);
                      await load(tenant);
                    } catch (e) {
                      setLinkError((e as Error).message);
                    }
                  }}
                >
                  Remover vínculo
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-slate-500">Nenhuma operação vinculada.</p>
        )}
      </Card>
      <Card>
        <h2 className="font-bold">Adicionar evento guiado</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <select
            className="rounded-lg border p-2"
            value={event.stage}
            onChange={(e) => set('stage', e.target.value)}
          >
            <option value="update">Atualização</option>
            <option value="resolution">Resolução</option>
            <option value="closing">Fechamento</option>
          </select>
          <select
            className="rounded-lg border p-2"
            value={event.reason_id}
            onChange={(e) => set('reason_id', e.target.value)}
          >
            <option value="">Selecione o motivo</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border p-2"
            value={event.event_description}
            onChange={(e) => set('event_description', e.target.value)}
            placeholder="Descrição do evento"
          />
          {requirements
            .filter((r) => r.field_key !== 'event_description')
            .map((r) => (
              <input
                key={r.field_key}
                className="rounded-lg border p-2"
                type={
                  r.field_key.includes('date') || r.field_key === 'occurred_at'
                    ? 'datetime-local'
                    : 'text'
                }
                placeholder={`${r.field_key} *`}
                value={event[r.field_key] ?? ''}
                onChange={(e) => set(r.field_key, e.target.value)}
              />
            ))}
        </div>
        {eventError && (
          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
            {eventError}
          </p>
        )}
        <button
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSavingEvent}
          onClick={async () => {
            if (!tenant || isSavingEvent) return;
            setEventError('');
            setIsSavingEvent(true);
            try {
              await addOccurrenceEvent(tenant, id, event);
              setEvent({
                stage: 'update',
                event_type: 'note',
                reason_id: '',
                event_description: '',
              });
              setRequirements([]);
              await load(tenant);
            } catch (e) {
              setEventError((e as Error).message);
            } finally {
              setIsSavingEvent(false);
            }
          }}
        >
          {isSavingEvent ? 'Registrando...' : 'Registrar'}
        </button>
      </Card>
      <StructuredRecords
        title="Itens envolvidos"
        tenant={tenant}
        occurrence={id}
        rows={row.items ?? []}
        api={occurrenceItemsApi}
        typeKey="item_type"
        labels={occurrenceItemLabels}
        fields={[
          ['sku', 'SKU', 'text'],
          ['product_name', 'Produto', 'text'],
          ['quantity', 'Quantidade', 'number'],
          ['unit', 'Unidade', 'text'],
          ['amount', 'Valor', 'number'],
          ['notes', 'Observação', 'text'],
        ]}
        onChange={() => tenant && load(tenant)}
      />
      <StructuredRecords
        title="Valores e despesas"
        tenant={tenant}
        occurrence={id}
        rows={row.financial_entries ?? []}
        api={occurrenceFinancialEntriesApi}
        typeKey="entry_type"
        labels={occurrenceFinancialTypeLabels}
        fields={[
          ['status', 'Status', 'select', occurrenceFinancialStatusLabels],
          ['amount', 'Valor', 'number'],
          ['description', 'Descrição', 'text'],
          ['due_at', 'Vencimento', 'datetime-local'],
          ['notes', 'Observação', 'text'],
        ]}
        onChange={() => tenant && load(tenant)}
      />
      <StructuredRecords
        title="Documentos"
        tenant={tenant}
        occurrence={id}
        rows={row.documents ?? []}
        api={occurrenceDocumentsApi}
        typeKey="document_type"
        labels={occurrenceDocumentLabels}
        fields={[
          ['document_number', 'Número', 'text'],
          ['document_key', 'Chave', 'text'],
          ['amount', 'Valor', 'number'],
          ['issued_at', 'Emissão', 'datetime-local'],
          ['external_url', 'URL/path opcional', 'text'],
          ['notes', 'Observação', 'text'],
        ]}
        onChange={() => tenant && load(tenant)}
      />
      <StructuredRecords
        title="Evidências"
        tenant={tenant}
        occurrence={id}
        rows={row.attachments ?? []}
        api={occurrenceAttachmentsApi}
        typeKey="attachment_type"
        labels={occurrenceAttachmentLabels}
        fields={[
          ['file_name', 'Nome do arquivo', 'text'],
          ['external_url', 'URL/path opcional', 'text'],
          ['description', 'Descrição', 'text'],
        ]}
        onChange={() => tenant && load(tenant)}
      />
      <Card>
        <h2 className="font-bold">Timeline</h2>
        <ol className="mt-4 border-l-2 border-blue-200 pl-5">
          {row.events?.map((e) => (
            <li className="mb-5" key={e.id}>
              <p className="font-semibold">
                {occurrenceEventLabels[e.event_type] ??
                  e.event_title ??
                  e.event_type}
              </p>
              <p className="text-sm text-slate-600">
                {e.event_description ??
                  (e.old_status && e.new_status
                    ? `${occurrenceStatusLabel(e.old_status)} → ${occurrenceStatusLabel(e.new_status)}`
                    : 'Sem descrição')}
              </p>
              <time className="text-xs text-slate-400">
                {new Date(e.event_at).toLocaleString('pt-BR')}
              </time>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

type RecordsApi = {
  create: (
    t: string,
    o: string,
    p: Record<string, unknown>,
  ) => Promise<unknown>;
  remove: (t: string, o: string, id: string) => Promise<unknown>;
};
type Field = [string, string, string, Record<string, string>?];
function StructuredRecords({
  title,
  tenant,
  occurrence,
  rows,
  api,
  typeKey,
  labels,
  fields,
  onChange,
}: {
  title: string;
  tenant: string | null;
  occurrence: string;
  rows: Array<Record<string, unknown> & { id: string }>;
  api: RecordsApi;
  typeKey: string;
  labels: Record<string, string>;
  fields: Field[];
  onChange: () => void;
}) {
  const first = Object.keys(labels)[0],
    [form, setForm] = useState<Record<string, string>>({ [typeKey]: first }),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [removing, setRemoving] = useState('');
  const change = (k: string, v: string) => setForm((x) => ({ ...x, [k]: v }));
  return (
    <Card>
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <select
          className="rounded-lg border p-2"
          value={form[typeKey]}
          onChange={(e) => change(typeKey, e.target.value)}
        >
          {Object.entries(labels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {fields.map(([key, label, type, options]) =>
          options ? (
            <select
              key={key}
              className="rounded-lg border p-2"
              value={form[key] ?? Object.keys(options)[0]}
              onChange={(e) => change(key, e.target.value)}
            >
              {Object.entries(options).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={key}
              className="rounded-lg border p-2"
              type={type}
              min={type === 'number' ? 0 : undefined}
              step={type === 'number' ? 'any' : undefined}
              placeholder={label}
              value={form[key] ?? ''}
              onChange={(e) => change(key, e.target.value)}
            />
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={saving}
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        onClick={async () => {
          if (!tenant || saving) return;
          setError('');
          setSaving(true);
          try {
            const payload = Object.fromEntries(
              Object.entries(form)
                .filter(([, v]) => v !== '')
                .map(([k, v]) => [
                  k,
                  fields.some(([fk, , ft]) => fk === k && ft === 'number')
                    ? Number(v)
                    : v,
                ]),
            );
            await api.create(tenant, occurrence, payload);
            setForm({ [typeKey]: first });
            onChange();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Adicionando...' : 'Adicionar'}
      </button>
      {rows.length ? (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex justify-between gap-3 rounded-lg border p-3"
            >
              <span>
                <strong>
                  {labels[String(r[typeKey])] ?? String(r[typeKey])}
                </strong>{' '}
                ·{' '}
                {fields
                  .map(([k]) => r[k])
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <button
                disabled={removing === r.id}
                className="text-sm text-red-700 disabled:opacity-60"
                onClick={async () => {
                  if (!tenant) return;
                  setError('');
                  setRemoving(r.id);
                  try {
                    await api.remove(tenant, occurrence, r.id);
                    onChange();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setRemoving('');
                  }
                }}
              >
                {removing === r.id ? 'Removendo...' : 'Remover'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Nenhum registro.</p>
      )}
    </Card>
  );
}
