'use client';

import type { ReactNode } from 'react';

export function OccurrenceActionModal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="occurrence-modal-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-4 border-b pb-3">
          <h2 id="occurrence-modal-title" className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={onClose}
            aria-label={`Fechar ${title}`}
          >
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
