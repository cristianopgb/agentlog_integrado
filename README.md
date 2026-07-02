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
