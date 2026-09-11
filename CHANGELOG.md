# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões
seguem o `package.json` (espelhado em `server.json` e `src/config.ts` pelo hook
`version`). O servidor é worker-only: uma versão = um deploy em
`https://uis.sidneybissoli.com`; a superfície de cada versão está em
`baselines/`.

## [Não publicado]

### Corrigido

- **As tools `uis_*` recusam parâmetro que não existe.** Sem isso o zod
  descartava a chave desconhecida em silêncio, aplicava o default do parâmetro
  que ficou faltando e a tool respondia OUTRA pergunta com cara de resposta.
  Medido no irmão `ibge-br-mcp` em 11/09/2026: `periodo` no singular, que o
  esquema não tem, devolveu a população de **2026** para uma pergunta sobre
  2023, com `p/last` na URL de procedência e nenhum aviso — um agente reporta
  isso como o número de 2023. Resposta errada é pior que erro: erro o modelo
  corrige na chamada seguinte, resposta errada vira número em relatório.
  Singular/plural é o engano mais comum que existe.

  A recusa vem do SDK como `Unrecognized key: "<nome>"`, que **nomeia a chave**,
  então o modelo se corrige sozinho. **Mudança de superfície:** as três tools
  `uis_*` publicam agora `additionalProperties: false`. `search` e `fetch`
  ficam de fora — o contrato é da OpenAI e quem os registra é
  `@sbissoli/mcp-search`. Guarda em `tests/output-contract.test.ts`.

  Preço consciente: erro de validação de esquema é respondido pelo SDK ANTES do
  callback, então não passa pela instrumentação e não aparece na telemetria.
  Troca-se visibilidade por prevenção.

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
