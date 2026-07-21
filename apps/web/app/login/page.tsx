'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError('Não foi possível autenticar com as credenciais informadas.');
      return;
    }

    router.push('/app');
  }

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.55),transparent_28rem),radial-gradient(circle_at_80%_60%,rgba(14,165,233,0.28),transparent_24rem)]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 font-bold shadow-lg shadow-blue-500/30">SLI</div>
          <div>
            <p className="text-sm text-blue-100">Sistema</p>
            <h1 className="text-xl font-semibold">Logístico Integrado</h1>
          </div>
        </div>
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">Dashboard SaaS logístico</p>
          <h2 className="mt-5 text-5xl font-bold leading-tight tracking-tight">Operação integrada com uma experiência moderna e profissional.</h2>
          <p className="mt-6 text-lg leading-8 text-slate-200">Acesse a área autenticada para consultar tenants, planos, assinatura e módulos em uma interface consistente.</p>
        </div>
      </section>
      <section className="flex items-center justify-center bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 shadow-2xl shadow-slate-300/40 backdrop-blur">
          <div className="mb-8 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white">SLI</div>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Acesso seguro</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Entrar no sistema</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use suas credenciais para acessar o Sistema Logístico Integrado.</p>
          <label className="mt-8 block text-sm font-semibold text-slate-700">E-mail</label>
          <input className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label className="mt-5 block text-sm font-semibold text-slate-700">Senha</label>
          <input className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error ? <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <button className="mt-7 w-full rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70" disabled={loading} type="submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
