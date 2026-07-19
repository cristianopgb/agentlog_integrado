'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../lib/rbac';
import { getSessionContext, listSetupProjects, type SetupProject } from '../../../lib/setup-api';

const statuses = ['not_started', 'in_progress', 'blocked', 'waiting_customer', 'waiting_internal', 'completed', 'cancelled'];

export default function SetupPage() {
  const [projects, setProjects] = useState<SetupProject[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [message, setMessage] = useState('Carregando setup...');
  const [tenantId, setTenantId] = useState<string | null>(null);

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

  return (
    <div className="app-page mx-auto max-w-6xl space-y-8">
      <SectionHeader eyebrow="Setup" title="Central de implantação" description="Resumo mínimo dos projetos de setup do tenant ativo." />
      {message ? <EmptyState title="Status do setup" description={message} /> : null}
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
