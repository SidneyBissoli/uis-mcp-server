/**
 * Catálogo UIS em memória — alternativa ao D1 para o runtime stdio
 * (src/cli.ts), onde não há bindings da Cloudflare.
 *
 * Mesma semântica de busca de src/uis/catalog.ts (D1): termos em AND, cada um
 * um OR das grafias da fonte (src/uis/vocabulary.ts), case-insensitive, sobre
 * nome e código; filtro opcional por tema; ordenação por record_count desc,
 * code asc; paginação por limit/offset com os mesmos tetos (100 indicadores,
 * 500 geo units). Geo units: substring no nome ou id exato, filtro por tipo,
 * ordem por nome.
 *
 * O catálogo é baixado dos endpoints oficiais na primeira busca (lazy) — os
 * MESMOS que scripts/seed-uis-catalog.mjs lê (`/definitions/indicators`,
 * `/definitions/geounits`, `/versions/default`) — e o `retrieved_at` reportado
 * é o instante REAL desse download, o mesmo contrato do seed do D1.
 *
 * Diferença deliberada em relação ao seed: NÃO baixa as definições do UIS Data
 * Browser (~6,7 MB) que dão `framework_id`/`group_id`/`group_name`. Essas
 * colunas ficam null; a URL pública que `fetch` (Deep Research) cita cai para
 * a home do Data Browser (browserViewUrl em src/tools/deep-research.ts) e o
 * índice de `search` fica sem o nome do grupo nas keywords. Deep Research
 * conversa com o servidor hospedado; o runtime local não paga 6,7 MB por
 * sessão por isso.
 */

import { nowIso, UIS_BASE, UisUserError, upstreamHeaders } from "./api.js";
import {
  UIS_CATALOG_SOURCE_URL,
  UIS_GEOUNITS_SOURCE_URL,
  type UisCatalogListing,
  type UisCatalogRow,
  type UisGeoUnitEntry,
  type UisGeoUnitSearchResult,
  type UisIndicatorEntry,
  type UisIndicatorSearchResult,
  type UisTheme,
} from "./catalog.js";
import { expandQuery, matchesTerm, vocabularyNotes } from "./vocabulary.js";

/** A forma do `/definitions/indicators` que o seed lê (só os campos usados). */
interface RawIndicator {
  indicatorCode: string;
  name: string;
  theme: string;
  lastDataUpdate?: string | null;
  dataAvailability?: {
    totalRecordCount?: number;
    timeLine?: { min?: number; max?: number };
    geoUnits?: { types?: string[] };
  };
}

interface RawGeoUnit {
  id: string;
  name: string;
  type: string;
}

/** O que o loader entrega: as três respostas oficiais, cruas. */
export interface UisCatalogSnapshot {
  indicators: unknown;
  geounits: unknown;
  release: unknown;
}

export interface UisIndicatorMemoryRow extends UisCatalogRow {
  codeLc: string;
  nameLc: string;
}

export interface UisGeoUnitMemoryRow extends UisGeoUnitEntry {
  nameLc: string;
}

/** `lastDataUpdate` vem em MM/DD/YYYY (ex.: "02/09/2026" = 9 de fevereiro) → ISO, como no seed. */
export function isoDateFromUs(mdY: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdY ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

const finiteOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Converte a resposta de `/definitions/indicators` nas linhas do catálogo — o mapeamento do seed. */
export function indicatorRowsFromDefinitions(raw: unknown): UisIndicatorMemoryRow[] {
  const list = (Array.isArray(raw) ? raw : []) as RawIndicator[];
  return list
    .filter((ind) => typeof ind?.indicatorCode === "string" && typeof ind.name === "string")
    .map((ind) => {
      const da = ind.dataAvailability ?? {};
      return {
        code: ind.indicatorCode,
        name: ind.name,
        theme: ind.theme,
        last_data_update: isoDateFromUs(ind.lastDataUpdate),
        record_count: finiteOrNull(da.totalRecordCount),
        year_min: finiteOrNull(da.timeLine?.min),
        year_max: finiteOrNull(da.timeLine?.max),
        geo_types: (da.geoUnits?.types ?? []).join(","),
        framework_id: null,
        group_id: null,
        group_name: null,
        codeLc: ind.indicatorCode.toLowerCase(),
        nameLc: ind.name.toLowerCase(),
      };
    });
}

/** Converte a resposta de `/definitions/geounits` nas linhas de geo units. */
export function geoUnitRowsFromDefinitions(raw: unknown): UisGeoUnitMemoryRow[] {
  const list = (Array.isArray(raw) ? raw : []) as RawGeoUnit[];
  return list
    .filter((g) => typeof g?.id === "string" && typeof g.name === "string")
    .map((g) => ({ id: g.id, name: g.name, type: g.type, nameLc: g.name.toLowerCase() }));
}

/** Ordem BINARY do SQLite (`ORDER BY code` / `ORDER BY name`): por code point, não por locale. */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const toEntry = (r: UisIndicatorMemoryRow): UisIndicatorEntry => ({
  code: r.code,
  name: r.name,
  theme: r.theme,
  last_data_update: r.last_data_update,
  record_count: r.record_count,
  year_min: r.year_min,
  year_max: r.year_max,
  geo_types: r.geo_types,
});

const toRow = ({ codeLc: _c, nameLc: _n, ...row }: UisIndicatorMemoryRow): UisCatalogRow => row;

/**
 * Busca com a mesma semântica da consulta SQL do D1 — expansão de vocabulário
 * inclusa. `record_count` nulo ordena por último, como o NULL no DESC do SQLite.
 */
export function searchIndicatorRows(
  rows: UisIndicatorMemoryRow[],
  query: string,
  theme: UisTheme | undefined,
  limit: number,
  offset: number,
): { entries: UisIndicatorEntry[]; total: number; notes: string[] } {
  const expanded = expandQuery(query);
  if (!expanded.length) {
    throw new UisUserError('Empty query: pass one or more search terms (e.g. "literacy rate youth").');
  }
  const matching = rows
    .filter((r) => (!theme || r.theme === theme) && expanded.every((t) => matchesTerm(r.nameLc, t) || matchesTerm(r.codeLc, t)))
    .sort((a, b) => (b.record_count ?? -Infinity) - (a.record_count ?? -Infinity) || byCodePoint(a.code, b.code));
  const lim = Math.max(1, Math.min(limit, 100));
  const off = Math.max(0, Math.floor(offset));
  return {
    entries: matching.slice(off, off + lim).map(toEntry),
    total: matching.length,
    notes: vocabularyNotes(expanded),
  };
}

/** Geo units com a semântica do D1: `name_lc LIKE %s%` OU `id = S`, filtro por tipo, ordem por nome. */
export function searchGeoUnitRows(
  rows: UisGeoUnitMemoryRow[],
  search: string | undefined,
  type: "NATIONAL" | "REGIONAL" | undefined,
  limit: number,
  offset: number,
): { entries: UisGeoUnitEntry[]; total: number } {
  const needle = search ? search.toLowerCase().replace(/[%_]/g, "") : null;
  const idExact = search ? search.toUpperCase() : null;
  const matching = rows
    .filter((r) => (!type || r.type === type) && (needle === null || r.nameLc.includes(needle) || r.id === idExact))
    .sort((a, b) => byCodePoint(a.name, b.name));
  const lim = Math.max(1, Math.min(limit, 500));
  const off = Math.max(0, Math.floor(offset));
  return {
    entries: matching.slice(off, off + lim).map(({ id, name, type: t }) => ({ id, name, type: t })),
    total: matching.length,
  };
}

interface Loaded {
  indicators: UisIndicatorMemoryRow[];
  geounits: UisGeoUnitMemoryRow[];
  retrievedAt: string;
  releaseVersion: string | null;
}

export class InMemoryUisCatalog {
  private loaded: Promise<Loaded> | null = null;

  constructor(private readonly loader: () => Promise<UisCatalogSnapshot> = defaultLoader) {}

  private load(): Promise<Loaded> {
    this.loaded ??= this.loader().then((snap) => {
      const indicators = indicatorRowsFromDefinitions(snap.indicators);
      const geounits = geoUnitRowsFromDefinitions(snap.geounits);
      // Os mesmos pisos do seed: catálogo minguado é sinal de resposta errada,
      // não de UNESCO com poucos indicadores.
      if (indicators.length < 1000) throw new Error(`catálogo suspeito: só ${indicators.length} indicadores`);
      if (geounits.length < 100) throw new Error(`geo units suspeitos: só ${geounits.length}`);
      const version = (snap.release as { version?: unknown } | null)?.version;
      return {
        indicators,
        geounits,
        retrievedAt: nowIso(),
        releaseVersion: typeof version === "string" ? version : null,
      };
    });
    // Falha no download não fica presa: a próxima busca tenta de novo.
    this.loaded.catch(() => {
      this.loaded = null;
    });
    return this.loaded;
  }

  async search(query: string, theme: UisTheme | undefined, limit: number, offset = 0): Promise<UisIndicatorSearchResult> {
    const { indicators, retrievedAt, releaseVersion } = await this.load();
    return {
      ...searchIndicatorRows(indicators, query, theme, limit, offset),
      retrievedAt,
      releaseVersion,
      sourceUrl: UIS_CATALOG_SOURCE_URL,
    };
  }

  /** O catálogo inteiro — o mesmo contrato de `listUisCatalog` sobre o D1. */
  async all(): Promise<UisCatalogListing> {
    const { indicators, retrievedAt, releaseVersion } = await this.load();
    return {
      entries: [...indicators].sort((a, b) => byCodePoint(a.code, b.code)).map(toRow),
      retrievedAt,
      releaseVersion,
      sourceUrl: UIS_CATALOG_SOURCE_URL,
    };
  }

  async geoUnits(
    search: string | undefined,
    type: "NATIONAL" | "REGIONAL" | undefined,
    limit: number,
    offset = 0,
  ): Promise<UisGeoUnitSearchResult> {
    const { geounits, retrievedAt, releaseVersion } = await this.load();
    return {
      ...searchGeoUnitRows(geounits, search, type, limit, offset),
      retrievedAt,
      releaseVersion,
      sourceUrl: UIS_GEOUNITS_SOURCE_URL,
    };
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: upstreamHeaders() });
  if (!res.ok) throw new Error(`UNESCO UIS catalogue HTTP ${res.status} (${url}): ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function defaultLoader(): Promise<UisCatalogSnapshot> {
  const [indicators, geounits, release] = await Promise.all([
    getJson(UIS_CATALOG_SOURCE_URL),
    getJson(UIS_GEOUNITS_SOURCE_URL),
    getJson(`${UIS_BASE}/versions/default`),
  ]);
  return { indicators, geounits, release };
}
