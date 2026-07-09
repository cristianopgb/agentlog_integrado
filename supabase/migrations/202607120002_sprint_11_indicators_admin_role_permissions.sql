-- Sprint 11 — vincula permissões de indicadores nativos aos roles administrativos existentes
with permission_seed(key, name, module_key, resource, action, description) as (
  values
    ('indicators.view', 'Visualizar indicadores nativos', 'indicators', 'indicators', 'view', 'Permite acessar o catálogo de indicadores nativos.'),
    ('indicators.preview', 'Calcular prévia de indicadores nativos', 'indicators', 'indicators', 'preview', 'Permite calcular prévias dos indicadores nativos.')
)
insert into public.permissions (key, name, module_key, resource, action, description)
select key, name, module_key, resource, action, description
from permission_seed
on conflict (key) do update set
  name = excluded.name,
  module_key = excluded.module_key,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('owner', 'admin', 'super_admin', 'administrador')
  and p.key in ('indicators.view', 'indicators.preview')
on conflict (tenant_id, role_id, permission_id) do nothing;
