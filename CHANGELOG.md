# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões
seguem o `package.json` (espelhado em `server.json` e `src/config.ts` pelo hook
`version`). Uma versão = um deploy em `https://uis.sidneybissoli.com` e, desde
a 0.4.0, uma publicação no npm (`uis-mcp-server`, runtime stdio) e no MCP
Registry; a superfície de cada versão está em `baselines/`.

## [0.4.0] — 2026-09-17

### Adicionado

- **Runtime stdio local e publicação no npm.** `src/cli.ts` roda o MESMO
  `buildServer` do Worker sem a Cloudflare no caminho: release corrente em
  memória do processo no lugar do KV; catálogo de indicadores e geo units
  baixado dos endpoints oficiais na primeira busca (`src/uis/catalog-memory.ts`,
  mesma semântica de busca, ordenação e paginação do D1, `retrieved_at` real do
  download; sem as colunas do Data Browser — `fetch` cita a home do Data
  Browser). Superfície idêntica ao endpoint hospedado, conferida contra o
  baseline `surface-http-prod-0.3.0.json`. Pacote `uis-mcp-server` (`bin`,
  `files: dist/`, `mcpName`, licença MIT), `server.json` com `packages[]` npm ao
  lado do `remotes`, `Dockerfile` para o Glama, `npm run build` + fumaça stdio
  no CI. `agents` vira devDependency (só o Worker o usa; o wrangler o resolve
  no `npm ci`). Molde: ilo-mcp-server (Sessão 09 de lá).

## [0.3.1] — 2026-09-16

### Alterado

- **A mecânica do vocabulário da pergunta sobe para `@sbissoli/mcp-search` 0.5.0.**
  `src/uis/vocabulary.ts` fica só com a tabela medida e os nomes de sempre;
  expansão, stopwords, singular, nota e ponta inversa vêm de `createVocabulary`
  (locale `en`, fonte "the UIS"). Cinco servidores carregavam a mesma receita em
  cópia — regra da Fase 0. Sem mudança de comportamento nem de superfície: os
  34 testes de `tests/vocabulary.test.ts` passam iguais. (O PR #11 entrou sem
  esta nota e sem o bump; este commit completa a 0.3.1.)

## [0.3.0] — 2026-09-16

### Corrigido

- **A busca devolvia ZERO quando a palavra do usuário não era a da UNESCO.**
  `uis_search_indicators` casa substrings do que o usuário escreveu contra o
  nome e o código do indicador, em AND; quem perguntava com a palavra de todo
  dia, ou com a grafia americana, não recebia um resultado ruim — recebia zero,
  sem explicação. Achado em 13/09/2026 na produção deste servidor (a mesma
  classe do irmão `ilo-mcp-server`, consertada lá na 0.6.0) e medido nos
  5.063 indicadores do catálogo oficial em 16/09/2026: `enrollment` **0**
  contra enrolment 227 (enrolled 160); `spending`/`budget` **0** contra
  expenditure 116; `wages`/`salaries` **0** contra salary 4; `preschool`/
  `kindergarten` **0** contra pre-primary 64; `university`/`college` **0**
  contra tertiary 448; `elementary` **0** contra primary 886; `scientists`
  **0** contra researchers 11; `girls`/`women` **0** contra female 1.252;
  `graduation` 4 contra completion 342; `pupil-teacher` **0** contra
  "teacher ratio" 10; `foreign` **0** contra "internationally mobile" 979;
  `illiteracy`, `maths`, `tvet`, `phd`, `stem`, `kids`, `teenagers`,
  `migrants`, `toilets`, `hygiene`, `certified`, `r&d` **0**, com o
  indicador existindo sob a grafia da UNESCO. E `school` (499) contra
  `education` (1.736): "primary school completion" achava zero.

  Conserto em `src/uis/vocabulary.ts` — tabela só de par **medido** (palavra
  perguntada ausente do catálogo, palavra da fonte presente), servindo as duas
  pontas: a busca expande o termo (OR dentro do termo, AND entre termos —
  expandir só aumenta o recall, nunca perde casamento que já havia) e o índice
  de `search` (Deep Research) recebe a palavra perguntada como keyword do
  indicador cujo nome traz a palavra da fonte. A tradução é **dita** na
  resposta (`vocabulary_notes`) e zero resultado deixa de ser beco sem saída
  (`hint` com o vocabulário da UIS e o resource de códigos verificados).
  Termo que a UIS não publica fica de fora (`dropout`, `tuition`,
  `unemployment`, `labor`): apelido para dado inexistente promete o que a
  fonte não tem. Rodado sobre o catálogo inteiro pelo código construído:
  enrollment 0 → 387, education spending 0 → 57, university enrollment
  0 → 114, girls 0 → 1.252, primary school completion 0 → 114; dropout e
  unemployment seguem em 0. 34 testes novos em `tests/vocabulary.test.ts`,
  com pares código/nome reais do catálogo conferidos contra a lista
  versionada do seed. Mesma receita do ilo; se um terceiro servidor precisar
  dela, o lugar passa a ser `@sbissoli/mcp-search`.

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

### Alterado

- **Superfície:** a descrição de `uis_search_indicators` diz que os termos
  são AND e que a grafia de todo dia é traduzida; o `outputSchema` ganha
  `vocabulary_notes` e `hint` (opcionais). As instruções do handshake dizem
  que a UIS escreve em inglês britânico e que a busca traduz. Baseline de
  superfície a recapturar após o deploy (`baselines/surface-http-prod-0.3.0.json`).

### Adicionado

Levado pelo `main` sem publicar desde a 0.2.0 (datas do git):

- Telemetria no Analytics Engine: a FORMA de cada chamada (10/09/2026), a
  classe de erro de `search`/`fetch` (10/09), os métodos de protocolo e o
  id de sessão e nome do cliente, blobs 9 e 10, como o sih (16/09).
- Rota privada do dono, para o uso próprio não virar adoção na telemetria; o
  smoke de produção passa a falar por ela (11/09/2026).
- Auditoria semanal do mcpscore, para regra nova do auditor não esperar o
  deploy (11/09/2026).

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
