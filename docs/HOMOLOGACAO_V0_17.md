# Homologação técnica v0.17-homologacao-ai-dados

Checklist de homologação técnica para congelar o marco v0.17 do Sistema Logístico Integrado.

## A. Ambiente

- [ ] Variáveis `.env` configuradas nos ambientes necessários.
- [ ] Supabase conectado.
- [ ] Migrations aplicadas.
- [ ] Vercel/build funcionando.
- [ ] Usuário admin/tenant de teste disponível.

## B. Dados

- [ ] Fonte API ativa.
- [ ] Contrato de dados ativo.
- [ ] Staging recebendo registros.
- [ ] Validação contra contrato funcionando.
- [ ] Publicação para `operation_records` funcionando.
- [ ] Total esperado de registros tratados conferido no dashboard.

## C. Dashboard e indicadores

- [ ] Dashboard publicado abre.
- [ ] Cards nativos carregam.
- [ ] Indicadores customizados carregam.
- [ ] R$/ton por Cliente retorna `rows`, `result_rows` e `structured_rows`.
- [ ] Transitime med por carga retorna dias por cliente.
- [ ] Transitime médio por entrega retorna matriz de entregas.

## D. Relatórios

- [ ] Definição de relatório ativa.
- [ ] Geração de job funcionando.
- [ ] Snapshot salvo.
- [ ] Arquivo/export gerado, se aplicável.
- [ ] Logs de exportação disponíveis.

## E. IA texto

### Frases para testar

- [ ] "faça uma analise do transitime"
- [ ] "faça uma analise do reais por tonelada médio por cliente"
- [ ] "Verifique para mim o transit time médio das entregas da Indústria Alimentícia Serra Azul Limitada."
- [ ] "como está a entrega DOC-2026-000055"

### Esperado

- [ ] Usar `indicators.get_result` para indicadores.
- [ ] Usar `operational.record.find` ou ferramenta operacional equivalente para DOC.
- [ ] Não usar SQL livre.
- [ ] Registrar `ai_runs`.
- [ ] Registrar `ai_tool_calls`.

## F. IA Voice/Reatime

### Frases para testar

- [ ] "Faça uma análise do reais tonelada por cliente"
- [ ] "Aveja o transtime médio por entrega do material de construção Planalto"
- [ ] "Não estou falando de tempo de entrega, estou falando de reais tonelada por cliente"
- [ ] "Faça um resumo da entrega DOC-2026-000055"

### Esperado

- [ ] R$/ton resolve para "R$/ton por Cliente".
- [ ] Transitime resolve para indicador customizado.
- [ ] DOC forte preserva busca operacional.
- [ ] Áudio fora de escopo não contamina resposta operacional.

## G. Segurança

- [ ] `tenant_id` preservado.
- [ ] RLS aplicada onde existir.
- [ ] Permissões backend ativas.
- [ ] Agents sem SQL livre.
- [ ] Sem secrets no código.
