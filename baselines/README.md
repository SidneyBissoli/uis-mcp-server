# Baselines de superfície

Dump NORMALIZADO de `tools/list` + resources + prompts, gerado por
`node scripts/dump-surface.mjs --url <endpoint>` (chaves ordenadas
recursivamente, tools por name / resources por uri, versão do servidor omitida
de propósito). Prática transplantada do bcb-br-mcp, onde o dump revelou
divergência real entre os canais stdio e HTTP.

| Arquivo | Como foi capturado | O que representa |
|:--|:--|:--|
| `surface-http-prod-0.1.0.json` | `--url https://uis.sidneybissoli.com/mcp` | o que o endpoint hospedado serve DE FATO |

## O que este baseline é — e o que não é

Este repositório é **worker-only**: não há canal stdio (sem `bin`, sem build
Node, `private: true`), então a classe de divergência que motivou o baseline
no bcb (stdio × worker) NÃO existe aqui, e o script só tem o modo `--url`.
O que o dump registra é a superfície de PRODUÇÃO no tempo: a próxima captura
diz exatamente o que mudou, em vez de a mudança passar em silêncio.

Medição da captura inicial (2026-09-01): 3 tools, 3 resources, 0 prompts —
o zero de prompts é POR DESENHO (o servidor não declara a capability; ver o
cabeçalho de `src/pagination.ts`), não ausência a corrigir.

Não há passo de dump no CI: sem canal stdio não existe captura offline, e
sondar produção (ou `wrangler dev`, que falseia a medição) num job de CI
trocaria um teste determinístico por dependência de rede. A recaptura é
manual, após cada deploy que possa mexer na superfície.

## Como usar no gate

Depois de um deploy que possa mexer na superfície:

```bash
node scripts/dump-surface.mjs --url https://uis.sidneybissoli.com/mcp > depois.json
# diff contra baselines/surface-http-prod-0.1.0.json
```

Toda diferença precisa ser deliberada e listada no CHANGELOG. A propagação da
Cloudflare serve isolates mistos por alguns segundos após o deploy — se
divergir logo depois, re-sondar antes de concluir deriva.
