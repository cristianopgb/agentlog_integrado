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
        <h2 className="font-bold">Operações vinculadas</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <OperationPicker
            tenant={tenant}
            selected={selectedOperation}
            onSelect={setSelectedOperation}
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
          disabled={!selectedOperation || isLinking}
          onClick={async () => {
            if (!tenant || !selectedOperation || isLinking) return;
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
      <Card>
        <h2 className="font-bold">Timeline</h2>
        <ol className="mt-4 border-l-2 border-blue-200 pl-5">
          {row.events?.map((e) => (
            <li className="mb-5" key={e.id}>
              <p className="font-semibold">{e.event_title ?? e.event_type}</p>
              <p className="text-sm text-slate-600">
                {e.event_description ??
                  (e.old_status && e.new_status
                    ? `${e.old_status} → ${e.new_status}`
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
