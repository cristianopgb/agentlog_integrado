'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';

type Module = { id: string; key: string; name: string; is_active: boolean };
type TenantModule = { module: Module };
type PlanModule = { module: Module };
type Subscription = { plan: { id: string; name: string } };
type Profile = { active_tenant_id: string | null };

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [planModules, setPlanModules] = useState<string[]>([]);
  const [tenantModules, setTenantModules] = useState<string[]>([]);
  const [planName, setPlanName] = useState<string>('sem plano');
  const [message, setMessage] = useState('Carregando módulos...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setMessage('Faça login para visualizar módulos.'); return; }
      const { data: moduleRows } = await supabase.from('modules').select('id,key,name,is_active').eq('is_active', 'true');
      setModules((moduleRows ?? []) as Module[]);
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      if (!activeTenantId) { setMessage('Selecione um tenant ativo para comparar módulos.'); return; }
      const { data: tenantModuleRows } = await supabase.from('tenant_modules').select('module:modules(id,key,name,is_active)').eq('tenant_id', activeTenantId).eq('is_active', 'true');
      setTenantModules(((tenantModuleRows ?? []) as TenantModule[]).map((row) => row.module.key));
      const { data: subscription } = await supabase.from('subscriptions').select('plan:plans(id,name)').eq('tenant_id', activeTenantId).maybeSingle();
      const currentSubscription = subscription as Subscription | null;
      if (currentSubscription?.plan.id) {
        setPlanName(currentSubscription.plan.name);
        const { data: planModuleRows } = await supabase.from('plan_modules').select('module:modules(id,key,name,is_active)').eq('plan_id', currentSubscription.plan.id);
        setPlanModules(((planModuleRows ?? []) as PlanModule[]).map((row) => row.module.key));
      }
      setMessage('');
    });
  }, []);

  return (
    <div className="page-stack app-page">
      <SectionHeader eyebrow="Administração" title="Módulos" description={`Comparativo visual dos módulos disponíveis, incluídos no plano ${planName} e ativos no tenant.`} />
      {message ? <EmptyState title="Status dos módulos" description={message} /> : null}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border bg-white px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Matriz de módulos</h2>
          <p className="mt-1 text-sm text-slate-600">Plano atual: {planName}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Módulo</th>
                <th className="px-6 py-4">Disponível</th>
                <th className="px-6 py-4">Incluído no plano</th>
                <th className="px-6 py-4">Ativo no tenant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modules.map((moduleItem) => (
                <tr className="bg-white/80 transition hover:bg-blue-50/50" key={moduleItem.id}>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-950">{moduleItem.name}</p>
                    <p className="text-xs text-slate-500">{moduleItem.key}</p>
                  </td>
                  <td className="px-6 py-4"><StatusBadge tone={moduleItem.is_active ? 'success' : 'neutral'}>{moduleItem.is_active ? 'Sim' : 'Não'}</StatusBadge></td>
                  <td className="px-6 py-4"><StatusBadge tone={planModules.includes(moduleItem.key) ? 'info' : 'neutral'}>{planModules.includes(moduleItem.key) ? 'Sim' : 'Não'}</StatusBadge></td>
                  <td className="px-6 py-4"><StatusBadge tone={tenantModules.includes(moduleItem.key) ? 'success' : 'neutral'}>{tenantModules.includes(moduleItem.key) ? 'Sim' : 'Não'}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
