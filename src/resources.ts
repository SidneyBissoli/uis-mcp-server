/**
 * Resources MCP — documentação de referência que o cliente pode anexar ao
 * contexto ANTES de chamar tools (guia de consulta, indicadores-chave por tema,
 * contrato de proveniência). São estáticos e 100% offline: nenhum toca o
 * upstream.
 *
 * POR QUE EXISTEM. O custo típico de uma sessão UIS está na DESCOBERTA — qual
 * indicador, qual código de país, quais anos. O guia e a lista de
 * indicadores-chave poupam 2–3 chamadas de tool nas perguntas mais comuns.
 * Havia também um motivo de conformidade: sem nenhuma resource registrada, uma
 * leitura de recurso inexistente respondia `-32601` (method not found), e o
 * `mcpscore` reprovava `readiness_2026_error_code_migration`, que espera
 * `-32602`. O servidor não tinha como distinguir "este recurso não existe" de
 * "eu não sirvo recursos", porque a segunda é que era verdade.
 *
 * TODO CÓDIGO CITADO AQUI EXISTE. Os ids vêm do catálogo real (5.063
 * indicadores no seed, release 20260507-91260335) e `tests/resources.test.ts`
 * confere cada um contra `tests/fixtures/catalog-ids.txt`. Documentação que
 * cita código inexistente é pior que documentação nenhuma: manda o cliente
 * gastar uma chamada para descobrir que mentimos.
 *
 * Idioma: inglês (mesma persona das tools). URIs no esquema próprio `uis://`.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { CONTRACT_VERSION } from "@sbissoli/mcp-provenance";

import { UIS_LIMITS } from "./config.js";
import { UIS_THEMES } from "./uis/catalog.js";
import { UIS_LICENSE } from "./uis/provenance.js";

export const GUIDE_URI = "uis://guide";
export const KEY_INDICATORS_URI = "uis://reference/key-indicators";
export const PROVENANCE_URI = "uis://reference/provenance";

/** Lista canônica das resources — fonte única para GET /status e para os testes. */
export const RESOURCE_URIS: readonly string[] = [GUIDE_URI, KEY_INDICATORS_URI, PROVENANCE_URI];

/**
 * Indicadores-chave por tema. Fonte da verdade da resource key-indicators E do
 * teste que prova que todo código existe no catálogo. A escolha privilegia
 * cobertura: entre variantes do mesmo conceito, entra a que tem mais registros
 * publicados, pela contagem do próprio catálogo.
 *
 * A assimetria de tamanho entre os temas é do acervo, não da curadoria: das
 * 5.063 entradas, 4.986 são de educação — ciência tem 12, cultura 30 e
 * demografia 35.
 */
export const KEY_INDICATORS: ReadonlyArray<{
  tema: (typeof UIS_THEMES)[number];
  titulo: string;
  itens: ReadonlyArray<{ code: string; what: string }>;
}> = [
  {
    tema: "EDUCATION",
    titulo: "Education — participation and completion",
    itens: [
      { code: "CR.MOD.1", what: "Completion rate, primary education, both sexes (modelled), 1981–2025" },
      { code: "CR.MOD.2", what: "Completion rate, lower secondary education, both sexes (modelled)" },
      { code: "ROFST.1.CP", what: "Out-of-school rate, children of primary school age, both sexes" },
      { code: "ROFST.MOD.2", what: "Out-of-school rate, adolescents of lower secondary school age (modelled)" },
      { code: "20062", what: "Enrolment in primary education, both sexes (number) — the widest series, 1970–2025" },
      { code: "20082", what: "Enrolment in secondary education, both sexes (number)" },
      { code: "20060", what: "Enrolment in pre-primary education, both sexes (number)" },
    ],
  },
  {
    tema: "EDUCATION",
    titulo: "Education — literacy, learning and resources",
    itens: [
      { code: "LR.AG15T99", what: "Adult literacy rate, population 15+, both sexes (%)" },
      { code: "LR.AG15T99.GPIA", what: "Adult literacy rate, adjusted gender parity index" },
      { code: "MATH.LOWERSEC", what: "Minimum proficiency in mathematics, end of lower secondary (SDG 4.1.1)" },
      { code: "READ.LOWERSEC", what: "Minimum proficiency in reading, end of lower secondary (SDG 4.1.1)" },
      { code: "XGDP.FSGOV", what: "Government expenditure on education as a percentage of GDP" },
      { code: "20162", what: "Teachers in primary education, both sexes (number)" },
    ],
  },
  {
    tema: "SCIENCE_TECHNOLOGY_INNOVATION",
    titulo: "Science, technology and innovation (SDG 9.5)",
    itens: [
      { code: "EXPGDP.TOT", what: "GERD as a percentage of GDP — gross domestic R&D expenditure (SDG 9.5.1)" },
      { code: "RESDEN.INHAB.TFTE", what: "Researchers per million inhabitants, full-time equivalent (SDG 9.5.2)" },
      { code: "FRESP.THC", what: "Female researchers as a percentage of the total (head count)" },
      { code: "FRESP.TFTE", what: "Female researchers as a percentage of the total (full-time equivalent)" },
    ],
  },
  {
    tema: "CULTURE",
    titulo: "Culture (SDG 11.4)",
    itens: [
      { code: "HEXPCSTPPPCAP.HER.PU", what: "Per capita public expenditure on cultural and natural heritage (SDG 11.4.1)" },
      { code: "HEXPCSTPPPCAP.HER.PR", what: "Per capita private expenditure on cultural and natural heritage" },
      { code: "CE.RA.CULOCC1.1.OV.ILOSTAT.1", what: "Share of persons employed in cultural occupations" },
      { code: "220174", what: "Total number of indoor cinemas, 1995–2017" },
    ],
  },
  {
    tema: "DEMOGRAPHIC_SOCIOECONOMIC",
    titulo: "Demographic and socioeconomic context",
    itens: [
      { code: "200101", what: "Total population (thousands)" },
      { code: "200144", what: "Population aged 15–24 (thousands) — a common school-age denominator" },
      { code: "200343", what: "Population aged 14 or younger (thousands)" },
      { code: "SP.POP.GROW", what: "Population growth (annual %)" },
    ],
  },
];

/** Todo código citado nas resources — o teste confere cada um contra o catálogo. */
export const KEY_INDICATOR_CODES: readonly string[] = KEY_INDICATORS.flatMap((g) =>
  g.itens.map((i) => i.code),
);

export function guideMarkdown(): string {
  const temas = UIS_THEMES.map((t) => "`" + t + "`").join(", ");
  const maxRegistros = UIS_LIMITS.maxRecordsPerResponse.toLocaleString("en-US");

  return `# Querying UNESCO UIS with this server

## The three tools, in the order they are usually needed

1. \`uis_search_indicators\` — find an indicator **code** by keywords, optionally
   filtered by theme. Searches the catalogue only; it returns no statistical values.
2. \`uis_list_geo_units\` — find a **geo unit** code: 462 units, countries
   (\`NATIONAL\`, ISO alpha-3 such as \`BRA\`) and regional aggregates (\`REGIONAL\`).
3. \`uis_get_data\` — the values, for one or more indicators, geo units and years.

If you already know the codes, skip straight to step 3. The resource
\`${KEY_INDICATORS_URI}\` lists verified codes for the most common questions.

## Code conventions

- **Indicator codes are opaque strings**, and two families coexist: mnemonic
  (\`CR.MOD.1\`, \`LR.AG15T99\`, \`EXPGDP.TOT\`) and numeric (\`20062\`, \`200101\`).
  Neither is derivable — confirm with a search or with the reference resource.
- Suffixes on mnemonic codes are systematic: \`.F\` / \`.M\` for female / male,
  \`.GPIA\` for the adjusted gender parity index, \`.MOD\` for modelled series.
  A base code with no sex suffix is normally "both sexes".
- **\`MOD\` means modelled**, not observed. Modelled series cover far more
  country-years; observed series are sparser and closer to what the country
  reported. Say which one you used.
- **Geo units are ISO alpha-3** for countries. Regional aggregates are UIS's own
  and are not ISO codes — list them with \`uis_list_geo_units\` and
  \`type: "REGIONAL"\` instead of guessing.
- **Themes** are exactly: ${temas}.

## Limits, and what happens at the edge

- At most **${UIS_LIMITS.maxIndicatorsPerCall} indicators per call** to
  \`uis_get_data\`. Beyond that the call fails with a validation error naming the
  limit — it is never silently truncated.
- A response carrying more than **${maxRegistros} records** is refused with the
  real count, so you can narrow the query. Partial data presented as complete is
  the one failure this server will not produce.
- Both list tools paginate: pass \`offset\`, and read \`has_more\` and
  \`next_offset\` from the response instead of assuming.

## Reporting rules

- Every response carries a provenance block with the **full source URL**, the
  data release used and the retrieval timestamp — see \`${PROVENANCE_URI}\`.
- Data is pinned to a **named release**, so the same query returns the same
  numbers until the UIS publishes a new one. Quote the release when the number
  matters.
- This server serves **only** UIS statistics. Labour statistics live in the
  sibling ILOSTAT server; asking this one for them will not fail loudly, it will
  simply find nothing.
`;
}

export function keyIndicatorsMarkdown(): string {
  const secoes = KEY_INDICATORS.map(
    (g) =>
      `## ${g.titulo}\n\n_Theme: \`${g.tema}\`_\n\n` +
      g.itens.map((i) => `- \`${i.code}\` — ${i.what}`).join("\n"),
  ).join("\n\n");

  return `# Key UNESCO UIS indicators by topic

Verified codes, usable directly in \`uis_get_data\` without searching first. Every
code here exists in the catalogue this server queries; a test in the repository
checks that on every build.

The list is deliberately short. The catalogue holds ~5,000 indicators, of which
almost all are education — science has 12, culture 30, demographic 35. When the
question is not covered below, \`uis_search_indicators\` is the way, not guessing
a code that looks similar.

${secoes}

## Reading the codes

Suffixes are systematic: \`.F\` female, \`.M\` male, \`.GPIA\` adjusted gender
parity index, \`.MOD\` modelled rather than observed. A base code with no sex
suffix is normally "both sexes". Confirm with \`uis_search_indicators\` when the
distinction carries the answer.
`;
}

export function provenanceMarkdown(): string {
  return `# Provenance and citation

Every tool response carries a provenance block (contract v${CONTRACT_VERSION}). The fields:

- **\`source_url\`** — the complete UIS Data API URL that produced the numbers,
  including the pinned release. Paste it and you get the same response.
- **\`data_vintage\`** — the UIS release the values came from, as
  \`<version> (published <date>)\`. Data is pinned to a release, so results stay
  reproducible until the UIS publishes a new one.
- **\`retrieved_at\`** — when this server fetched from the UIS, in UTC. On a
  cached response it is the timestamp of the ORIGINAL fetch, not of the cache
  hit: \`served_from_cache\` tells the two apart.
- **\`license\`** — ${UIS_LICENSE.id} (${UIS_LICENSE.name}), verified verbatim
  against the UIS terms on ${UIS_LICENSE.verified_at}: ${UIS_LICENSE.terms_url}
- **\`citation\`** — the attribution string the UIS terms require, already
  assembled: source name, full query URL and date of extraction.
- **\`derived\`** / **\`derivation_note\`** — whether this server computed
  anything on top of the published values, and what.

## How to cite

Use the \`citation\` field verbatim. The UIS terms require the source name, the
full URL and the date of extraction — an abbreviated citation does not satisfy
them.

**ShareAlike matters here.** UIS data is ${UIS_LICENSE.id}: a derived work
distributed publicly carries the same license. That is why this server serves UIS
data only — the sibling ILOSTAT server is CC BY, and mixing the two regimes in
one response would make the obligation ambiguous. Keep them apart downstream too.
`;
}

export function registerResources(server: McpServer): void {
  const md = { mimeType: "text/markdown" as const };

  server.registerResource(
    "uis-guide",
    GUIDE_URI,
    {
      title: "UIS query guide",
      description:
        "How to query the UNESCO UIS with this server: tool workflow, code conventions " +
        "(indicator code families and suffixes, ISO alpha-3 geo units, themes), limits and " +
        "reporting rules. Read once per session to save discovery calls.",
      ...md,
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: md.mimeType, text: guideMarkdown() }] }),
  );

  server.registerResource(
    "uis-key-indicators",
    KEY_INDICATORS_URI,
    {
      title: "Key UIS indicators by topic",
      description:
        "Verified indicator codes for the most common questions — completion, out-of-school, " +
        "enrolment, literacy, learning proficiency, education spending, R&D (SDG 9.5), " +
        "heritage spending (SDG 11.4) and population — usable directly in uis_get_data.",
      ...md,
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: md.mimeType, text: keyIndicatorsMarkdown() }] }),
  );

  server.registerResource(
    "uis-provenance",
    PROVENANCE_URI,
    {
      title: "Provenance and citation contract",
      description:
        "Meaning of every provenance field returned with the data (source_url, data_vintage, " +
        "retrieved_at, license, citation, derived) and how to cite the UIS correctly, " +
        "including what CC BY-SA ShareAlike requires downstream.",
      ...md,
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: md.mimeType, text: provenanceMarkdown() }] }),
  );
}
