/**
 * Seed do catálogo UIS (D1 — tabelas uis_indicators / uis_geounits / uis_meta).
 *
 * Baixa o catálogo de indicadores (`/definitions/indicators`, ~5.060 indicadores),
 * os geo units (`/definitions/geounits`, 462) e a release corrente
 * (`/versions/default`), registra o instante REAL da extração (é o retrieved_at
 * que os blocos de proveniência das tools uis_* de catálogo reportam) e gera
 * `scripts/seed-uis-catalog.sql` para o `wrangler d1 execute`.
 *
 * Baixa também as definições do UIS Data Browser (`/api/data-browser/resources/
 * <versão>/indicators/indicator-definitions-en.json`, ~6,7 MB, 138 grupos) para
 * gravar em cada indicador o `framework_id` (UIS-SDG4Monitoring, UIS-EducationOPRI,
 * …) e o grupo (`group_id` IG-…, `group_name`). O framework é o que a URL pública
 * do Data Browser exige (`/view#indicatorPaths=<framework>%3A0%3A<code>` — sem
 * ele a página quebra em carga limpa; verificado no navegador em 2026-09-03) e é
 * por essa URL que `search`/`fetch` (Deep Research) citam o indicador. A API
 * pública não expõe o framework; só o Data Browser. Medido em 2026-09-03: TODOS
 * os códigos do catálogo público existem nas definições, cada um com framework.
 *
 * Uso:
 *   node scripts/seed-uis-catalog.mjs
 *   npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql
 *   npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql
 *
 * Ao contrário do gateway da OIT, a UIS Data API responde 200 ao fetch do Node —
 * não é preciso curl (medição do mini-spike, docs/06, 07/08/2026).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.uis.unesco.org/api";
const BASE = `${API}/public`;
const BROWSER = `${API}/data-browser`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "seed-uis-catalog.sql");
const UA = "uis-mcp-server (https://uis.sidneybissoli.com; sbissoli76@gmail.com)";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.json();
}

const [indicators, geounits, release, browserRelease] = await Promise.all([
  getJson(`${BASE}/definitions/indicators`),
  getJson(`${BASE}/definitions/geounits`),
  getJson(`${BASE}/versions/default`),
  getJson(`${BROWSER}/versions/default`),
]);
const definitions = await getJson(
  `${BROWSER}/resources/${browserRelease.version}/indicators/indicator-definitions-en.json`,
);
const retrievedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
if (indicators.length < 1000) throw new Error(`catálogo suspeito: só ${indicators.length} indicadores`);
if (geounits.length < 100) throw new Error(`geo units suspeitos: só ${geounits.length}`);
if (definitions.length < 100) throw new Error(`definições do Data Browser suspeitas: só ${definitions.length} grupos`);

/**
 * code → {framework, groupId, groupName}: grupos → mainIndicators → subIndicators
 * (as tags moram no indicador; o grupo é o fallback). Primeiro framework de cada
 * indicador — todo indicador tem exatamente um (medição de 2026-09-03).
 */
const browserInfo = new Map();
for (const group of definitions) {
  const walk = (ind) => {
    const tags = ind.frameworkTags ?? group.frameworkTags ?? [];
    if (!browserInfo.has(ind.id)) {
      browserInfo.set(ind.id, { framework: tags[0]?.frameworkId ?? null, groupId: group.id, groupName: group.name });
    }
    for (const sub of ind.subIndicators ?? []) walk(sub);
  };
  for (const main of group.mainIndicators ?? []) walk(main);
}
const semFramework = indicators.filter((ind) => !browserInfo.get(ind.indicatorCode)?.framework);
if (semFramework.length) {
  // Não é fatal — a coluna fica NULL e a URL pública cai para a home do Data
  // Browser — mas tem de ser visto: o seed é o único momento em que alguém olha.
  console.warn(`AVISO: ${semFramework.length} indicadores sem framework no Data Browser (ex.: ${semFramework.slice(0, 5).map((i) => i.indicatorCode).join(", ")})`);
}

const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const n = (v) => (Number.isFinite(v) ? String(v) : "NULL");
// lastDataUpdate vem em MM/DD/YYYY (ex.: "02/09/2026" = 9 de fevereiro) → ISO.
const isoDate = (mdY) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdY ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
};

const lines = [
  "-- Gerado por scripts/seed-uis-catalog.mjs — não editar à mão.",
  `-- Fontes: ${BASE}/definitions/indicators · /definitions/geounits · /versions/default`,
  `--          ${BROWSER}/resources/${browserRelease.version}/indicators/indicator-definitions-en.json`,
  `-- Extraído em: ${retrievedAt} (release ${release.version})`,
  // DROP + CREATE, não DELETE: o esquema já mudou uma vez (framework_id/group_*
  // em 2026-09-03) e `CREATE TABLE IF NOT EXISTS` não acrescenta coluna a tabela
  // que já existe — o seed reconstrói tudo de qualquer maneira.
  "DROP TABLE IF EXISTS uis_indicators;",
  "CREATE TABLE uis_indicators (",
  "  code TEXT PRIMARY KEY, name TEXT NOT NULL, code_lc TEXT NOT NULL, name_lc TEXT NOT NULL,",
  "  theme TEXT NOT NULL, last_data_update TEXT, record_count INTEGER,",
  "  year_min INTEGER, year_max INTEGER, geo_types TEXT,",
  "  framework_id TEXT, group_id TEXT, group_name TEXT",
  ");",
  "DROP TABLE IF EXISTS uis_geounits;",
  "CREATE TABLE uis_geounits (",
  "  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL, type TEXT NOT NULL",
  ");",
  "DROP TABLE IF EXISTS uis_meta;",
  "CREATE TABLE uis_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
];

const CHUNK = 50;
for (let i = 0; i < indicators.length; i += CHUNK) {
  const values = indicators.slice(i, i + CHUNK).map((ind) => {
    const da = ind.dataAvailability ?? {};
    const b = browserInfo.get(ind.indicatorCode) ?? {};
    return `(${q(ind.indicatorCode)}, ${q(ind.name)}, ${q(ind.indicatorCode.toLowerCase())}, ${q(
      ind.name.toLowerCase(),
    )}, ${q(ind.theme)}, ${q(isoDate(ind.lastDataUpdate))}, ${n(da.totalRecordCount)}, ${n(
      da.timeLine?.min,
    )}, ${n(da.timeLine?.max)}, ${q((da.geoUnits?.types ?? []).join(","))}, ${q(b.framework)}, ${q(b.groupId)}, ${q(b.groupName)})`;
  });
  lines.push(
    "INSERT INTO uis_indicators (code, name, code_lc, name_lc, theme, last_data_update, record_count, year_min, year_max, geo_types, framework_id, group_id, group_name) VALUES\n" +
      values.join(",\n") +
      ";",
  );
}

for (let i = 0; i < geounits.length; i += CHUNK) {
  const values = geounits
    .slice(i, i + CHUNK)
    .map((g) => `(${q(g.id)}, ${q(g.name)}, ${q(g.name.toLowerCase())}, ${q(g.type)})`);
  lines.push(`INSERT INTO uis_geounits (id, name, name_lc, type) VALUES\n${values.join(",\n")};`);
}

lines.push(
  `INSERT INTO uis_meta (key, value) VALUES ('retrieved_at', ${q(retrievedAt)});`,
  `INSERT INTO uis_meta (key, value) VALUES ('release_version', ${q(release.version)});`,
  `INSERT INTO uis_meta (key, value) VALUES ('release_publication_date', ${q(release.publicationDate)});`,
  `INSERT INTO uis_meta (key, value) VALUES ('indicator_count', ${q(String(indicators.length))});`,
  `INSERT INTO uis_meta (key, value) VALUES ('geounit_count', ${q(String(geounits.length))});`,
  `INSERT INTO uis_meta (key, value) VALUES ('browser_version', ${q(browserRelease.version)});`,
);

writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
console.log(
  `OK: ${indicators.length} indicadores (${indicators.length - semFramework.length} com framework do Data Browser ${browserRelease.version}), ` +
    `${geounits.length} geo units, release ${release.version}, extraído em ${retrievedAt}`,
);
console.log(`SQL: ${OUT}`);
console.log("Aplicar com:");
console.log("  npx wrangler d1 execute uis-catalog --local  --file=scripts/seed-uis-catalog.sql");
console.log("  npx wrangler d1 execute uis-catalog --remote --file=scripts/seed-uis-catalog.sql");
