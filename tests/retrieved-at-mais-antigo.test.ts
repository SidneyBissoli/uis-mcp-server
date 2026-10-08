/**
 * Resposta que junta partes de instantes distintos: `retrieved_at` é o MAIS ANTIGO,
 * `served_from_cache` só é verdadeiro se TODAS vieram do cache, e `field_sources` diz
 * de onde e de quando veio cada parte (contrato de proveniência §3, v1.2).
 *
 * Por que este arquivo existe. Até a 1.5.0, `uis_get_data` juntava a release corrente
 * (KV, até 24 h) com os dados buscados agora e informava o instante dos DADOS, o mais
 * novo, com `served_from_cache: false` fixo; `fetch` juntava ainda a linha do catálogo
 * (seed, semanas ou meses) e fazia o mesmo. O instante da release era devolvido por
 * `getDefaultRelease` e descartado por quem chamava. Medido em produção em 08/10/2026:
 * `retrieval.requests: 1` (a release veio do KV) e `retrieved_at` = agora, sem
 * `field_sources`. Os cenários abaixo são os da medição.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deepResearchHandlers, resetIndex } from "../src/tools/deep-research.js";
import { uisGetDataHandler } from "../src/tools/uis.js";
import { UIS_RELEASE_URL } from "../src/uis/api.js";
import { UIS_CATALOG_SOURCE_URL, type UisCatalogRow } from "../src/uis/catalog.js";
import { uisProvenance } from "../src/uis/provenance.js";
import { withUpstreamCall } from "../src/uis/upstream.js";
import type { Env } from "../src/types.js";

const RELEASE = {
  version: "20260507-91260335",
  publicationDate: "2026-05-08T16:58:36.233Z",
  themes: [],
};
/** A release no KV, extraída na véspera. */
const RELEASE_AT = "2026-10-07T09:00:00Z";
/** O seed do catálogo. */
const SEED_AT = "2026-08-01T12:00:00Z";
/** "Agora", fixado — o relógio falso vale para `nowIso()` e para o coletor. */
const AGORA = "2026-10-08T21:00:00Z";

const DATA_BODY = {
  records: [{ indicatorId: "CR.1", geoUnit: "BRA", year: 2023, value: 96.7, magnitude: null, qualifier: null }],
  hints: [],
};

function kv(seed?: { retrievedAt: string; value: unknown }) {
  const store = new Map<string, string>();
  if (seed) store.set("uis:default-version", JSON.stringify(seed));
  return {
    store,
    cache: {
      get: async (k: string) => {
        const v = store.get(k);
        return v ? JSON.parse(v) : null;
      },
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };
}

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/versions/default")) {
      return new Response(JSON.stringify({ version: RELEASE.version, publicationDate: RELEASE.publicationDate }), { status: 200 });
    }
    return new Response(JSON.stringify(DATA_BODY), { status: 200 });
  });
}

type Fs = { fields: string[]; source_url: string; retrieved_at: string | null; served_from_cache: boolean | null };

function bloco(r: unknown): Record<string, unknown> {
  return (r as { structuredContent: { provenance: Record<string, unknown> } }).structuredContent.provenance;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AGORA));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetIndex();
});

describe("uis_get_data: release do KV + dados de agora", () => {
  const args = { indicators: ["CR.1"], geo_units: ["BRA"], provenance_mode: "detailed" as const };

  it("o topo é o instante da release (o mais antigo), não o dos dados", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const env = { UIS_CACHE: kv({ retrievedAt: RELEASE_AT, value: RELEASE }).cache } as unknown as Env;
    const p = bloco(await withUpstreamCall(() => uisGetDataHandler(env)(args)));

    expect(p.retrieved_at).toBe(RELEASE_AT);
    expect(p.served_from_cache).toBe(false); // os dados não vieram do cache
    // Acerto de cache não é ida à origem: só os dados contam.
    expect((p.retrieval as { requests: number }).requests).toBe(1);

    const fs = p.field_sources as Fs[];
    expect(fs).toHaveLength(2);
    expect(fs[0]).toMatchObject({
      fields: ["data_vintage", "dataset.version"],
      source_url: UIS_RELEASE_URL,
      retrieved_at: RELEASE_AT,
      served_from_cache: true,
    });
    expect(fs[1]).toMatchObject({ fields: ["rows", "rows_count"], retrieved_at: AGORA, served_from_cache: false });
    expect(fs[1]?.source_url).toBe(p.source_url);
    // A citação embute a data de extração DA URL citada (a dos dados).
    expect(String(p.citation)).toContain("date of extraction 2026-10-08");
  });

  it("field_sources sai também no concise (o servidor emite 1.2)", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const env = { UIS_CACHE: kv({ retrievedAt: RELEASE_AT, value: RELEASE }).cache } as unknown as Env;
    const p = bloco(await withUpstreamCall(() => uisGetDataHandler(env)({ indicators: ["CR.1"] })));
    expect(p.retrieved_at).toBe(RELEASE_AT);
    expect((p.field_sources as Fs[]).map((f) => f.retrieved_at)).toEqual([RELEASE_AT, AGORA]);
  });

  it("fora de um coletor o resultado é o mesmo (instantes declarados pelas partes)", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const env = { UIS_CACHE: kv({ retrievedAt: RELEASE_AT, value: RELEASE }).cache } as unknown as Env;
    const p = bloco(await uisGetDataHandler(env)(args));
    expect(p.retrieved_at).toBe(RELEASE_AT);
    expect((p.field_sources as Fs[])[0]?.served_from_cache).toBe(true);
  });

  it("KV frio: duas idas, a release buscada agora e marcada como não-cache", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const { cache, store } = kv();
    const p = bloco(await withUpstreamCall(() => uisGetDataHandler({ UIS_CACHE: cache } as unknown as Env)(args)));
    expect((p.retrieval as { requests: number }).requests).toBe(2);
    expect(p.retrieved_at).toBe(AGORA);
    expect(p.served_from_cache).toBe(false);
    expect((p.field_sources as Fs[]).map((f) => f.served_from_cache)).toEqual([false, false]);
    // E a próxima chamada lê a release do KV com o instante desta extração.
    expect(JSON.parse(store.get("uis:default-version") ?? "{}").retrievedAt).toBe(AGORA);
  });
});

describe("fetch (Deep Research): catálogo do seed + release do KV + amostra de agora", () => {
  const row: UisCatalogRow = {
    code: "CR.1",
    name: "Completion rate, primary education",
    theme: "EDUCATION",
    last_data_update: "2026-02-09",
    record_count: 100,
    year_min: 2000,
    year_max: 2023,
    geo_types: "NATIONAL",
    framework_id: "UIS-SDG4Monitoring",
    group_id: null,
    group_name: null,
  };
  const catalogo = {
    all: async () => ({ entries: [row], retrievedAt: SEED_AT, releaseVersion: "20260301-00000000", sourceUrl: UIS_CATALOG_SOURCE_URL }),
  };

  it("o topo é o instante do seed; três sub-fontes, cada uma com o próprio instante e cache", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const env = { UIS_CACHE: kv({ retrievedAt: RELEASE_AT, value: RELEASE }).cache, CATALOG_MEMORY: catalogo } as unknown as Env;
    const reply = await deepResearchHandlers(env).fetch("ind:CR.1");
    const p = (reply?.extras?.structured as { provenance: Record<string, unknown> }).provenance;

    expect(p.retrieved_at).toBe(SEED_AT);
    expect((p.retrieval as { requests: number }).requests).toBe(1);
    const fs = p.field_sources as Array<Fs & { data_vintage: string | null }>;
    expect(fs.map((f) => [f.source_url === UIS_CATALOG_SOURCE_URL, f.retrieved_at, f.served_from_cache])).toEqual([
      [true, SEED_AT, true],
      [false, RELEASE_AT, true],
      [false, AGORA, false],
    ]);
    expect(fs[1]?.source_url).toBe(UIS_RELEASE_URL);
    // A release do seed pode não ser a dos dados — e agora isso fica visível.
    expect(fs[0]?.data_vintage).toBe("20260301-00000000");
    expect(fs[2]?.data_vintage).toContain(RELEASE.version);
  });

  it("linha sem year_max: uma parte só, sem field_sources, servida do cache", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const semAnos = { all: async () => ({ ...(await catalogo.all()), entries: [{ ...row, year_max: null }] }) };
    const env = { UIS_CACHE: kv().cache, CATALOG_MEMORY: semAnos } as unknown as Env;
    const reply = await deepResearchHandlers(env).fetch("ind:CR.1");
    const p = (reply?.extras?.structured as { provenance: Record<string, unknown> }).provenance;
    expect(p.retrieved_at).toBe(SEED_AT);
    expect("field_sources" in p).toBe(false);
  });
});

describe("uisProvenance com partes", () => {
  const base = {
    sourceUrl: "https://api.uis.unesco.org/api/public/data/indicators?indicator=CR.1&version=x",
    retrievedAt: AGORA,
  };

  it("todas do cache → served_from_cache true; o topo é o mínimo mesmo se a parte citada for a mais nova", () => {
    const p = uisProvenance({
      ...base,
      parts: [
        { fields: ["a"], sourceUrl: "https://x/a", retrievedAt: "2026-10-08T10:00:00Z", servedFromCache: true },
        { fields: ["b"], sourceUrl: "https://x/b", retrievedAt: "2026-10-06T10:00:00Z", servedFromCache: true },
      ],
    });
    expect(p.retrieved_at).toBe("2026-10-06T10:00:00Z");
    expect(p.served_from_cache).toBe(true);
  });

  it("uma parte só não vira field_sources e respeita o servedFromCache declarado", () => {
    const p = uisProvenance({
      ...base,
      servedFromCache: false,
      parts: [{ fields: ["a"], sourceUrl: base.sourceUrl, retrievedAt: AGORA, servedFromCache: false }],
    });
    expect(p.field_sources).toBeNull();
    expect(p.served_from_cache).toBe(false);
  });
});
