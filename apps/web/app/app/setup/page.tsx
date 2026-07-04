'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../lib/rbac';
import { getSessionContext, setupApi, type SetupProject } from '../../../lib/setup-api';

const statuses = ['not_started','in_progress','blocked','waiting_customer','waiting_internal','completed','cancelled'];
export default function SetupPage() {
  const [projects, setProjects] = useState<SetupProject[]>([]); const [permissions, setPermissions] = useState<UserPermission[]>([]); const [message, setMessage] = useState('Carregando setup...'); const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => { getSessionContext().then(async (ctx) => { if (!ctx.user || !ctx.token) { setMessage('Faça login para visualizar Setup.'); return; } if (!ctx.tenantId) { setMessage('Selecione um tenant ativo para visualizar Setup.'); return; } setTenantId(ctx.tenantId); const perms = await getCurrentUserPermissions(ctx.tenantId); setPermissions(perms); if (!hasPermission(perms, 'setup.projects.view')) { setMessage('Acesso negado: permissão setup.projects.view é necessária.'); return; } setProjects(await setupApi<SetupProject[]>(`/tenants/${ctx.tenantId}/setup-projects`, ctx.token)); setMessage(''); }).catch((e: Error) => setMessage(e.message)); }, []);
  const counts = useMemo(() => Object.fromEntries(statuses.map((s) => [s, projects.filter((p) => p.status === s).length])), [projects]);
  return <div className="mx-auto max-w-6xl space-y-8"><SectionHeader eyebrow="Setup" title="Central de implantação" description="Resumo mínimo dos projetos de setup do tenant ativo." />{message ? <EmptyState title="Status do setup" description={message} /> : null}{hasPermission(permissions, 'setup.projects.view') ? <><Card><p className="text-sm text-slate-500">Tenant ativo</p><p className="mt-1 font-semibold">{tenantId}</p><p className="mt-4 text-3xl font-bold">{projects.length}</p><p className="text-sm text-slate-600">projetos de setup</p><Link className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/app/setup/projects">Ver projetos</Link></Card><div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">{statuses.map((status) => <Card key={status}><StatusBadge>{status}</StatusBadge><p className="mt-4 text-3xl font-bold">{counts[status] ?? 0}</p></Card>)}</div></> : null}</div>;
}
