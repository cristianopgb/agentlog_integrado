'use client';

import type { OccurrenceEvent } from '../../../../lib/occurrences-api';
import { occurrenceEventLabels } from '../../../../lib/occurrences-api';
import { occurrenceStatusLabel } from '../../../../lib/occurrence-labels';

export function OccurrenceTimelineDrawer({
  open,
  onClose,
  events,
}: {
  open: boolean;
  onClose: () => void;
  events: OccurrenceEvent[];
}) {
  if (!open) return null;
  const chronologicalEvents = [...events].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
  );
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40" role="presentation">
      <aside
        className="ml-auto h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-title"
      >
        <div className="flex items-center justify-between border-b pb-4">
          <h2 id="timeline-title" className="text-xl font-bold">
            Timeline
          </h2>
          <button
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        {chronologicalEvents.length ? (
          <ol className="mt-5 border-l-2 border-blue-200 pl-5">
            {chronologicalEvents.map((event) => (
              <li className="mb-5" key={event.id}>
                <p className="font-semibold">
                  {occurrenceEventLabels[event.event_type] ??
                    event.event_title ??
                    event.event_type}
                </p>
                <p className="text-sm text-slate-600">
                  {event.event_description ??
                    (event.old_status && event.new_status
                      ? `${occurrenceStatusLabel(event.old_status)} → ${occurrenceStatusLabel(event.new_status)}`
                      : 'Sem descrição')}
                </p>
                <time className="text-xs text-slate-400">
                  {new Date(event.event_at).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Nenhum evento registrado.
          </p>
        )}
      </aside>
    </div>
  );
}
