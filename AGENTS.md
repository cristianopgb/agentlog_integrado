# AGENTS.md - Sistema Logístico Integrado

O projeto é o Sistema Logístico Integrado, um SaaS modular multiempresa com IA para transportadoras.

## Regras obrigatórias para desenvolvimento

1. Implementar somente a sprint solicitada.
2. Não criar funcionalidades futuras.
3. Não usar Python.
4. Não criar microserviços no MVP.
5. Toda alteração de banco exige migration Supabase.
6. Toda tabela multiempresa deve ter tenant_id.
7. Nenhuma regra de negócio crítica deve ficar apenas no frontend.
8. Backend deve validar permissões.
9. Não colocar secrets no código.
10. Não permitir SQL livre por agente.
11. IA não pode acessar banco cru.
12. Dados externos devem passar por contrato de dados, staging, validação, pareamento e modelo canônico.
13. Flexível no setup, rígido na operação.

## Escopo atual

A Sprint 0 contém apenas a estrutura técnica inicial do monorepo. Não implemente banco, autenticação, tenants, permissões, dashboards, módulos operacionais, integrações, WhatsApp ou IA sem solicitação explícita em sprint futura.
