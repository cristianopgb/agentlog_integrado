'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';

type ModuleRow = { module: { id: string; key: string; name: string } };
type Plan = { id: string; key: string; name: string; description: string | null; monthly_price_cents: number; annual_price_cents: number; currency: string; modules: string[] };

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setNeedsLogin(true);
        return;
      }
      const { data: planRows } = await supabase.from('plans').select('id,key,name,description,monthly_price_cents,annual_price_cents,currency').eq('status', 'active');
      const hydrated = await Promise.all(
        (planRows as Omit<Plan, 'modules'>[]).map(async (plan) => {
          const { data: modules } = await supabase.from('plan_modules').select('module:modules(id,key,name)').eq('plan_id', plan.id);
          return { ...plan, modules: ((modules ?? []) as ModuleRow[]).map((row) => row.module.name) };
        }),
      );
      setPlans(hydrated);
    });
  }, []);

  return (
    <div className="page-stack app-page">
      <SectionHeader eyebrow="Administração" title="Planos" description="Visualização interna dos planos comerciais ativos, com preços e módulos incluídos." />
      {needsLogin ? <EmptyState title="Login necessário" description="Faça login para visualizar os planos disponíveis." /> : null}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card className="flex h-full flex-col" key={plan.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <StatusBadge tone="info">{plan.key}</StatusBadge>
                <h2 className="mt-4 text-2xl font-bold text-slate-950">{plan.name}</h2>
              </div>
            </div>
            <p className="mt-3 min-h-14 text-sm leading-6 text-slate-600">{plan.description}</p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-bold text-slate-950">{formatMoney(plan.monthly_price_cents, plan.currency)}<span className="text-sm font-medium text-slate-500">/mês</span></p>
              <p className="mt-1 text-sm text-slate-600">Anual: {formatMoney(plan.annual_price_cents, plan.currency)}</p>
            </div>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Módulos incluídos</h3>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
              {plan.modules.map((moduleName) => <li className="rounded-full bg-blue-50 px-3 py-1 text-blue-700" key={moduleName}>{moduleName}</li>)}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
