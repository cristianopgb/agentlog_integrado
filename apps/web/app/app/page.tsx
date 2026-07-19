'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '../../lib/supabase';
import { Card, SectionHeader, StatusBadge } from '../../components/ui';
import { AppStatCard } from '../../components/app';
import { Building2, ChartNoAxesCombined, Gauge, PlugZap } from 'lucide-react';

type Profile = { full_name: string | null; active_tenant_id: string | null } | null;
type Tenant = { id: string; name: string; slug: string };

const quickLinks = [
  { href: '/app/dashboards', title: 'Dashboards', description: 'Acompanhe suas visões publicadas e rascunhos.', icon: Gauge },
  { href: '/app/integrations', title: 'Integrações', description: 'Consulte fontes de dados e suas etapas de configuração.', icon: PlugZap },
  { href: '/app/native-data', title: 'Dados tratados', description: 'Visualize a base operacional normalizada.', icon: Building2 },
  { href: '/app/indicators', title: 'Indicadores', description: 'Acesse indicadores nativos e personalizados.', icon: ChartNoAxesCombined },
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
    <div className="app-page mx-auto max-w-7xl space-y-8">
      <SectionHeader eyebrow="Visão geral" title={`Olá${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.`} description="Acompanhe a operação da sua empresa e acesse rapidamente os módulos disponíveis." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AppStatCard label="Empresa ativa" value={activeTenant?.name ?? 'Não selecionada'} description={activeTenant?.slug ?? 'Selecione uma empresa para contextualizar as consultas.'} icon={<Building2 className="h-5 w-5" />} />
        <AppStatCard label="Situação da conta" value={activeTenant ? 'Pronta para operar' : 'Aguardando seleção'} description={activeTenant ? 'Contexto da empresa carregado.' : 'Defina uma empresa ativa para continuar.'} icon={<ChartNoAxesCombined className="h-5 w-5" />} />
        <AppStatCard label="Acesso autenticado" value={email ? 'Conectado' : 'Carregando'} description={email ?? 'Validando a sessão atual.'} icon={<Gauge className="h-5 w-5" />} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-gradient-to-br from-white via-white to-blue-50/60">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Sessão atual</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{profile?.full_name ?? 'Sem nome informado'}</h2>
              <p className="mt-1 text-slate-600">{email ?? 'E-mail não carregado'}</p>
            </div>
            <StatusBadge tone={activeTenant ? 'success' : 'warning'}>{activeTenant ? 'Tenant ativo' : 'Sem tenant ativo'}</StatusBadge>
          </div>
        </Card>
        <Card className="bg-[#0b2040] text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-200">Empresa ativa</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{activeTenant?.name ?? 'Não selecionada'}</h2>
          <p className="mt-1 text-slate-300">{activeTenant?.slug ?? 'Selecione uma empresa para contextualizar as consultas.'}</p>
        </Card>
      </div>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Navegação rápida">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white"><item.icon className="h-5 w-5" /></div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            <span className="mt-5 inline-flex text-sm font-semibold text-blue-700">Acessar →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
