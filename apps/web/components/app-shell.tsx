'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Blocks, Building2, ChartNoAxesCombined, CircleUserRound, FileBarChart, Gauge, KeyRound, LayoutDashboard, PackageOpen, PanelTop, PlugZap, ScrollText, Settings2, Tags, UsersRound } from 'lucide-react';
import { createBrowserSupabaseClient } from '../lib/supabase';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../lib/rbac';
import { GlobalAgentChat } from './agents/global-agent-chat';

type Profile = { full_name: string | null; active_tenant_id: string | null } | null;
type Tenant = { id: string; name: string; slug: string } | null;

const navigation = [
  { href: '/app', label: 'Visão geral', icon: LayoutDashboard, permission: 'core.app.view' },
  { href: '/app/dashboards', label: 'Dashboards', icon: Gauge, permission: 'dashboards.view' },
  { href: '/app/integrations', label: 'Integrações', icon: PlugZap, permission: 'core.data_sources.view' },
  { href: '/app/native-data', label: 'Dados tratados', icon: PackageOpen, permission: 'native_records.view' },
  { href: '/app/indicators', label: 'Indicadores', icon: ChartNoAxesCombined, permission: 'indicators.view' },
  { href: '/app/reports', label: 'Relatórios', icon: FileBarChart, permission: 'reports.view' },
  { href: '/app/agents', label: 'Agentes', icon: Blocks, badge: 'em breve' },
];

const setupNavigation = [
  { href: '/app/setup', label: 'Configuração de dados', icon: Settings2, permission: 'setup.projects.view' },
  { href: '/app/setup/reports', label: 'Configuração de relatórios', icon: FileBarChart, permission: 'reports.configure' },
  { href: '/app/setup/agents', label: 'Configuração de agentes', icon: Blocks, permission: 'agents.configure' },
  { href: '/app/setup/knowledge', label: 'Base de conhecimento', icon: ScrollText, permission: 'knowledge.manage' },
];

const adminNavigation = [
  { href: '/app/tenants', label: 'Empresas', icon: Building2, permission: 'core.tenants.view' },
  { href: '/app/admin/plans', label: 'Planos', icon: Tags, permission: 'commercial.plans.view' },
  { href: '/app/admin/subscription', label: 'Assinatura', icon: ScrollText, permission: 'commercial.subscription.view' },
  { href: '/app/admin/modules', label: 'Módulos', icon: PanelTop, permission: 'core.modules.view' },
  { href: '/app/admin/roles', label: 'Funções', icon: UsersRound, permission: 'core.roles.view' },
  { href: '/app/admin/permissions', label: 'Permissões', icon: KeyRound, permission: 'core.permissions.view' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | undefined>();
  const [profile, setProfile] = useState<Profile>(null);
  const [tenant, setTenant] = useState<Tenant>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email);
      if (!data.user) return;

      const { data: profileData } = await supabase.from('users_profile').select('full_name, active_tenant_id').eq('id', data.user.id).maybeSingle();
      const loadedProfile = profileData as Profile;
      setProfile(loadedProfile);

      if (loadedProfile?.active_tenant_id) {
        const { data: tenantData } = await supabase.from('tenants').select('id, name, slug').eq('id', loadedProfile.active_tenant_id).maybeSingle();
        setTenant(tenantData as Tenant);
        setPermissions(await getCurrentUserPermissions(loadedProfile.active_tenant_id));
      }
    });
  }, []);

  function handleSignOut() {
    createBrowserSupabaseClient().auth.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[17.5rem] border-r border-white/[0.08] bg-[linear-gradient(165deg,#06142c_0%,#0a2042_50%,#071a35_100%)] text-white shadow-[18px_0_45px_rgba(15,23,42,0.12)] lg:flex lg:flex-col">
        <div className="p-5 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-sm font-black shadow-lg shadow-blue-950/40">SLI</div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-200/70">Sistema</p>
              <p className="text-sm font-semibold leading-tight">Logístico Integrado</p>
            </div>
          </div>
        </div>
        <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3" aria-label="Navegação autenticada">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400/70">Operação</p>
          {navigation.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => {
            const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${active ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-950/25' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-white/20 text-white' : 'bg-white/[0.07] text-slate-300'}`}><Icon className="h-4 w-4" /></span>
                <span className="flex-1">{item.label}</span>
                {'badge' in item ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-100">{item.badge}</span> : null}
              </Link>
            );
          })}
          <div className="pt-4">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400/70">Implantação</p>
            <div className="mt-2 space-y-1">
              {setupNavigation.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${active ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-950/25' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-white/20 text-white' : 'bg-white/[0.07] text-slate-300'}`}><Icon className="h-4 w-4" /></span>{item.label}</Link>;
              })}
            </div>
          </div>
          <div className="pt-4">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400/70">Administração</p>
            <div className="mt-2 space-y-1">
              {adminNavigation.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${active ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-950/25' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-white/20 text-white' : 'bg-white/[0.07] text-slate-300'}`}><Icon className="h-4 w-4" /></span>{item.label}</Link>;
              })}
            </div>
          </div>
        </nav>
        <div className="m-4 mt-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.10] to-white/[0.04] p-4 text-sm shadow-inner shadow-white/[0.03]">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/15 text-sky-100"><CircleUserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate font-semibold">{profile?.full_name ?? email ?? 'Carregando...'}</p><p className="truncate text-xs text-slate-400">{email ?? 'Usuário autenticado'}</p></div></div>
          <div className="mt-4 border-t border-white/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Empresa ativa</p><p className="mt-1 truncate font-medium text-slate-100">{tenant ? tenant.name : 'Não selecionada'}</p></div>
          <button className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.10] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.18]" onClick={handleSignOut} type="button">Encerrar sessão</button>
        </div>
      </aside>
      <div className="lg:pl-[17.5rem]">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-xl md:px-8 lg:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Área de trabalho</p>
              <p className="mt-0.5 text-xs text-slate-500">{tenant ? `Empresa ativa: ${tenant.name}` : 'Selecione uma empresa para continuar'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs md:inline-flex">{email ?? 'Usuário não carregado'}</span><button aria-label="Notificações" className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50"><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" /><Bell className="h-4 w-4" /></button>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden" aria-label="Navegação autenticada mobile">
            {[...navigation, ...setupNavigation, ...adminNavigation].filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${pathname === item.href ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{item.label}</Link>)}
          </nav>
        </header>
        <main className="min-h-[calc(100vh-76px)] bg-[#f6f8fc] px-4 py-6 md:px-8 lg:px-10 lg:py-7">{children}</main>
      </div>
      <GlobalAgentChat />
    </div>
  );
}
