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

Python não faz parte da stack do produto.

## Fluxo correto dos agentes

```text
Frontend
  → Backend NestJS
  → AI Gateway
  → Agente
  → Tools controladas
  → Supabase/Postgres tratado
  → Resposta
```

Agentes não devem contornar o backend, acessar banco cru, consultar staging diretamente, executar SQL livre ou interpretar planilhas fora dos contratos de dados.

## Agentes previstos

- Financeiro
- Atendimento
- Transporte
- Armazém
- Equipes
- SaaSAdmin
- SetupDev

## Estado atual dos agentes

- Chat Geral texto funcional.
- Voice/Reatime funcional, com ressalvas de alias de voz ainda documentadas como limitação conhecida.
- Ferramentas controladas em uso.
- Logs de execução registrados em `ai_runs` e `ai_tool_calls`.
- Traces de decisão disponíveis para auditoria de uso das ferramentas.

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
14. IA não altera status crítico sem permissão explícita e validação no backend.
15. IA não interpreta planilha fora do contrato.
16. IA deve consultar dados tratados e tools controladas.

## Estado atual

O projeto está congelado como marco técnico de homologação **v0.17-homologacao-ai-dados**, com foco em dados tratados, indicadores nativos e personalizados, dashboards, relatórios e IA controlada.

## Diretriz para indicadores

- Indicadores nativos e personalizados devem consultar somente a base nativa/canônica.
- Indicadores nativos e personalizados não devem depender de integração, lote, upload, staging, `data_source` ou origem.
- Ausência de dado deve virar aguardando dados/dados insuficientes, não erro operacional.
