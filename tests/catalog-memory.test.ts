import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/cli.js";
import {
  geoUnitRowsFromDefinitions,
  indicatorRowsFromDefinitions,
  InMemoryUisCatalog,
  isoDateFromUs,
  searchGeoUnitRows,
  searchIndicatorRows,
} from "../src/uis/catalog-memory.js";
import { listUisCatalog, searchUisCatalog, searchUisGeoUnits } from "../src/uis/catalog.js";

/** Um indicador no formato de `/definitions/indicators` — o que o seed lê. */
const ind = (
  code: string,
  name: string,
  theme = "EDUCATION",
  extra: { records?: number; min?: number; max?: number; types?: string[]; updated?: string } = {},
) => ({
  indicatorCode: code,
  name,
  theme,
  lastDataUpdate: extra.updated ?? "02/09/2026",
  dataAvailability: {
    totalRecordCount: extra.records,
    timeLine: { min: extra.min, max: extra.max },
    geoUnits: { types: extra.types ?? ["NATIONAL"] },
  },
});

const INDICATORS = [
  ind("CR.1", "Completion rate, primary education, both sexes (%)", "EDUCATION", { records: 3000, min: 2000, max: 2024, types: ["NATIONAL", "REGIONAL"] }),
  ind("ROFST.1.CP", "Out-of-school rate for children of primary school age, both sexes (%)", "EDUCATION", { records: 5000 }),
  ind("NERT.1", "Net enrolment rate, primary, both sexes (%)", "EDUCATION", { records: 3000 }),
  ind("GERD.GDP", "GERD as a percentage of GDP", "SCIENCE_TECHNOLOGY_INNOVATION", { records: 900 }),
  ind("X.NO.COUNT", "Primary education, indicator without data availability", "EDUCATION"),
];

const GEOUNITS = [
  { id: "BRA", name: "Brazil", type: "NATIONAL" },
  { id: "ARG", name: "Argentina", type: "NATIONAL" },
  { id: "LAC", name: "Latin America and the Caribbean", type: "REGIONAL" },
  { id: "WLD", name: "World", type: "REGIONAL" },
];

describe("catálogo em memória (runtime stdio)", () => {
  const rows = indicatorRowsFromDefinitions(INDICATORS);

  it("mapeia as colunas como o seed do D1 (data US → ISO, contagens, anos, geo_types; Data Browser nulo)", () => {
    expect(isoDateFromUs("02/09/2026")).toBe("2026-02-09");
    expect(isoDateFromUs("2026-02-09")).toBeNull();
    expect(rows[0]).toEqual({
      code: "CR.1",
      name: "Completion rate, primary education, both sexes (%)",
      theme: "EDUCATION",
      last_data_update: "2026-02-09",
      record_count: 3000,
      year_min: 2000,
      year_max: 2024,
      geo_types: "NATIONAL,REGIONAL",
      framework_id: null,
      group_id: null,
      group_name: null,
      codeLc: "cr.1",
      nameLc: "completion rate, primary education, both sexes (%)",
    });
    expect(rows[4]).toMatchObject({ record_count: null, year_min: null, year_max: null });
    expect(indicatorRowsFromDefinitions({ not: "a list" })).toEqual([]);
  });

  it("busca: AND entre termos, case-insensitive, sobre nome e código; ordena por record_count desc, code asc; nulo por último", () => {
    // "primary school age" não tem "education": o AND entre termos deixa ROFST.1.CP de fora.
    const r = searchIndicatorRows(rows, "PRIMARY education", undefined, 10, 0);
    expect(r.total).toBe(2);
    expect(r.entries.map((e) => e.code)).toEqual(["CR.1", "X.NO.COUNT"]);
    expect(searchIndicatorRows(rows, "primary", undefined, 10, 0).entries.map((e) => e.code)).toEqual(["ROFST.1.CP", "CR.1", "NERT.1", "X.NO.COUNT"]);
    // record_count empatado (3000) desempata por code — mesma ordem do D1.
    const empate = searchIndicatorRows(rows, "both sexes", undefined, 10, 0);
    expect(empate.entries.map((e) => e.code)).toEqual(["ROFST.1.CP", "CR.1", "NERT.1"]);
    expect(searchIndicatorRows(rows, "gerd.gdp", undefined, 10, 0).entries.map((e) => e.code)).toEqual(["GERD.GDP"]);
    // As entradas têm as 8 colunas de UisIndicatorEntry, sem as internas.
    expect(Object.keys(r.entries[0]!)).not.toContain("nameLc");
    expect(Object.keys(r.entries[0]!)).not.toContain("framework_id");
  });

  it("traduz a palavra do usuário para a da UNESCO e diz que traduziu (mesma tabela do D1)", () => {
    const r = searchIndicatorRows(rows, "enrollment rate", undefined, 10, 0);
    expect(r.entries.map((e) => e.code)).toEqual(["NERT.1"]);
    expect(r.notes.join(" ")).toMatch(/enrol/);
  });

  it("filtra por tema, pagina por limit/offset e clampa como o D1", () => {
    expect(searchIndicatorRows(rows, "primary", "SCIENCE_TECHNOLOGY_INNOVATION", 10, 0).total).toBe(0);
    expect(searchIndicatorRows(rows, "gdp", "SCIENCE_TECHNOLOGY_INNOVATION", 10, 0).total).toBe(1);
    const all = searchIndicatorRows(rows, "primary", undefined, 100, 0);
    const page = searchIndicatorRows(rows, "primary", undefined, 1, 1);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.code).toBe(all.entries[1]?.code);
    expect(searchIndicatorRows(rows, "primary", undefined, 0, -5).entries).toHaveLength(1);
  });

  it("query vazia é erro de uso", () => {
    expect(() => searchIndicatorRows(rows, "   ", undefined, 10, 0)).toThrow(/Empty query/);
  });

  it("geo units: substring no nome OU id exato, filtro por tipo, ordem por nome, teto 500", () => {
    const g = geoUnitRowsFromDefinitions(GEOUNITS);
    expect(searchGeoUnitRows(g, undefined, undefined, 500, 0).entries.map((e) => e.id)).toEqual(["ARG", "BRA", "LAC", "WLD"]);
    expect(searchGeoUnitRows(g, "bra", undefined, 10, 0).entries.map((e) => e.id)).toEqual(["BRA"]);
    expect(searchGeoUnitRows(g, "lac", undefined, 10, 0).entries.map((e) => e.id)).toEqual(["LAC"]);
    expect(searchGeoUnitRows(g, undefined, "REGIONAL", 10, 0).entries.map((e) => e.id)).toEqual(["LAC", "WLD"]);
    const p = searchGeoUnitRows(g, undefined, undefined, 1, 1);
    expect(p.total).toBe(4);
    expect(p.entries.map((e) => e.id)).toEqual(["BRA"]);
    expect(Object.keys(p.entries[0]!)).toEqual(["id", "name", "type"]);
  });
});

/** Um snapshot grande o bastante para passar os pisos do seed (1.000 indicadores, 100 geo units). */
const bigSnapshot = () => ({
  indicators: Array.from({ length: 1200 }, (_, i) => ind(`IND.${i}`, `Indicator ${i} literacy`, "EDUCATION", { records: i })),
  geounits: Array.from({ length: 120 }, (_, i) => ({ id: `G${i}`, name: `Geo ${i}`, type: i % 2 ? "NATIONAL" : "REGIONAL" })),
  release: { version: "20260507-91260335", publicationDate: "2026-05-07" },
});

describe("InMemoryUisCatalog no lugar do D1", () => {
  it("baixa uma vez (lazy), reporta retrieved_at real e release, e é usado pelas três funções de catalog.ts sem D1", async () => {
    let loads = 0;
    const cat = new InMemoryUisCatalog(async () => {
      loads++;
      return bigSnapshot();
    });
    const env = { CATALOG_MEMORY: cat };
    const before = Math.floor(Date.now() / 1000) * 1000;
    const r1 = await searchUisCatalog(env, "literacy", undefined, 5, 0);
    const r2 = await searchUisCatalog(env, "indicator 1", undefined, 5, 0);
    const geo = await searchUisGeoUnits(env, "geo 7", "NATIONAL", 10, 0);
    const all = await listUisCatalog(env);
    expect(loads).toBe(1);
    expect(r1.total).toBe(1200);
    expect(r1.entries).toHaveLength(5);
    expect(r1.entries[0]?.code).toBe("IND.1199");
    expect(r2.total).toBeGreaterThan(0);
    expect(r1.releaseVersion).toBe("20260507-91260335");
    expect(Date.parse(r1.retrievedAt)).toBeGreaterThanOrEqual(before);
    expect(r1.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(r1.sourceUrl).toContain("/definitions/indicators");
    expect(geo.sourceUrl).toContain("/definitions/geounits");
    expect(geo.entries.map((e) => e.id)).toEqual(["G7", "G71", "G73", "G75", "G77", "G79"]);
    expect(all.entries).toHaveLength(1200);
    expect(all.entries[0]?.code).toBe("IND.0");
    expect(all.entries[1]?.code).toBe("IND.1");
    expect(all.retrievedAt).toBe(r1.retrievedAt);
  });

  it("com D1 presente, o catálogo em memória é ignorado", async () => {
    const cat = new InMemoryUisCatalog(async () => {
      throw new Error("não devia ser chamado");
    });
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => ({ n: 0 }),
        }),
        all: async () => ({ results: [{ key: "retrieved_at", value: "2026-08-07T18:00:00Z" }] }),
      }),
    } as unknown as D1Database;
    const r = await searchUisCatalog({ CATALOG_DB: db, CATALOG_MEMORY: cat }, "x", undefined, 5, 0);
    expect(r.total).toBe(0);
    expect(r.retrievedAt).toBe("2026-08-07T18:00:00Z");
  });

  it("sem D1 nem memória, erra alto como antes", async () => {
    await expect(searchUisCatalog({}, "x", undefined, 5, 0)).rejects.toThrow(/CATALOG_DB ausente/);
  });

  it("catálogo minguado é recusado (pisos do seed) e a falha não fica presa: a próxima busca tenta de novo", async () => {
    let n = 0;
    const cat = new InMemoryUisCatalog(async () => {
      n++;
      if (n === 1) throw new Error("boom");
      if (n === 2) return { indicators: [ind("A", "a")], geounits: [], release: null };
      return bigSnapshot();
    });
    await expect(cat.search("literacy", undefined, 1)).rejects.toThrow("boom");
    await expect(cat.search("literacy", undefined, 1)).rejects.toThrow(/catálogo suspeito/);
    await expect(cat.search("literacy", undefined, 1)).resolves.toMatchObject({ total: 1200 });
    expect(n).toBe(3);
  });
});

describe("MemoryCache (KV em memória do runtime stdio)", () => {
  it("get/put com JSON e TTL", async () => {
    const c = new MemoryCache();
    expect(await c.get("k", "json")).toBeNull();
    await c.put("k", JSON.stringify({ a: 1 }), { expirationTtl: 60 });
    expect(await c.get<{ a: number }>("k", "json")).toEqual({ a: 1 });
    await c.put("t", JSON.stringify(1), { expirationTtl: 0.001 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("t", "json")).toBeNull();
  });
});
