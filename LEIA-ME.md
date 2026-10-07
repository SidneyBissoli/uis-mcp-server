# Instituto de Estatística da UNESCO (UIS) — MCP Server

![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-1f6feb)
[![CI](https://github.com/SidneyBissoli/uis-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/SidneyBissoli/uis-mcp-server/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fuis.sidneybissoli.com%2Fstatus&query=%24.version&label=version&color=1f6feb)](https://uis.sidneybissoli.com/status)
[![Tools](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fuis.sidneybissoli.com%2Fstatus&query=%24.tools&label=tools&color=2ea44f)](https://uis.sidneybissoli.com/status)
[![npm](https://img.shields.io/npm/v/uis-mcp-server?label=npm&color=cb3837)](https://www.npmjs.com/package/uis-mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-blue)](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SidneyBissoli%2Fuis-mcp-server/versions)
[![uis-mcp-server MCP server](https://glama.ai/mcp/servers/SidneyBissoli/uis-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/SidneyBissoli/uis-mcp-server)
[![smithery badge](https://smithery.ai/badge/sidneybissoli/uis-mcp-server)](https://smithery.ai/servers/sidneybissoli/uis-mcp-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE.md)
[![Status](https://img.shields.io/website?url=https%3A%2F%2Fuis.sidneybissoli.com%2Fhealth&up_message=online&down_message=offline&label=status)](https://uis.sidneybissoli.com/status)

🇺🇸 [Read in English](https://github.com/SidneyBissoli/uis-mcp-server/blob/main/README.md)

Servidor [MCP](https://modelcontextprotocol.io) **público, hospedado e provenance-first** para as
estatísticas do **Instituto de Estatística da UNESCO (UNESCO Institute for Statistics, UIS)** —
educação, ciência e P&D, cultura e comunicação — **sem instalação, sem conta, sem chave de API**.
Aponte seu cliente MCP para o endpoint hospedado e pergunte sobre matrícula, conclusão, crianças
fora da escola, alfabetização, gasto em educação, pesquisadores e gasto em P&D por país, região e
ano. Roda em Cloudflare Workers via Streamable HTTP e consulta a **UIS Data API** oficial.

> **Projeto independente.** Este é um cliente não oficial, construído pela comunidade, da Data API
> pública da UIS — sem afiliação nem endosso da UNESCO ou do Instituto de Estatística da UNESCO.
> Os dados permanecem © UNESCO-UIS sob CC BY-SA 4.0; ver [Licença dos dados e atribuição](#licença-dos-dados-e-atribuição).

Toda resposta carrega um **bloco de proveniência** (URL da fonte, a release de dados da UIS de
onde veio, instante real da extração, licença, citação da UIS) — números exatos com trilha de
auditoria, não palpites da base de treino.

## Perguntas que ele responde

Em linguagem comum, dentro do cliente MCP — quem escolhe a ferramenta e os filtros é o
assistente:

- "Que indicadores da UNESCO acompanham crianças fora da escola?" (`uis_search_indicators`)
- "Como evoluiu a conclusão do ensino fundamental no Brasil, no Peru e na Colômbia depois de 2015?"
  (`uis_get_data`)
- "Existe série da UNESCO de gasto público em educação como fatia do PIB?"
  (`uis_search_indicators` → `uis_get_data`)
- "Quantos pesquisadores por milhão de habitantes os BRICS têm desde 2010?"
  (`uis_search_indicators` → `uis_get_data`)
- "Qual a taxa de alfabetização de adultos na Argentina e no Chile, por sexo?" (`uis_get_data`)
- "Que código a UIS usa para a Costa do Marfim, e que agregados regionais existem?"
  (`uis_list_geo_units`)

**Pergunte com a sua palavra, não com a da UNESCO.** A UIS escreve em inglês estatístico
britânico e a busca casa o nome do indicador — por isso a palavra do dia a dia (ou a grafia
americana) devolvia *nada*. Medido nos 5.063 indicadores do catálogo oficial em 16/09/2026, e
corrigido na 0.3.0: a busca expande o termo para a grafia da fonte (OU dentro do termo, E entre
termos — só aumenta o recall) e **avisa** que traduziu, em `vocabulary_notes`; resultado zero vem
com um `hint` do que tentar em seguida. A mesma tabela alimenta o índice de `search` (Deep
Research).

| você pergunta | achava antes | a UNESCO escreve | acha |
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

Só entra par **medido** (palavra perguntada ausente do catálogo, palavra da fonte presente) — a
tabela está em `src/uis/vocabulary.ts`, com as contagens. Termo que a UIS não publica fica de fora
e segue devolvendo zero, porque apelido para dado inexistente promete o que a fonte não tem:
`dropout`, `tuition`, `unemployment` e `labor` (estatística do trabalho é do servidor irmão
[`ilo-mcp-server`](https://ilo.sidneybissoli.com); o que `labor` casa hoje são 62 nomes com
"collaboration").

## Comparação com as alternativas

Quem já trabalha com os dados da UIS tem boas ferramentas, e este servidor **não substitui nenhuma
delas** — ele ocupa outro lugar da cadeia: responde a pergunta no ponto onde ela é feita, dentro
do assistente, com fonte, release de dados e licença grudadas na resposta. Versões medidas em
02/10/2026.

| Ferramenta | O que é | Quando preferir |
| --- | --- | --- |
| **uis-mcp-server** (este) | Servidor MCP remoto, hospedado, nada para instalar: 5 ferramentas sobre os ~5.060 indicadores da UIS, com bloco de proveniência por resposta | A pergunta é feita num assistente (Claude, ChatGPT, Cursor, Claude Code) e a resposta precisa ser auditável |
| [uisapi](https://cran.r-project.org/package=uisapi) 0.1.1 (R, CRAN) | Cliente R comunitário da UIS Data API (não é da equipe da UIS); também lista os arquivos em lote | Você está em R e quer as séries da UIS num data frame, para analisar |
| [unesco-reader](https://pypi.org/project/unesco-reader/) 3.1.1 (Python, PyPI) | Cliente Python comunitário da UIS Data API | Seu pipeline é Python |
| [global-education-mcp](https://github.com/malkreide/global-education-mcp) 0.4.0 (MCP, Python) | Outro servidor MCP: UIS Data API mais a API *Education at a Glance* da OCDE | Você quer dados de educação da UIS e da OCDE lado a lado num servidor local |
| [WDI](https://cran.r-project.org/package=WDI) / [wbstats](https://cran.r-project.org/package=wbstats) (R), [wbgapi](https://pypi.org/project/wbgapi/) (Python) | Clientes do Banco Mundial; o WDI republica muitas séries de educação da UIS, com defasagem | Você quer as séries de educação da UIS junto com indicadores do Banco Mundial |
| [UIS Bulk Data Download Service](https://databrowser.uis.unesco.org/resources/bulk) | Os arquivos CSV da própria UIS, por release de dados (SDG e OPRI) | Você precisa da base inteira, não de respostas |
| [UIS Data API](https://api.uis.unesco.org/api/public/documentation/) | A própria fonte, que este servidor consulta — sem chave | Você está construindo o seu próprio cliente |

**Sobre SDMX:** a UIS não serve mais. A API SDMX antiga chegou ao fim de vida em 23/06/2020 (está
na nota da release de fevereiro de 2026 da própria UIS) e o endpoint hoje responde 404 — clientes
SDMX genéricos que ainda listam uma fonte `UNESCO` (ex.: `sdmx1`) apontam para essa URL morta, e
a cópia dos dados da UNESCO na DBnomics é um retrato congelado da era de 2020. Para SDMX sobre
estatística do trabalho, ver o servidor irmão [`ilo-mcp-server`](https://ilo.sidneybissoli.com),
que consulta a API SDMX do ILOSTAT.

**Não use este servidor quando** precisar da base inteira em vez de uma resposta (os arquivos em
lote são a ferramenta certa), quando a pergunta não for de estatística de educação, ciência,
cultura ou comunicação publicada pela UIS (trabalho → OIT, contas nacionais → FMI/Banco Mundial)
ou quando precisar de microdado: a UIS publica agregados, e este servidor também.

**Servidores irmãos**, mesmo desenho e mesmo bloco de proveniência, para outras fontes oficiais:
[ILOSTAT](https://ilo.sidneybissoli.com) (estatísticas do trabalho da OIT),
[IBGE](https://ibge.sidneybissoli.com), [BCB](https://bcb.sidneybissoli.com),
[Senado](https://senado.sidneybissoli.com), [SIH/SUS](https://sih.sidneybissoli.com) (internações
hospitalares do DATASUS) e [terminologias médicas](https://medical.sidneybissoli.com) (CID-10,
CID-11, LOINC, RxNorm, ATC, MeSH).

## Use (hospedado — sem configuração)

Aponte qualquer cliente MCP para o endpoint Streamable HTTP:

```
https://uis.sidneybissoli.com/mcp
```

Claude Desktop / Claude Code e outros clientes com suporte remoto nativo:

```json
{
  "mcpServers": {
    "unesco-uis": {
      "url": "https://uis.sidneybissoli.com/mcp"
    }
  }
}
```

Para clientes que lançam servidores MCP como comando, use a ponte
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "unesco-uis": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://uis.sidneybissoli.com/mcp"]
    }
  }
}
```

O hostname `uis-mcp-server.sidneybissoli.workers.dev` também é servido, como secundário.

### ChatGPT (Deep Research)

O deep research do ChatGPT (e o company knowledge, e os fluxos de pesquisa da Responses API) só
usa servidor MCP que exponha exatamente `search` e `fetch` — este servidor expõe, por cima das
ferramentas `uis_*`. Aponte o conector para o endpoint hospedado, sem chave:

```
https://uis.sidneybissoli.com/mcp
```

`search` ranqueia a consulta contra o catálogo inteiro da UIS (~5.060 indicadores — educação,
ciência/P&D, cultura, contexto demográfico) e devolve `{ id, title, url }` (`ind:<code>`, ex.:
`ind:ROFST.1.CP`); `fetch` devolve o indicador em Markdown legível — nome, tema, grupo e framework
do Data Browser, anos disponíveis, uma amostra dos dados (Brasil e o agregado mundial dos ODS,
últimos cinco anos; 1 chamada à Data API com release fixada) e como consultar com `uis_get_data`
— com a página pública do UIS Data Browser como `url`
(`https://databrowser.uis.unesco.org/view#indicatorPaths=<framework>%3A0%3A<code>`), que é o que o
ChatGPT cita. Em `search`/`fetch` o canal de texto é o JSON do contrato Deep Research (sem
rodapé); a proveniência viaja em `structuredContent` e `_meta`. No modo desenvolvedor do ChatGPT
(Settings → Security and login → Developer mode) qualquer ferramenta é chamável — as `uis_*`
continuam sendo as certas para dados.

## Rodar localmente (stdio)

Prefere não passar suas consultas por um host de terceiros? O **mesmo servidor** também roda como
**processo stdio local**, falando direto com a UIS Data API oficial — mesmas 5 ferramentas e 3
resources, mesmos limites, mesmo bloco de proveniência, sem Cloudflare no caminho. A superfície
dos dois runtimes é idêntica por construção (o CI confere: `node scripts/dump-surface.mjs --stdio`).

Sem instalação — o pacote está no npm ([`uis-mcp-server`](https://www.npmjs.com/package/uis-mcp-server), Node ≥ 22):

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

Diferenças em relação ao servidor hospedado, todas por ausência dos bindings da Cloudflare:

- a release de dados corrente (`/versions/default`) fica na memória do processo: resolvida uma
  vez por sessão, não entre sessões;
- o catálogo de indicadores e os geo units são **baixados dos endpoints oficiais na primeira
  busca** (`/definitions/indicators`, `/definitions/geounits` — os mesmos de onde sai o catálogo
  hospedado; ~1 s), e o `retrieved_at` real desse download é o que a proveniência reporta;
- o catálogo em memória **não** baixa as definições do UIS Data Browser (~6,7 MB), então a URL que
  `fetch` cita cai para a página inicial do Data Browser e o índice de `search` fica sem o nome do
  grupo nas keywords — o Deep Research conversa com o servidor hospedado, que tem tudo;
- sem métricas de uso, rate limit ou autenticação.

Logs vão para **stderr** — stdout carrega só o JSON-RPC. O `Dockerfile` do repositório constrói
este runtime (usado pelo registro Glama).

## Ferramentas

| Ferramenta | O que faz | Fonte |
|---|---|---|
| `uis_search_indicators` | busca por palavra-chave em ~5.060 indicadores (4 temas) com disponibilidade de dados; traduz a palavra do usuário para a da UNESCO e avisa (`vocabulary_notes`); paginação por `offset` | catálogo local (sem chamada à fonte) |
| `uis_list_geo_units` | 462 códigos de país e de região (NATIONAL/REGIONAL); paginação por `offset` | catálogo local (sem chamada à fonte) |
| `uis_get_data` | registros por indicador, geo unit e anos, footnotes opcionais | 1 chamada viva à Data API por consulta (release fixada) |
| `search` | contrato ChatGPT Deep Research: ranqueia a consulta contra o catálogo inteiro, devolve `{ id, title, url }` (`ind:<code>`) | índice em memória construído do catálogo local (24 h) |
| `fetch` | contrato ChatGPT Deep Research: um indicador em Markdown legível (entrada do catálogo + amostra de dados) com a página pública do Data Browser como `url` | catálogo local + 1 chamada à Data API (amostra) |

Fluxo típico: `uis_search_indicators` para achar o código do indicador → `uis_list_geo_units`
para os códigos de país/região → `uis_get_data` com filtro de anos.

Toda resposta carrega o **bloco de proveniência v1.1**
([`@sbissoli/mcp-provenance`](https://www.npmjs.com/package/@sbissoli/mcp-provenance), modos
`concise`/`detailed` pelo parâmetro `provenance_mode`) em três canais: `structuredContent`,
`_meta` com namespace (`com.sidneybissoli.uis/*`) e rodapé de texto. Desde a 1.1.0 o bloco traz
`retrieval`, o diagnóstico de origem da chamada — quantas idas foram à Data API, quantas
tentativas custaram, que anomalias foram superadas e se a resposta é `unstable` —, medido pelo
fetch comum do portfólio ([`@sbissoli/mcp-upstream`](https://www.npmjs.com/package/@sbissoli/mcp-upstream));
`null` quando a resposta não tocou a UIS (catálogo ou release em cache).

## Resources

Três **resources** (estáticos, `text/markdown`, sem chamada à fonte) que o cliente pode anexar ao
contexto antes de chamar as ferramentas — poupam as chamadas de descoberta que quase toda sessão
gasta com "qual indicador, qual código":

| URI | Conteúdo |
|---|---|
| `uis://guide` | fluxo das ferramentas, convenções de código (famílias e sufixos dos códigos de indicador, geo units ISO alfa-3, temas), limites, regras de reporte |
| `uis://reference/key-indicators` | códigos de indicador conferidos por tema (conclusão, fora da escola, matrícula, alfabetização, proficiência, gasto em educação, P&D do ODS 9.5, gasto com patrimônio do ODS 11.4, população) |
| `uis://reference/provenance` | significado de cada campo da proveniência e como citar a UIS, inclusive o que o CC BY-SA (ShareAlike) exige de quem redistribui |

## Comportamento e limites

- **Toda consulta de dados fixa a release.** `uis_get_data` manda `version=` explícita, resolvida
  de `/versions/default` e guardada por 24 h — reprodutível, e aproveita o cache da própria fonte.
  A release é o `data_vintage` (ex.: `20260507-91260335 (published 2026-05-08)`); quando a UIS
  publica release nova, as consultas de dados migram para ela em até 24 h.
- **5.000 registros por resposta, no máximo 25 indicadores por chamada.** Acima disso o servidor
  devolve erro explicativo com a contagem real — **nunca trunca calado**, porque dado parcial
  apresentado como completo quebraria o contrato de proveniência. O teto da própria UIS, de
  100.000 registros, volta como o HTTP 400 explicativo da fonte, repassado.
- **O catálogo de indicadores é um retrato de uma release da UIS**, atualizado à mão quando a UIS
  publica release nova (2 a 3 vezes por ano); o `retrieved_at` real dele sai na proveniência de
  `uis_search_indicators`, então a idade fica sempre visível (`served_from_cache: true`).
- **`retrieved_at` é sempre o instante real da extração na UIS**, nunca o do build ou da resposta.
- **Notices** reportam os tipos de footnote, magnitude e qualifier, com contagem; o texto integral
  de cada footnote fica na linha (`include_footnotes: true`).
- **Toda ida à fonte tem timeout e política de retry** (desde a 1.1.0, medida contra a API viva em
  27/09/2026: release 1,1 s, consulta pequena 0,8 s, cinco indicadores inteiros 2,9 s/3,5 MB, o 400
  do teto de 100 mil em 0,9 s): 35 s por tentativa — dez vezes o pior caso legítimo e acima dos
  29 s do API Gateway da AWS que fica na frente da UIS —, até 3 tentativas em 5xx, 429 (honrando
  `Retry-After`) e falha de rede, 45 s no total por chamada. Timeout, HTTP 504, o 400 explicativo e
  404 nunca se repetem. O que aconteceu sai no campo `retrieval` da proveniência; timeout e falha
  de rede viram erro legível, não exceção crua.
- **`derived` é sempre `false`** — o servidor não transforma valores.
- **Idioma: inglês; fuso: UTC** (a UIS publica os dados em inglês).

## Licença dos dados e atribuição

- Dados da UIS: **CC BY-SA 4.0** (termos do UIS Data Browser, que regem a Data API; licença
  conferida em 04/08/2026).
- Atribuição da UIS em toda resposta (campo `citation`), com URL completa e data de extração:
  `Source: UNESCO Institute for Statistics (UIS), <URL>, date of extraction <data>.`
- ShareAlike: o que você redistribuir construído sobre esses dados tem de manter a licença
  CC BY-SA 4.0 — o resource `uis://reference/provenance` explica.
- O logotipo da UNESCO não é usado e nenhum endosso é sugerido; por isso o servidor se chama
  `uis-mcp-server`, e não "unesco-mcp-server". Os dados do ILOSTAT (CC BY 4.0) moram num servidor
  separado, então as duas licenças nunca dividem uma resposta.

## Hospedar o seu / desenvolvimento

Tudo abaixo só é necessário para rodar uma instância própria — **não** é preciso para usar o
servidor público.

```bash
npm install
npm run typecheck && npm test   # suíte offline (ferramentas, framework, vocabulário, catálogo em memória, fixtures de eval)
npm run dev                     # http://localhost:8787/mcp (Worker)
npm run build                   # runtime stdio → dist/cli.js (o que vai para o npm)
node scripts/dump-surface.mjs --stdio   # fumaça offline do build: initialize → tools/resources/prompts

# Seed do catálogo (D1) — necessário antes do primeiro uso:
node scripts/seed-uis-catalog.mjs
npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql
npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql

npm run deploy
node scripts/smoke-mcp.mjs      # smoke contra a produção (initialize → tools/list == /status → uis_* → search/fetch → erros)
```

Notas para quem opera:

- **O refresh do catálogo** é manual, uma vez por release de dados da UIS (sem cron). O smoke em
  produção imprime a release corrente da Data API; quando ela diverge da release do seed, re-seedar
  com os três comandos acima. As consultas de dados seguem a release default sozinhas, então só o
  catálogo envelhece — e a idade dele está exposta na proveniência.
- A UIS Data API aceita o `fetch` do Node como ele é (sem o contorno de cabeçalho que o gateway da
  OIT exige).
- Autenticação Bearer opcional (`wrangler secret put API_KEY`); rate limit token-bucket por IP.

## Evals

[`@sbissoli/mcp-evals`](https://www.npmjs.com/package/@sbissoli/mcp-evals): 22 fixtures em
`evals/fixtures/queries.ts`, validadas offline no `npm test`. A rodada com modelo real
(`npm run eval`) usa a API da Anthropic e exige `ANTHROPIC_API_KEY` (sem ela, sai com instruções).
Rodada de 07/08/2026: **top-1 100% (20/20)** — `evals/results/`.

**Ponta a ponta**: 10 perguntas complexas com resposta única verificável em
`evals/e2e/evaluation.xml`, respostas validadas à mão contra a produção
(`evals/e2e/validacao-respostas.md`). Rodada de 07/08/2026 (Sonnet): **10/10** —
`evals/results/2026-08-07-e2e.md`.

## Rotas

| Rota | Para quê |
|---|---|
| `/` | landing (identidade do serviço + contato — pública) |
| `/health` | liveness |
| `/status` | versão, contagem e nomes das ferramentas, deploy corrente (alimenta os badges do README) |
| `/metrics` | uso agregado (só do endpoint MCP; sem IPs, sem conteúdo de consulta) |
| `/.well-known/mcp/server-card.json` | server card MCP para scanners de diretório (derivado do `initialize` e das listas reais — público) |
| `/mcp` | MCP Streamable HTTP |

## Segurança

Snyk Agent Scan (07/08/2026, antes de `search` e `fetch` existirem): **passou** — relatório em
[`security/`](security/2026-08-07-snyk-agent-scan.md).

## Licença

Código: [MIT](LICENSE.md). Dados: UIS, CC BY-SA 4.0 (ver "Licença dos dados e atribuição" acima).

## Privacidade

Política de privacidade do serviço hospedado: [PRIVACY.md](PRIVACY.md).

## Contato

Sidney da Silva Pereira Bissoli — sbissoli76@gmail.com. Este serviço não tem endosso da UNESCO.
