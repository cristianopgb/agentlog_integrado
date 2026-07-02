# Sistema Logístico Integrado

Monorepo da Sprint 0 do **Sistema Logístico Integrado**, um SaaS modular multiempresa com IA para transportadoras.

A Sprint 0 entrega somente a base técnica do repositório: estrutura de monorepo, aplicações iniciais, pacotes compartilhados, documentação e diretório reservado para Supabase. Funcionalidades de produto serão implementadas apenas em sprints futuras.

## Estrutura

```text
.
├── apps
│   ├── web       # Frontend Next.js, React, TypeScript e Tailwind CSS
│   ├── api       # Backend NestJS com healthcheck inicial
│   └── workers   # Estrutura inicial para workers Node.js/TypeScript
├── packages      # Pacotes compartilhados do monorepo
├── docs          # Documentação inicial do projeto
├── supabase      # Estrutura reservada para Supabase
├── package.json  # Scripts raiz e configuração do workspace
└── pnpm-workspace.yaml
```

## Pré-requisitos

- Node.js 20.11 ou superior para desenvolvimento local.
- Node.js 22.x recomendado para Preview/Production na Vercel.
- Corepack habilitado.
- pnpm 10.14.0.

## Instalação

A partir da raiz do repositório:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install
```

## Comandos de frontend

Executar a partir da raiz do repositório:

```bash
pnpm --filter @sli/web dev
pnpm --filter @sli/web build
pnpm --filter @sli/web lint
pnpm --filter @sli/web typecheck
```

Por padrão, o frontend roda em `http://localhost:3000` durante o desenvolvimento.

## Comandos de backend

Executar a partir da raiz do repositório:

```bash
pnpm --filter @sli/api dev
pnpm --filter @sli/api build
pnpm --filter @sli/api lint
pnpm --filter @sli/api typecheck
```

## Healthcheck

Com a API em execução, o healthcheck inicial pode ser validado em:

```bash
curl http://localhost:3001/health
```

O endpoint existe apenas para validar que a aplicação backend inicial está respondendo.

## Comandos de qualidade

Executar a partir da raiz do repositório:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

Para formatar arquivos quando necessário:

```bash
pnpm format
```

## Configuração Vercel

A configuração de deploy deve ficar no painel da Vercel, sem arquivo `vercel.json` na raiz do repositório.

Configuração esperada do projeto Vercel:

- **Root Directory:** `apps/web`
- **Framework Preset:** `Next.js`
- **Node.js Version:** `22.x`
- **Install Command:** `corepack enable && corepack prepare pnpm@10.14.0 --activate && cd ../.. && pnpm install --no-frozen-lockfile`
- **Build Command:** sem override
- **Output Directory:** sem override

> Com **Root Directory** configurado como `apps/web`, não configure `apps/web/.next` como **Output Directory**. O Next.js e a Vercel resolvem a saída de build automaticamente a partir do diretório raiz configurado.

Também não é necessário sobrescrever `buildCommand`, `installCommand` ou `outputDirectory` em arquivo de configuração versionado para a Sprint 0.

## Limites da Sprint 0

Esta sprint contém apenas limpeza e estrutura técnica inicial. Não fazem parte da Sprint 0:

- banco de dados ou migrations reais;
- configuração Supabase;
- configuração OpenAI;
- autenticação;
- tenants;
- roles;
- permissions;
- dashboards;
- módulos operacionais;
- integrações externas;
- WhatsApp;
- agentes de IA com acesso a dados reais.

Qualquer evolução funcional deve ser solicitada explicitamente em sprint futura.
