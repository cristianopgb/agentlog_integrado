'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../lib/rbac';
import { establishSetupLogisticKey, getSessionContext, getSetupLogisticKey, listSetupProjects, type PrimaryLogisticKey, type SetupProject, type TenantLogisticKeySetting } from '../../../lib/setup-api';

const statuses = ['not_started', 'in_progress', 'blocked', 'waiting_customer', 'waiting_internal', 'completed', 'cancelled'];

export default function SetupPage() {
  const [projects, setProjects] = useState<SetupProject[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [message, setMessage] = useState('Carregando setup...');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [logisticSetting, setLogisticSetting] = useState<TenantLogisticKeySetting | null>(null);
  const [logisticKey, setLogisticKey] = useState<PrimaryLogisticKey | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    getSessionContext()
      .then(async (ctx) => {
        if (!ctx.user) {
          setMessage('Faça login para visualizar Setup.');
          return;
        }
        if (!ctx.tenantId) {
          setMessage('Selecione um tenant ativo para visualizar Setup.');
          return;
        }
        setTenantId(ctx.tenantId);
        const perms = await getCurrentUserPermissions(ctx.tenantId);
        setPermissions(perms);
        if (hasPermission(perms, 'integrations.api.configure'))
          setLogisticSetting(await getSetupLogisticKey(ctx.tenantId));
        if (!hasPermission(perms, 'setup.projects.view')) {
          setMessage('Acesso negado: permissão setup.projects.view é necessária.');
          return;
        }
        const setupProjects = await listSetupProjects(ctx.tenantId);
        setProjects(setupProjects);
        setMessage(setupProjects.length === 0 ? 'Nenhum projeto de setup encontrado para o tenant ativo.' : '');
      })
      .catch((e: Error) => setMessage(e.message));
  }, []);

  const counts = useMemo(() => Object.fromEntries(statuses.map((s) => [s, projects.filter((p) => p.status === s).length])), [projects]);
  const canView = hasPermission(permissions, 'setup.projects.view');
  const canConfigureKey = hasPermission(permissions, 'integrations.api.configure');
  const keyLabels: Record<PrimaryLogisticKey, string> = { delivery_number: 'Documento da entrega', document_number: 'Documento operacional', invoice_number: 'NF', cte_number: 'CT-e', manifest_number: 'Manifesto / Romaneio', order_number: 'Pedido' };

  async function saveLogisticKey() {
    if (!tenantId || !logisticKey || !confirmed) return;
    setSavingKey(true);
    try {
      setLogisticSetting(await establishSetupLogisticKey(tenantId, logisticKey));
      setMessage('');
    } catch (error) { setMessage((error as Error).message); }
    finally { setSavingKey(false); }
  }

  return (
    <div className="page-stack app-page">
      <SectionHeader eyebrow="Setup" title="Central de implantação" description="Resumo mínimo dos projetos de setup do tenant ativo." />
      {message ? <EmptyState title="Status do setup" description={message} /> : null}
      {canConfigureKey ? <Card>
        <h2 className="text-lg font-bold">Chave oficial da empresa</h2>
        {logisticSetting ? <>
          <p className="mt-3 text-2xl font-bold text-blue-700">{keyLabels[logisticSetting.primary_logistic_key]}</p>
          <p className="mt-2 text-sm text-slate-600">Definição concluída. A chave é permanente e vale para todas as integrações operacionais.</p>
        </> : <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">Escolha uma vez a identidade usada para consolidar operações de todas as fontes. Esta ação não cria fonte, contrato, pareamento ou dado operacional.</p>
          <select value={logisticKey} onChange={(event) => { setLogisticKey(event.target.value as PrimaryLogisticKey); setConfirmed(false); }} className="w-full rounded-xl border bg-white p-3">
            <option value="">Selecione a chave oficial</option>
            {Object.entries(keyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo que esta será a chave oficial permanente da empresa e não poderá ser alterada.</label>
          <button type="button" disabled={!logisticKey || !confirmed || savingKey} onClick={saveLogisticKey} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingKey ? 'Salvando...' : 'Definir chave oficial'}</button>
        </div>}
      </Card> : null}
      {canView ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">Tenant ativo</p>
            <p className="mt-1 font-semibold">{tenantId}</p>
            <p className="mt-4 text-3xl font-bold">{projects.length}</p>
            <p className="text-sm text-slate-600">projetos de setup</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/app/setup/projects">Ver projetos</Link>
              {hasPermission(permissions, 'core.data_sources.view') ? <Link className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/app/setup/data-sources">Fontes de dados</Link> : null}
              {hasPermission(permissions, 'core.data_contracts.view') ? <Link className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/app/setup/data-contracts">Contratos de dados</Link> : null}
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {statuses.map((status) => (
              <Card key={status}>
                <StatusBadge>{status}</StatusBadge>
                <p className="mt-4 text-3xl font-bold">{counts[status] ?? 0}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
