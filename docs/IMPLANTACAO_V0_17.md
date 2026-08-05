# Plano de implantação v0.17-homologacao-ai-dados

Plano operacional para implantação e validação da versão v0.17. Não adiciona funcionalidades; apenas organiza a sequência de deploy, configuração e validação.

## Pré-requisitos

- Repositório atualizado na branch de implantação.
- Node.js compatível com o projeto.
- pnpm disponível via Corepack.
- Projeto Supabase criado e acessível.
- Projeto Vercel criado e conectado ao repositório.
- Variáveis de ambiente separadas por ambiente.
- Usuário responsável pela implantação com acesso ao Supabase, Vercel e repositório.

## Comandos existentes confirmados no projeto

- `pnpm install`
- `pnpm -r typecheck`
- `pnpm -r build`
- `pnpm --filter @sli/api test:general-chat-tools`
- `pnpm bootstrap:admin`

Comandos de deploy específico, reset de banco, seed operacional completo e ingestão/API não estão padronizados como scripts de raiz nesta versão; quando necessários, devem ser executados pelo fluxo operacional já existente no ambiente ou documentados como pendentes antes do go-live.

## Ordem de deploy

1. Congelar a branch/tag de homologação `v0.17-homologacao-ai-dados`.
2. Validar dependências com `pnpm install`.
3. Executar typecheck com `pnpm -r typecheck`.
4. Executar build com `pnpm -r build`.
5. Executar teste de tools do Chat Geral com `pnpm --filter @sli/api test:general-chat-tools`.
6. Aplicar migrations Supabase pendentes.
7. Configurar variáveis de ambiente no Supabase/Vercel/backend.
8. Publicar backend e frontend conforme pipeline do projeto.
9. Rodar validações de dados, dashboards, relatórios e IA.

## Aplicação de migrations

- Conferir migrations pendentes em `supabase/migrations`.
- Aplicar migrations pelo processo Supabase adotado no ambiente.
- Não criar migration nova para esta sprint de documentação.
- Confirmar que tabelas multiempresa preservam `tenant_id`.

## Configuração Supabase

- Configurar URL do projeto.
- Configurar anon key onde aplicável.
- Configurar service role apenas em ambientes backend/scripts seguros.
- Confirmar Auth habilitado.
- Confirmar RLS onde existir.
- Confirmar Storage, se usado pelo fluxo de relatórios/exportações.

## Configuração Vercel

- Conectar projeto ao repositório.
- Configurar build do frontend conforme workspace.
- Configurar variáveis públicas do frontend apenas com prefixos seguros.
- Não expor service role, tokens internos ou secrets de backend no frontend.
- Validar preview/produção com build bem-sucedido.

## Variáveis de ambiente

- Supabase URL.
- Supabase anon key para frontend quando necessário.
- Supabase service role apenas para backend/scripts.
- Variáveis de bootstrap admin quando usado.
- `OPENAI_API_KEY` apenas no backend.
- `OPENAI_DEFAULT_MODEL` no backend.
- Flags do AI Gateway no backend.
- Demais variáveis específicas de integração conforme ambiente.

## Seed mínimo

- Catálogo de módulos.
- Roles e permissões base.
- Tenant de teste.
- Usuário admin.
- Vínculo do usuário admin ao tenant.
- Módulos necessários ativados para o tenant.

O comando existente para bootstrap administrativo é `pnpm bootstrap:admin`. Seed operacional completo que não estiver exposto por script deve ser tratado como pendente ou executado pelo procedimento controlado do ambiente.

## Criação de tenant

- Criar tenant de homologação.
- Confirmar identificador/slug.
- Confirmar `tenant_id` nos registros multiempresa relacionados.
- Validar associação do usuário admin ao tenant.

## Criação de usuário admin

- Configurar variáveis de bootstrap.
- Executar `pnpm bootstrap:admin` após build quando aplicável.
- Validar login do admin.
- Validar perfil, roles e permissões.

## Ativação de módulos

- Ativar módulos necessários para a homologação.
- Conferir acesso no frontend.
- Conferir validação de permissões no backend.

## Criação/ativação de fonte de dados

- Criar ou selecionar fonte API de homologação.
- Ativar a fonte.
- Conferir logs de integração.
- Validar que dados externos seguem contrato e staging.

## Criação/ativação de contrato

- Criar ou selecionar contrato de dados.
- Ativar contrato.
- Conferir campos obrigatórios e mapeamentos.
- Validar que planilhas e payloads fora do contrato não alimentam a base tratada.

## Execução de ingestão/API

- Executar ingestão pelo mecanismo existente no ambiente.
- Conferir recebimento no staging.
- Registrar qualquer ausência de comando padronizado como pendência operacional.

## Validação staging

- Conferir chegada dos registros.
- Conferir validação contra contrato.
- Conferir erros de contrato sem publicar registros inválidos.
- Não acessar `raw_payload` fora dos fluxos permitidos.

## Publicação canônica

- Publicar registros válidos para o modelo canônico.
- Confirmar criação/atualização de `operation_records`.
- Conferir total tratado esperado.

## Validação dashboards

- Abrir dashboard publicado.
- Conferir cards nativos.
- Conferir indicadores customizados.
- Conferir R$/ton por Cliente.
- Conferir transitime por carga e por entrega.

## Validação relatórios

- Ativar definição de relatório.
- Gerar job.
- Validar snapshot.
- Validar arquivo/export se aplicável.
- Conferir logs de exportação.

## Validação IA

- Validar Chat Geral texto com perguntas de indicadores e DOC.
- Validar Voice/Reatime com frases de R$/ton, transitime e DOC.
- Confirmar uso de tools controladas.
- Confirmar registros em `ai_runs` e `ai_tool_calls`.
- Confirmar ausência de SQL livre.

## Checklist pós-deploy

- [ ] Aplicação acessível.
- [ ] Login admin funcionando.
- [ ] Tenant correto selecionado.
- [ ] Dados tratados conferidos.
- [ ] Dashboards carregando.
- [ ] Relatórios gerando.
- [ ] IA texto respondendo via tools.
- [ ] Voice/Reatime validado com ressalvas conhecidas.
- [ ] Logs e traces disponíveis.
- [ ] Sem secrets no frontend ou no código.

## Rollback básico

- Reverter deploy Vercel para a versão anterior estável.
- Reverter variáveis de ambiente alteradas, se necessário.
- Interromper ingestões/API novas enquanto a causa é analisada.
- Preservar logs de integração e IA para auditoria.
- Não executar rollback destrutivo de banco sem plano específico, backup e responsável técnico.
