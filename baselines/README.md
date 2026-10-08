# Baselines de superfície

Dump NORMALIZADO de `tools/list` + resources + prompts, gerado por
`node scripts/dump-surface.mjs --url <endpoint>` (chaves ordenadas
recursivamente, tools por name / resources por uri, versão do servidor omitida
de propósito). Prática transplantada do bcb-br-mcp, onde o dump revelou
divergência real entre os canais stdio e HTTP.

| Arquivo | Como foi capturado | O que representa |
|:--|:--|:--|
| `surface-http-prod-0.1.0.json` | `--url https://uis.sidneybissoli.com/mcp` | o que o endpoint hospedado servia na 0.1.0 (3 tools) |
| `surface-http-prod-0.2.0.json` | `--url https://uis.sidneybissoli.com/mcp` | o que o endpoint hospedado serve DE FATO desde 03/09/2026 (5 tools: + `search`/`fetch`) |
| `surface-http-prod-0.3.0.json` | `--url https://uis.sidneybissoli.com/mcp` | o que o endpoint serve desde 16/09/2026 (0.3.0). Diff para a 0.2.0, deliberado e no CHANGELOG: `additionalProperties: false` nas três tools `uis_*` (11/09) e, em `uis_search_indicators`, descrição nova (AND, vocabulário traduzido) + `vocabulary_notes`/`hint` no `outputSchema` |
| `surface-stdio-<versão>.json` (1.0.0 a 1.3.0) | `--stdio` (spawna `dist/cli.js`) | a superfície do runtime stdio, o que vai ao npm, por versão |

## O que este baseline é — e o que não é

O repositório tem **dois canais com o mesmo servidor** (`buildServer`): o Worker
hospedado e, desde a 0.4.0, o runtime stdio publicado no npm (`src/cli.ts` →
`dist/cli.js`, `bin`). Até a 0.3.0 era worker-only — sem `bin`, sem build Node,
`private: true` —, e por isso as três primeiras capturas são só `--url`. O
script tem os dois modos; o dump registra a superfície no tempo, e a próxima
captura diz exatamente o que mudou, em vez de a mudança passar em silêncio. A
classe de divergência que motivou o baseline no bcb (stdio × worker) passou a
existir aqui na 0.4.0, mas é coberta por construção: os dois canais montam o
mesmo `buildServer`, e a trava da superfície (`surface.lock.json`) prende a
superfície declarada à versão.

Medição da captura inicial (2026-09-01): 3 tools, 3 resources, 0 prompts;
na 0.2.0 (2026-09-03): 5 tools (`search`/`fetch` do Deep Research), 3 resources, 0 prompts —
o zero de prompts é POR DESENHO (o servidor não declara a capability; ver o
cabeçalho de `src/pagination.ts`), não ausência a corrigir.

No CI, o `ci.yml` roda `node scripts/dump-surface.mjs --stdio` como fumaça do
build (captura offline, sem rede), sem comparar com baseline — quem reprova
superfície mudada sem versão nova é a trava. Sondar produção (ou `wrangler dev`,
que falseia a medição) num job de CI trocaria um teste determinístico por
dependência de rede: a captura `--url` segue manual, após cada deploy que possa
mexer na superfície.

## Como usar no gate

Depois de um deploy que possa mexer na superfície:

```bash
node scripts/dump-surface.mjs --url https://uis.sidneybissoli.com/mcp > depois.json
# diff contra o baselines/surface-http-prod-<versão>.json mais recente
```

Toda diferença precisa ser deliberada e listada no CHANGELOG. A propagação da
Cloudflare serve isolates mistos por alguns segundos após o deploy — se
divergir logo depois, re-sondar antes de concluir deriva.
