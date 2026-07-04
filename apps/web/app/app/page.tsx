'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../lib/supabase';
import { Card, SectionHeader, StatusBadge } from '../../components/ui';

type Profile = { full_name: string | null; active_tenant_id: string | null } | null;
type Tenant = { id: string; name: string; slug: string };

const quickLinks = [
  { href: '/app/tenants', title: 'Tenants', description: 'Visualize os tenants vinculados ao usuário.' },
  { href: '/app/admin/plans', title: 'Planos', description: 'Consulte a vitrine interna dos planos ativos.' },
  { href: '/app/admin/subscription', title: 'Assinatura', description: 'Acompanhe o plano e limites do tenant ativo.' },
  { href: '/app/admin/modules', title: 'Módulos', description: 'Compare disponibilidade, plano e ativação por tenant.' },
];

export default function AppPage() {
  const [email, setEmail] = useState<string | undefined>();
  const [profile, setProfile] = useState<Profile>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email);
      if (!data.user) return;

      const { data: profileData } = await supabase.from('users_profile').select('full_name, active_tenant_id').eq('id', data.user.id).maybeSingle();
      setProfile(profileData as Profile);

      if ((profileData as Profile)?.active_tenant_id) {
        const { data: tenantData } = await supabase.from('tenants').select('id, name, slug').eq('id', (profileData as Profile)!.active_tenant_id!).maybeSingle();
        setActiveTenant(tenantData as Tenant | null);
      }
    });
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <SectionHeader eyebrow="Dashboard" title="Bem-vindo ao Sistema Logístico Integrado" description="Base visual inicial para navegação pelas áreas existentes do SaaS logístico, mantendo a operação simples e consistente." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Usuário autenticado</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{profile?.full_name ?? 'Sem nome informado'}</h2>
              <p className="mt-1 text-slate-600">{email ?? 'E-mail não carregado'}</p>
            </div>
            <StatusBadge tone={activeTenant ? 'success' : 'warning'}>{activeTenant ? 'Tenant ativo' : 'Sem tenant ativo'}</StatusBadge>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tenant ativo</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{activeTenant?.name ?? 'Não selecionado'}</h2>
          <p className="mt-1 text-slate-600">{activeTenant?.slug ?? 'Selecione um tenant para contextualizar as consultas.'}</p>
        </Card>
      </div>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Navegação rápida">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href} className="group rounded-2xl border border-border/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-lg font-bold text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">{item.title.charAt(0)}</div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            <span className="mt-5 inline-flex text-sm font-semibold text-blue-700">Acessar →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
