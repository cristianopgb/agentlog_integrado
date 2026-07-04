'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';

type Profile = { active_tenant_id: string | null };
type Tenant = { id: string; name: string; slug: string };
type Subscription = { id: string; status: string; current_period_start: string | null; current_period_end: string | null; plan: { name: string; key: string } };
type Limit = { id: string; key: string; name: string; limit_value: number | null; unit: string | null };

export default function AdminSubscriptionPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [limits, setLimits] = useState<Limit[]>([]);
  const [message, setMessage] = useState('Carregando assinatura...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setMessage('Faça login para visualizar a assinatura.'); return; }
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      if (!activeTenantId) { setMessage('Selecione um tenant ativo para visualizar a assinatura.'); return; }
      const { data: tenantData } = await supabase.from('tenants').select('id,name,slug').eq('id', activeTenantId).maybeSingle();
      setTenant(tenantData as Tenant | null);
      const { data: subscriptionData } = await supabase.from('subscriptions').select('id,status,current_period_start,current_period_end,plan:plans(name,key)').eq('tenant_id', activeTenantId).maybeSingle();
      setSubscription(subscriptionData as Subscription | null);
      const { data: limitRows } = await supabase.from('subscription_limits').select('id,key,name,limit_value,unit').eq('tenant_id', activeTenantId);
      setLimits((limitRows ?? []) as Limit[]);
      setMessage('');
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <SectionHeader eyebrow="Administração" title="Assinatura" description="Resumo visual do plano, status e limites contratados para o tenant ativo." />
      {message ? <EmptyState title="Status da assinatura" description={message} /> : null}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Plano atual</p>
          {subscription ? (
            <div className="mt-4 space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-950">{subscription.plan.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">Código: {subscription.plan.key}</p>
                </div>
                <StatusBadge tone="success">{subscription.status}</StatusBadge>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Período atual: {subscription.current_period_start ?? 'não informado'} até {subscription.current_period_end ?? 'não informado'}</div>
            </div>
          ) : !message ? <p className="mt-4 text-slate-600">Nenhuma assinatura encontrada para o tenant ativo.</p> : null}
        </Card>
        <Card>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tenant ativo</p>
          <h2 className="mt-3 text-2xl font-bold text-slate-950">{tenant?.name ?? 'Não carregado'}</h2>
          <p className="mt-1 text-slate-600">{tenant?.slug ?? 'Sem tenant selecionado'}</p>
        </Card>
      </div>
      <section>
        <h2 className="text-xl font-semibold text-slate-950">Limites contratados</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {limits.map((limit) => (
            <Card key={limit.id}>
              <p className="text-sm font-semibold text-slate-500">{limit.key}</p>
              <h3 className="mt-2 text-lg font-bold text-slate-950">{limit.name}</h3>
              <p className="mt-4 text-2xl font-bold text-blue-700">{limit.limit_value ?? 'ilimitado'} <span className="text-sm font-medium text-slate-500">{limit.unit ?? ''}</span></p>
            </Card>
          ))}
        </div>
        {!limits.length && !message ? <div className="mt-4"><EmptyState title="Nenhum limite cadastrado" description="Não há limites de assinatura para exibir neste tenant." /></div> : null}
      </section>
    </div>
  );
}
