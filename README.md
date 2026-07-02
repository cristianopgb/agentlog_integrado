# Sistema Logístico Integrado

Monorepo da Sprint 0 do Sistema Logístico Integrado, um SaaS modular multiempresa para transportadoras.

## Estrutura

- `apps/web`: frontend Next.js, React, TypeScript e Tailwind CSS.
- `apps/api`: backend NestJS com endpoint `GET /health`.
- `apps/workers`: estrutura inicial Node.js/TypeScript sem jobs reais.
- `packages/*`: pacotes compartilhados com exports mínimos.
- `supabase/migrations`: diretório reservado para migrations futuras.
- `docs`: documentação inicial do projeto.

## Pré-requisitos

- Node.js 20.11 ou superior.
- pnpm 10.x.

## Instalação

```bash
pnpm install
```

## Rodar localmente

### Frontend

```bash
pnpm --filter @sli/web dev
```

O frontend roda por padrão em `http://localhost:3000`.

### Backend

```bash
pnpm --filter @sli/api dev
```

O backend roda por padrão em `http://localhost:3001`.

Healthcheck:

```bash
curl http://localhost:3001/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "service": "api",
  "project": "Sistema Logístico Integrado"
}
```

### Frontend e backend juntos

```bash
pnpm dev
```

## Qualidade e build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Vercel

A configuração de deploy deve ficar no painel da Vercel. Este repositório não força `buildCommand`, `installCommand` ou `outputDirectory` via `vercel.json`, evitando conflito com o Root Directory do painel.

Configure o projeto na Vercel com:

- Root Directory: `apps/web`.
- Framework Preset: `Next.js`.
- Node.js Version: `22.x`.
- Install Command: `corepack enable && corepack prepare pnpm@10.14.0 --activate && cd ../.. && pnpm install --no-frozen-lockfile`.
- Build Command: sem override.
- Output Directory: sem override.
- Não configure `apps/web/.next` como Output Directory; com Root Directory `apps/web`, isso duplica o caminho e faz a Vercel procurar `apps/web/apps/web/.next`.

Com o Root Directory em `apps/web` e sem overrides de build/output, o Next.js gera o diretório `.next` padrão dentro de `apps/web`. O `packageManager` da raiz fixa o pnpm em `10.14.0` para evitar incompatibilidade com versões antigas usadas durante o install.

## Limites da Sprint 0

Esta sprint não cria banco, migrations reais, autenticação, tenants, permissões, dashboard real, módulos operacionais, integrações externas, WhatsApp, OpenAI, filas reais, jobs reais ou agentes de IA.
