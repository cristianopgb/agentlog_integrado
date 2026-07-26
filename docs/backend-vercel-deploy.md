# Deploy do backend NestJS na Vercel

Este guia prepara o `apps/api` para publicação separada do frontend. O frontend `apps/web` continua usando `NEXT_PUBLIC_API_URL` para chamar a API pública.

## Projeto backend na Vercel

1. Crie um novo projeto na Vercel apontando para o mesmo repositório GitHub.
2. Configure **Root Directory** como `apps/api`.
3. Configure os comandos do projeto backend:
   - **Install Command:** `cd ../.. && pnpm install --frozen-lockfile`
   - **Build Command:** vazio ou padrão da Vercel; o `vercel.json` usa `@vercel/node` para empacotar `api/index.ts`.
   - **Output Directory:** não configurar.
4. Publique o projeto e copie a URL pública gerada para usar no frontend.

## Variáveis do backend

Configure somente no projeto backend da Vercel:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CORS_ORIGIN=
```

- `SUPABASE_URL`: URL do projeto Supabase usado pelo backend.
- `SUPABASE_SERVICE_ROLE_KEY`: chave service role, restrita ao backend. Não configure essa variável no frontend.
- `CORS_ORIGIN`: origem pública do frontend, por exemplo `https://seu-frontend.vercel.app`. Para mais de uma origem, separe por vírgula.

## Variáveis do frontend

Configure no projeto frontend `apps/web` da Vercel:

```env
NEXT_PUBLIC_API_URL=
```

Use a URL pública do backend, sem barra final, por exemplo:

```env
NEXT_PUBLIC_API_URL=https://seu-backend.vercel.app
```

## Testar o healthcheck

Depois do deploy do backend, teste:

```bash
curl https://seu-backend.vercel.app/health
```

A resposta esperada é um JSON com `status` igual a `ok`, `service` igual a `api` e `project` igual a `Sistema Logístico Integrado`.

## Testar os endpoints da Sprint 9

Os endpoints de normalização continuam publicados pelo backend NestJS:

- `POST /tenants/:tenantId/staging-batches/:batchId/normalize`
- `GET /tenants/:tenantId/normalization-runs`
- `GET /tenants/:tenantId/normalization-runs/:runId`

Eles permanecem protegidos por autenticação e permissões do backend. Para validar pelo frontend:

1. Confirme que `NEXT_PUBLIC_API_URL` está configurada no projeto `apps/web` da Vercel com a URL pública do backend.
2. Faça novo deploy do frontend para aplicar a variável.
3. Acesse a tela da Sprint 9 com um usuário autorizado.
4. Clique em **Processar para base nativa**.
5. A mensagem “API backend não configurada. Defina NEXT_PUBLIC_API_URL no ambiente.” não deve aparecer quando a variável estiver definida.
6. Se houver erro de permissão, autenticação ou validação de dados, trate-o como resposta funcional da API, não como ausência de configuração do backend.

## Agendamento da integração API de leitura

O endpoint de agendamento fica preparado em `POST /internal/integrations/api/sync-due` e exige o header `x-cron-secret` com o mesmo valor de `CRON_SECRET`. O Vercel Cron nativo realiza requisições `GET` e não permite configurar esse header customizado; por isso ele não deve apontar diretamente para este endpoint.

No deploy atual, configure um scheduler externo controlado (por exemplo, o scheduler da plataforma de infraestrutura) para executar a cada 15 minutos:

```sh
curl --fail --request POST "$API_URL/internal/integrations/api/sync-due" \
  --header "x-cron-secret: $CRON_SECRET" \
  --header "content-type: application/json" \
  --data '{"limit":10}'
```

Sem esse job de infraestrutura, a sincronização manual continua disponível e a interface identifica o endpoint como preparado, mas não há promessa de execução automática. Nunca coloque `CRON_SECRET` em variável pública do frontend.
