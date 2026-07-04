type AuthResponse = { access_token?: string; user?: { id: string; email?: string } };

const tokenKey = 'sli_supabase_access_token';

function getConfig() {
  const url =
    process.env.NEXT_PUBLIC_AGENTLOG_SUPABASE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_AGENTLOG_SUPABASE_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase public environment variables are required.');
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getConfig();

  async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
    const token = window.localStorage.getItem(tokenKey);
    const response = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  }

  return {
    auth: {
      async signInWithPassword(credentials: { email: string; password: string }) {
        const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });
        const body = (await response.json()) as AuthResponse & { error_description?: string };
        if (!response.ok || !body.access_token) return { error: new Error(body.error_description ?? 'Authentication failed.') };
        window.localStorage.setItem(tokenKey, body.access_token);
        return { error: null };
      },
      async getUser() {
        const user = await request<{ id: string; email?: string }>('/auth/v1/user');
        return { data: { user } };
      },
      signOut() {
        window.localStorage.removeItem(tokenKey);
      },
    },
    from(table: string) {
      let selected = '*';
      const filters: string[] = [];
      return {
        select(columns: string) {
          selected = columns;
          return this;
        },
        eq(column: string, value: string) {
          filters.push(`${column}=eq.${value}`);
          return this;
        },
        async maybeSingle() {
          const data = await request<unknown[]>(`/rest/v1/${table}?select=${selected}&${filters.join('&')}&limit=1`);
          return { data: data?.[0] ?? null };
        },
        then(resolve: (value: { data: unknown[] }) => void) {
          request<unknown[]>(`/rest/v1/${table}?select=${selected}&${filters.join('&')}`).then((data) => resolve({ data: data ?? [] }));
        },
      };
    },
  };
}
