'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

type Profile = { active_tenant_id: string | null };
type Tenant = { id: string; name: string; slug: string };
type Subscription = {
  id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  plan: { name: string; key: string };
};
type Limit = { id: string; key: string; name: string; limit_value: number | null; unit: string | null };

export default function AdminSubscriptionPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [limits, setLimits] = useState<Limit[]>([]);
  const [message, setMessage] = useState('Carregando assinatura...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setMessage('Faça login para visualizar a assinatura.');
        return;
      }
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      if (!activeTenantId) {
        setMessage('Selecione um tenant ativo para visualizar a assinatura.');
        return;
      }
      const { data: tenantData } = await supabase.from('tenants').select('id,name,slug').eq('id', activeTenantId).maybeSingle();
      setTenant(tenantData as Tenant | null);
      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select('id,status,current_period_start,current_period_end,plan:plans(name,key)')
        .eq('tenant_id', activeTenantId)
        .maybeSingle();
      setSubscription(subscriptionData as Subscription | null);
      const { data: limitRows } = await supabase
        .from('subscription_limits')
        .select('id,key,name,limit_value,unit')
        .eq('tenant_id', activeTenantId);
      setLimits((limitRows ?? []) as Limit[]);
      setMessage('');
    });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-4xl rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Assinatura</h1>
        {message ? <p className="mt-6 text-slate-600">{message}</p> : null}
        {tenant ? <p className="mt-4"><strong>Tenant ativo:</strong> {tenant.name} ({tenant.slug})</p> : null}
        {subscription ? (
          <div className="mt-6 rounded-xl border p-5">
            <p><strong>Plano atual:</strong> {subscription.plan.name} ({subscription.plan.key})</p>
            <p><strong>Status:</strong> {subscription.status}</p>
            <p><strong>Período atual:</strong> {subscription.current_period_start ?? 'não informado'} até {subscription.current_period_end ?? 'não informado'}</p>
          </div>
        ) : !message ? <p className="mt-6 text-slate-600">Nenhuma assinatura encontrada para o tenant ativo.</p> : null}
        <h2 className="mt-8 text-xl font-semibold">Limites contratados</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {limits.map((limit) => (
            <li className="rounded-lg border p-4" key={limit.id}>
              <strong>{limit.name}</strong>
              <p className="text-sm text-slate-600">{limit.limit_value ?? 'ilimitado'} {limit.unit ?? ''}</p>
            </li>
          ))}
        </ul>
        {!limits.length && !message ? <p className="mt-4 text-slate-600">Nenhum limite cadastrado.</p> : null}
      </section>
    </main>
  );
}
