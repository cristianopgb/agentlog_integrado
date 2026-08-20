'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Card, SectionHeader } from '../../../../components/ui';
import { loadLogisticKeySetupState, logisticKeyReturnPath } from '../../../../lib/logistic-key-setup-flow.mjs';
import {
  establishSetupLogisticKey,
  getLogisticKeySetupContext,
  getSetupLogisticKey,
  SetupApiError,
  type PrimaryLogisticKey,
  type TenantLogisticKeySetting,
} from '../../../../lib/setup-api';

type LoadState = 'loading' | 'forbidden' | 'error' | 'unset' | 'configured';

const keyOptions: Array<{ value: PrimaryLogisticKey; label: string }> = [
  { value: 'delivery_number', label: 'Documento da entrega' },
  { value: 'document_number', label: 'Documento operacional' },
  { value: 'invoice_number', label: 'NF' },
  { value: 'cte_number', label: 'CT-e' },
  { value: 'manifest_number', label: 'Manifesto / Romaneio' },
  { value: 'order_number', label: 'Pedido' },
];

function LogisticKeySetupContent() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = useMemo(() => logisticKeyReturnPath(search.get('sourceId')), [search]);
  const [tenantId, setTenantId] = useState('');
  const [state, setState] = useState<LoadState>('loading');
  const [setting, setSetting] = useState<TenantLogisticKeySetting | null>(null);
  const [selectedKey, setSelectedKey] = useState<PrimaryLogisticKey | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLogisticKeySetupState(getLogisticKeySetupContext, getSetupLogisticKey)
      .then((result) => {
        setState(result.state as LoadState);
        setError(result.error);
        setSetting(result.setting as TenantLogisticKeySetting | null);
        if (result.context?.tenantId) setTenantId(result.context.tenantId);
      });
  }, []);

  async function save() {
    if (!tenantId || !selectedKey || !confirmed) return;
    setSaving(true);
    setError('');
    try {
      const saved = await establishSetupLogisticKey(tenantId, selectedKey);
      setSetting(saved);
      setState('configured');
      router.replace(returnTo);
    } catch (caught) {
      if (caught instanceof SetupApiError && caught.status === 403) {
        setState('forbidden');
      } else {
        setError(caught instanceof Error ? caught.message : 'Não foi possível definir a chave logística oficial.');
        setState('error');
      }
    } finally {
      setSaving(false);
    }
  }

  const label = setting
    ? keyOptions.find((option) => option.value === setting.primary_logistic_key)?.label ?? setting.primary_logistic_key
    : '';

  return <div className="page-stack app-page">
    <SectionHeader eyebrow="Setup" title="Chave oficial da empresa" description="Defina a identidade logística permanente usada pelas integrações desta empresa." />
    <Card className="max-w-2xl">
      {state === 'loading' ? <p role="status" className="text-sm text-slate-600">Carregando configuração...</p> : null}
      {state === 'forbidden' ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Você não possui permissão para definir a chave logística oficial desta empresa.</p> : null}
      {state === 'error' ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Erro ao consultar ou salvar a chave oficial: {error}</p> : null}
      {state === 'unset' ? <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Chave oficial da empresa</h2>
          <p className="mt-2 text-sm text-slate-600">Escolha uma vez a identidade usada para consolidar as operações. A escolha é permanente e não poderá ser alterada.</p>
        </div>
        <select value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value as PrimaryLogisticKey); setConfirmed(false); }} className="w-full rounded-xl border bg-white p-3">
          <option value="">Selecione a chave oficial</option>
          {keyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo que esta será a chave oficial permanente da empresa e não poderá ser alterada.</label>
        <button type="button" disabled={!selectedKey || !confirmed || saving} onClick={save} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Definir chave oficial'}</button>
      </div> : null}
      {state === 'configured' ? <div>
        <h2 className="text-lg font-bold">Chave oficial da empresa</h2>
        <p className="mt-3 text-2xl font-bold text-blue-700">{label}</p>
        <p className="mt-2 text-sm text-slate-600">Definição concluída. A chave é permanente e não pode ser alterada.</p>
        <Link href={returnTo} className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Voltar ao pareamento</Link>
      </div> : null}
    </Card>
  </div>;
}

export default function LogisticKeySetupPage() {
  return <Suspense fallback={<div className="page-stack app-page"><p role="status" className="text-sm text-slate-600">Carregando configuração...</p></div>}>
    <LogisticKeySetupContent />
  </Suspense>;
}
