# Sistema Logístico Integrado

Monorepo do **Sistema Logístico Integrado**, um SaaS modular multiempresa para transportadoras com camada inteligente sobre dados operacionais tratados.

O princípio do produto é: **flexível no setup, rígido na operação**. O sistema aceita diferentes fontes legadas, APIs e planilhas contratadas na entrada, mas consolida a operação em contratos, validação, pareamento, modelo canônico, indicadores, dashboards, relatórios e agentes de IA controlados.

## Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS e shadcn.
- **Backend:** NestJS, Node.js e TypeScript.
- **Banco e plataforma de dados:** Supabase Postgres, Auth, Storage e migrations.
- **IA:** OpenAI via AI Gateway/backend, com tools controladas e sem SQL livre.
- **Monorepo:** pnpm workspaces.

Python **não faz parte da stack do produto** e não deve ser usado em desenvolvimento, validação ou automações do MVP.

## Arquitetura resumida

```text
apps/web      → Frontend Next.js
apps/api      → Backend NestJS, autenticação, permissões, regras e AI Gateway
apps/workers  → Estrutura para rotinas internas do monorepo, sem microserviços no MVP
packages/*    → Tipos, schemas, UI, config, utilitários, db e ferramentas compartilhadas
supabase/*    → Migrations e artefatos de banco
```

A operação crítica passa pelo backend. O frontend não deve concentrar regra de negócio crítica, e o backend deve validar autenticação, tenant, módulos, permissões e acesso às tools antes de consultar dados tratados ou disparar ações.

## Fluxo de dados

```text
Legado/API/planilha contratada
  → contrato
  → staging
  → validação
  → pareamento
  → modelo canônico
  → indicadores/dashboards/relatórios/agentes
```

Indicadores nativos, indicadores customizados, dashboards, relatórios e agentes devem consultar somente a base nativa/canônica tratada. Eles não devem depender diretamente de integração, lote, upload, staging, `data_source` ou origem. Ausência de dado deve ser tratada como aguardando dados ou dados insuficientes, não como erro operacional.

## Módulos implementados na versão v0.17-homologacao-ai-dados

- Base multiempresa com `tenant_id` nas tabelas multiempresa.
- Autenticação.
- RBAC, roles e permissões.
- Planos e módulos.
- Setup.
- Fontes de dados.
- Contratos de dados.
- Staging.
- Validação contra contrato.
- Pareamento.
- Modelo canônico operacional.
- `operation_records`.
- Dashboards.
- Indicadores nativos.
- Indicadores customizados.
- Relatórios.
- Central de integrações/logs.
- AI Gateway.
- Chat Geral texto.
- Voice/Reatime, com ressalvas de aliases de voz documentadas.
- Tools controladas.
- Logs de IA em `ai_runs` e `ai_tool_calls`.
- Traces de decisão.
- Indicadores customizados de transitime e R$/ton funcionando em homologação.

## Módulos e frentes ainda pendentes

- Tickets e ocorrências operacionais como workflow completo.
- Canhotos, pendências, bloqueios e pré-faturamento MVP.
- Inbox sem IA.
- WhatsApp provider/webhook.
- Suporte interno SaaS.
- Transporte MVP completo.
- Armazém MVP completo.
- Equipes MVP completo.
- Governança IA avançada.
- Alertas e tarefas.
- Hardening final.

## Comandos principais

```bash
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm --filter @sli/api test:general-chat-tools
```

## Comandos úteis por aplicação

```bash
pnpm --filter @sli/web dev
pnpm --filter @sli/web build
pnpm --filter @sli/web lint
pnpm --filter @sli/web typecheck
pnpm --filter @sli/api dev
pnpm --filter @sli/api build
pnpm --filter @sli/api lint
pnpm --filter @sli/api typecheck
pnpm bootstrap:admin
```

## Regras de IA controlada

Agentes de IA não usam SQL livre, não acessam banco cru e não leem staging/`raw_payload` fora dos fluxos permitidos. A rota correta é passar pelo Backend NestJS, AI Gateway e tools controladas, consultando somente dados tratados no Supabase/Postgres e respeitando tenant, permissões e contratos.

## Homologação v0.17

A versão **v0.17-homologacao-ai-dados** congela o estado técnico atual para homologação de dados, indicadores, relatórios e IA controlada. A documentação de homologação, implantação, release notes, limitações conhecidas e backlog pós-homologação está em `docs/`.
