# UNESCO Institute for Statistics (UIS) — MCP Server

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

🇧🇷 [Leia em Português](https://github.com/SidneyBissoli/uis-mcp-server/blob/main/LEIA-ME.md)

A **public, hosted, provenance-first** [MCP](https://modelcontextprotocol.io) server for the
statistics of the **UNESCO Institute for Statistics (UIS)** — education, science and R&D, culture
and communication — **no installation, no account, no API key**. Point your MCP client at the
hosted endpoint and ask about enrolment, completion, out-of-school children, literacy, education
spending, researchers and R&D expenditure by country, region and year. It runs on Cloudflare
Workers over Streamable HTTP and talks to the official **UIS Data API**.

> **Independent project.** This is an unofficial, community-built client of the UIS's public
> Data API — not affiliated with or endorsed by UNESCO or the UNESCO Institute for Statistics.
> Data remain © UNESCO-UIS under CC BY-SA 4.0; see [Data license and attribution](#data-license-and-attribution).

Every response carries a **provenance block** (source URL, the UIS data release it came from,
real retrieval timestamp, license, UIS citation) — exact figures with an audit trail, not
numbers guessed from training data.

> 🇧🇷 **Em português.** Servidor MCP **remoto e hospedado** (nada para instalar, sem conta e sem
> chave) para as estatísticas do **Instituto de Estatística da UNESCO** — matrícula, conclusão,
> crianças fora da escola, alfabetização, gasto em educação e P&D por país, região e ano, direto
> no Claude, no ChatGPT ou em qualquer cliente MCP, com proveniência e citação da fonte em cada
> resposta: [README em português](https://github.com/SidneyBissoli/uis-mcp-server/blob/main/LEIA-ME.md).

## Questions it answers

In plain language, inside the MCP client — the assistant picks the tool and the filters:

- "Which UNESCO indicators track out-of-school children?" (`uis_search_indicators`)
- "How did primary completion evolve in Brazil, Peru and Colombia after 2015?" (`uis_get_data`)
- "Is there a UNESCO series on government expenditure on education as a share of GDP?"
  (`uis_search_indicators` → `uis_get_data`)
- "How many researchers per million inhabitants do the BRICS countries have since 2010?"
  (`uis_search_indicators` → `uis_get_data`)
- "What is the adult literacy rate in Argentina and Chile, by sex?" (`uis_get_data`)
- "Which geo unit code does the UIS use for Côte d'Ivoire, and which regional aggregates exist?"
  (`uis_list_geo_units`)

**Ask in your words, not UNESCO's.** The UIS is worded in British statistical English, and the
catalogue is matched on the indicator name — so the everyday or US word used to return *nothing
at all*. Measured over the 5,063 indicators of the official catalogue (2026-09-16), and fixed
since 0.3.0: the search expands the term to the source's wording (OR within a term, AND across
terms — it only adds recall) and **says** it translated, in `vocabulary_notes`; a zero result
comes with a `hint` on what to try next. The same table feeds the `search` index (Deep Research).

| you ask | hits before | UNESCO writes | hits |
| --- | ---: | --- | ---: |
| `enrollment` | 0 | enrolment | 387 |
| `education spending`, `budget` | 0 | expenditure | 57 |
| `teacher wages` | 0 | salary | 4 |
| `university`, `college` | 0 | tertiary | 448 |
| `preschool`, `kindergarten` | 0 | pre-primary, early childhood | 113 |
| `elementary` | 0 | primary | 886 |
| `scientists` | 0 | researchers | 11 |
| `girls`, `women` | 0 | female | 1,252 |
| `kids`, `teenagers` | 0 | children, adolescents | 161, 131 |
| `graduation rate` | 0 | completion | 342 |
| `pupil-teacher ratio` | 0 | pupil-qualified teacher ratio | 10 |
| `foreign students` | 249 | internationally mobile students | 979 |
| `primary school completion` | 0 | primary education | 114 |
| `illiteracy`, `maths`, `tvet`, `phd`, `stem` | 0 | illiterate, mathematics, vocational, doctoral, science, technology, engineering | 268, 79, 33, 24, 9 |

Only **measured** pairs go in (the asked word absent from the catalogue, the source's word
present) — the table lives in `src/uis/vocabulary.ts`, with the counts. A term the UIS does not
publish is left out and still returns zero, because an alias for data that does not exist
promises what the source does not have: `dropout`, `tuition`, `unemployment` and `labor` (labour
statistics belong to the sister server [`ilo-mcp-server`](https://ilo.sidneybissoli.com); what
`labor` matches today are 62 names containing "collaboration").

## Comparison with the alternatives

Anyone who already works with UIS data has good tools, and this server **replaces none of them** —
it sits somewhere else in the chain: it answers the question at the point where the question is
asked, inside the assistant, with source, data release and licence attached to the answer.
Versions measured on 2026-10-02.

| Tool | What it is | When to prefer it |
| --- | --- | --- |
| **uis-mcp-server** (this) | Remote MCP server, hosted, nothing to install: 5 tools over the ~5,060 UIS indicators, with a provenance block per answer | The question is asked in an assistant (Claude, ChatGPT, Cursor, Claude Code) and the answer has to be auditable |
| [uisapi](https://cran.r-project.org/package=uisapi) 0.1.1 (R, CRAN) | Community R client of the UIS Data API (not by UIS staff); also lists the bulk files | You are in R and want UIS series in a data frame for analysis |
| [unesco-reader](https://pypi.org/project/unesco-reader/) 3.1.1 (Python, PyPI) | Community Python client of the UIS Data API | Your pipeline is Python |
| [global-education-mcp](https://github.com/malkreide/global-education-mcp) 0.4.0 (MCP, Python) | Another MCP server: UIS Data API plus the OECD *Education at a Glance* API | You want UIS and OECD education data side by side in one local server |
| [WDI](https://cran.r-project.org/package=WDI) / [wbstats](https://cran.r-project.org/package=wbstats) (R), [wbgapi](https://pypi.org/project/wbgapi/) (Python) | World Bank clients; WDI republishes many UIS education series, with a lag | You want UIS education series next to World Bank indicators |
| [UIS Bulk Data Download Service](https://databrowser.uis.unesco.org/resources/bulk) | The UIS's own CSV files per data release (SDG and OPRI) | You need whole datasets, not answers |
| [UIS Data API](https://api.uis.unesco.org/api/public/documentation/) | The source itself, which this server calls — no key | You are building your own client and want full control |

**About SDMX:** the UIS no longer serves it. Its legacy SDMX API reached end-of-life on
2020-06-23 (stated in the UIS's own February 2026 data release note) and the endpoint now answers
404 — generic SDMX clients that still list a `UNESCO` source (e.g. `sdmx1`) point at that dead
URL, and the DBnomics copy of UNESCO data is a frozen 2020-era snapshot. For SDMX over labour
statistics, see the sister server [`ilo-mcp-server`](https://ilo.sidneybissoli.com), which talks
to the ILOSTAT SDMX API.

**Do not use this server when** you need a whole dataset rather than an answer (the bulk files are
the right tool), when the question is not education, science, culture or communication statistics
published by the UIS (labour → ILO, national accounts → IMF/World Bank), or when you need
microdata: the UIS publishes aggregates, and so does this server.

**Sister servers**, same design and same provenance block, for other official sources:
[ILOSTAT](https://ilo.sidneybissoli.com) (ILO labour statistics),
[IBGE](https://ibge.sidneybissoli.com) (Brazilian statistics),
[BCB](https://bcb.sidneybissoli.com) (Central Bank of Brazil),
[Senado](https://senado.sidneybissoli.com) (Brazilian Senate open data),
[SIH/SUS](https://sih.sidneybissoli.com) (Brazilian hospital admissions) and
[medical terminologies](https://medical.sidneybissoli.com) (ICD-11, ICD-10, LOINC, RxNorm, ATC, MeSH).

## Use it (hosted — no setup)

Point any MCP client at the Streamable HTTP endpoint:

```
https://uis.sidneybissoli.com/mcp
```

Claude Desktop / Claude Code and other clients with native remote support:

```json
{
  "mcpServers": {
    "unesco-uis": {
      "url": "https://uis.sidneybissoli.com/mcp"
    }
  }
}
```

For clients that launch MCP servers as a command, use the
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge:

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

The `uis-mcp-server.sidneybissoli.workers.dev` hostname is also served, as a secondary.

### ChatGPT (Deep Research)

ChatGPT deep research (and company knowledge, and research workflows over the Responses API)
only uses an MCP server that exposes exactly `search` and `fetch` — this server does, on top of
the `uis_*` tools. Point the connector at the hosted endpoint, no key required:

```
https://uis.sidneybissoli.com/mcp
```

`search` ranks the query against the full UIS catalogue (~5,060 indicators — education,
science/R&D, culture, demographic context) and returns `{ id, title, url }` (`ind:<code>`, e.g.
`ind:ROFST.1.CP`); `fetch` returns the indicator as readable Markdown — name, theme, Data Browser
group and framework, available years, a data sample (Brazil and the SDG world aggregate, last five
years; one Data API call with a pinned release) and how to query it with `uis_get_data` — with the
public UIS Data Browser page as `url`
(`https://databrowser.uis.unesco.org/view#indicatorPaths=<framework>%3A0%3A<code>`), which is
what ChatGPT cites. In `search`/`fetch` the text channel is the Deep Research contract's JSON (no
footer); provenance travels in `structuredContent` and `_meta`. In ChatGPT's developer mode
(Settings → Security and login → Developer mode) any tool is callable — the `uis_*` tools remain
the ones to use for data.

## Run locally (stdio)

Prefer not to route queries through a third-party host? The **same server** also runs as a
**local stdio process** that talks directly to the official UIS Data API — same 5 tools and 3
resources, same limits, same provenance block, no Cloudflare in the loop. The surface of the two
runtimes is identical by construction (CI checks it: `node scripts/dump-surface.mjs --stdio`).

No install needed — the package is on npm ([`uis-mcp-server`](https://www.npmjs.com/package/uis-mcp-server), Node ≥ 22):

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

Or from source:

```bash
git clone https://github.com/SidneyBissoli/uis-mcp-server
cd uis-mcp-server
npm install
npm run build
node dist/cli.js   # serves MCP over stdio (Ctrl+C to stop)
```

Differences from the hosted server, all due to the absence of Cloudflare bindings:

- the current data release (`/versions/default`) is kept in process memory: resolved once per
  session, not across sessions;
- the indicator catalogue and the geo units are **downloaded from the official endpoints on the
  first search** (`/definitions/indicators`, `/definitions/geounits` — the same ones the hosted
  catalogue is seeded from; ~1 s), and the real `retrieved_at` of that download is what
  provenance reports;
- the in-memory catalogue does **not** download the UIS Data Browser definitions (~6.7 MB), so
  the URL that `fetch` cites falls back to the Data Browser home page and the `search` index lacks
  the group name in its keywords — Deep Research talks to the hosted server, which has them;
- no usage metrics, rate limit or auth.

Logs go to **stderr** — stdout carries only the JSON-RPC stream. The repository `Dockerfile`
builds this runtime (used by the Glama registry).

## Tools

| Tool | What it does | Source |
|---|---|---|
| `uis_search_indicators` | keyword search over ~5,060 indicators (4 themes) with data availability; translates the user's word to UNESCO's and says so (`vocabulary_notes`); paginated by `offset` | local catalogue (no upstream call) |
| `uis_list_geo_units` | 462 country and regional codes (NATIONAL/REGIONAL); paginated by `offset` | local catalogue (no upstream call) |
| `uis_get_data` | records by indicator, geo unit and years, optional footnotes | 1 live Data API call per query (pinned release) |
| `search` | ChatGPT Deep Research contract: ranks a query against the full catalogue, returns `{ id, title, url }` (`ind:<code>`) | in-memory index built from the local catalogue (24 h) |
| `fetch` | ChatGPT Deep Research contract: one indicator as readable Markdown (catalogue entry + data sample) with the public Data Browser page as `url` | local catalogue + 1 Data API call (sample) |

Typical flow: `uis_search_indicators` to find an indicator code → `uis_list_geo_units` for
country/region codes → `uis_get_data` with year filters.

Every response carries the **provenance block v1.1**
([`@sbissoli/mcp-provenance`](https://www.npmjs.com/package/@sbissoli/mcp-provenance), modes
`concise`/`detailed` via the `provenance_mode` parameter) on three channels:
`structuredContent`, namespaced `_meta` (`com.sidneybissoli.uis/*`) and a text footer.
Since 1.1.0 the block includes `retrieval`, the origin diagnostic of the call — how many
requests went to the Data API, how many attempts they took, which anomalies were overcome and
whether the answer is `unstable` — measured by the portfolio's common fetch
([`@sbissoli/mcp-upstream`](https://www.npmjs.com/package/@sbissoli/mcp-upstream)); `null`
when the answer did not touch the UIS (catalogue or cached release).

## Resources

Three **resources** (static, `text/markdown`, no upstream call) that a client can attach to the
context before calling tools — they save the discovery calls most sessions spend on "which
indicator, which code":

| URI | Content |
|---|---|
| `uis://guide` | tool workflow, code conventions (indicator code families and suffixes, ISO alpha-3 geo units, themes), limits, reporting rules |
| `uis://reference/key-indicators` | verified indicator codes by topic (completion, out-of-school, enrolment, literacy, learning proficiency, education spending, R&D for SDG 9.5, heritage spending for SDG 11.4, population) |
| `uis://reference/provenance` | meaning of every provenance field and how to cite the UIS, including what CC BY-SA ShareAlike requires downstream |

## Behaviour and limits

- **Every data query pins the release.** `uis_get_data` sends an explicit `version=`, resolved
  from `/versions/default` and cached for 24 h — reproducible, and it reuses the upstream's own
  cache. The release is the `data_vintage` (e.g. `20260507-91260335 (published 2026-05-08)`);
  when the UIS publishes a new release, data queries move to it within 24 h.
- **5,000 records per response, at most 25 indicators per call.** Above that the server returns
  an explanatory error with the real count — it **never truncates silently**, since partial data
  presented as complete would break the provenance contract. The UIS's own ceiling of 100,000
  records comes back as the upstream's explanatory HTTP 400, passed through.
- **The indicator catalogue is a snapshot of a UIS release**, refreshed by hand when the UIS
  publishes a new one (2–3 times a year); its real `retrieved_at` is reported in the provenance
  of `uis_search_indicators`, so its age is always visible (`served_from_cache: true`).
- **`retrieved_at` is always the real instant of extraction from the UIS**, never the build or
  response time.
- **Notices** report footnote types, magnitude and qualifier, with counts; the full text of each
  footnote stays on the row (`include_footnotes: true`).
- **Every upstream call has a timeout and a retry policy** (since 1.1.0, measured against the
  live API on 2026-09-27: release 1.1 s, small query 0.8 s, five whole indicators 2.9 s/3.5 MB,
  the 100k-cap 400 in 0.9 s): 35 s per attempt — ten times the worst legitimate case and above the
  29 s of the AWS API Gateway in front of the UIS —, up to 3 attempts on 5xx, 429 (honouring
  `Retry-After`) and network errors, 45 s in total per call. Timeouts, HTTP 504, the explanatory
  400 and 404 are never retried. What happened is reported in the provenance `retrieval` field;
  a timeout or network failure becomes a readable error, not a raw exception.
- **`derived` is always `false`** — the server does not transform values.
- **Language: English; timezone: UTC** (UIS data is published in English).

## Data license and attribution

- UIS data: **CC BY-SA 4.0** (terms of the UIS Data Browser, which govern the Data API; license
  verified 2026-08-04).
- UIS attribution in every response (`citation` field), with the full URL and the extraction date:
  `Source: UNESCO Institute for Statistics (UIS), <URL>, date of extraction <date>.`
- ShareAlike: anything you redistribute that is built on these data must keep the CC BY-SA 4.0
  license — the `uis://reference/provenance` resource spells it out.
- The UNESCO logo is not used and no endorsement is implied; that is why the server is called
  `uis-mcp-server` and not "unesco-mcp-server". The ILOSTAT data (CC BY 4.0) live in a separate
  server, so the two licences never share a response.

## Self-hosting / development

Everything below is only needed to run your own instance — it is **not** required to use the
public server.

```bash
npm install
npm run typecheck && npm test   # offline suite (tools, framework, vocabulary, in-memory catalogue, eval fixtures)
npm run dev                     # http://localhost:8787/mcp (Worker)
npm run build                   # stdio runtime → dist/cli.js (what ships to npm)
node scripts/dump-surface.mjs --stdio   # offline smoke of the build: initialize → tools/resources/prompts

# Catalogue seed (D1) — required before first use:
node scripts/seed-uis-catalog.mjs
npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql
npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql

npm run deploy
node scripts/smoke-mcp.mjs      # smoke test against production (initialize → tools/list == /status → uis_* → search/fetch → errors)
```

Notes for operators:

- **Catalogue refresh** is manual, once per UIS data release (no cron). The production smoke
  prints the current Data API release; when it differs from the seed's release, re-seed with the
  three commands above. Data queries follow the default release on their own, so only the
  catalogue can age — and its age is exposed in provenance.
- The UIS Data API accepts Node's `fetch` as is (no header workaround needed, unlike the ILO
  gateway).
- Optional Bearer auth (`wrangler secret put API_KEY`); token-bucket rate limit per IP.

## Evals

[`@sbissoli/mcp-evals`](https://www.npmjs.com/package/@sbissoli/mcp-evals): 22 fixtures in
`evals/fixtures/queries.ts`, validated offline in `npm test`. The run with a real model
(`npm run eval`) uses the Anthropic API and needs `ANTHROPIC_API_KEY` (without it, it exits with
instructions). Run of 2026-08-07: **top-1 100% (20/20)** — `evals/results/`.

**End-to-end**: 10 complex questions with a single verifiable answer in `evals/e2e/evaluation.xml`,
answers validated manually against production (`evals/e2e/validacao-respostas.md`). Run of
2026-08-07 (Sonnet): **10/10** — `evals/results/2026-08-07-e2e.md`.

## Endpoints

| Route | Purpose |
|---|---|
| `/` | landing page (service identity + contact — public) |
| `/health` | liveness |
| `/status` | version, tool count and names, current deploy (feeds the README badges) |
| `/metrics` | aggregated usage (MCP endpoint only; no IPs, no query content) |
| `/.well-known/mcp/server-card.json` | MCP server card for directory scanners (derived from the live `initialize` + lists — public) |
| `/mcp` | MCP Streamable HTTP |

## Security

Snyk Agent Scan (2026-08-07, before `search` and `fetch` were added): **passed** — report in
[`security/`](security/2026-08-07-snyk-agent-scan.md).

## License

Code: [MIT](LICENSE.md). Data: UIS, CC BY-SA 4.0 (see "Data license and attribution" above).

## Privacy

Privacy policy of the hosted service: [PRIVACY.md](PRIVACY.md).

## Contact

Sidney da Silva Pereira Bissoli — sbissoli76@gmail.com. This service is not endorsed by UNESCO.
