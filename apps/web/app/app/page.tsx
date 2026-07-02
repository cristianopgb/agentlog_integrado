'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../lib/supabase';

type Profile = { full_name: string | null; active_tenant_id: string | null } | null;
type Tenant = { id: string; name: string; slug: string };

export default function AppPage() {
  const [email, setEmail] = useState<string | undefined>();
  const [profile, setProfile] = useState<Profile>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email);
      if (!data.user) return;

      const { data: profileData } = await supabase
        .from('users_profile')
        .select('full_name, active_tenant_id')
        .eq('id', data.user.id)
        .maybeSingle();
      setProfile(profileData as Profile);

      if ((profileData as Profile)?.active_tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug')
          .eq('id', (profileData as Profile)!.active_tenant_id!)
          .maybeSingle();
        setActiveTenant(tenantData as Tenant | null);
      }
    });
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">Sistema Logístico Integrado</h1>
        <p className="mt-4 text-slate-600">Área autenticada inicial da Sprint 1.</p>
        <div className="mt-6 space-y-2 rounded-lg bg-slate-50 p-4">
          <p><strong>Usuário autenticado:</strong> {email ?? 'não carregado'}</p>
          <p><strong>Perfil:</strong> {profile?.full_name ?? 'sem nome informado'}</p>
          <p><strong>Tenant ativo:</strong> {activeTenant ? `${activeTenant.name} (${activeTenant.slug})` : 'nenhum tenant ativo'}</p>
        </div>
        <Link className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-white" href="/app/tenants">Ver tenants</Link>
      </section>
    </main>
  );
}
