# CLAUDE.md

Orientação para o Claude Code neste repositório. O histórico por versão está no
`CHANGELOG.md`; o que foi medido e decidido, fase a fase, no `ROADMAP.md` (gitignored,
cópia no portfolio-monitor).

## O que é

Servidor MCP da **UNESCO UIS** (UIS Data API, `api.uis.unesco.org`): educação, ciência,
cultura e comunicação, por país e ano. Cinco tools — `uis_search_indicators`,
`uis_list_geo_units`, `uis_get_data`, mais `search`/`fetch` (contrato Deep Research da
OpenAI, únicas sem o prefixo `uis_`) — e três resources (`uis://…`); **nenhum prompt**
(`prompts/list` não é servido). Idioma do servidor: inglês; fuso: UTC (`src/config.ts`).
Licença dos dados: CC BY-SA 4.0 — por isso a UIS vive num servidor separado do ILOSTAT
(CC BY): os dois regimes nunca coabitam (`src/uis/provenance.ts`).

Dois canais, o MESMO servidor (`buildServer`, `src/server.ts`):

- **Hospedado** — `https://uis.sidneybissoli.com/mcp`, Cloudflare Worker. O repositório
  INTEIRO é o Worker: `wrangler.jsonc` na raiz, `main` = `src/index.ts`; não há
  subprojeto `worker/`.
- **npm** — `uis-mcp-server`, stdio (`src/cli.ts` → `dist/cli.js`, `bin`). Sem bindings
  da Cloudflare: release corrente em `Map` com TTL no lugar do KV, catálogo baixado dos
  endpoints oficiais na primeira busca no lugar do D1 (`src/uis/catalog-memory.ts`), sem
  uso, rate limit nem auth. Tools, validações, limites e proveniência são idênticos.
  O `Dockerfile` existe só para o Glama (roda o stdio).

## Comandos

```bash
npm run typecheck && npm test   # suíte offline (vitest)
npm run dev                     # wrangler dev — http://localhost:8787/mcp
npm run build                   # runtime stdio → dist/cli.js (o que vai ao npm)
node scripts/dump-surface.mjs --stdio   # fumaça do build: initialize → tools/resources/prompts
npm run deploy                  # wrangler deploy (o CI faz isso; ver CI)
node scripts/smoke-mcp.mjs      # smoke contra PRODUÇÃO
npm run surface:lock            # regrava surface.lock.json + o bloco do server.json (ver Trava)
npm run manifest:lhm            # regenera lhm.plugin.json (ficha do LobeHub) da superfície real
npm run eval                    # eval com MODELO REAL — CUSTA DINHEIRO
```

**`npm run eval` cobra a API da Anthropic, à parte de qualquer assinatura.** Nunca rodar
sem o dono pedir a rodada; sem `ANTHROPIC_API_KEY` o script só imprime instruções e sai
com 0 (`evals/run.ts`). O sinal offline das 22 fixtures roda dentro do `npm test`.

Seed do catálogo (D1), uma vez por release de dados da UIS (2–3 por ano; README,
"Notes for operators"):

```bash
npm run seed:sql    # = node scripts/seed-uis-catalog.mjs → scripts/seed-uis-catalog.sql
npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql
npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql
```

## Arquitetura

| Módulo | Responsabilidade |
|:--|:--|
| `src/index.ts` | Entrada do Worker: rotas públicas (landing, `/health`, `/status`, `/metrics`, server card) → Bearer opcional → rate limit por cliente → `createMcpHandler` stateless (McpServer novo por request, SDK v2) |
| `src/cli.ts` | Entrada stdio (npm). Logs em stderr: stdout é só JSON-RPC |
| `src/server.ts` | `buildServer`: anotações em toda tool, envelope de proveniência, uso fora do caminho crítico |
| `src/config.ts` | Identidade e tunáveis (`SERVER_CONFIG`, `RATE_LIMIT`…) — o arquivo que uma instância nova edita, com `wrangler.jsonc` e `package.json` |
| `src/tools/uis.ts` | As três `uis_*` |
| `src/tools/deep-research.ts` | `search`/`fetch` sobre o catálogo (contrato, ranking e registro no `@sbissoli/mcp-search`) |
| `src/tools/errors.ts` | `toToolError`: erro de uso volta pedagógico; de origem, com status; o resto relança. Anexa a classe do erro |
| `src/tools/index.ts` | Lista declarada das tools, presa ao servidor real por `tests/server.test.ts` (o SDK não expõe as registradas) |
| `src/uis/api.ts` | Cliente da Data API: release corrente (`/versions/default`, KV 24 h) fixada em toda consulta |
| `src/uis/upstream.ts` | Ponto único de rede (`@sbissoli/mcp-upstream`, desde a 1.1.0): timeout, retry, orçamento e a contagem do `retrieval` |
| `src/uis/catalog.ts` / `catalog-memory.ts` | Busca no catálogo: D1 no Worker, memória no stdio — mesma semântica |
| `src/uis/vocabulary.ts` | Vocabulário da pergunta × da fonte (enrollment → enrolment, spending → expenditure…) |
| `src/uis/provenance.ts` | Contexto de proveniência (`@sbissoli/mcp-provenance`) |
| `src/analytics.ts`, `usage*.ts` | Telemetria (Analytics Engine `uis_mcp_tool_calls`) e uso (Durable Object `UsageTracker`); `SELF_ROUTE = /mcp/uso-proprio` marca o uso do dono |

Bindings (`wrangler.jsonc`): KV `UIS_CACHE`, D1 `CATALOG_DB` (`uis-catalog`), DO `USAGE`,
Analytics Engine `ANALYTICS`, `CF_VERSION_METADATA`. Auth: sem `API_KEY` configurada o acesso
é aberto (`src/auth.ts`) — é assim em produção.

**Proveniência:** toda resposta leva o envelope do contrato v1.1; `retrieved_at` é sempre o
instante REAL da extração (para o catálogo, o do seed, gravado em `uis_meta`; respostas do
catálogo são `served_from_cache: true`). `derived` é sempre `false`: o servidor não transforma
valores (README, "Behaviour and limits").

## Testes

`tests/` (vitest), todos offline. Os que guardam uma classe de defeito, e por quê (cada um
explica no cabeçalho):

- `surface-lock.test.ts` — a trava (próxima seção).
- `output-contract.test.ts` — `structuredContent` obedece ao `outputSchema` LISTADO, pelo
  `Client` do SDK; cliente que valida rejeita a resposta inteira quando não obedece.
- `classe-do-erro.test.ts`, `sem-iserror-literal.test.ts` — a classe do erro sai do TIPO da
  falha, nunca da frase; `isError: true` montado fora de `toToolError` nasce sem classe.
- `fronteira-de-palavra.test.ts`, `vocabulary.test.ts` — busca por fronteira de palavra, igual
  no D1 e na memória.
- `version-sync.test.ts`, `serverinfo-sync.test.ts`, `icon-sync.test.ts` — o que é declarado em
  vários lugares (versão, site, ícone) não pode discordar.
- `contagem-nos-textos.test.ts` — toda contagem de tools escrita para humano bate com a
  superfície real.
- `pacote-npm-readme.test.ts` — o pacote leva um README só (o npm empacota todo `README*`).
- `lhm-manifest.test.ts` — `lhm.plugin.json` é derivado da superfície, nunca mantido à mão.

## Trava da superfície e impressão digital no registro

`surface.lock.json` (`@sbissoli/mcp-surface`) guarda duas seções, cada uma com a versão em que
foi travada e o sha256: `declarada` (initialize + tools + resources + templates + prompts, do
`buildServer`) e `semToken` (quem responde sem credencial em `POST /mcp` e
`POST /mcp/uso-proprio`, com `API_KEY` ausente e presente). **Mudou a superfície sem subir a
versão = teste vermelho, e o deploy não roda.** Fluxo: `npm version <nível>
--no-git-tag-version` → `npm run surface:lock` → commitar a trava e o `server.json` juntos.

**Desde a 1.3.2** o `server.json` publica, sob
`_meta["io.modelcontextprotocol.registry/publisher-provided"]["io.github.sidneybissoli/mcp-surface"]`,
o sha da `declarada` e o mapa de quem responde sem token em produção, com a sonda
`uis_search_indicators {"query":"literacy"}` (forma `mcp-surface/1`, SPEC.md do pacote). O
`surface:lock` termina com `mcp-surface registro`, que grava o bloco; o teste da trava reprova
`server.json` defasado — **fora do modo de escrita**, porque no `surface:lock` o arquivo de
teste roda antes do `registro`. Qualquer um confere de fora:
`node verify.mjs io.github.SidneyBissoli/uis-mcp-server` (script em `exemplos/` do pacote).

## CI

- `ci.yml` — push em `main` e PR: typecheck, testes, build, dump da superfície pelo stdio e
  `wrangler deploy --dry-run`.
- `deploy-worker.yml` — push em `main` **filtrado por caminho** (`src/**`, `package*.json`,
  `wrangler.jsonc`, `surface.lock.json`, o próprio workflow) e dispatch: testes ANTES do
  wrangler, deploy, versão hospedada = `package.json`, smoke de produção e
  `mcp-surface verificar` (o no ar = a trava). Sem os secrets da Cloudflare, o job se pula.
- `mcpscore.yml` — catraca de conformidade em dois jobs. `stdio`: o CÓDIGO DO PR, por
  `dist/cli.js`, piso 87 (medido em 08/10/2026; a diferença para o 88 do ilo é só o
  denominador, sem prompts aqui) — em PR, push e semanal. `remoto`: PRODUÇÃO, piso 100, no
  TÉRMINO do deploy (`workflow_run`), não no push — senão auditaria o código anterior — e
  toda semana.
- `publish.yml` — tag `v*`: npm (trusted publishing/OIDC) → espera o npm expor a versão →
  MCP Registry → `mcp-surface conferir-registro` (a entrada da versão × o ar, como um
  cliente). **Não cria a release do GitHub.**

## Release

1. `npm view uis-mcp-server version` é a versão publicada de verdade; numerar a partir dela.
2. Entrada no `CHANGELOG.md` cobrindo tudo desde a última PUBLICADA.
3. `npm version <patch|minor|major> --no-git-tag-version`. O hook `version`
   (`scripts/sync-version.mjs && git add -u`) espelha a versão em `server.json` (raiz e
   `packages[0]`), `lhm.plugin.json` e `src/config.ts`, e os põe em stage.
4. Se a superfície mudou: `npm run surface:lock`.
5. PR → merge em `main` → **`gh release create v<versão> --target main --generate-notes`**.
   Ele cria a tag pela API, e o push da tag dispara o `publish.yml`. **Nunca empurrar a tag
   sozinha:** o `publish.yml` não cria a release do GitHub, e a versão fica sem página — foi o
   que aconteceu com a 1.3.2 em 07/10/2026. Conserto sem republicar:
   `gh release create v<x> --verify-tag --generate-notes`.

O deploy do Worker não depende da tag: sai no push em `main` (caminhos acima).

## Pontos que mordem

- **Toda consulta de dados fixa `version=`.** A Data API fica atrás de um CloudFront com cache
  agressivo pela URL completa; a release corrente vem de `/versions/default` (KV, 24 h)
  (`src/uis/api.ts`, medições do mini-spike de 07/08/2026).
- **Teto da origem: 100.000 registros por consulta**, devolvido como HTTP 400 pedagógico com a
  contagem — repassado ao cliente. O servidor corta antes: 5.000 registros por resposta e 25
  indicadores por chamada, com erro explicativo; **nunca trunca em silêncio** (README).
- **Política de rede medida** (1.1.0, 27/09/2026): 35 s por tentativa, até 3 tentativas em 5xx,
  429 (respeitando `Retry-After`) e erro de rede, 45 s no total; timeout, 504, o 400 do teto e
  404 não são repetidos (`src/uis/upstream.ts`, README).
- **A palavra do usuário não é a da UIS.** Substring sobre o nome devolvia ZERO para
  `enrollment`, `spending`, `preschool` (a UIS escreve `enrolment`, `expenditure`,
  `pre-primary`); medido no catálogo de 5.063 indicadores em 16/09/2026
  (`src/uis/vocabulary.ts`).
- **O catálogo envelhece; os dados não.** Consultas de dados seguem a release padrão sozinhas;
  o catálogo só muda com o seed manual. O smoke de produção imprime a release corrente: se
  diferir da do seed, re-semear (README).
- **Medir o mcpscore localmente engana:** em `wrangler dev` não há `CF-Connecting-IP`, todas as
  requisições caem no mesmo balde e o burst de 20 (`RATE_LIMIT.clientBurst`) estoura — o
  auditor lê como regra de segurança reprovada; e o TLS não se aplica a `http://localhost`
  (−5 pontos, não é regressão) (`ROADMAP.md`, "Duas armadilhas de medição local").
- **`npm install` no Windows apaga os campos `libc` do `package-lock.json`**, e o `npm ci` do
  Linux no CI quebra. Restaurar com `node C:\dev\skills\scripts\restore-libc.mjs <lock do HEAD>
  package-lock.json` antes de commitar.
- **O README do npm é o `README.md`** (inglês); o português é `LEIA-ME.md`, fora do prefixo
  `README*` de propósito (`tests/pacote-npm-readme.test.ts`).
