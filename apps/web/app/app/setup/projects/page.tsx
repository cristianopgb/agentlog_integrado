'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../lib/rbac';
import { getSessionContext, listSetupProjects, type SetupProject } from '../../../../lib/setup-api';

const statuses = ['not_started', 'in_progress', 'blocked', 'waiting_customer', 'waiting_internal', 'completed', 'cancelled'];

export default function SetupProjectsPage() {
  const [projects, setProjects] = useState<SetupProject[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [message, setMessage] = useState('Carregando projetos...');

  useEffect(() => {
    getSessionContext()
      .then(async (ctx) => {
        if (!ctx.user) {
          setMessage('Faça login para visualizar projetos.');
          return;
        }
        if (!ctx.tenantId) {
          setMessage('Selecione um tenant ativo.');
          return;
        }
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

  return (
    <div className="app-page mx-auto max-w-7xl space-y-8">
      <SectionHeader eyebrow="Setup" title="Projetos de implantação" description="Lista em colunas por status com cards simples de implantação." />
      {message ? <EmptyState title="Status dos projetos" description={message} /> : null}
      {hasPermission(permissions, 'setup.projects.view') ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {statuses.map((status) => (
            <div key={status} className="space-y-3">
              <h2 className="font-semibold text-slate-700">{status}</h2>
              {projects
                .filter((p) => p.status === status)
                .map((project) => (
                  <Card key={project.id}>
                    <StatusBadge>{project.status}</StatusBadge>
                    <h3 className="mt-3 text-lg font-bold">{project.name}</h3>
                    <p className="mt-2 text-sm text-slate-600">Prioridade: {project.priority}</p>
                    <p className="text-sm text-slate-600">Progresso: {project.progress_percent}%</p>
                    <p className="text-sm text-slate-600">Data alvo: {project.target_date ?? 'não definida'}</p>
                    <Link className="mt-4 inline-flex text-sm font-semibold text-blue-700" href={`/app/setup/projects/${project.id}`}>
                      Abrir detalhe
                    </Link>
                  </Card>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
