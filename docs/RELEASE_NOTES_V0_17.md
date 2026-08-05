# v0.17-homologacao-ai-dados

## Principais entregas

- Congelamento técnico da versão atual para homologação.
- Documentação do estado real do sistema.
- Checklist de homologação técnica.
- Plano de implantação.
- Backlog pós-homologação organizado.
- Limitações conhecidas documentadas.

## Dados e integrações

- Fluxo de dados tratado por contrato, staging, validação, pareamento e modelo canônico.
- Fontes de dados e contratos ativos no escopo de homologação.
- Publicação canônica para `operation_records`.
- Central de integrações/logs disponível para acompanhamento.

## Dashboards e indicadores

- Dashboards publicados para validação.
- Cards nativos carregando sobre base tratada.
- Indicadores customizados em uso.
- Indicadores de transitime e R$/ton funcionando em homologação.

## Relatórios

- Definições de relatório disponíveis.
- Geração por job e snapshot prevista no fluxo.
- Exportação e logs de exportação validados quando aplicáveis.

## IA controlada

- AI Gateway em uso pelo backend.
- Chat Geral texto funcional.
- Tools controladas para indicadores e dados operacionais.
- IA sem acesso a banco cru e sem SQL livre.

## Voice/Reatime

- Voice/Reatime funcional no escopo de homologação.
- Ressalvas conhecidas para aliases de voz e extrações por fala natural.
- Validação prevista para R$/ton, transitime e DOC forte.

## Observabilidade

- Execuções de IA registradas em `ai_runs`.
- Chamadas de ferramentas registradas em `ai_tool_calls`.
- Traces de decisão disponíveis para auditoria.
- Logs de integração e exportação acompanhados nos fluxos correspondentes.

## Segurança

- Operação multiempresa com preservação de `tenant_id`.
- Permissões validadas no backend.
- RLS considerada onde existir.
- Secrets fora do código.
- Sem SQL livre para agentes.

## Limitações conhecidas

- Voice pode exigir aliases adicionais para termos reconhecidos incorretamente.
- Extração de `customer_name` por fala natural pode precisar refinamento.
- Tickets, ocorrências, inbox, WhatsApp, canhotos, pré-faturamento, suporte interno SaaS, governança IA avançada, alertas, tarefas e hardening final seguem pendentes.

## Próximos passos

- Executar homologação técnica completa.
- Priorizar backlog pós-homologação.
- Formalizar pendências operacionais de deploy e ingestão que ainda não tenham script padronizado.
- Planejar hardening antes do avanço para produção ampla.
