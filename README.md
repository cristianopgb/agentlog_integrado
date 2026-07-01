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

Para publicar o frontend na Vercel, configure o projeto apontando para `apps/web` como aplicação Next.js dentro do monorepo. O arquivo `vercel.json` na raiz fornece comandos mínimos para instalar dependências e executar o build do app web.

## Limites da Sprint 0

Esta sprint não cria banco, migrations reais, autenticação, tenants, permissões, dashboard real, módulos operacionais, integrações externas, WhatsApp, OpenAI, filas reais, jobs reais ou agentes de IA.
