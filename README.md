# Sistema Logístico Integrado

Monorepo do **Sistema Logístico Integrado**, um SaaS modular multiempresa para transportadoras.

A Sprint 1 entrega somente a fundação SaaS multiempresa: Supabase Auth, tenants, perfis, roles, permissions, catálogo de módulos, vínculos de módulos por tenant, RLS básica, endpoints mínimos protegidos e telas mínimas de login/área autenticada.

## Estrutura

```text
.
├── apps
│   ├── web       # Frontend Next.js, React, TypeScript e Tailwind CSS
│   ├── api       # Backend NestJS com healthcheck e endpoints mínimos Sprint 1
│   └── workers   # Estrutura inicial de workers sem funcionalidades operacionais
├── packages      # Pacotes compartilhados do monorepo
├── docs          # Documentação inicial do projeto
├── supabase      # Migrations e seed do Supabase
└── pnpm-workspace.yaml
```

## Pré-requisitos

- Node.js 20.11 ou superior.
- Corepack habilitado.
- pnpm 10.14.0.
- Projeto Supabase configurado localmente ou remoto.

## Instalação

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install
```

## Primeiro acesso seguro

1. Configure as variáveis Supabase no `.env` local usando `.env.example` como referência.
2. Aplique a migration da Sprint 1 em `supabase/migrations/202607020001_sprint_1_core_multitenancy.sql`.
3. Preencha localmente `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_TENANT_NAME` e `BOOTSTRAP_TENANT_SLUG`.
4. Rode o bootstrap manual e idempotente:

```bash
pnpm bootstrap:admin
```

5. Acesse `/login` com o usuário criado.

O script de bootstrap usa `SUPABASE_SERVICE_ROLE_KEY` somente no backend/script, não imprime senha, tokens ou service role, e não cria cadastro público.

## Comandos de frontend

```bash
pnpm --filter @sli/web dev
pnpm --filter @sli/web build
pnpm --filter @sli/web lint
pnpm --filter @sli/web typecheck
```

## Comandos de backend

```bash
pnpm --filter @sli/api dev
pnpm --filter @sli/api build
pnpm --filter @sli/api lint
pnpm --filter @sli/api typecheck
pnpm --filter @sli/api bootstrap:admin
```

## Endpoints Sprint 1

- `GET /health` permanece público para healthcheck.
- `GET /users/me` retorna usuário autenticado e perfil.
- `GET /tenants` retorna somente tenants do usuário autenticado.
- `GET /tenants/:tenantId/modules` retorna módulos ativos do tenant somente se o usuário pertencer ao tenant.
- `GET /modules` retorna catálogo global de módulos ativos para usuário autenticado.

## Telas Sprint 1

- `/login`: login por e-mail e senha com Supabase Auth, sem cadastro público.
- `/app`: área autenticada simples com estado do usuário e tenant ativo.
- `/app/tenants`: lista tenants do usuário e permite seleção local do tenant ativo.

## Banco Sprint 1

Migration criada:

- `supabase/migrations/202607020001_sprint_1_core_multitenancy.sql`

Tabelas criadas:

- `tenants`
- `users_profile`
- `roles`
- `permissions`
- `user_roles`
- `modules`
- `tenant_modules`

Módulos semeados:

- Core
- Transporte
- Atendimento
- Armazém
- Financeiro
- Equipes

## Comandos de qualidade

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Limites da Sprint 1

Não foram implementados dashboards reais, SaaS Admin, planos, cobrança, setup kanban, contratos de dados, staging, pareamento, tickets, módulos operacionais, WhatsApp, OpenAI ou agentes de IA.
