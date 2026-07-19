'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../../lib/rbac';
import {
  getSessionContext,
  getSetupProject,
  listSetupChecklistItems,
  listSetupSteps,
  type SetupChecklistItem,
  type SetupProject,
  type SetupStep,
  updateSetupChecklistItemStatus,
  updateSetupProjectStatus,
  updateSetupStepStatus,
} from '../../../../../lib/setup-api';

const projectStatuses = ['not_started', 'in_progress', 'blocked', 'waiting_customer', 'waiting_internal', 'completed', 'cancelled'];
const checklistStatuses = ['pending', 'in_progress', 'done', 'blocked', 'not_applicable'];

type SetupContext = { tenantId: string };

export default function SetupProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<SetupProject | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [items, setItems] = useState<SetupChecklistItem[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [ctx, setCtx] = useState<SetupContext | null>(null);
  const [message, setMessage] = useState('Carregando detalhe...');

  const load = useCallback(async () => {
    const c = await getSessionContext();
    if (!c.user) {
      setMessage('Faça login para visualizar o projeto.');
      return;
    }
    if (!c.tenantId) {
      setMessage('Selecione um tenant ativo.');
      return;
    }
    setCtx({ tenantId: c.tenantId });
    const perms = await getCurrentUserPermissions(c.tenantId);
    setPermissions(perms);
    if (!hasPermission(perms, 'setup.projects.view')) {
      setMessage('Acesso negado: permissão setup.projects.view é necessária.');
      return;
    }
    const [setupProject, setupSteps, checklistItems] = await Promise.all([
      getSetupProject(c.tenantId, params.id),
      hasPermission(perms, 'setup.steps.view') ? listSetupSteps(c.tenantId, params.id) : Promise.resolve([]),
      hasPermission(perms, 'setup.checklist.view') ? listSetupChecklistItems(c.tenantId, params.id) : Promise.resolve([]),
    ]);
    setProject(setupProject);
    setSteps(setupSteps);
    setItems(checklistItems);
    setMessage(setupProject ? '' : 'Projeto de setup não encontrado para o tenant ativo.');
  }, [params.id]);

  useEffect(() => {
    load().catch((e: Error) => setMessage(e.message));
  }, [load]);

  async function patchProject(status: string) {
    if (!ctx || !project) return;
    await updateSetupProjectStatus(ctx.tenantId, project.id, status);
    await load();
  }

  async function patchStep(stepId: string, status: string) {
    if (!ctx) return;
    await updateSetupStepStatus(ctx.tenantId, stepId, status);
    await load();
  }

  async function patchChecklistItem(itemId: string, status: string) {
    if (!ctx) return;
    await updateSetupChecklistItemStatus(ctx.tenantId, itemId, status);
    await load();
  }

  return (
    <div className="app-page mx-auto max-w-6xl space-y-8">
      <SectionHeader eyebrow="Setup" title={project?.name ?? 'Projeto de implantação'} description="Detalhe mínimo com etapas, checklist e alteração simples de status." />
      {message ? <EmptyState title="Status do detalhe" description={message} /> : null}
      {project ? (
        <Card>
          <StatusBadge>{project.status}</StatusBadge>
          <p className="mt-3 text-slate-600">{project.description}</p>
          <p className="mt-3 text-sm">
            Prioridade: {project.priority} · Progresso: {project.progress_percent}% · Data alvo: {project.target_date ?? 'não definida'}
          </p>
          {hasPermission(permissions, 'setup.projects.update') ? (
            <select className="mt-4 rounded-xl border p-2" value={project.status} onChange={(e) => patchProject(e.target.value)}>
              {projectStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          ) : null}
        </Card>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">Etapas</h2>
          {!hasPermission(permissions, 'setup.steps.view') ? (
            <p className="mt-4 text-sm text-slate-600">Acesso negado: permissão setup.steps.view é necessária.</p>
          ) : (
            steps.map((step) => (
              <div key={step.id} className="mt-4 rounded-xl border p-4">
                <StatusBadge>{step.status}</StatusBadge>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.description}</p>
                {hasPermission(permissions, 'setup.steps.update') ? (
                  <select className="mt-3 rounded-xl border p-2" value={step.status} onChange={(e) => patchStep(step.id, e.target.value)}>
                    {projectStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Checklist</h2>
          {!hasPermission(permissions, 'setup.checklist.view') ? (
            <p className="mt-4 text-sm text-slate-600">Acesso negado: permissão setup.checklist.view é necessária.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="mt-4 rounded-xl border p-4">
                <StatusBadge>{item.status}</StatusBadge>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.description}</p>
                {hasPermission(permissions, 'setup.checklist.update') ? (
                  <select className="mt-3 rounded-xl border p-2" value={item.status} onChange={(e) => patchChecklistItem(item.id, e.target.value)}>
                    {checklistStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
