/**
 * Página de exemplos em `/examples` — a SEGUNDA página própria do produto.
 *
 * POR QUE EXISTE (13/10/2026, ação `geo:uis-mcp-server`). A hipótese aprovada
 * pelo dono em 05/10: a sigla "UIS" é opaca, e quem busca "UNESCO education
 * statistics MCP" acha o ator da Apify e o pacote `uisapi`, não este servidor.
 * O sitemap tinha UMA URL (a raiz), e o próprio `discovery.ts` registrava que
 * servir mais conteúdo aqui era o passo que faria o sitemap valer alguma coisa.
 *
 * O que ela tem, e de onde veio cada parte:
 *
 * - **Três perguntas** — matrícula, alfabetização, gasto —, cada uma RODADA no
 *   servidor em produção em 13/10/2026 antes de entrar aqui, com o caminho de
 *   ferramentas que o assistente percorre e um trecho do que voltou, datado pela
 *   release da UIS. Os códigos citados são conferidos contra o catálogo real
 *   (`tests/fixtures/catalog-ids.txt`) por `tests/examples.test.ts`: código
 *   montado é hipótese.
 * - **Comparação** com o que aparece na mesma busca, medida na fonte no mesmo
 *   dia: o ator da Apify pela API pública da Apify (preço por resultado, uso), o
 *   `unesco-mcp` e o `global-education-mcp` pelo GitHub. Não existe um "Apify
 *   UNESCO UIS MCP Server" como produto: existe um ator raspador que a Apify
 *   expõe como ferramenta pelo servidor MCP geral dela — e a página diz isso.
 *
 * Os números dos trechos são de UMA release e vão envelhecer: por isso cada
 * trecho nomeia a release e a data, em vez de se apresentar como o valor atual.
 */

import { SERVER_CONFIG, LANDING } from "./config.js";

/** Rota da página. Exportada para o sitemap e a landing não repetirem a literal. */
export const EXAMPLES_ROUTE = "/examples";

/** Escapa texto para interpolação segura em HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Release da UIS em que os trechos foram medidos, e o dia da medição. */
const MEDIDO_EM = { release: "20260507-91260335", data: "2026-10-13" } as const;

interface Exemplo {
  tema: string;
  pergunta: string;
  perguntaPt: string;
  /** O caminho de ferramentas que o assistente percorre. */
  passos: readonly string[];
  /** Códigos de indicador citados — conferidos contra o catálogo pelo teste. */
  codigos: readonly string[];
  /** Trecho do que voltou, na release de `MEDIDO_EM`. */
  trecho: string;
}

export const EXEMPLOS: readonly Exemplo[] = [
  {
    tema: "Enrolment",
    pergunta: "How did tertiary enrollment grow in Brazil, Mexico and Chile since 2015?",
    perguntaPt: "Como evoluiu a matrícula no ensino superior no Brasil, no México e no Chile desde 2015?",
    passos: [
      'uis_search_indicators {"query": "gross enrollment ratio tertiary"} — "enrollment" is searched as the UIS\'s "enrolment", and the response says so',
      'uis_get_data {"indicators": ["GER.5T8"], "geo_units": ["BRA", "MEX", "CHL"], "start_year": 2015}',
    ],
    codigos: ["GER.5T8"],
    trecho:
      "Gross enrolment ratio for tertiary education (%): Brazil 49.1 (2015) → 69.7 (2024); " +
      "Mexico 32.0 → 48.2; Chile 86.4 → 110.2 — every value flagged as a national estimate.",
  },
  {
    tema: "Literacy",
    pergunta: "What is the youth literacy rate in India, Nigeria and Pakistan, for girls and boys?",
    perguntaPt: "Qual a taxa de alfabetização dos jovens na Índia, na Nigéria e no Paquistão, por sexo?",
    passos: [
      'uis_search_indicators {"query": "youth literacy rate"}',
      'uis_get_data {"indicators": ["LR.AG15T24.F", "LR.AG15T24.M"], "geo_units": ["IND", "NGA", "PAK"], "start_year": 2015}',
    ],
    codigos: ["LR.AG15T24.F", "LR.AG15T24.M"],
    trecho:
      "Youth literacy rate, 15–24 years (%), latest year available: India 96.6 female / 98.0 male (2024); " +
      "Nigeria 81.4 / 81.3 (2024); Pakistan 66.5 / 79.5 (2021). Years differ by country — the " +
      "answer lists what exists instead of filling gaps.",
  },
  {
    tema: "Education spending",
    pergunta: "How much do Brazil, Argentina and South Africa spend on education as a share of GDP?",
    perguntaPt: "Quanto Brasil, Argentina e África do Sul gastam com educação, em % do PIB?",
    passos: [
      'uis_search_indicators {"query": "government education spending GDP"} — "spending" is searched as "expenditure"',
      'uis_get_data {"indicators": ["XGDP.FSGOV"], "geo_units": ["BRA", "ARG", "ZAF"], "start_year": 2015}',
    ],
    codigos: ["XGDP.FSGOV"],
    trecho:
      "Government expenditure on education as a percentage of GDP (%), latest year: Brazil 5.6 (2022), " +
      "Argentina 5.0 (2023), South Africa 6.0 (2024).",
  },
];

/** Linha da comparação. `quando` diz quando preferir a alternativa. */
interface Alternativa {
  nome: string;
  url: string;
  oQueE: string;
  acesso: string;
  quando: string;
}

/** Medido em 13/10/2026 (ver cabeçalho). Os números são da data, e dizem isso. */
export const ALTERNATIVAS: readonly Alternativa[] = [
  {
    nome: "uis-mcp-server (this server)",
    url: "https://github.com/SidneyBissoli/uis-mcp-server",
    oQueE:
      "Hosted MCP server over the official UIS Data API: catalogue search with everyday-wording " +
      "translation, data by country/region/year, the UIS data release pinned on every query and a " +
      "provenance block (source URL, release, retrieval time, licence) on every answer.",
    acesso: "Free, no account, no API key — point the client at the URL. Also on npm (stdio).",
    quando: "The question is asked in an assistant and the answer has to be auditable.",
  },
  {
    nome: "UNESCO UIS Statistics Scraper (Apify actor, thirdwatch)",
    url: "https://apify.com/thirdwatch/unesco-uis-statistics-scraper",
    oQueE:
      "Community actor on Apify that reads the same UIS Data API and returns rows with source URL, " +
      "qualifier and footnotes; reachable as an MCP tool through Apify's general MCP server " +
      "(mcp.apify.com). The data release is not stated in the output. Not a dedicated MCP server: " +
      "one actor, inputs are indicator codes, geo units and years — no catalogue search.",
    acesso:
      "Apify account (OAuth or API token); pay per result — US$ 0.004 on the free plan down to " +
      "US$ 0.002 on paid plans, plus US$ 0.00005 per run (Apify API, 2026-10-13).",
    quando: "You already run Apify pipelines and want UIS rows in an Apify dataset.",
  },
  {
    nome: "unesco-mcp (Python, PyPI)",
    url: "https://github.com/lpicci96/unesco-mcp",
    oQueE:
      "Community MCP server over the UIS API, run locally with uvx; indicator catalogue cached in " +
      "SQLite; more analysis tools (rankings, geography comparisons).",
    acesso: "Local install (Python, uvx). Free, no key.",
    quando: "You prefer a local server and ranking/comparison tools built in.",
  },
  {
    nome: "global-education-mcp (Python)",
    url: "https://github.com/malkreide/global-education-mcp",
    oQueE: "Community MCP server combining the UIS Data API with the OECD Education at a Glance API.",
    acesso: "Local install (Python). Free.",
    quando: "You want UIS and OECD education data side by side in one local server.",
  },
  {
    nome: "uisapi (R) / unesco-reader (Python)",
    url: "https://cran.r-project.org/package=uisapi",
    oQueE: "Community client libraries of the UIS Data API, for analysis code rather than an assistant.",
    acesso: "Install from CRAN / PyPI. Free.",
    quando: "You are writing R or Python and want UIS series in a data frame.",
  },
];

export function examplesHtml(): string {
  const c = SERVER_CONFIG;
  const site = c.websiteUrl;
  const url = `${site}${EXAMPLES_ROUTE}`;
  const titulo = `${c.title}: example questions on enrolment, literacy and education spending`;
  const resumo =
    "Example questions a UNESCO education statistics MCP server answers — enrolment, literacy, " +
    "education spending — with the tool calls behind each answer, and how it compares with the " +
    "Apify UIS actor and other UIS clients.";

  /** `FAQPage`: cada pergunta é um par pergunta/resposta que o buscador lê sem inferir. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url,
    inLanguage: "en",
    mainEntity: EXEMPLOS.map((e) => ({
      "@type": "Question",
      name: e.pergunta,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${e.trecho} (UNESCO Institute for Statistics, data release ${MEDIDO_EM.release}, retrieved ${MEDIDO_EM.data}.)`,
      },
    })),
  };

  const blocos = EXEMPLOS.map(
    (e) => `<section>
<h3>${esc(e.tema)}: “${esc(e.pergunta)}”</h3>
<p class="muted" lang="pt-BR">Em português: “${esc(e.perguntaPt)}”</p>
<p>What the assistant calls:</p>
<ol>
  ${e.passos.map((p) => `<li><code>${esc(p)}</code></li>`).join("\n  ")}
</ol>
<p>What came back: ${esc(e.trecho)}</p>
</section>`,
  ).join("\n\n");

  const linhas = ALTERNATIVAS.map(
    (a) =>
      `<tr><td><a href="${esc(a.url)}">${esc(a.nome)}</a></td><td>${esc(a.oQueE)}</td>` +
      `<td>${esc(a.acesso)}</td><td>${esc(a.quando)}</td></tr>`,
  ).join("\n  ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumo)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/icon.png" type="image/png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(c.title)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(resumo)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site)}/icon.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.6; margin: 0; padding: 2rem 1.25rem; color: CanvasText; background: Canvas;
  }
  main { max-width: 52rem; margin: 0 auto; }
  h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 .5rem; }
  h2 { font-size: 1.25rem; margin-top: 2.25rem; }
  h3 { font-size: 1.05rem; margin-top: 1.75rem; }
  code { background: color-mix(in srgb, CanvasText 10%, Canvas 90%); padding: .1rem .35rem; border-radius: 4px; overflow-wrap: anywhere; }
  .muted { color: color-mix(in srgb, CanvasText 70%, Canvas 30%); }
  .tabela { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .92rem; }
  th, td { text-align: left; vertical-align: top; padding: .5rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, Canvas 80%); }
</style>
</head>
<body>
<main>
<p><a href="/">← ${esc(c.title)}</a></p>
<h1>UNESCO education statistics in your AI assistant: example questions</h1>
<p>${esc(LANDING.resumo)} Connect any MCP client to <code>${esc(site)}${esc(c.mcpRoute)}</code> —
nothing to install, no account, no API key — and ask in your own words. The questions below
were run against the live server on ${MEDIDO_EM.data}; the figures are from UIS data release
${MEDIDO_EM.release} and a later release can revise them.</p>

<h2>Example questions</h2>
${blocos}

<p>Every answer also carries a provenance block: the exact UIS Data API URL, the data release,
the retrieval time, the licence (CC BY-SA 4.0) and a ready-to-paste citation.</p>

<h2>How it compares</h2>
<p>Measured on ${MEDIDO_EM.data}. There is no dedicated “Apify UNESCO UIS MCP server”: Apify
offers a community scraper actor for the UIS, which its general MCP server can expose as a tool.</p>
<div class="tabela">
<table>
<thead><tr><th>Tool</th><th>What it is</th><th>Access and cost</th><th>Prefer it when</th></tr></thead>
<tbody>
  ${linhas}
</tbody>
</table>
</div>
<p>The full comparison, including World Bank clients and the UIS bulk files, is in the
<a href="${esc(LANDING.docsUrl)}#comparison-with-the-alternatives">README</a>.</p>

<p class="muted">Independent project — not affiliated with or endorsed by UNESCO or the UNESCO
Institute for Statistics. Contact: <a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a></p>
</main>
</body>
</html>`;
}

export function examplesResponse(): Response {
  return new Response(examplesHtml(), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
