'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, SectionHeader } from '../../../../components/ui';
import { getSessionContext } from '../../../../lib/setup-api';
import {
  changeOccurrenceStatus,
  occurrenceKanban,
  type Occurrence,
} from '../../../../lib/occurrences-api';
import { occurrenceStatusLabel } from '../../../../lib/occurrence-labels';
const operationLabel = (item: Occurrence) => {
  const doc = item.operation_document_number || item.operation_delivery_number;
  return item.operation_invoice_number && doc
    ? `${item.operation_invoice_number} / ${doc}`
    : doc ||
        item.operation_cte_number ||
        item.operation_manifest_number ||
        item.operation_order_number ||
        'Sem documento vinculado';
};
type Column = { status: string; items: Occurrence[] };
export default function Kanban() {
  const [tenant, setTenant] = useState<string | null>(null),
    [columns, setColumns] = useState<Column[]>([]),
    [error, setError] = useState('');
  const load = (id: string) =>
    occurrenceKanban(id)
      .then(setColumns)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    getSessionContext().then((c) => {
      setTenant(c.tenantId);
      if (c.tenantId) load(c.tenantId);
    });
  }, []);
  async function move(id: string, status: string) {
    if (!tenant) return;
    try {
      await changeOccurrenceStatus(tenant, id, status);
      await load(tenant);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="page-stack app-page">
      <SectionHeader
        eyebrow="Atendimento"
        title="Kanban de ocorrências"
        description="Movimentação operacional por status, sem métricas analíticas."
      />
      {error ? <Card>{error}</Card> : null}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns
          .filter(
            (c) =>
              c.items.length ||
              ['open', 'triage', 'in_progress', 'resolved'].includes(c.status),
          )
          .map((c) => (
            <section
              className="w-72 shrink-0 rounded-2xl bg-slate-100 p-3"
              key={c.status}
            >
              <h2 className="mb-3 font-bold">
                {occurrenceStatusLabel(c.status)}{' '}
                <span className="text-slate-500">({c.items.length})</span>
              </h2>
              {c.items.map((item) => (
                <Card key={item.id}>
                  <Link
                    className="font-semibold text-blue-700"
                    href={`/app/occurrences/${item.id}`}
                  >
                    {item.occurrence_number}
                  </Link>
                  <p className="my-2 text-sm">{item.title}</p>
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    {operationLabel(item)}
                  </p>
                  <p className="mb-2 line-clamp-2 text-xs text-slate-500">
                    Última atualização:{' '}
                    {item.last_treatment_description || 'sem tratativa'}
                    {item.last_treatment_at
                      ? ` · ${new Date(item.last_treatment_at).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                  <select
                    className="w-full rounded-lg border p-2 text-xs"
                    value={item.current_status}
                    onChange={(e) => move(item.id, e.target.value)}
                  >
                    {columns.map((x) => (
                      <option key={x.status} value={x.status}>
                        {occurrenceStatusLabel(x.status)}
                      </option>
                    ))}
                  </select>
                </Card>
              ))}
            </section>
          ))}
      </div>
    </div>
  );
}
