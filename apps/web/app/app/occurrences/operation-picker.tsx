'use client';
import { useEffect, useState } from 'react';
import {
  operationOptions,
  type OperationOption,
} from '../../../lib/occurrences-api';

export function OperationPicker({
  tenant,
  selected,
  onSelect,
}: {
  tenant: string | null;
  selected: OperationOption | null;
  onSelect: (option: OperationOption | null) => void;
}) {
  const [search, setSearch] = useState(''),
    [options, setOptions] = useState<OperationOption[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!tenant || search.trim().length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setError('');
      setLoading(true);
      try {
        setOptions(await operationOptions(tenant, search));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tenant, search]);
  if (selected)
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <strong>{selected.label}</strong>
        {selected.subtitle && (
          <p className="text-slate-600">{selected.subtitle}</p>
        )}
        <button
          type="button"
          className="mt-2 text-blue-700 underline"
          onClick={() => {
            onSelect(null);
            setSearch('');
          }}
        >
          Trocar operação
        </button>
      </div>
    );
  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border p-2"
        placeholder="Buscar por NF, documento, manifesto, cliente ou referência"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
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
                className="block w-full border-b p-3 text-left hover:bg-slate-50"
                onClick={() => {
                  onSelect(option);
                  setOptions([]);
                }}
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
              Nenhuma operação tratada encontrada.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
