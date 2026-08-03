# GoDeploy no Claude Code — setup

Este bundle deixa o Claude Code capaz de fazer (e refazer) o deploy do dashboard sozinho.

## Onde colocar

Copie estas pastas para a **raiz do seu repositório** (o mesmo repo do dashboard):

```
seu-repo/
├── .claude/
│   └── commands/
│       └── deploy-dashboard.md     ← vira o comando /deploy-dashboard
├── godeploy/
│   ├── server.ts                   ← o worker (arquivo permanente do repo)
│   └── assemble.sh                 ← monta godeploy/upload/ a partir do dist/
├── dist/                           ← gerado por `npm run build`
└── ... (resto do projeto)
```

O `godeploy/upload/` e o `godeploy/.appid` são gerados automaticamente — pode colocar no
`.gitignore`:

```
godeploy/upload/
```

(Mantenha o `godeploy/.appid` versionado se quiser que qualquer pessoa do time atualize o
mesmo app.)

## Passo 1 — conectar o GoDeploy MCP (uma vez)

No terminal, na raiz do repo:

```bash
claude mcp add --transport http --scope project godeploy https://mcp.devgogroup.com/mcp
```

`--scope project` grava no `.mcp.json` do repo (compartilhável com o time). Depois, dentro
do Claude Code, rode `/mcp` e autorize no navegador (OAuth). Confira com `claude mcp get godeploy`.

## Passo 2 — deployar

Dentro do Claude Code:

```
/deploy-dashboard
```

Ele checa o conector, monta os arquivos, faz upload e chama createApp (1ª vez) ou
updateApp (demais). No primeiro deploy ele te pede os 5 segredos e te lembra de configurar
o acesso `restricted`.

## Redeploy depois de atualizar dados

```bash
npm run refresh && npm run refresh-skus && npm run refresh-stamped && \
npm run refresh-import && npm run refresh-estoque && npm run build
```

Depois, no Claude Code: `/deploy-dashboard` de novo. Como o `.appid` já existe, ele faz
updateApp e mantém a mesma URL/segredos.

## Segredos (só no 1º deploy)

Pegue os valores nas Environment Variables do projeto na Vercel:
FEEDBACK_SCRIPT_URL, FEEDBACK_SCRIPT_SECRET, STAMPED_PUBLIC_KEY, STAMPED_PRIVATE_KEY,
STAMPED_STORE_HASH.
