'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../lib/rbac';
import { getSessionContext } from '../../../lib/setup-api';
import { listIntegrations, type IntegrationSummary } from '../../../lib/integrations-api';

const statusTone = { 'conexão pendente': 'warning', 'estrutura configurada': 'info', 'validação pendente': 'warning', 'mapeamento pendente': 'warning', 'integração configurada': 'success' } as const;
const typeLabels: Record<string, string> = { api: 'API', spreadsheet: 'Planilha', database: 'Banco', other: 'Outro', manual_file: 'Planilha', email: 'Outro' };

export default function IntegrationsPage() {
  const [items, setItems] = useState<IntegrationSummary[]>([]);
  const [perms, setPerms] = useState<UserPermission[]>([]);
  const [msg, setMsg] = useState('Carregando integrações...');

  useEffect(() => { getSessionContext().then(async (ctx) => {
    if (!ctx.user) return setMsg('Faça login para visualizar integrações.');
    if (!ctx.tenantId) return setMsg('Selecione um tenant ativo.');
    const p = await getCurrentUserPermissions(ctx.tenantId); setPerms(p);
    if (!hasPermission(p, 'core.data_sources.view')) return setMsg('Acesso negado: permissão core.data_sources.view é necessária.');
    setItems(await listIntegrations(ctx.tenantId)); setMsg('');
  }).catch((e: Error) => setMsg(e.message)); }, []);

  return <div className="mx-auto max-w-7xl space-y-8"><div className="flex flex-wrap items-start justify-between gap-4"><SectionHeader eyebrow="Integrações" title="Integrações" description="Configure conexão, mapeamento e finalização em uma trilha simples, sem expor contrato, staging ou modelo canônico como menus técnicos." />{hasPermission(perms, 'core.data_sources.create') ? <Link href="/app/integrations/new" className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20">Nova integração</Link> : null}</div>{msg ? <EmptyState title="Integrações" description={msg} /> : null}{!msg && items.length === 0 ? <EmptyState title="Nenhuma integração" description="Crie a primeira integração declarativa para configurar conexão e mapeamento." /> : null}<div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <Card key={item.source.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><StatusBadge tone={statusTone[item.generalStatus]}>{item.generalStatus}</StatusBadge><h2 className="mt-3 text-xl font-bold">{item.source.name}</h2><p className="mt-1 text-sm text-slate-600">{typeLabels[item.source.source_type] ?? item.source.source_type} · módulo {item.source.module_key}</p></div><StatusBadge>{item.source.status}</StatusBadge></div><dl className="mt-5 grid gap-3 text-sm md:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-3"><dt className="font-semibold">Contrato vinculado</dt><dd className="text-slate-600">{item.contract?.name ?? 'Não vinculado'}</dd></div><div className="rounded-2xl bg-slate-50 p-3"><dt className="font-semibold">Campos</dt><dd className="text-slate-600">{item.contractFieldCount} no contrato · {item.mappedFieldCount} mapeados</dd></div><div className="rounded-2xl bg-slate-50 p-3"><dt className="font-semibold">Último staging</dt><dd className="text-slate-600">{item.latestBatch ? `${item.latestBatch.status} · ${item.latestBatch.batch_code ?? item.latestBatch.created_at}` : 'Sem lote'}</dd></div><div className="rounded-2xl bg-slate-50 p-3"><dt className="font-semibold">Operação</dt><dd className="text-slate-600">Sem sincronização real nesta sprint</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><Link href={`/app/integrations/${item.source.id}/setup?step=connection`} className="rounded-xl border px-3 py-2 text-sm font-semibold">Editar conexão</Link><Link href={`/app/integrations/${item.source.id}/setup?step=mapping`} className="rounded-xl border px-3 py-2 text-sm font-semibold">Editar mapeamento</Link><Link href={`/app/integrations/${item.source.id}/setup`} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Continuar configuração</Link></div></Card>)}</div></div>;
}
