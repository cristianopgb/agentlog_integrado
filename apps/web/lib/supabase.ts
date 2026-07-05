type AuthResponse = { access_token?: string; user?: { id: string; email?: string } };
type RestResult<T> = { data: T | null; error: Error | null };

type SupabaseErrorBody = {
  message?: string;
  msg?: string;
  error?: string;
  error_description?: string;
  details?: string;
  hint?: string;
  code?: string;
};

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

function buildRestError(status: number, statusText: string, body: string): Error {
  let parsed: SupabaseErrorBody | null = null;
  try {
    parsed = body ? (JSON.parse(body) as SupabaseErrorBody) : null;
  } catch {
    parsed = null;
  }

  const message =
    parsed?.message ??
    parsed?.error_description ??
    parsed?.error ??
    parsed?.msg ??
    (body || statusText || 'Supabase request failed.');
  const details = [parsed?.details, parsed?.hint, parsed?.code ? `code: ${parsed.code}` : null]
    .filter(Boolean)
    .join(' ');
  return new Error(`Supabase REST ${status}: ${message}${details ? ` (${details})` : ''}`);
}

function encodeQueryParam(key: string, value: string) {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getConfig();

  async function request<T>(path: string, init?: RequestInit): Promise<RestResult<T>> {
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
    const text = response.status === 204 ? '' : await response.text();
    if (!response.ok) return { data: null, error: buildRestError(response.status, response.statusText, text) };
    if (!text) return { data: null, error: null };
    try {
      return { data: JSON.parse(text) as T, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Invalid Supabase JSON response.') };
    }
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
        const { data: user, error } = await request<{ id: string; email?: string }>('/auth/v1/user');
        return { data: { user }, error };
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
      let insertBody: Record<string, unknown> | null = null;
      async function run() {
        const query = [encodeQueryParam('select', selected), ...filters, ...orders].join('&');
        const init = insertBody
          ? { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(insertBody) }
          : patchBody
            ? { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patchBody) }
            : undefined;
        const { data, error } = await request<unknown[]>(`/rest/v1/${table}?${query}`, init);
        return { data: data ?? [], error };
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
        insert(values: Record<string, unknown>) {
          insertBody = values;
          return this;
        },
        eq(column: string, value: string) {
          filters.push(encodeQueryParam(column, `eq.${value}`));
          return this;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push(encodeQueryParam('order', `${column}.${options?.ascending === false ? 'desc' : 'asc'}`));
          return this;
        },
        async maybeSingle() {
          const query = [encodeQueryParam('select', selected), ...filters, ...orders, encodeQueryParam('limit', '1')].join('&');
          const { data, error } = await request<unknown[]>(`/rest/v1/${table}?${query}`);
          return { data: data?.[0] ?? null, error };
        },
        then(resolve: (value: { data: unknown[]; error: Error | null }) => void, reject?: (reason: unknown) => void) {
          run().then(resolve, reject);
        },
      };
    },
  };
}
