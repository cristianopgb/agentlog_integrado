'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

type ModuleRow = { module: { id: string; key: string; name: string } };
type Plan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  annual_price_cents: number;
  currency: string;
  modules: string[];
};

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
      const { data: planRows } = await supabase
        .from('plans')
        .select('id,key,name,description,monthly_price_cents,annual_price_cents,currency')
        .eq('status', 'active');

      const hydrated = await Promise.all(
        (planRows as Omit<Plan, 'modules'>[]).map(async (plan) => {
          const { data: modules } = await supabase
            .from('plan_modules')
            .select('module:modules(id,key,name)')
            .eq('plan_id', plan.id);
          return { ...plan, modules: ((modules ?? []) as ModuleRow[]).map((row) => row.module.name) };
        }),
      );
      setPlans(hydrated);
    });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-5xl rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Planos</h1>
        <p className="mt-2 text-slate-600">Visualização interna dos planos comerciais da Sprint 2.</p>
        {needsLogin ? <p className="mt-6 text-amber-700">Faça login para visualizar os planos.</p> : null}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article className="rounded-xl border p-5" key={plan.id}>
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm text-slate-600">{plan.description}</p>
              <p className="mt-4 font-medium">Mensal: {formatMoney(plan.monthly_price_cents, plan.currency)}</p>
              <p className="text-sm text-slate-600">Anual: {formatMoney(plan.annual_price_cents, plan.currency)}</p>
              <h3 className="mt-4 font-medium">Módulos incluídos</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {plan.modules.map((moduleName) => <li key={moduleName}>{moduleName}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
