Faça o deploy do Gocase Performance Dashboard no GoDeploy.

Contexto: é uma SPA Vite/React já buildada + um worker único (`godeploy/server.ts`) que
substitui as rotas de API da Vercel. A autenticação é a nativa do GoDeploy (o worker lê
`X-Godeploy-User-Email`). Os segredos vêm de `env` (setados via setAppSecret).

Siga exatamente estes passos:

1. **Cheque o conector.** Confirme que as ferramentas do GoDeploy MCP (getUploadToken,
   createApp, updateApp, setAppSecret, getAppLogs) estão disponíveis. Se não estiverem,
   PARE e peça pro usuário rodar:
   `claude mcp add --transport http --scope project godeploy https://mcp.devgogroup.com/mcp`
   e depois `/mcp` pra autorizar. Não invente token.

2. **Monte os arquivos.** Rode `bash godeploy/assemble.sh`. Isso gera `godeploy/upload/`
   a partir de `dist/` + o worker. (Se `dist/` estiver velho, rode antes
   `npm run refresh && npm run build`.) Anote a lista de arquivos e o `assets[]` impressos.

3. **getUploadToken** → pegue `uploadToken` e `uploadUrl`.

4. **Upload.** Faça um único `curl -X POST` para `uploadUrl` com
   `-H "Authorization: Bearer <uploadToken>"` e um `-F "<caminho>=@./godeploy/upload/<caminho>"`
   para CADA arquivo em `godeploy/upload/` (preservando o caminho relativo, ex.:
   `-F "assets/index-XXXX.js=@./godeploy/upload/assets/index-XXXX.js"`). Os hashes dos
   bundles mudam a cada build — leia os nomes reais da pasta, não fixe. Guarde o `uploadId`.

5. **Deploy.**
   - Se existir `godeploy/.appid`, é uma atualização: chame **updateApp** com
     `{ appId: <conteúdo do .appid>, uploadId, entrypoint: "src/server.ts",
        assets: <todos os arquivos menos src/server.ts>,
        assetConfig: { not_found_handling: "single-page-application" } }`.
   - Senão, é o primeiro deploy: chame **createApp** com os mesmos campos +
     `name: "Gocase Performance Dashboard"`. Salve o `appId` retornado em `godeploy/.appid`.

6. **Só no primeiro deploy:**
   a. Peça ao usuário os 5 valores e chame **setAppSecret** para cada:
      FEEDBACK_SCRIPT_URL, FEEDBACK_SCRIPT_SECRET, STAMPED_PUBLIC_KEY,
      STAMPED_PRIVATE_KEY, STAMPED_STORE_HASH.
   b. Lembre-o de deixar o app em `restricted` + grants no admin console (isso NÃO é via MCP).
   c. (Opcional) `setAppSlug({ appId, slug: "gocase-produto" })`.

7. **Verifique.** Mostre a URL. Se o usuário disser que algo falhou, rode
   `getAppLogs({ appId })` ANTES de chutar a causa. Preste atenção especial se
   `/api/comments`, `/api/presence` e `/api/stamped-reviews` estão chegando no worker
   (source "worker") e não sendo engolidos pelo fallback de SPA (source "asset").

Não faça deploy de app quebrado: se faltar dado ou segredo, avise e pare.
