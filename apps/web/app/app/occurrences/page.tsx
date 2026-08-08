'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
} from '../../../components/ui';
import { getSessionContext } from '../../../lib/setup-api';
import {
  createOccurrence,
  listOccurrenceReasons,
  listOccurrences,
  reasonRequirements,
  type Occurrence,
  type OccurrenceReason,
  type OperationOption,
  type ReasonRequirement,
} from '../../../lib/occurrences-api';
import {
  occurrencePriorityLabel,
  occurrenceStatusLabel,
} from '../../../lib/occurrence-labels';
import { OperationPicker } from './operation-picker';
const date = (v: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(v));
export default function OccurrencesPage() {
  const [tenant, setTenant] = useState<string | null>(null),
    [rows, setRows] = useState<Occurrence[]>([]),
    [reasons, setReasons] = useState<OccurrenceReason[]>([]),
    [requirements, setRequirements] = useState<ReasonRequirement[]>([]),
    [form, setForm] = useState<Record<string, string>>({
      title: '',
      reason_id: '',
      current_priority: 'medium',
    }),
    [selectedOperation, setSelectedOperation] =
      useState<OperationOption | null>(null),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [saveError, setSaveError] = useState(''),
    [isSaving, setIsSaving] = useState(false);
  const load = (t: string) => listOccurrences(t).then(setRows);
  useEffect(() => {
    getSessionContext().then((c) => {
      setTenant(c.tenantId);
      if (c.tenantId) {
        load(c.tenantId);
        listOccurrenceReasons(c.tenantId).then(setReasons);
      }
    });
  }, []);
  useEffect(() => {
    if (!tenant) return;
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    listOccurrences(tenant, q)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [tenant, search, status]);
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    if (!tenant || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        ...(selectedOperation
          ? {
              primary_operation_record_id: selectedOperation.id,
              operation_record_ids: [selectedOperation.id],
            }
          : {}),
      };
      await createOccurrence(tenant, payload);
      setForm({ title: '', reason_id: '', current_priority: 'medium' });
      setSelectedOperation(null);
      setRequirements([]);
      await load(tenant);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <div className="page-stack app-page">
      <SectionHeader
        eyebrow="Atendimento"
        title="Ocorrências operacionais"
        description="Acompanhe o workflow transacional e as operações afetadas."
      />
      <Card>
        <h2 className="font-bold">Registrar ocorrência guiada</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-lg border p-2"
            placeholder="Título"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <select
            className="rounded-lg border p-2"
            value={form.reason_id}
            onChange={async (e) => {
              set('reason_id', e.target.value);
              setRequirements(
                tenant && e.target.value
                  ? await reasonRequirements(tenant, e.target.value, 'opening')
                  : [],
              );
            }}
          >
            <option value="">Selecione o motivo</option>
            {reasons.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border p-2"
            value={form.current_priority}
            onChange={(e) => set('current_priority', e.target.value)}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <OperationPicker
            tenant={tenant}
            selected={selectedOperation}
            onSelect={setSelectedOperation}
          />
          <label className="text-sm font-medium text-slate-700">
            Prazo previsto para fechamento
            <input
              className="mt-1 w-full rounded-lg border p-2"
              type="datetime-local"
              value={form.due_at ?? ''}
              onChange={(e) => set('due_at', e.target.value)}
            />
          </label>
          <textarea
            className="rounded-lg border p-2 md:col-span-2"
            placeholder="Observação"
            value={form.event_description ?? ''}
            onChange={(e) => set('event_description', e.target.value)}
          />
          {requirements.map((r) => (
            <input
              key={r.field_key}
              className="rounded-lg border p-2"
              type={
                r.field_key.includes('date') || r.field_key === 'occurred_at'
                  ? 'datetime-local'
                  : 'text'
              }
              required
              placeholder={`${r.field_key} *`}
              value={form[r.field_key] ?? ''}
              onChange={(e) => set(r.field_key, e.target.value)}
            />
          ))}
        </div>
        {saveError && (
          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
            {saveError}
          </p>
        )}
        <button
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={save}
        >
          {isSaving ? 'Criando ocorrência...' : 'Criar ocorrência'}
        </button>
      </Card>
      <div className="flex gap-3">
        <input
          className="rounded-xl border px-4 py-2"
          placeholder="Número ou título"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-xl border px-4 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="open">Aberta</option>
          <option value="triage">Triagem</option>
          <option value="in_progress">Em andamento</option>
          <option value="resolved">Resolvida</option>
        </select>
        <Link
          className="rounded-xl bg-blue-600 px-4 py-2 text-white"
          href="/app/occurrences/kanban"
        >
          Ver kanban
        </Link>
      </div>
      {error ? (
        <Card>{error}</Card>
      ) : rows.length ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Número</th>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Canal</th>
                  <th>Responsável</th>
                  <th>Abertura</th>
                  <th>Operação principal / NF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr className="border-b" key={r.id}>
                    <td className="p-3">
                      <Link
                        className="font-semibold text-blue-700"
                        href={`/app/occurrences/${r.id}`}
                      >
                        {r.occurrence_number}
                      </Link>
                    </td>
                    <td>{r.title}</td>
                    <td>
                      <StatusBadge>
                        {occurrenceStatusLabel(r.current_status)}
                      </StatusBadge>
                    </td>
                    <td>{occurrencePriorityLabel(r.current_priority)}</td>
                    <td>{r.source_channel}</td>
                    <td>{r.current_owner_id ?? 'Não atribuído'}</td>
                    <td>{date(r.opened_at)}</td>
                    <td>
                      {r.operation_links?.find((l) => l.is_primary)
                        ?.operation_record_id ?? 'Sem operação principal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Nenhuma ocorrência"
          description="Não há ocorrências para os filtros selecionados."
        />
      )}
    </div>
  );
}
