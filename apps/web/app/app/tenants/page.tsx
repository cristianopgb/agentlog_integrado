'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../../lib/supabase';

type Tenant = { id: string; name: string; slug: string };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;

      const { data: profile } = await supabase
        .from('users_profile')
        .select('active_tenant_id')
        .eq('id', data.user.id)
        .maybeSingle();
      setActiveTenantId((profile as { active_tenant_id: string | null } | null)?.active_tenant_id ?? null);

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('tenant:tenants(id, name, slug)')
        .eq('user_id', data.user.id);

      setTenants((userRoles ?? []).map((row) => (row as { tenant: Tenant }).tenant).filter(Boolean));
    });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Tenants disponíveis</h1>
        <ul className="mt-6 space-y-3">
          {tenants.map((tenant) => (
            <li className="rounded-lg border p-4" key={tenant.id}>
              <button className="text-left" onClick={() => setActiveTenantId(tenant.id)} type="button">
                <strong>{tenant.name}</strong>
                <span className="ml-2 text-slate-500">{tenant.slug}</span>
                {activeTenantId === tenant.id ? <span className="ml-3 text-sm text-green-700">ativo</span> : null}
              </button>
            </li>
          ))}
        </ul>
        {!tenants.length ? <p className="mt-6 text-slate-600">Nenhum tenant disponível para este usuário.</p> : null}
      </section>
    </main>
  );
}
