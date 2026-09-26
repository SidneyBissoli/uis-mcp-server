# uis-mcp-server — servidor MCP provenance-first do UNESCO UIS

[![smithery badge](https://smithery.ai/badge/sidneybissoli/uis-mcp-server)](https://smithery.ai/servers/sidneybissoli/uis-mcp-server)

Servidor [MCP](https://modelcontextprotocol.io) (Streamable HTTP) para o **UNESCO
UIS** (Instituto de Estatística da UNESCO — educação, ciência/P&D, cultura e
comunicação), hospedado em Cloudflare Workers. Fase 2 do projeto ilostat
(`C:\dev\mcp\ilostat\roadmap.md`; medições da Data API em `ilostat/docs/06`).
O ILOSTAT vive no servidor irmão **`ilo-mcp-server`** (decisão do decisor,
07/08/2026: um servidor por fonte — segregação estrutural CC BY / CC BY-SA e
convenção de naming do mcp-builder; tools com prefixo de serviço `uis_`).

Produção: **`https://uis.sidneybissoli.com`** (endpoint MCP em `/mcp`; padrão de
URLs do portfólio). O hostname `uis-mcp-server.sidneybissoli.workers.dev` permanece
servido como secundário. O mesmo servidor também roda **localmente por stdio**
(pacote [`uis-mcp-server`](https://www.npmjs.com/package/uis-mcp-server) no npm —
ver [Rodar localmente](#rodar-localmente-stdio)).

## Tools

| Tool | O quê | Fonte |
|---|---|---|
| `uis_search_indicators` | busca ~5.060 indicadores (4 temas) com disponibilidade de dados; traduz a palavra do usuário para a da UNESCO e diz que traduziu (`vocabulary_notes`); paginação por `offset` | catálogo em D1 (100% local) |
| `uis_list_geo_units` | 462 códigos de país/região (NATIONAL/REGIONAL); paginação por `offset` | D1 (100% local) |
| `uis_get_data` | registros por indicador/geo unit/anos, footnotes opcionais | 1 chamada à Data API por consulta (release fixada) |
| `search` | contrato ChatGPT Deep Research: ranqueia a consulta contra o catálogo inteiro, devolve `{ id, title, url }` (`ind:<code>`) | índice em memória construído do catálogo D1 (24 h) |
| `fetch` | contrato ChatGPT Deep Research: um indicador em Markdown legível (entrada do catálogo + amostra de dados) com a página pública do Data Browser como `url` | catálogo D1 + 1 chamada à Data API (amostra) |

Toda resposta carrega o **bloco de proveniência v1.0** (`@sbissoli/mcp-provenance`,
modos `concise`/`detailed` via parâmetro `provenance_mode`) nos três canais do
contrato: `structuredContent`, `_meta` namespaced (`com.sidneybissoli.uis/*`) e
rodapé de texto. Em `search`/`fetch` o canal de texto é o JSON do contrato
Deep Research (sem rodapé); a proveniência viaja em `structuredContent` e `_meta`.

### Pergunte com as suas palavras, não com as da UNESCO

A UIS escreve em inglês britânico e estatístico, e o catálogo é casado por
substring contra o NOME do indicador — então a palavra de todo dia, ou a grafia
americana, devolvia **zero, calado**. Medido nos 5.063 indicadores do catálogo
oficial em 16/09/2026 e consertado na 0.3.0: a busca expande o termo para as
grafias da fonte (OR dentro do termo, AND entre termos — só aumenta o recall) e
**diz** que traduziu, em `vocabulary_notes`; zero resultado vem com `hint` do
que fazer em seguida. A mesma tabela alimenta o índice de `search` (Deep
Research), que recebe a palavra perguntada como keyword do indicador cujo nome
traz a palavra da fonte.

| você pergunta | achava | a UNESCO escreve | acha |
| --- | ---: | --- | ---: |
| `enrollment` | 0 | enrolment | 387 |
| `education spending`, `budget` | 0 | expenditure | 57 |
| `teacher wages` | 0 | salary | 4 |
| `university`, `college` | 0 | tertiary | 448 |
| `preschool`, `kindergarten` | 0 | pre-primary, early childhood | 113 |
| `elementary` | 0 | primary | 886 |
| `scientists` | 0 | researchers | 11 |
| `girls`, `women` | 0 | female | 1.252 |
| `kids`, `teenagers` | 0 | children, adolescents | 161, 131 |
| `graduation rate` | 0 | completion | 342 |
| `pupil-teacher ratio` | 0 | pupil-qualified teacher ratio | 10 |
| `foreign students` | 249 | internationally mobile students | 979 |
| `primary school completion` | 0 | primary education | 114 |
| `illiteracy`, `maths`, `tvet`, `phd`, `stem` | 0 | illiterate, mathematics, vocational, doctoral, science, technology, engineering | 268, 79, 33, 24, 9 |

Só entra par **medido** (palavra perguntada ausente do catálogo, palavra da
fonte presente) — a tabela está em `src/uis/vocabulary.ts`, com as contagens.
Termo que a UIS não publica fica de fora e segue devolvendo zero, porque apelido
para dado inexistente promete o que a fonte não tem: `dropout`, `tuition`,
`unemployment` e `labor` (estatística de trabalho é do servidor irmão
`ilo-mcp-server`; o que `labor` casa hoje são 62 nomes com "collaboration").

### ChatGPT (Deep Research)

O deep research do ChatGPT (e o company knowledge, e os fluxos de pesquisa da
Responses API) só usa servidor MCP que exponha exatamente `search` e `fetch` —
este servidor expõe, por cima das tools `uis_*`. Aponte o conector para o
endpoint hospedado, sem chave:

```
https://uis.sidneybissoli.com/mcp
```

`search` ranqueia a consulta contra o catálogo inteiro da UIS (~5.060 indicadores
— educação, ciência/P&D, cultura, contexto demográfico) e devolve
`{ id, title, url }` (`ind:<code>`, ex.: `ind:ROFST.1.CP`); `fetch` devolve o
indicador em Markdown legível — nome, tema, grupo e framework do Data Browser,
anos disponíveis, uma amostra dos dados (Brasil e o agregado mundial dos ODS,
últimos cinco anos; 1 chamada à Data API com release fixada) e como consultar com
`uis_get_data` — com a página pública do UIS Data Browser como `url`
(`https://databrowser.uis.unesco.org/view#indicatorPaths=<framework>%3A0%3A<code>`),
que é o que o ChatGPT cita. O framework vem das definições do Data Browser,
gravadas no catálogo pelo seed (`framework_id`, `group_id`, `group_name`). No modo
desenvolvedor do ChatGPT (Settings → Security and login → Developer mode) qualquer
tool é chamável — as `uis_*` continuam sendo as certas para dados.

## Rodar localmente (stdio)

Prefere não passar suas consultas por um host de terceiros? O **mesmo servidor**
(`buildServer` de `src/server.ts`) também roda como **processo stdio local**
(`src/cli.ts`), falando direto com a UIS Data API oficial — mesmas 5 tools e 3
resources, mesmos limites, mesmo bloco de proveniência, sem Cloudflare no
caminho. A superfície dos dois canais é idêntica por construção (o dump do CI
confere: `node scripts/dump-surface.mjs --stdio`).

Sem instalação — o pacote está no npm
([`uis-mcp-server`](https://www.npmjs.com/package/uis-mcp-server), Node ≥ 22):

```json
{
  "mcpServers": {
    "unesco-uis": {
      "command": "npx",
      "args": ["-y", "uis-mcp-server"]
    }
  }
}
```

Ou a partir do código-fonte:

```bash
git clone https://github.com/SidneyBissoli/uis-mcp-server
cd uis-mcp-server
npm install
npm run build
node dist/cli.js   # serve MCP via stdio (Ctrl+C para parar)
```

Diferenças em relação ao servidor hospedado, todas por ausência dos bindings da
Cloudflare (`src/uis/catalog-memory.ts`):

- a release corrente (`/versions/default`) fica na memória do processo (KV →
  Map com TTL): resolvida uma vez por sessão, não entre sessões;
- o catálogo de indicadores e os geo units são **baixados dos endpoints oficiais
  na primeira busca** (`/definitions/indicators`, `/definitions/geounits` — os
  mesmos que o seed do D1 lê; ~1 s), e o `retrieved_at` real desse download é o
  que a proveniência reporta;
- o catálogo em memória **não** baixa as definições do UIS Data Browser
  (~6,7 MB): `framework_id`/`group_*` ficam nulos, então a URL que `fetch`
  (Deep Research) cita cai para a home do Data Browser e o índice de `search`
  não tem o nome do grupo nas keywords. Deep Research conversa com o servidor
  hospedado, onde o seed do D1 tem tudo;
- sem métricas de uso, rate limit ou autenticação (não há rede de entrada).

Logs vão para **stderr** — stdout carrega só o JSON-RPC. O `Dockerfile` do
repositório constrói este runtime (para o registro Glama).

## Decisões vinculantes (mini-spike docs/06 + decisor, 07/08/2026)

- **Release fixada em toda consulta de dados** (`version=` explícita, resolvida de
  `/versions/default` com cache KV TTL 24 h) — pinagem reprodutível + aproveitamento
  do cache CloudFront do upstream (keyed pela URL completa). A release é o
  `data_vintage` (ex.: `20260507-91260335 (published 2026-05-08)`).
- **Catálogo em D1** (`uis_indicators`/`uis_geounits`/`uis_meta`), seed via
  `scripts/seed-uis-catalog.mjs` com `retrieved_at` REAL da extração — é o que a
  proveniência do catálogo reporta (`served_from_cache: true`). A UIS aceita fetch
  do Node (sem a patologia do gateway da OIT).
- **Teto de 100k registros é do upstream** (HTTP 400 pedagógico com contagem exata —
  repassado ao cliente). Teto próprio de **5.000 registros por resposta** (proteção
  do contexto MCP): acima disso, erro pedagógico com a contagem real — **nunca
  truncar silenciosamente** (dado parcial apresentado como completo viola o contrato
  anti-alucinação). Máx. 25 indicadores/chamada. Reavaliar com uso real.
- **Notices** = tipos de footnote + magnitude + qualifier com contagem; o texto
  integral de cada footnote fica na linha (`include_footnotes: true`).
- **Idioma do servidor: inglês; fuso: UTC** (persona internacional; dados da UIS são
  publicados em inglês). `derived` é sempre `false` — o servidor não transforma nada.

## Obrigações de licença (docs/02 do projeto ilostat)

- UIS: **CC BY-SA 4.0** (Terms do Data Browser, que governam a Data API; `verified_at`
  2026-08-04; confirmação manual do decisor 07/08/2026).
- Atribuição obrigatória em toda resposta (campo `citation`), com **URL completa +
  data de extração**:
  `Source: UNESCO Institute for Statistics (UIS), <URL>, date of extraction <data>.`
- Não implicar endosso/afiliação da UNESCO (landing declara "not endorsed"); por isso
  o servidor chama `uis-mcp-server`, não "unesco-mcp-server".
- Segregação CC BY / CC BY-SA em relação ao ILOSTAT: **estrutural** — servidores
  distintos; os dois regimes nunca coabitam uma resposta nem um servidor.

## Desenvolvimento

```bash
npm install
npm run typecheck && npm test   # testes offline (tools, framework, vocabulário, catálogo em memória, evals-fixtures)
npm run dev                     # http://localhost:8787/mcp
npm run build                   # runtime stdio → dist/cli.js (o que vai para o npm)
node scripts/dump-surface.mjs --stdio   # fumaça offline do build: initialize → tools/resources/prompts

# Seed do catálogo (D1) — necessário antes do primeiro uso:
node scripts/seed-uis-catalog.mjs
npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql
npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql

npm run deploy
node scripts/smoke-mcp.mjs      # smoke do MCP em produção (initialize → tools/list == /status → uis_* → search/fetch → erros)
```

## Refresh do seed (D1) — decisão da Sessão 07 (07/08/2026)

Estratégia: **seed manual a cada data release da UIS; sem cron do Worker.** As
consultas de `uis_get_data` seguem a release *default* re-resolvida com KV TTL 24 h
(quando a UIS publica release nova, os dados migram sozinhos em ≤24 h); o que fica
defasado é o catálogo em D1 (disponibilidade, contagens, anos por indicador),
seedado da release corrente (`20260507-91260335`). A proveniência do catálogo expõe
o `retrieved_at` REAL do seed — staleness explícita, não silenciosa.

- **Gatilho de re-seed**: release default ≠ release do seed (a UIS publica ~2–3
  releases/ano; o smoke em produção imprime a release corrente da Data API —
  divergência = re-seedar). Procedimento: os 3 comandos de seed em "Desenvolvimento".
- **Cron rejeitado por ora**: 2–3 eventos/ano não justificam código/estado extra;
  reavaliar na Fase 3 (pós-submissão), com tráfego real — mesma janela da
  reavaliação dos tetos operacionais.

## Evals

`@sbissoli/mcp-evals`: 22 fixtures próprias em `evals/fixtures/queries.ts`, validadas
offline em `npm test`. A rodada com modelo real (`npm run eval`) **custa API** — só
com decisão explícita (`ANTHROPIC_API_KEY`; sem a chave, sai 0 com instruções).
Rodada de 07/08/2026 (Sessão 07): **top-1 100% (20/20)** — `evals/results/`.

**End-to-end (formato mcp-builder)**: 10 perguntas complexas com resposta única
verificável em `evals/e2e/evaluation.xml`, respostas validadas manualmente contra a
produção (`evals/e2e/validacao-respostas.md`). Rodada de 07/08/2026 (Sonnet):
**10/10 (100%)** — `evals/results/2026-08-07-e2e.md`. Harness:
`fase0-insumos/mcp-builder-evaluation/evaluation.py -t http -u https://uis.sidneybissoli.com/mcp`
(exige as correções de compatibilidade descritas no registro de resultados).

## Rotas

`/` landing · `/health` liveness · `/status` versão+deploy · `/metrics` uso agregado ·
`/mcp` MCP Streamable HTTP. Auth Bearer opcional (`wrangler secret put API_KEY`);
rate limit token-bucket por IP.

## Privacidade

Política de privacidade do serviço hospedado: [PRIVACY.md](PRIVACY.md).
