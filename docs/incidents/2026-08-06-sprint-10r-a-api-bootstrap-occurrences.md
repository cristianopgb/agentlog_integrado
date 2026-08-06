# Incidente Sprint 10R-A — bootstrap da API no módulo de ocorrências

## Identificação

- **Projeto:** Sistema Logístico Integrado / AgentLog
- **Data:** 6 de agosto de 2026
- **Área afetada:** API NestJS / módulo de Ocorrências Operacionais
- **Ambiente:** função serverless da API na Vercel
- **Status:** resolvido

## Resumo executivo

Durante a Sprint 10R-A, o módulo de Ocorrências Operacionais foi implementado e registrado no `AppModule` da API. Após o deploy automático na Vercel, a função serverless passou a falhar durante o bootstrap do NestJS, antes que a aplicação pudesse responder a qualquer requisição.

O incidente causou respostas globais `500 INTERNAL_SERVER_ERROR` com `FUNCTION_INVOCATION_FAILED`. No frontend, a ausência de resposta HTTP e dos respectivos headers se apresentou como erro de CORS ou `Failed to fetch`, inclusive em rotas antigas e não relacionadas diretamente ao módulo recém-adicionado.

O problema não era uma configuração de CORS. A causa foi um grafo de dependências inválido no container do NestJS: o `OccurrencesModule` não importava os módulos que exportavam as dependências usadas pelo seu service e pelos guards do controller.

## Impacto observado

A API deixou de inicializar e, por consequência, rotas novas e preexistentes ficaram indisponíveis. Entre as rotas em que o frontend observou falha estavam:

- `/tenants/:tenantId/chat/conversations`;
- `/tenants/:tenantId/dashboards`;
- `/tenants/:tenantId/occurrences`.

Como a falha ocorria antes da criação de uma resposta HTTP válida, os headers de CORS não eram emitidos. Isso fez o navegador reportar um sintoma de CORS, embora a origem da indisponibilidade estivesse no bootstrap da API.

## Sintomas

No deploy da API na Vercel, foram observados:

```text
500 INTERNAL_SERVER_ERROR
FUNCTION_INVOCATION_FAILED
```

No frontend, foram observados:

```text
Failed to fetch
```

e mensagens do navegador associadas a CORS.

## Linha de diagnóstico

1. O deploy automático incorporou o `OccurrencesModule` ao `AppModule`.
2. Rotas antigas também passaram a falhar, indicando um problema global na inicialização da API, e não uma falha restrita ao endpoint de ocorrências.
3. A função serverless encerrava durante o bootstrap do NestJS.
4. Como o processo falhava antes de responder, nenhum header de CORS era produzido.
5. A inspeção do módulo mostrou que dependências injetadas pelo service e guards usados pelo controller não estavam disponíveis no escopo do `OccurrencesModule`.

## Causa raiz

O `OccurrencesService` injeta `SupabaseService`. O `OccurrencesController` usa `AuthGuard` e `PermissionsGuard`, os quais dependem da infraestrutura de RBAC. Entretanto, o `OccurrencesModule` havia sido criado sem importar:

- `SupabaseModule`, que disponibiliza `SupabaseService`;
- `RbacModule`, que disponibiliza os componentes de autenticação, autorização e RBAC necessários.

Embora o código compilasse e passasse pelo typecheck, o container de injeção de dependências do NestJS não conseguia resolver o grafo em runtime. O registro do módulo inválido no `AppModule` transformou a falha local de configuração em falha global de bootstrap.

## Correção aplicada

O `OccurrencesModule` passou a importar explicitamente os módulos que exportam suas dependências:

```ts
@Module({
  imports: [SupabaseModule, RbacModule],
  controllers: [OccurrencesController],
  providers: [OccurrencesService],
})
export class OccurrencesModule {}
```

Também foi criado um teste local de bootstrap do módulo real pelo container do NestJS. O teste valida a resolução de:

- `SupabaseService`;
- `AuthGuard`;
- `PermissionsGuard`;
- `RbacService`.

Essa validação complementa os testes unitários do service e cobre o comportamento que build e typecheck não verificam: a composição efetiva dos módulos e providers em runtime.

## Validação da recuperação

Após a correção e a reativação do módulo:

- a API voltou a inicializar e responder normalmente;
- o menu de Ocorrências foi reativado;
- as visualizações de lista e Kanban funcionaram;
- módulos e rotas antigas continuaram funcionando;
- não houve novo erro de CORS;
- não houve novo `FUNCTION_INVOCATION_FAILED` associado ao bootstrap do módulo.

## Lição técnica

Build e typecheck garantem consistência estática, mas não garantem que o grafo de dependências do NestJS seja válido em runtime. Testes que instanciam manualmente um service também podem ocultar erros de composição do módulo, pois não exercitam o container real nem a resolução dos guards e providers transitivos.

Todo módulo NestJS novo ou reativado deve, portanto, ser inicializado em um teste mínimo com o container real do framework.

## Regra obrigatória para novos módulos NestJS

Sempre que um módulo NestJS for criado ou reativado no `AppModule`:

1. O módulo deve importar explicitamente todos os módulos que exportam os providers, guards e services necessários.
2. Deve existir um teste mínimo de bootstrap do módulo real pelo container do NestJS.
3. Uma sprint não deve ser aprovada se a cobertura apenas instanciar o service manualmente e não validar o módulo real.
4. Antes de registrar o módulo novo no `AppModule`, devem ser executadas as seguintes verificações:

   ```bash
   pnpm --filter @sli/api typecheck
   pnpm --filter @sli/api build
   # Executar o teste específico de bootstrap do módulo.
   pnpm -r build
   ```

O teste específico deve falhar caso qualquer dependência exigida pelo módulo não possa ser resolvida pelo container do NestJS.

## Prevenção e critério de aprovação

Para prevenir recorrência:

- revisar imports e exports do módulo durante a revisão de código;
- exigir teste de bootstrap real para módulos novos ou reativados;
- executar o teste específico antes do registro no `AppModule`;
- tratar falhas simultâneas em rotas não relacionadas como possível falha de bootstrap;
- confirmar nos logs da função serverless se a aplicação chegou a inicializar antes de classificar o problema como CORS.

O critério de aprovação passa a incluir, além de testes unitários, a comprovação de que o módulo compila no contexto do container NestJS e resolve todas as dependências usadas por controllers, guards e services.
