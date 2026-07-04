'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

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
      if (!data.user) {
        setMessage('Faça login para visualizar módulos.');
        return;
      }
      const { data: moduleRows } = await supabase.from('modules').select('id,key,name,is_active').eq('is_active', 'true');
      setModules((moduleRows ?? []) as Module[]);
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      if (!activeTenantId) {
        setMessage('Selecione um tenant ativo para comparar módulos.');
        return;
      }
      const { data: tenantModuleRows } = await supabase
        .from('tenant_modules')
        .select('module:modules(id,key,name,is_active)')
        .eq('tenant_id', activeTenantId)
        .eq('is_active', 'true');
      setTenantModules(((tenantModuleRows ?? []) as TenantModule[]).map((row) => row.module.key));
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan:plans(id,name)')
        .eq('tenant_id', activeTenantId)
        .maybeSingle();
      const currentSubscription = subscription as Subscription | null;
      if (currentSubscription?.plan.id) {
        setPlanName(currentSubscription.plan.name);
        const { data: planModuleRows } = await supabase
          .from('plan_modules')
          .select('module:modules(id,key,name,is_active)')
          .eq('plan_id', currentSubscription.plan.id);
        setPlanModules(((planModuleRows ?? []) as PlanModule[]).map((row) => row.module.key));
      }
      setMessage('');
    });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-4xl rounded-2xl border border-border bg-white p-8 shadow-sm">
        <Link className="mb-6 inline-flex text-sm font-medium text-slate-700 hover:text-slate-900" href="/app">
          Voltar para /app
        </Link>
        <h1 className="text-2xl font-bold">Módulos</h1>
        <p className="mt-2 text-slate-600">Plano atual: {planName}</p>
        {message ? <p className="mt-6 text-slate-600">{message}</p> : null}
        <div className="mt-6 overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Módulo</th>
                <th className="p-3">Disponível</th>
                <th className="p-3">Incluído no plano</th>
                <th className="p-3">Ativo no tenant</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((moduleItem) => (
                <tr className="border-t" key={moduleItem.id}>
                  <td className="p-3 font-medium">{moduleItem.name}</td>
                  <td className="p-3">{moduleItem.is_active ? 'Sim' : 'Não'}</td>
                  <td className="p-3">{planModules.includes(moduleItem.key) ? 'Sim' : 'Não'}</td>
                  <td className="p-3">{tenantModules.includes(moduleItem.key) ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
