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
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Entrar no Sistema Logístico Integrado</h1>
        <label className="mt-6 block text-sm font-medium">E-mail</label>
        <input className="mt-2 w-full rounded-md border px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="mt-4 block text-sm font-medium">Senha</label>
        <input className="mt-2 w-full rounded-md border px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        <button className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white" disabled={loading} type="submit">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
