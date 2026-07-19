'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../lib/supabase';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';

type Tenant = { id: string; name: string; slug: string };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;

      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      setActiveTenantId((profile as { active_tenant_id: string | null } | null)?.active_tenant_id ?? null);

      const { data: userRoles } = await supabase.from('user_roles').select('tenant:tenants(id, name, slug)').eq('user_id', data.user.id);
      setTenants((userRoles ?? []).map((row) => (row as { tenant: Tenant }).tenant).filter(Boolean));
    });
  }, []);

  return (
    <div className="page-stack app-page">
      <SectionHeader eyebrow="Organizações" title="Tenants disponíveis" description="Escolha visualmente o contexto de operação entre os tenants vinculados ao usuário autenticado." />
      {tenants.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tenants.map((tenant) => {
            const active = activeTenantId === tenant.id;
            return (
              <button className={`text-left transition hover:-translate-y-1 ${active ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`} key={tenant.id} onClick={() => setActiveTenantId(tenant.id)} type="button">
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">{tenant.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">{tenant.slug}</p>
                    </div>
                    {active ? <StatusBadge tone="success">ativo</StatusBadge> : <StatusBadge>disponível</StatusBadge>}
                  </div>
                  <p className="mt-6 text-sm leading-6 text-slate-600">Tenant disponível para consulta na área autenticada.</p>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Nenhum tenant disponível" description="Este usuário ainda não possui tenants vinculados para exibição." />
      )}
    </div>
  );
}
