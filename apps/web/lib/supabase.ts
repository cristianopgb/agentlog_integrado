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
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as T;
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
      const orders: string[] = [];
      let patchBody: Record<string, unknown> | null = null;
      async function run() {
        const query = [`select=${selected}`, ...filters, ...orders].join('&');
        const init = patchBody ? { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patchBody) } : undefined;
        const data = await request<unknown[]>(`/rest/v1/${table}?${query}`, init);
        return { data: data ?? [] };
      }
      return {
        select(columns: string) {
          selected = columns;
          return this;
        },
        update(values: Record<string, unknown>) {
          patchBody = values;
          return this;
        },
        eq(column: string, value: string) {
          filters.push(`${column}=eq.${value}`);
          return this;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push(`order=${column}.${options?.ascending === false ? 'desc' : 'asc'}`);
          return this;
        },
        async maybeSingle() {
          const query = [`select=${selected}`, ...filters, ...orders, 'limit=1'].join('&');
          const data = await request<unknown[]>(`/rest/v1/${table}?${query}`);
          return { data: data?.[0] ?? null };
        },
        then(resolve: (value: { data: unknown[] }) => void) {
          run().then(resolve);
        },
      };
    },
  };
}
