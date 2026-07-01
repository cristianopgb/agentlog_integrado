# Arquitetura inicial

A Sprint 0 estabelece um monorepo com pnpm workspaces para frontend, backend, workers e packages compartilhados.

## Aplicações

- `apps/web`: Next.js com React, TypeScript, Tailwind CSS e base para shadcn/ui.
- `apps/api`: NestJS com TypeScript e endpoint `GET /health`.
- `apps/workers`: base Node.js/TypeScript sem jobs reais.

## Pacotes compartilhados

Os pacotes em `packages/*` expõem exports mínimos para manter o build funcional. Implementações reais serão adicionadas apenas em sprints futuras aprovadas.
