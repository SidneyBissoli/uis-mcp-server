/**
 * Catálogo UIS em D1 (mesma database do catálogo ILOSTAT, tabelas próprias
 * `uis_indicators`/`uis_geounits`/`uis_meta`) — busca 100% local, sem chamada ao
 * upstream por consulta. Medição do mini-spike (docs/06): 5.063 indicadores em
 * 4 temas + 462 geo units. Sem D1 (runtime stdio, src/cli.ts), delega ao
 * catálogo em memória (catalog-memory.ts), de mesma semântica.
 *
 * Seed: scripts/seed-uis-catalog.mjs grava também o instante REAL da extração e
 * a release corrente em `uis_meta` — é esse `retrieved_at` que o bloco de
 * proveniência reporta (respostas do catálogo são sempre served_from_cache=true).
 */

import { UisUserError } from "./api.js";
import type { Env } from "../types.js";
import { UIS_BASE } from "./api.js";
import { expandQuery, vocabularyNotes } from "./vocabulary.js";

export const UIS_THEMES = ["EDUCATION", "SCIENCE_TECHNOLOGY_INNOVATION", "CULTURE", "DEMOGRAPHIC_SOCIOECONOMIC"] as const;
export type UisTheme = (typeof UIS_THEMES)[number];

export const UIS_CATALOG_SOURCE_URL = `${UIS_BASE}/definitions/indicators`;
export const UIS_GEOUNITS_SOURCE_URL = `${UIS_BASE}/definitions/geounits`;

export interface UisIndicatorEntry {
  code: string;
  name: string;
  theme: string;
  last_data_update: string | null;
  record_count: number | null;
  year_min: number | null;
  year_max: number | null;
  geo_types: string | null;
}

/**
 * Linha completa do catálogo — a de `UisIndicatorEntry` mais o que o seed tira
 * do UIS Data Browser (framework e grupo; ver scripts/seed-uis-catalog.mjs).
 * Só `search`/`fetch` (Deep Research) leem estas colunas: o framework monta a
 * URL pública do indicador e o grupo entra nas palavras-chave do índice.
 */
export interface UisCatalogRow extends UisIndicatorEntry {
  framework_id: string | null;
  group_id: string | null;
  group_name: string | null;
}

const CATALOG_COLUMNS =
  "code, name, theme, last_data_update, record_count, year_min, year_max, geo_types, framework_id, group_id, group_name";

export interface UisGeoUnitEntry {
  id: string;
  name: string;
  type: string;
}

interface UisCatalogMeta {
  retrievedAt: string;
  releaseVersion: string | null;
}

function requireDb(env: Env): D1Database {
  if (!env.CATALOG_DB) {
    throw new Error("binding CATALOG_DB ausente — o catálogo D1 não foi provisionado");
  }
  return env.CATALOG_DB;
}

async function uisMeta(db: D1Database): Promise<UisCatalogMeta> {
  const rows = await db
    .prepare("SELECT key, value FROM uis_meta WHERE key IN ('retrieved_at', 'release_version')")
    .all<{ key: string; value: string }>();
  const map = new Map((rows.results ?? []).map((r) => [r.key, r.value]));
  const retrievedAt = map.get("retrieved_at");
  if (!retrievedAt) {
    throw new Error("catálogo UIS sem uis_meta.retrieved_at — rodar o seed (scripts/seed-uis-catalog.mjs)");
  }
  return { retrievedAt, releaseVersion: map.get("release_version") ?? null };
}

export interface UisIndicatorSearchResult {
  entries: UisIndicatorEntry[];
  total: number;
  retrievedAt: string;
  releaseVersion: string | null;
  sourceUrl: string;
  /** Traduções de vocabulário DITAS ao chamador (src/uis/vocabulary.ts); vazio quando não houve. */
  notes: string[];
}

/**
 * Busca por termos no nome/código do indicador (AND entre termos,
 * case-insensitive), opcionalmente restrita a um tema; ordenada pela contagem de
 * registros disponíveis (proxy de proeminência — a API não publica peso de busca).
 *
 * Cada termo vira um OR das grafias que a UNESCO usa para ele
 * (src/uis/vocabulary.ts): quem escreve "enrollment" ou "spending" casa
 * "enrolment" e "expenditure" em vez de receber zero calado. O `notes`
 * devolvido diz quando isso aconteceu.
 */
export async function searchUisCatalog(
  env: Env,
  query: string,
  theme: UisTheme | undefined,
  limit: number,
  offset = 0,
): Promise<UisIndicatorSearchResult> {
  // Runtime stdio (sem D1): catálogo em memória com a mesma semântica de busca.
  if (!env.CATALOG_DB && env.CATALOG_MEMORY) return env.CATALOG_MEMORY.search(query, theme, limit, offset);
  const db = requireDb(env);
  const expanded = expandQuery(query);
  if (!expanded.length) {
    throw new UisUserError('Empty query: pass one or more search terms (e.g. "literacy rate youth").');
  }

  const params: string[] = [];
  const conds = expanded.map(
    (t) =>
      "(" +
      t.patterns
        .map((p) => {
          params.push(`%${p.replace(/[%_]/g, "")}%`);
          const n = params.length;
          return `name_lc LIKE ?${n} OR code_lc LIKE ?${n}`;
        })
        .join(" OR ") +
      ")",
  );
  if (theme) {
    conds.push(`theme = ?${params.length + 1}`);
    params.push(theme);
  }
  const where = conds.join(" AND ");

  const [rows, count, meta] = await Promise.all([
    db
      .prepare(
        `SELECT code, name, theme, last_data_update, record_count, year_min, year_max, geo_types ` +
          `FROM uis_indicators WHERE ${where} ` +
          `ORDER BY record_count DESC, code LIMIT ${Math.max(1, Math.min(limit, 100))} ` +
          `OFFSET ${Math.max(0, Math.floor(offset))}`,
      )
      .bind(...params)
      .all<UisIndicatorEntry>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM uis_indicators WHERE ${where}`)
      .bind(...params)
      .first<{ n: number }>(),
    uisMeta(db),
  ]);

  return {
    entries: rows.results ?? [],
    total: count?.n ?? 0,
    retrievedAt: meta.retrievedAt,
    releaseVersion: meta.releaseVersion,
    sourceUrl: UIS_CATALOG_SOURCE_URL,
    notes: vocabularyNotes(expanded),
  };
}

export interface UisCatalogListing {
  entries: UisCatalogRow[];
  retrievedAt: string;
  releaseVersion: string | null;
  sourceUrl: string;
}

/**
 * O catálogo INTEIRO (~5.060 linhas, ~1 MB em D1) — para o índice de
 * `search`/`fetch`, construído uma vez por isolate (src/tools/deep-research.ts).
 * As tools `uis_*` nunca chamam isto: buscam por SQL, página a página.
 */
export async function listUisCatalog(env: Env): Promise<UisCatalogListing> {
  if (!env.CATALOG_DB && env.CATALOG_MEMORY) return env.CATALOG_MEMORY.all();
  const db = requireDb(env);
  const [rows, meta] = await Promise.all([
    db.prepare(`SELECT ${CATALOG_COLUMNS} FROM uis_indicators ORDER BY code`).all<UisCatalogRow>(),
    uisMeta(db),
  ]);
  return {
    entries: rows.results ?? [],
    retrievedAt: meta.retrievedAt,
    releaseVersion: meta.releaseVersion,
    sourceUrl: UIS_CATALOG_SOURCE_URL,
  };
}

export interface UisGeoUnitSearchResult {
  entries: UisGeoUnitEntry[];
  total: number;
  retrievedAt: string;
  releaseVersion: string | null;
  sourceUrl: string;
}

/** Geo units (462 no total) — filtro opcional por texto e tipo (NATIONAL/REGIONAL). */
export async function searchUisGeoUnits(
  env: Env,
  search: string | undefined,
  type: "NATIONAL" | "REGIONAL" | undefined,
  limit: number,
  offset = 0,
): Promise<UisGeoUnitSearchResult> {
  if (!env.CATALOG_DB && env.CATALOG_MEMORY) return env.CATALOG_MEMORY.geoUnits(search, type, limit, offset);
  const db = requireDb(env);
  const conds: string[] = [];
  const params: string[] = [];
  if (search) {
    params.push(`%${search.toLowerCase().replace(/[%_]/g, "")}%`);
    conds.push(`(name_lc LIKE ?${params.length} OR id = ?${params.length + 1})`);
    params.push(search.toUpperCase());
  }
  if (type) {
    params.push(type);
    conds.push(`type = ?${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const [rows, count, meta] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, type FROM uis_geounits ${where} ` +
          `ORDER BY name LIMIT ${Math.max(1, Math.min(limit, 500))} OFFSET ${Math.max(0, Math.floor(offset))}`,
      )
      .bind(...params)
      .all<UisGeoUnitEntry>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM uis_geounits ${where}`)
      .bind(...params)
      .first<{ n: number }>(),
    uisMeta(db),
  ]);

  return {
    entries: rows.results ?? [],
    total: count?.n ?? 0,
    retrievedAt: meta.retrievedAt,
    releaseVersion: meta.releaseVersion,
    sourceUrl: UIS_GEOUNITS_SOURCE_URL,
  };
}
