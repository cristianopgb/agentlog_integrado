'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createBrowserSupabaseClient } from '../lib/supabase';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../lib/rbac';

type Profile = { full_name: string | null; active_tenant_id: string | null } | null;
type Tenant = { id: string; name: string; slug: string } | null;

const navigation = [
  { href: '/app', label: 'Início', marker: 'I', permission: 'core.app.view' },
  { href: '/app/dashboards', label: 'Dashboards', marker: 'D', permission: 'dashboards.view' },
  { href: '/app/integrations', label: 'Integrações', marker: 'I', permission: 'core.data_sources.view' },
  { href: '/app/native-data', label: 'Dados tratados', marker: 'B', permission: 'native_records.view' },
  { href: '/app/indicators', label: 'Indicadores', marker: 'N', permission: 'indicators.view' },
  { href: '/app/reports', label: 'Relatórios', marker: 'R', badge: 'em breve' },
  { href: '/app/agents', label: 'Agentes', marker: 'A', badge: 'em breve' },
];

const adminNavigation = [
  { href: '/app/tenants', label: 'Tenants', marker: 'T', permission: 'core.tenants.view' },
  { href: '/app/admin/plans', label: 'Planos', marker: 'P', permission: 'commercial.plans.view' },
  { href: '/app/admin/subscription', label: 'Assinatura', marker: 'S', permission: 'commercial.subscription.view' },
  { href: '/app/admin/modules', label: 'Módulos', marker: 'M', permission: 'core.modules.view' },
  { href: '/app/admin/roles', label: 'Roles', marker: 'R', permission: 'core.roles.view' },
  { href: '/app/admin/permissions', label: 'Permissões', marker: 'K', permission: 'core.permissions.view' },
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_32rem),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-white/70 bg-slate-950 text-white shadow-2xl shadow-slate-950/20 lg:flex lg:flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500 font-bold shadow-lg shadow-blue-500/30">SLI</div>
            <div>
              <p className="text-sm text-slate-300">Sistema</p>
              <p className="font-semibold leading-tight">Logístico Integrado</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto px-4" aria-label="Navegação autenticada">
          {navigation.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => {
            const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${active ? 'bg-blue-600 text-white' : 'bg-white/10'}`}>{item.marker}</span>
                <span className="flex-1">{item.label}</span>
                {'badge' in item ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{item.badge}</span> : null}
              </Link>
            );
          })}
          <div className="pt-4">
            <p className="px-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Administração</p>
            <div className="mt-2 space-y-2">
              {adminNavigation.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => {
                const active = pathname === item.href;
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${active ? 'bg-blue-600 text-white' : 'bg-white/10'}`}>{item.marker}</span>{item.label}</Link>;
              })}
            </div>
          </div>
        </nav>
        <div className="m-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm">
          <p className="text-slate-300">Usuário</p>
          <p className="mt-1 truncate font-semibold">{profile?.full_name ?? email ?? 'Carregando...'}</p>
          <p className="mt-3 text-slate-300">Tenant ativo</p>
          <p className="mt-1 truncate font-semibold">{tenant ? `${tenant.name} · ${tenant.slug}` : 'Não selecionado'}</p>
          <button className="mt-4 w-full rounded-xl bg-white px-3 py-2 font-semibold text-slate-950 transition hover:bg-blue-50" onClick={handleSignOut} type="button">Sair</button>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-600">Sistema Logístico Integrado</p>
              <p className="text-xs text-slate-500">{tenant ? `Tenant ativo: ${tenant.name}` : 'Tenant ativo não selecionado'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">{email ?? 'Usuário não carregado'}</span>
              <button className="rounded-full bg-slate-950 px-4 py-1.5 font-semibold text-white" onClick={handleSignOut} type="button">Sair</button>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden" aria-label="Navegação autenticada mobile">
            {[...navigation, ...adminNavigation].filter((item) => !item.permission || hasPermission(permissions, item.permission)).map((item) => <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${pathname === item.href ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{item.label}</Link>)}
          </nav>
        </header>
        <main className="px-4 py-8 md:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
