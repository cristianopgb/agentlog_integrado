type User = { id: string; email?: string };
type ModuleRow = { id: string; name: string };

const requiredVariables = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'BOOTSTRAP_ADMIN_FULL_NAME',
  'BOOTSTRAP_TENANT_NAME',
  'BOOTSTRAP_TENANT_SLUG',
] as const;

function readEnv(name: (typeof requiredVariables)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const baseUrl = readEnv('SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function upsertSingle<T>(table: string, row: Record<string, unknown>, onConflict: string, select: string): Promise<T> {
  const encodedConflict = encodeURIComponent(onConflict);
  return request<T[]>(`/rest/v1/${table}?on_conflict=${encodedConflict}&select=${select}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  }).then((rows) => rows[0]);
}

async function main() {
  for (const variable of requiredVariables) readEnv(variable);

  const email = readEnv('BOOTSTRAP_ADMIN_EMAIL');
  const users = await request<{ users: User[] }>('/auth/v1/admin/users');
  let authUser = users.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  const userAlreadyExisted = Boolean(authUser);

  if (!authUser) {
    authUser = await request<User>('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: readEnv('BOOTSTRAP_ADMIN_PASSWORD'),
        email_confirm: true,
        user_metadata: { full_name: readEnv('BOOTSTRAP_ADMIN_FULL_NAME') },
      }),
    });
  }

  const tenant = await upsertSingle<{ id: string; name: string; slug: string }>(
    'tenants',
    { name: readEnv('BOOTSTRAP_TENANT_NAME'), slug: readEnv('BOOTSTRAP_TENANT_SLUG') },
    'slug',
    'id,name,slug',
  );

  await upsertSingle('users_profile', { id: authUser.id, full_name: readEnv('BOOTSTRAP_ADMIN_FULL_NAME'), active_tenant_id: tenant.id }, 'id', 'id');
  const role = await upsertSingle<{ id: string }>('roles', { tenant_id: tenant.id, key: 'owner', name: 'Dono / Administrador' }, 'tenant_id,key', 'id');
  await upsertSingle('user_roles', { tenant_id: tenant.id, user_id: authUser.id, role_id: role.id }, 'tenant_id,user_id,role_id', 'id');

  const modules = await request<ModuleRow[]>('/rest/v1/modules?select=id,name&key=in.(core,transporte,atendimento,armazem,financeiro,equipes)');
  if (modules.length) {
    await request('/rest/v1/tenant_modules?on_conflict=tenant_id,module_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(modules.map((module) => ({ tenant_id: tenant.id, module_id: module.id, is_active: true }))),
    });
  }

  console.log(`Usuário: ${userAlreadyExisted ? 'já existente' : 'criado'} (${email})`);
  console.log(`Tenant: criado ou já existente (${tenant.name} / ${tenant.slug})`);
  console.log(`Módulos ativados: ${modules.map((module) => module.name).join(', ')}`);
  console.log('Acesse /login com o usuário configurado localmente.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
