'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, SectionHeader, StatusBadge } from '../../../../components/ui';
import { getSessionContext } from '../../../../lib/setup-api';
import {
  addOccurrenceEvent,
  addOperationLink,
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
  occurrenceTreatmentsApi,
  occurrencePendingActionsApi,
  occurrenceTreatmentTypeLabels,
  occurrenceTreatmentStatusLabels,
  occurrencePendingStatusLabels,
  occurrenceSlaLabels,
  updateOccurrenceSla,
  resolveOccurrence,
  closeOccurrence,
} from '../../../../lib/occurrences-api';
import {
  occurrencePriorityLabel,
  occurrenceStatusLabel,
} from '../../../../lib/occurrence-labels';
import { OperationPicker } from '../operation-picker';
import {
  formatCurrencyBRL,
  formatDateTimeBR,
  safeLinkLabel,
  shortId,
} from '../../../../lib/occurrence-formatters';
import { OccurrenceActionModal } from './OccurrenceActionModal';
import { OccurrenceTimelineDrawer } from './OccurrenceTimelineDrawer';

const relationshipLabels: Record<string, string> = {
  primary: 'Principal',
  affected: 'Afetada',
  source: 'Origem',
  related: 'Relacionada',
  return: 'Retorno',
  complementary: 'Complementar',
};
const availableStatuses = [
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
  'canceled',
  'reopened',
];
type ModalName =
  | 'operation'
  | 'status'
  | 'treatments'
  | 'pending'
  | 'items'
  | 'financial'
  | 'documents'
  | 'event'
  | null;

function operationLinkLabel(
  link: NonNullable<Occurrence['operation_links']>[number],
) {
  const snapshot = link.snapshot ?? {};
  const reference = [
    snapshot.label,
    snapshot.operation_label,
    snapshot.document_number,
    snapshot.invoice_number,
    snapshot.external_code,
  ].find((value) => typeof value === 'string' && value.trim());
  return reference
    ? String(reference)
    : `Operação ${shortId(link.operation_record_id)}`;
}
function friendlyStatusError(
  message: string,
  action: 'status' | 'resolve' = 'status',
) {
  if (message.includes('Invalid status transition')) {
    return action === 'resolve'
      ? 'Esta ocorrência ainda não pode ser resolvida neste status. Coloque em andamento antes de resolver.'
      : 'Não foi possível alterar para esse status. Para resolver a ocorrência, use o botão Resolver ocorrência. Para fechar, use o botão Fechar ocorrência.';
  }
  return message;
}

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<string | null>(null),
    [row, setRow] = useState<Occurrence | null>(null),
    [reasons, setReasons] = useState<OccurrenceReason[]>([]),
    [requirements, setRequirements] = useState<ReasonRequirement[]>([]);
  const [event, setEvent] = useState<Record<string, string>>({
    stage: 'update',
    event_type: 'note',
    reason_id: '',
    event_description: '',
  });
  const [selectedOperation, setSelectedOperation] =
      useState<OperationOption | null>(null),
    [relationship, setRelationship] = useState('affected'),
    [isPrimary, setIsPrimary] = useState(false);
  const [linkError, setLinkError] = useState(''),
    [isLoadingOperations, setIsLoadingOperations] = useState(false),
    [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState(''),
    [eventError, setEventError] = useState(''),
    [isSavingEvent, setIsSavingEvent] = useState(false),
    [modal, setModal] = useState<ModalName>(null),
    [timelineOpen, setTimelineOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState(''),
    [statusSaving, setStatusSaving] = useState(false),
    [statusError, setStatusError] = useState('');
  const load = (t: string) =>
    occurrenceDetail(t, id)
      .then(setRow)
      .catch((e: Error) => setError(e.message));
  const setEventValue = (key: string, value: string) =>
    setEvent((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    getSessionContext().then((context) => {
      setTenant(context.tenantId);
      if (context.tenantId) {
        load(context.tenantId);
        listOccurrenceReasons(context.tenantId).then(setReasons);
      }
    });
  }, [id]);
  useEffect(() => {
    if (tenant && event.reason_id)
      reasonRequirements(tenant, event.reason_id, event.stage).then(
        setRequirements,
      );
  }, [tenant, event.reason_id, event.stage]);
  useEffect(() => {
    if (row) setNextStatus(row.current_status);
  }, [row]);
  if (!row)
    return (
      <div className="app-page">
        <Card>{error || 'Carregando ocorrência...'}</Card>
      </div>
    );
  const primaryOperation = row.operation_links?.find(
    (link) => link.is_primary || link.relationship_type === 'primary',
  );
  const openPending = (row.pending_actions ?? []).filter((item) =>
    ['open', 'in_progress'].includes(item.status),
  ).length;
  const actionButton =
    'rounded-xl border border-slate-200 bg-white p-4 text-left font-semibold shadow-sm transition hover:border-blue-300 hover:bg-blue-50';
  return (
    <div className="page-stack app-page">
      <SectionHeader
        eyebrow={row.occurrence_number}
        title={row.title}
        description={row.description ?? 'Sem descrição.'}
      />
      {error && (
        <Card>
          <p className="text-red-700" role="alert">
            {error}
          </p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">Status</p>
          <StatusBadge>{occurrenceStatusLabel(row.current_status)}</StatusBadge>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Prioridade</p>
          <strong>{occurrencePriorityLabel(row.current_priority)}</strong>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Responsável</p>
          <strong>{row.current_owner_id ?? 'Não atribuído'}</strong>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">SLA</p>
          <strong>
            {occurrenceSlaLabels[row.sla_status ?? 'not_started']}
          </strong>
          <p className="text-sm text-slate-600">
            {row.due_at ? formatDateTimeBR(row.due_at) : 'Prazo não definido'}
          </p>
        </Card>
      </div>
      <Card>
        <h2 className="font-bold">Operação principal vinculada</h2>
        <p className="mt-2 text-slate-700">
          {primaryOperation
            ? `${operationLinkLabel(primaryOperation)} · Principal`
            : 'Nenhuma operação vinculada.'}
        </p>
      </Card>
      <section>
        <h2 className="mb-3 text-lg font-bold">Ações rápidas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            className={actionButton}
            onClick={() => setModal('operation')}
          >
            Vincular operação
          </button>
          <button className={actionButton} onClick={() => setModal('status')}>
            Alterar status
          </button>
          <button
            className={actionButton}
            onClick={() => setModal('treatments')}
          >
            Tratativas
          </button>
          <button className={actionButton} onClick={() => setModal('pending')}>
            Pendências {openPending ? `(${openPending})` : ''}
          </button>
          <button className={actionButton} onClick={() => setModal('items')}>
            Itens envolvidos
          </button>
          <button
            className={actionButton}
            onClick={() => setModal('financial')}
          >
            Valores/despesas
          </button>
          <button
            className={actionButton}
            onClick={() => setModal('documents')}
          >
            Documentos e evidências
          </button>
          <button className={actionButton} onClick={() => setModal('event')}>
            Evento manual
          </button>
        </div>
      </section>
      <SlaClosure
        tenant={tenant}
        occurrence={id}
        row={row}
        onChange={() => tenant && load(tenant)}
      />
      <button
        className="w-fit rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700"
        onClick={() => setTimelineOpen(true)}
      >
        Ver timeline
      </button>

      <OccurrenceActionModal
        title="Operação vinculada"
        open={modal === 'operation'}
        onClose={() => setModal(null)}
      >
        <p className="text-sm text-slate-600">
          Busque uma operação tratada por NF, manifesto, pedido, entrega,
          cliente ou código operacional.
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
            {Object.entries(relationshipLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
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
          <p className="mt-3 text-sm text-red-700" role="alert">
            {linkError}
          </p>
        )}
        <button
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          disabled={!selectedOperation?.id || isLoadingOperations || isLinking}
          onClick={async () => {
            if (!tenant || !selectedOperation?.id || isLinking) return;
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
            {row.operation_links.map((link) => (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border p-2"
                key={link.id}
              >
                <span>
                  {operationLinkLabel(link)} ·{' '}
                  {relationshipLabels[link.relationship_type] ??
                    link.relationship_type}
                  {link.is_primary && link.relationship_type !== 'primary'
                    ? ' · Principal'
                    : ''}
                </span>
                <button
                  className="text-sm text-red-700 underline"
                  onClick={async () => {
                    if (!tenant) return;
                    setLinkError('');
                    try {
                      await removeOperationLink(tenant, id, link.id);
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
          <p className="mt-3 text-slate-500">Nenhuma operação vinculada.</p>
        )}
      </OccurrenceActionModal>

      <OccurrenceActionModal
        title="Alterar status"
        open={modal === 'status'}
        onClose={() => setModal(null)}
      >
        <p className="text-sm">
          Status atual:{' '}
          <strong>{occurrenceStatusLabel(row.current_status)}</strong>
        </p>
        <label className="mt-4 block text-sm font-medium">Próximo status</label>
        <select
          className="mt-1 w-full rounded-lg border p-2"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value)}
        >
          {availableStatuses.map((status) => (
            <option key={status} value={status}>
              {occurrenceStatusLabel(status)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-slate-600">
          Para resolver a ocorrência, use o botão Resolver ocorrência. Para
          fechar, use o botão Fechar ocorrência.
        </p>
        {statusError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {statusError}
          </p>
        )}
        <button
          disabled={statusSaving || nextStatus === row.current_status}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          onClick={async () => {
            if (!tenant) return;
            setStatusSaving(true);
            setStatusError('');
            try {
              await changeOccurrenceStatus(tenant, id, nextStatus);
              await load(tenant);
              setModal(null);
            } catch (e) {
              setStatusError(friendlyStatusError((e as Error).message));
            } finally {
              setStatusSaving(false);
            }
          }}
        >
          {statusSaving ? 'Alterando...' : 'Confirmar'}
        </button>
      </OccurrenceActionModal>

      <OccurrenceActionModal
        title="Tratativas"
        open={modal === 'treatments'}
        onClose={() => setModal(null)}
      >
        <OperationalRecords
          title="Tratativas"
          tenant={tenant}
          occurrence={id}
          rows={row.treatments ?? []}
          api={occurrenceTreatmentsApi}
          labels={occurrenceTreatmentTypeLabels}
          statusLabels={occurrenceTreatmentStatusLabels}
          typeKey="treatment_type"
          mainKey="description"
          onChange={() => tenant && load(tenant)}
        />
      </OccurrenceActionModal>
      <OccurrenceActionModal
        title="Pendências"
        open={modal === 'pending'}
        onClose={() => setModal(null)}
      >
        <OperationalRecords
          title="Pendências"
          tenant={tenant}
          occurrence={id}
          rows={row.pending_actions ?? []}
          api={occurrencePendingActionsApi}
          labels={{ pending: 'Pendência' }}
          statusLabels={occurrencePendingStatusLabels}
          typeKey="kind"
          mainKey="title"
          pending
          onChange={() => tenant && load(tenant)}
        />
      </OccurrenceActionModal>
      <OccurrenceActionModal
        title="Itens envolvidos"
        open={modal === 'items'}
        onClose={() => setModal(null)}
      >
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
      </OccurrenceActionModal>
      <OccurrenceActionModal
        title="Valores e despesas"
        open={modal === 'financial'}
        onClose={() => setModal(null)}
      >
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
          display="financial"
        />
      </OccurrenceActionModal>
      <OccurrenceActionModal
        title="Documentos e evidências"
        open={modal === 'documents'}
        onClose={() => setModal(null)}
      >
        <div className="space-y-6">
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
            display="document"
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
            display="evidence"
          />
        </div>
      </OccurrenceActionModal>
      <OccurrenceActionModal
        title="Registrar evento"
        open={modal === 'event'}
        onClose={() => setModal(null)}
      >
        <div className="grid gap-2 md:grid-cols-3">
          <select
            className="rounded-lg border p-2"
            value={event.stage}
            onChange={(e) => setEventValue('stage', e.target.value)}
          >
            <option value="update">Atualização</option>
            <option value="resolution">Resolução</option>
            <option value="closing">Fechamento</option>
          </select>
          <select
            className="rounded-lg border p-2"
            value={event.reason_id}
            onChange={(e) => setEventValue('reason_id', e.target.value)}
          >
            <option value="">Selecione o motivo</option>
            {reasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border p-2"
            value={event.event_description}
            onChange={(e) => setEventValue('event_description', e.target.value)}
            placeholder="Descrição do evento"
          />
          {requirements
            .filter(
              (requirement) => requirement.field_key !== 'event_description',
            )
            .map((requirement) => (
              <input
                key={requirement.field_key}
                className="rounded-lg border p-2"
                type={
                  requirement.field_key.includes('date') ||
                  requirement.field_key === 'occurred_at'
                    ? 'datetime-local'
                    : 'text'
                }
                placeholder={`${requirement.field_key} *`}
                value={event[requirement.field_key] ?? ''}
                onChange={(e) =>
                  setEventValue(requirement.field_key, e.target.value)
                }
              />
            ))}
        </div>
        {eventError && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {eventError}
          </p>
        )}
        <button
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
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
      </OccurrenceActionModal>
      <OccurrenceTimelineDrawer
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        events={row.events ?? []}
      />
    </div>
  );
}

function OperationalRecords({
  title,
  tenant,
  occurrence,
  rows,
  api,
  labels,
  statusLabels,
  typeKey,
  mainKey,
  pending = false,
  onChange,
}: {
  title: string;
  tenant: string | null;
  occurrence: string;
  rows: Array<Record<string, unknown> & { id: string }>;
  api: RecordsApi & {
    update: (
      t: string,
      o: string,
      id: string,
      p: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  labels: Record<string, string>;
  statusLabels: Record<string, string>;
  typeKey: string;
  mainKey: string;
  pending?: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
      [typeKey]: Object.keys(labels)[0],
      [mainKey]: '',
      description: '',
      responsible_team: '',
      due_at: '',
    }),
    [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Card>
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {!pending && (
          <select
            className="rounded-lg border p-2"
            value={form[typeKey]}
            onChange={(e) => setForm({ ...form, [typeKey]: e.target.value })}
          >
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <input
          className="rounded-lg border p-2"
          placeholder={pending ? 'Título' : 'Descrição'}
          value={form[mainKey]}
          onChange={(e) => setForm({ ...form, [mainKey]: e.target.value })}
        />
        {pending && (
          <input
            className="rounded-lg border p-2"
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        )}
        <input
          className="rounded-lg border p-2"
          placeholder="Equipe responsável"
          value={form.responsible_team}
          onChange={(e) =>
            setForm({ ...form, responsible_team: e.target.value })
          }
        />
        {pending && (
          <input
            className="rounded-lg border p-2"
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm({ ...form, due_at: e.target.value })}
          />
        )}
      </div>
      <button
        className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-white"
        onClick={() =>
          tenant &&
          run(() =>
            api.create(
              tenant,
              occurrence,
              pending
                ? {
                    title: form.title,
                    description: form.description,
                    responsible_team: form.responsible_team,
                    due_at: form.due_at || undefined,
                  }
                : {
                    treatment_type: form.treatment_type,
                    description: form.description,
                    responsible_team: form.responsible_team,
                  },
            ),
          )
        }
      >
        Adicionar
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-lg border p-2"
          >
            <span>
              <strong>{String(r[mainKey])}</strong> ·{' '}
              {String(r.responsible_team || 'Sem equipe')} ·{' '}
              {statusLabels[String(r.status)] ?? String(r.status)}
              {pending && r.due_at
                ? ` · ${formatDateTimeBR(String(r.due_at))}`
                : ''}
            </span>
            <span className="flex gap-2">
              {r.status !== 'done' && (
                <button
                  className="text-blue-700 underline"
                  onClick={() =>
                    tenant &&
                    run(() =>
                      api.update(tenant, occurrence, r.id, { status: 'done' }),
                    )
                  }
                >
                  Concluir
                </button>
              )}
              <button
                className="text-red-700 underline"
                onClick={() =>
                  tenant && run(() => api.remove(tenant, occurrence, r.id))
                }
              >
                Remover
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
function SlaClosure({
  tenant,
  occurrence,
  row,
  onChange,
}: {
  tenant: string | null;
  occurrence: string;
  row: Occurrence;
  onChange: () => void;
}) {
  const [due, setDue] = useState(row.due_at?.slice(0, 16) ?? ''),
    [sla, setSla] = useState(row.sla_status ?? 'not_started'),
    [summary, setSummary] = useState(''),
    [reason, setReason] = useState(''),
    [notes, setNotes] = useState(''),
    [force, setForce] = useState(false),
    [error, setError] = useState(''),
    [saving, setSaving] = useState<'sla' | 'resolve' | 'close' | null>(null);
  useEffect(() => {
    setDue(row.due_at?.slice(0, 16) ?? '');
    setSla(row.sla_status ?? 'not_started');
    setSummary(row.resolution_summary ?? '');
    setReason(row.closed_reason ?? '');
    setNotes(row.closed_notes ?? '');
  }, [
    row.due_at,
    row.sla_status,
    row.resolution_summary,
    row.closed_reason,
    row.closed_notes,
  ]);
  const open = (row.pending_actions ?? []).some((x) =>
    ['open', 'in_progress'].includes(x.status),
  );
  const canResolve = ![
    'open',
    'triage',
    'resolved',
    'closed',
    'canceled',
  ].includes(row.current_status);
  const run = async (
    action: 'sla' | 'resolve' | 'close',
    fn: () => Promise<unknown>,
  ) => {
    setError('');
    setSaving(action);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(
        action === 'resolve'
          ? friendlyStatusError((e as Error).message, 'resolve')
          : friendlyStatusError((e as Error).message),
      );
    } finally {
      setSaving(null);
    }
  };
  return (
    <Card>
      <h2 className="font-bold">SLA e fechamento</h2>
      <p className="mt-2 text-sm">
        Prazo atual:{' '}
        {row.due_at ? formatDateTimeBR(row.due_at) : 'Não definido'} · SLA:{' '}
        {occurrenceSlaLabels[row.sla_status ?? 'not_started']}
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <input
          className="rounded-lg border p-2"
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <select
          className="rounded-lg border p-2"
          value={sla}
          onChange={(e) => setSla(e.target.value)}
        >
          {Object.entries(occurrenceSlaLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          disabled={saving !== null}
          className="rounded-lg bg-blue-600 p-2 text-white disabled:opacity-60"
          onClick={() =>
            tenant &&
            run('sla', () =>
              updateOccurrenceSla(tenant, occurrence, {
                due_at: due || null,
                sla_status: sla,
              }),
            )
          }
        >
          {saving === 'sla' ? 'Atualizando...' : 'Atualizar SLA'}
        </button>
        <input
          className="rounded-lg border p-2"
          placeholder="Resumo de resolução"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <button
          disabled={!canResolve || saving !== null}
          className="rounded-lg bg-emerald-600 p-2 text-white disabled:opacity-60"
          onClick={() =>
            tenant &&
            run('resolve', () => resolveOccurrence(tenant, occurrence, summary))
          }
        >
          {saving === 'resolve' ? 'Resolvendo...' : 'Resolver ocorrência'}
        </button>
        {!canResolve && (
          <p className="text-sm text-amber-700 md:col-span-3">
            Coloque a ocorrência em andamento antes de resolver.
          </p>
        )}
        <input
          className="rounded-lg border p-2"
          placeholder="Motivo de fechamento"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <input
          className="rounded-lg border p-2"
          placeholder="Observação de fechamento"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {open && (
          <label className="flex items-center gap-2 text-sm text-amber-700 md:col-span-3">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Existem pendências abertas. Conclua as pendências ou marque
            fechamento forçado.
          </label>
        )}
        <button
          disabled={saving !== null || (open && !force)}
          className="rounded-lg bg-slate-800 p-2 text-white disabled:opacity-60"
          onClick={() =>
            tenant &&
            run('close', () =>
              closeOccurrence(tenant, occurrence, {
                closed_reason: reason,
                closed_notes: notes,
                force_close_with_pending: force,
              }),
            )
          }
        >
          {saving === 'close' ? 'Fechando...' : 'Fechar ocorrência'}
        </button>
      </div>
      <div className="mt-3 text-sm">
        <p>Resumo: {row.resolution_summary ?? '—'}</p>
        <p>
          Motivo: {row.closed_reason ?? '—'} · Observação:{' '}
          {row.closed_notes ?? '—'}
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Card>
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
  display = 'default',
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
  display?: 'default' | 'financial' | 'document' | 'evidence';
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
              <RecordSummary
                row={r}
                typeKey={typeKey}
                labels={labels}
                fields={fields}
                display={display}
              />
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

function RecordSummary({
  row,
  typeKey,
  labels,
  fields,
  display,
}: {
  row: Record<string, unknown>;
  typeKey: string;
  labels: Record<string, string>;
  fields: Field[];
  display: 'default' | 'financial' | 'document' | 'evidence';
}) {
  const typeLabel = labels[String(row[typeKey])] ?? String(row[typeKey]);
  const detail = (label: string, value: unknown) =>
    value ? (
      <p className="break-words text-sm text-slate-600">
        <span className="font-medium text-slate-700">{label}:</span>{' '}
        {String(value)}
      </p>
    ) : null;
  const link =
    typeof row.external_url === 'string' && row.external_url
      ? row.external_url
      : typeof row.storage_path === 'string' && row.storage_path
        ? row.storage_path
        : null;

  if (display === 'financial')
    return (
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-slate-900">
          {typeLabel} ·{' '}
          {occurrenceFinancialStatusLabels[
            String(row.status) as keyof typeof occurrenceFinancialStatusLabels
          ] ?? String(row.status)}{' '}
          · {formatCurrencyBRL(row.amount)}
        </p>
        {detail('Descrição', row.description)}
        {row.due_at ? detail('Vencimento', formatDateTimeBR(row.due_at)) : null}
        {detail('Observação', row.notes)}
      </div>
    );

  if (display === 'document' || display === 'evidence')
    return (
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-slate-900">{typeLabel}</p>
        {display === 'document' && detail('Número', row.document_number)}
        {display === 'document' && detail('Chave', row.document_key)}
        {display === 'document' && row.amount != null
          ? detail('Valor', formatCurrencyBRL(row.amount))
          : null}
        {display === 'document' && row.issued_at
          ? detail('Emissão', formatDateTimeBR(row.issued_at))
          : null}
        {display === 'evidence' && detail('Arquivo', row.file_name)}
        {display === 'evidence' && detail('Descrição', row.description)}
        {display === 'document' && detail('Observação', row.notes)}
        {link && (
          <a
            className="inline-block text-sm font-medium text-blue-700 underline"
            href={link}
            {...(row.external_url
              ? { target: '_blank', rel: 'noreferrer' }
              : {})}
          >
            {safeLinkLabel(display)}
          </a>
        )}
      </div>
    );

  return (
    <span className="min-w-0 break-words">
      <strong>{typeLabel}</strong> ·{' '}
      {fields
        .map(([key]) => row[key])
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}
