'use client';
import { useEffect, useState } from 'react';
import {
  operationOptions,
  type OperationOption,
} from '../../../lib/occurrences-api';
import { shortId } from '../../../lib/occurrence-formatters';

export function OperationPicker({
  tenant,
  selected,
  onSelect,
  onLoadingChange,
}: {
  tenant: string | null;
  selected: OperationOption | null;
  onSelect: (option: OperationOption | null) => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [search, setSearch] = useState(''),
    [options, setOptions] = useState<OperationOption[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!tenant || search.trim().length < 2) {
      setOptions([]);
      setError('');
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }
    const timer = setTimeout(async () => {
      setError('');
      setLoading(true);
      onLoadingChange?.(true);
      try {
        const results = await operationOptions(tenant, search);
        const unique = [
          ...new Map(results.map((option) => [option.id, option])).values(),
        ];
        const labelCounts = unique.reduce<Record<string, number>>(
          (counts, option) => {
            counts[option.label] = (counts[option.label] ?? 0) + 1;
            return counts;
          },
          {},
        );
        setOptions(
          unique.map((option) => ({
            ...option,
            subtitle:
              labelCounts[option.label] > 1
                ? [option.subtitle, `ID ${shortId(option.id)}`]
                    .filter(Boolean)
                    .join(' · ')
                : option.subtitle,
          })),
        );
      } catch (e) {
        setError((e as Error).message);
        setOptions([]);
      } finally {
        setLoading(false);
        onLoadingChange?.(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tenant, search, onLoadingChange]);
  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border p-2"
        placeholder="Buscar NF, manifesto, pedido, entrega ou cliente"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (selected) onSelect(null);
        }}
      />
      {!search.trim() && (
        <p className="mt-1 text-xs text-slate-500">
          Digite pelo menos parte de uma NF, manifesto, pedido, entrega ou
          cliente.
        </p>
      )}
      {loading && (
        <p className="mt-1 text-xs text-slate-500">Buscando operações...</p>
      )}
      {error && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {search.trim().length >= 2 && !loading && !error && (
        <div className="mt-1 max-h-52 overflow-auto rounded-lg border bg-white">
          {options.length ? (
            options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`block w-full border-b p-3 text-left last:border-b-0 ${
                  selected?.id === option.id
                    ? 'bg-blue-50 ring-2 ring-inset ring-blue-500'
                    : 'hover:bg-slate-50'
                }`}
                aria-pressed={selected?.id === option.id}
                onClick={() => onSelect(option)}
              >
                <strong className="block text-sm">{option.label}</strong>
                {option.subtitle && (
                  <span className="text-xs text-slate-500">
                    {option.subtitle}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-slate-500">
              Nenhuma operação tratada foi encontrada para este termo.
            </p>
          )}
        </div>
      )}
      {selected && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p>
            Selecionada: <strong>{selected.label}</strong>
          </p>
          {selected.subtitle && (
            <p className="mt-1 text-slate-600">{selected.subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
