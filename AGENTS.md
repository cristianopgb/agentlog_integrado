# AGENTS.md - Sistema Logístico Integrado

## Descrição atual do projeto

Sistema Logístico Integrado é um SaaS modular multiempresa com IA controlada para transportadoras.

## Regra principal

Flexível no setup, rígido na operação.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind e shadcn.
- Backend: NestJS, Node e TypeScript.
- Banco: Supabase Postgres, Auth, Storage e migrations.
- IA: via OpenAI apenas por AI Gateway/backend, sem SQL livre.

## Regras obrigatórias para desenvolvimento

1. Implementar somente o escopo solicitado.
2. Não criar funcionalidades futuras.
3. Não usar Python.
4. Não criar microserviços no MVP.
5. Toda alteração de banco exige migration Supabase.
6. Toda tabela multiempresa deve ter `tenant_id`.
7. Nenhuma regra de negócio crítica deve ficar apenas no frontend.
8. Backend deve validar permissões.
9. Não colocar secrets no código.
10. Não permitir SQL livre.
11. Não acessar `raw_payload`/staging diretamente fora dos fluxos permitidos.
12. Agentes não podem acessar banco cru.
13. Dados externos passam por contrato, staging, validação, pareamento e base nativa.

## Estado atual

O projeto já passou pela estrutura técnica inicial e está trabalhando na evolução de indicadores nativos e personalizados sobre a base nativa tratada.

## Diretriz para indicadores

- Indicadores nativos e personalizados devem consultar somente a base nativa/canônica.
- Indicadores nativos e personalizados não devem depender de integração, lote, upload, staging, `data_source` ou origem.
- Ausência de dado deve virar aguardando dados/dados insuficientes, não erro operacional.
