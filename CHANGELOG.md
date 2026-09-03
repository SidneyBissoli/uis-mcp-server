# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões
seguem o `package.json` (espelhado em `server.json` e `src/config.ts` pelo hook
`version`). O servidor é worker-only: uma versão = um deploy em
`https://uis.sidneybissoli.com`; a superfície de cada versão está em
`baselines/`.

## [0.2.0] — 2026-09-03

### Adicionado

- `search` e `fetch` — o contrato ChatGPT Deep Research (OpenAI) por cima das
  tools `uis_*`, via `@sbissoli/mcp-search` 0.3.0 (`locale: "en"`). `search`
  ranqueia a consulta contra o catálogo inteiro (índice em memória construído
  do D1 no primeiro uso, 24 h; ids `ind:<code>`); `fetch` devolve o indicador
  em Markdown (entrada do catálogo + amostra de dados — Brasil e `SDG: World`,
  últimos cinco anos, 1 chamada à Data API com release fixada) com a página
  pública do UIS Data Browser como `url`. Ambas carregam o bloco de proveniência
  em `structuredContent`/`_meta`. 3 → 5 tools.
- Seed do catálogo grava `framework_id`, `group_id` e `group_name` de cada
  indicador, tirados das definições do UIS Data Browser
  (`/api/data-browser/resources/<versão>/indicators/indicator-definitions-en.json`)
  — o framework é obrigatório na URL pública do indicador
  (`/view#indicatorPaths=<framework>%3A0%3A<code>`). O seed agora recria as
  tabelas (DROP + CREATE) em vez de só esvaziá-las.
- `GET /status` expõe `tools` e `tool_names` (lista de `src/tools/index.ts`,
  presa ao `tools/list` real por teste); o smoke pós-deploy confronta produção
  com ela em vez de pinar uma contagem.
- Gate no `server.json`: `description` ≤ 100 caracteres (limite do MCP
  Registry, que só valida no publish).
- Este CHANGELOG.

### Alterado

- Guia (`uis://guide`) e instruções do handshake mencionam `search`/`fetch`.
- Smoke em produção exercita `search` → `fetch` e id desconhecido.

## [0.1.0] — 2026-09-01

Primeira versão com baseline de superfície: 3 tools (`uis_search_indicators`,
`uis_list_geo_units`, `uis_get_data`), 3 resources, 0 prompts.
