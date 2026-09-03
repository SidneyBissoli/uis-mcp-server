/**
 * `search` / `fetch` — the ChatGPT Deep Research contract (OpenAI), over the
 * UNESCO UIS indicator catalogue. The contract, the envelope, the ranking and
 * the registration live in `@sbissoli/mcp-search` (portfolio package); this
 * module is the UIS adapter: what can be found (the index) and how a document
 * reads (the text).
 *
 * Why these two tools exist: ChatGPT deep research, company knowledge and the
 * research workflows of the Responses API only use an MCP server that exposes
 * exactly `search` and `fetch` — the `uis_*` tools, however rich, are invisible
 * to them. They are the ONLY tools without the `uis_` prefix (name fixed by
 * OpenAI; `DEEP_RESEARCH_TOOLS` is the allowlist the tests use).
 *
 * The index: every indicator of the catalogue (`listUisCatalog` — the D1 seed,
 * ~5,060 rows), id `ind:<code>`, keywords from the code's segments, the theme,
 * the Data Browser group name and the curated note of `KEY_INDICATORS` when the
 * indicator is one of the 25 curated ones. Built on first use, kept for 24 h in
 * this module (the Worker is stateless per request, but the isolate keeps the
 * module across requests). Ranked by the package index — relevance, not the
 * ANDed substrings of `uis_search_indicators`. Geo units (462) are NOT
 * documents; `uis_list_geo_units` covers them.
 *
 * `fetch` renders the catalogue row plus a short SAMPLE of the data (Brazil and
 * the SDG world aggregate, latest five years — one call to the Data API, same
 * reading `uis_get_data` does) and reuses that call's provenance block as the
 * envelope extras, so the provenance gate covers these two the same way it
 * covers the other tools. Rows without a year range skip the sample (no upstream
 * call). Unknown ids are refused from the index, without touching the upstream.
 *
 * `url` is the public UIS Data Browser, never the Data API — it is what ChatGPT
 * cites. Pattern verified in the browser on 2026-09-03 (see `browserViewUrl`):
 * the `/view` page shows the data table of the indicator, and it REQUIRES the
 * framework id (`UIS-SDG4Monitoring:0:ROFST.1.CP`) — the bare code renders a
 * client-side error on a clean load. The framework comes from the Data Browser
 * definitions, stored in the catalogue by the seed (`framework_id`).
 */

import type { McpServer } from "@modelcontextprotocol/server";
import {
  DEEP_RESEARCH_TOOLS,
  createIndex,
  registerDeepResearchTools as registerFromPackage,
  type FetchReply,
  type IndexEntry,
  type SearchIndex,
  type SearchReply,
} from "@sbissoli/mcp-search";
import { KEY_INDICATORS } from "../resources.js";
import type { Env } from "../types.js";
import { fetchUisData, type UisRecord } from "../uis/api.js";
import { listUisCatalog, UIS_CATALOG_SOURCE_URL, type UisCatalogRow } from "../uis/catalog.js";
import { provenanceExtras, uisDataVintage, uisProvenance } from "../uis/provenance.js";
import type { RecordUsage } from "../usage-core.js";
import { noticesFromUisRecords } from "./uis.js";
import { provenanceOutputShape } from "./shared.js";

export { DEEP_RESEARCH_TOOLS };

/** Prefix of every document id (`ind:ROFST.1.CP`, `ind:200101`). */
export const DEEP_RESEARCH_ID_PREFIX = "ind:";

/** Results per `search` call (the contract has no paging; ten is what the examples show). */
export const DEEP_RESEARCH_LIMIT = 10;

/** The catalogue is re-seeded a few times a year; a day is nothing. */
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;

/** Geo units of the data sample in `fetch` — Brazil and the SDG world aggregate. */
export const SAMPLE_GEO_UNITS = ["BRA", "SDG: World"] as const;

/** Years of the data sample in `fetch` (latest N, ending at the catalogue's `year_max`). */
export const SAMPLE_YEARS = 5;

export const DATA_BROWSER_HOME = "https://databrowser.uis.unesco.org/";

/**
 * Public Data Browser page of an indicator — the table of its data. The hash
 * is `indicatorPaths=<framework>:0:<code>`, URL-encoded (`%3A`), as the browser
 * itself writes it. Without a framework (never, in the current seed) the home
 * page is the honest fallback: a URL that renders, not one that breaks.
 */
export function browserViewUrl(code: string, frameworkId: string | null): string {
  if (!frameworkId) return DATA_BROWSER_HOME;
  return `${DATA_BROWSER_HOME}view#indicatorPaths=${encodeURIComponent(`${frameworkId}:0:${code}`)}`;
}

// ==================== INDEX ====================

interface LoadedIndex {
  index: SearchIndex;
  /** Every indexed row by document id — `fetch` reads the document from here, never from D1. */
  rows: ReadonlyMap<string, UisCatalogRow>;
  /** Provenance of the catalogue listing — the `search` provenance. */
  retrievedAt: string;
  releaseVersion: string | null;
  sourceUrl: string;
  createdAt: number;
}

const CURATED: ReadonlyMap<string, string> = new Map(
  KEY_INDICATORS.flatMap((group) => group.itens.map((i) => [i.code, i.what] as const)),
);

/** `LR.AG15T99.GPIA` → ["LR", "AG15T99", "GPIA"]; numeric codes stay whole. */
function codeSegments(code: string): string[] {
  return code.split(".").filter((s) => s.length >= 2);
}

const THEME_WORDS: Readonly<Record<string, string>> = {
  EDUCATION: "education",
  SCIENCE_TECHNOLOGY_INNOVATION: "science technology innovation R&D",
  CULTURE: "culture",
  DEMOGRAPHIC_SOCIOECONOMIC: "demographic socioeconomic population",
};

export function indexEntries(rows: readonly UisCatalogRow[]): IndexEntry[] {
  return rows
    .filter((r) => r.code)
    .map((r) => {
      const curated = CURATED.get(r.code);
      const theme = THEME_WORDS[r.theme] ?? r.theme;
      return {
        id: `${DEEP_RESEARCH_ID_PREFIX}${r.code}`,
        title: r.name || r.code,
        url: browserViewUrl(r.code, r.framework_id),
        keywords: [...codeSegments(r.code), theme, r.group_name ?? "", curated ?? ""].filter(Boolean),
        text: `${r.name}${r.group_name ? ` — ${r.group_name}` : ""} (${theme}).`,
      };
    });
}

// One index per isolate. Concurrent first calls share the build; a failed
// build is not kept.
let loaded: LoadedIndex | null = null;
let loading: Promise<LoadedIndex> | null = null;

async function buildIndex(env: Env): Promise<LoadedIndex> {
  const { entries, retrievedAt, releaseVersion, sourceUrl } = await listUisCatalog(env);
  const docs = indexEntries(entries);
  return {
    index: createIndex(docs),
    rows: new Map(entries.map((r) => [`${DEEP_RESEARCH_ID_PREFIX}${r.code}`, r])),
    retrievedAt,
    releaseVersion,
    sourceUrl,
    createdAt: Date.now(),
  };
}

/** The index, built on first use and kept for `INDEX_TTL_MS`. */
export async function getIndex(env: Env): Promise<LoadedIndex> {
  if (loaded && Date.now() - loaded.createdAt < INDEX_TTL_MS) return loaded;
  if (!loading) {
    loading = buildIndex(env)
      .then((idx) => {
        loaded = idx;
        return idx;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Tests only: forget the built index. */
export function resetIndex(): void {
  loaded = null;
  loading = null;
}

// ==================== DOCUMENT ====================

const line = (label: string, value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : `- **${label}:** ${String(value)}`;

function fmt(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function renderIndicator(row: UisCatalogRow, sample: readonly UisRecord[] | null): string {
  // The curated note only earns a line when it says more than the name does.
  const note = CURATED.get(row.code);
  const curated = note && note.toLowerCase() !== row.name.toLowerCase() ? note : undefined;
  const years = row.year_min !== null && row.year_max !== null ? `${row.year_min}–${row.year_max}` : null;
  const sampleLines: string[] = [];
  if (sample) {
    sampleLines.push("", `## Sample (${SAMPLE_GEO_UNITS.join(", ")}; latest ${SAMPLE_YEARS} years)`);
    if (sample.length === 0) {
      sampleLines.push("No records for this selection — the indicator may not cover these geo units or years.");
    } else {
      sampleLines.push("| geo_unit | year | value |", "|---|---|---|");
      for (const r of sample) {
        const flags = [r.magnitude, r.qualifier].filter(Boolean).join(", ");
        sampleLines.push(`| ${r.geoUnit} | ${r.year} | ${fmt(r.value)}${flags ? ` (${flags})` : ""} |`);
      }
    }
  }
  return [
    `# ${row.name}`,
    "",
    line("Indicator code", row.code),
    line("Theme", row.theme),
    line("Data Browser group", row.group_name ? `${row.group_name}${row.group_id ? ` (${row.group_id})` : ""}` : null),
    line("Framework", row.framework_id),
    line("Years available", years),
    line("Records published", row.record_count !== null ? fmt(row.record_count) : null),
    line("Geo unit types", row.geo_types),
    line("Last data update", row.last_data_update),
    curated ? `- **Note:** ${curated}` : null,
    ...sampleLines,
    "",
    "## How to query",
    `Call \`uis_get_data\` with \`indicators: ["${row.code}"]\`, \`geo_units\` (codes from ` +
      "`uis_list_geo_units`, e.g. `[\"BRA\"]`) and `start_year`/`end_year`; set `include_footnotes` " +
      "for per-record source notes.",
    "",
    `Source: UNESCO Institute for Statistics (UIS). Data Browser: ${browserViewUrl(row.code, row.framework_id)}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

// ==================== HANDLERS ====================

export function deepResearchHandlers(env: Env) {
  async function search(query: string): Promise<SearchReply> {
    const idx = await getIndex(env);
    const results = idx.index.search(query, { limit: DEEP_RESEARCH_LIMIT }).map(({ id, title, url }) => ({ id, title, url }));
    const p = uisProvenance({
      dataset: { id: "UIS indicator catalogue", version: idx.releaseVersion, name: "UNESCO UIS catalogue of indicators" },
      retrievedAt: idx.retrievedAt,
      sourceUrl: idx.sourceUrl,
      servedFromCache: true,
    });
    return { results, extras: provenanceExtras(p) };
  }

  async function fetch(id: string): Promise<FetchReply | null> {
    if (!id.startsWith(DEEP_RESEARCH_ID_PREFIX)) return null;
    // Refuse unknown ids from the catalogue — the upstream is never asked about them.
    const idx = await getIndex(env);
    const row = idx.rows.get(id);
    if (!row) return null;

    const metadata = {
      code: row.code,
      theme: row.theme,
      framework: row.framework_id,
      group_id: row.group_id,
      group_name: row.group_name,
      year_min: row.year_min,
      year_max: row.year_max,
      record_count: row.record_count,
      geo_types: row.geo_types,
      last_data_update: row.last_data_update,
    };
    const url = browserViewUrl(row.code, row.framework_id);

    if (row.year_max === null) {
      // Nothing to sample: the document is the catalogue row, with the catalogue's provenance.
      const p = uisProvenance({
        dataset: { id: row.code, version: idx.releaseVersion, name: row.name },
        retrievedAt: idx.retrievedAt,
        sourceUrl: UIS_CATALOG_SOURCE_URL,
        servedFromCache: true,
      });
      return { document: { id, title: row.name, text: renderIndicator(row, null), url, metadata }, extras: provenanceExtras(p) };
    }

    const start = row.year_max - (SAMPLE_YEARS - 1);
    const { records, retrievedAt, sourceUrl, release } = await fetchUisData(env, {
      indicators: [row.code],
      geoUnits: [...SAMPLE_GEO_UNITS],
      start,
      end: row.year_max,
    });
    const p = uisProvenance({
      dataset: { id: row.code, version: release.version, name: row.name },
      dimensionKey: { indicator: row.code, geoUnit: SAMPLE_GEO_UNITS.join(","), year: `${start}-${row.year_max}` },
      dataVintage: uisDataVintage(release),
      retrievedAt,
      sourceUrl,
      servedFromCache: false,
      notices: noticesFromUisRecords(records),
    });
    return {
      document: { id, title: row.name, text: renderIndicator(row, records), url, metadata },
      extras: provenanceExtras(p),
    };
  }

  return { search, fetch };
}

// ==================== REGISTRATION ====================

export function registerDeepResearchTools(server: McpServer, env: Env, record: RecordUsage): void {
  registerFromPackage(server, {
    ...deepResearchHandlers(env),
    locale: "en",
    corpus:
      "UNESCO UIS statistics (≈5,000 indicators: education — enrolment, completion, literacy, teachers, " +
      "spending, SDG 4 —, science/R&D (SDG 9.5), culture (SDG 11.4) and demographic context)",
    richTools: "the `uis_*` tools",
    limit: DEEP_RESEARCH_LIMIT,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    extendOutputSchema: (schema) => schema.extend(provenanceOutputShape()),
    record,
  });
}
