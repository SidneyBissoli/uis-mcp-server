/**
 * A ida à origem pelo fetch comum (`src/uis/upstream.ts`): a política de
 * repetição, a tradução do erro do pacote para o erro que o servidor lê, e —
 * pelo servidor INTEIRO (cache e catálogo em memória, o runtime stdio) — a
 * contagem que sai em `retrieval` no bloco de proveniência: medida quando
 * houve ida à UIS, `null` quando a resposta veio do catálogo injetado ou do
 * cache da release.
 *
 * Fetch dublado com `Response` real (o pacote lê `headers` e `text()`); a
 * espera do backoff é calada por `upstreamIo.sleep` e CONTADA — é o relógio
 * que prova a política.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { UpstreamError, type RetryContext } from "@sbissoli/mcp-upstream";
import { classifyError } from "../src/call-shape.js";
import { MemoryCache } from "../src/cli.js";
import { InMemoryUisCatalog, type UisCatalogSnapshot } from "../src/uis/catalog-memory.js";
import {
  retryUpstream,
  translateUpstreamError,
  UPSTREAM_POLICY,
  UisUpstreamError,
  upstreamIo,
} from "../src/uis/upstream.js";
import { provenance } from "../src/uis/provenance.js";
import { buildServer } from "../src/server.js";
import { resetIndex } from "../src/tools/deep-research.js";
import type { Env } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fontes falsas
// ---------------------------------------------------------------------------

const RELEASE_BODY = {
  version: "20260507-91260335",
  publicationDate: "2026-05-08T16:58:36.233Z",
  themeDataStatus: [{ theme: "EDUCATION", lastUpdate: "02/09/2026", description: "February 2026 Data Release" }],
};

/** `/definitions/indicators` com mais de 1000 indicadores (o piso que o catálogo aceita). */
function indicatorsBody() {
  const um = (code: string, name: string) => ({
    indicatorCode: code,
    name,
    theme: "EDUCATION",
    lastDataUpdate: "02/09/2026",
    dataAvailability: { totalRecordCount: 3000, timeLine: { min: 2000, max: 2024 }, geoUnits: { types: ["NATIONAL"] } },
  });
  const filler = Array.from({ length: 1000 }, (_, i) => um(`ZZ.${String(i).padStart(4, "0")}`, `Filler indicator ${i}`));
  return [um("CR.1", "Completion rate, primary education, both sexes (%)"), ...filler];
}

/** `/definitions/geounits` com mais de 100 geo units (o piso que o catálogo aceita). */
function geounitsBody() {
  const filler = Array.from({ length: 100 }, (_, i) => ({ id: `Z${String(i).padStart(2, "0")}`, name: `Filler ${i}`, type: "NATIONAL" }));
  return [{ id: "BRA", name: "Brazil", type: "NATIONAL" }, ...filler];
}

function dataBody(n = 2) {
  return {
    hints: [],
    records: Array.from({ length: n }, (_, i) => ({
      indicatorId: "CR.1",
      geoUnit: "BRA",
      year: 2023 + i,
      value: 93.2 + i,
      magnitude: null,
      qualifier: null,
    })),
  };
}

type Route = (url: string, n: number) => Response;

/** Um fetch por substring da URL; `n` é a ordem da chamada àquela rota (1-based). */
function stubFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const perRoute = new Map<string, number>();
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [needle, route] of Object.entries(routes)) {
      if (url.includes(needle)) {
        const n = (perRoute.get(needle) ?? 0) + 1;
        perRoute.set(needle, n);
        return route(url, n);
      }
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** As três rotas do catálogo em memória, como a UIS responde. */
const ROTAS_DO_CATALOGO: Record<string, Route> = {
  "/definitions/indicators": () => json(indicatorsBody()),
  "/definitions/geounits": () => json(geounitsBody()),
  "/versions/default": () => json(RELEASE_BODY),
};

/** O catálogo já em memória (o D1 do Worker): nada vai à origem por ele. */
async function catalogoInjetado(): Promise<UisCatalogSnapshot> {
  return { indicators: indicatorsBody(), geounits: geounitsBody(), release: RELEASE_BODY };
}

function envMemoria(loader?: () => Promise<UisCatalogSnapshot>): Env {
  return { UIS_CACHE: new MemoryCache(), CATALOG_MEMORY: new InMemoryUisCatalog(loader) };
}

async function conectar(env: Env): Promise<Client> {
  const server = buildServer(env);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "upstream-test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

type Retrieval = { requests: number; attempts: number; anomalies: Array<{ kind: string; count: number }>; unstable: boolean };

function retrievalOf(r: { structuredContent?: unknown }): Retrieval | null {
  const sc = r.structuredContent as { provenance: { retrieval: Retrieval | null } };
  return sc.provenance.retrieval;
}

const texto = (r: { content?: unknown }) =>
  (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");

const LIMPA: Retrieval = { requests: 1, attempts: 1, anomalies: [], unstable: false };

let sleep: MockInstance<typeof upstreamIo.sleep>;

beforeEach(() => {
  resetIndex();
  sleep = vi.spyOn(upstreamIo, "sleep").mockResolvedValue(undefined);
});

afterEach(() => {
  sleep.mockRestore();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// A política
// ---------------------------------------------------------------------------

function ctx(over: Partial<RetryContext>): RetryContext {
  return { url: "https://api.uis.unesco.org/api/public/x", attempt: 1, kind: "http_5xx", status: 503, response: undefined, body: undefined, ...over };
}

describe("retryUpstream — o que repete e o que não", () => {
  it("5xx, 429 e rede repetem", () => {
    expect(retryUpstream(ctx({ kind: "http_5xx", status: 503 }))).toBe(true);
    expect(retryUpstream(ctx({ kind: "http_5xx", status: 500 }))).toBe(true);
    expect(retryUpstream(ctx({ kind: "rate_limited", status: 429 }))).toBe(true);
    expect(retryUpstream(ctx({ kind: "network", status: undefined }))).toBe(true);
  });

  it("504 (timeout de integração do gateway), timeout, 400 pedagógico e corpo não-JSON NÃO repetem", () => {
    // 404 nem chega aqui: o pacote não consulta `retryOn` para `not_found`.
    expect(retryUpstream(ctx({ kind: "http_5xx", status: 504 }))).toBe(false);
    expect(retryUpstream(ctx({ kind: "timeout", status: undefined }))).toBe(false);
    expect(retryUpstream(ctx({ kind: "http_4xx", status: 400 }))).toBe(false);
    expect(retryUpstream(ctx({ kind: "malformed_body", status: 200 }))).toBe(false);
  });

  it("o teto por tentativa fica acima dos 29 s do API Gateway na frente da UIS", () => {
    expect(UPSTREAM_POLICY.timeoutMs).toBeGreaterThan(29_000);
    expect(UPSTREAM_POLICY.budgetMs).toBeGreaterThan(UPSTREAM_POLICY.timeoutMs);
    expect(UPSTREAM_POLICY.budgetMs).toBeLessThan(2 * UPSTREAM_POLICY.timeoutMs);
    expect(UPSTREAM_POLICY.backoff.jitterMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A tradução do erro
// ---------------------------------------------------------------------------

function erroDoPacote(over: Partial<ConstructorParameters<typeof UpstreamError>[0]>): UpstreamError {
  return new UpstreamError({
    url: "https://api.uis.unesco.org/api/public/x",
    kind: "http_5xx",
    status: 503,
    retryable: true,
    transport: false,
    attempts: 1,
    ...over,
  });
}

describe("translateUpstreamError — do erro do pacote ao erro que o servidor lê", () => {
  it("timeout → UisUpstreamError status 0, 'unreachable', classe fonte na telemetria", () => {
    const e = translateUpstreamError(erroDoPacote({ kind: "timeout", status: undefined, transport: true }), "data X");
    expect(e).toBeInstanceOf(UisUpstreamError);
    const err = e as UisUpstreamError;
    expect(err.status).toBe(0);
    expect(err.message).toBe("UNESCO UIS upstream unreachable (data X): timeout after 1 attempt (35 s each)");
    expect(classifyError(err.message)).toBe("fonte");
  });

  it("rede → status 0 com o que o fetch lançou, contando as tentativas", () => {
    const e = translateUpstreamError(
      erroDoPacote({ kind: "network", status: undefined, transport: true, attempts: 3, cause: new TypeError("fetch failed") }),
      "default version",
    ) as UisUpstreamError;
    expect(e.status).toBe(0);
    expect(e.message).toBe("UNESCO UIS upstream unreachable (default version): network error after 3 attempts: fetch failed");
    expect(classifyError(e.message)).toBe("fonte");
  });

  it("status que chegou → status + trecho do corpo (cortado em 300) e o sufixo das tentativas", () => {
    const e = translateUpstreamError(erroDoPacote({ status: 503, attempts: 3, body: "x".repeat(400) }), "data X") as UisUpstreamError;
    expect(e.status).toBe(503);
    expect(e.message).toBe(`UNESCO UIS upstream HTTP 503 (data X): ${"x".repeat(300)} (after 3 attempts)`);
    expect(classifyError(e.message)).toBe("fonte");
  });

  it("404 → status 404 sem sufixo (na Data API é rota inexistente, como sempre foi)", () => {
    const e = translateUpstreamError(erroDoPacote({ kind: "not_found", status: 404, retryable: false, body: "Cannot GET" }), "default version");
    expect((e as UisUpstreamError).status).toBe(404);
    expect((e as UisUpstreamError).message).toBe("UNESCO UIS upstream HTTP 404 (default version): Cannot GET");
  });

  it("corpo que não é JSON em 200 → status 200 e classe fonte", () => {
    const e = translateUpstreamError(erroDoPacote({ kind: "malformed_body", status: 200 }), "data X") as UisUpstreamError;
    expect(e.status).toBe(200);
    expect(classifyError(e.message)).toBe("fonte");
  });

  it("erro que não é do pacote passa intacto", () => {
    const meu = new RangeError("bug nosso");
    expect(translateUpstreamError(meu, "x")).toBe(meu);
  });
});

// ---------------------------------------------------------------------------
// O fio inteiro: contagem em `retrieval`, pelo servidor
// ---------------------------------------------------------------------------

describe("retrieval medido pelo servidor inteiro", () => {
  it("uis_get_data: 503 superado → release (miss) + dados = 2 idas, 3 tentativas, anomalia http_5xx, unstable; depois a release vem do cache", async () => {
    const { fn } = stubFetch({
      "/versions/default": () => json(RELEASE_BODY),
      "/data/indicators": (_u, n) => (n === 1 ? new Response("upstream down", { status: 503 }) : json(dataBody())),
    });
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      const r = await client.callTool({
        name: "uis_get_data",
        arguments: { indicators: ["CR.1"], geo_units: ["BRA"], provenance_mode: "detailed" },
      });
      expect(r.isError).toBeFalsy();
      const sc = r.structuredContent as Record<string, unknown>;
      expect(sc.rows_count).toBe(2);
      expect((sc.provenance as Record<string, unknown>).contract_version).toBe(provenance.contractVersion);
      expect(retrievalOf(r)).toEqual({
        requests: 2,
        attempts: 3,
        anomalies: [{ kind: "http_5xx", count: 1 }],
        unstable: true,
      });
      expect(fn).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000]);

      // Segunda consulta: a release está no cache — só a ida de dados conta.
      const r2 = await client.callTool({ name: "uis_get_data", arguments: { indicators: ["CR.1"], geo_units: ["BRA"] } });
      expect(r2.isError).toBeFalsy();
      expect(retrievalOf(r2)).toEqual(LIMPA);
    } finally {
      await client.close();
    }
  });

  it("uis_get_data: o 400 pedagógico da UIS continua chegando com a contagem exata, sem repetir", async () => {
    const { calls } = stubFetch({
      "/versions/default": () => json(RELEASE_BODY),
      "/data/indicators": () =>
        json(
          { message: "Too much data requested (124982 records), please reduce the amount of records queried to less than 100000 by using the available filter options.", error: "Bad Request", statusCode: 400 },
          400,
        ),
    });
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      const r = await client.callTool({ name: "uis_get_data", arguments: { indicators: ["CR.1", "CR.2"] } });
      expect(r.isError).toBe(true);
      expect(texto(r)).toContain("124982 records");
      expect(texto(r)).toContain("Narrow the query");
      expect(calls.filter((c) => c.url.includes("/data/indicators"))).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it("uis_get_data: 504 NÃO repete e vira erro upstream legível", async () => {
    const { calls } = stubFetch({
      "/versions/default": () => json(RELEASE_BODY),
      "/data/indicators": () => new Response("Endpoint request timed out", { status: 504 }),
    });
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      const r = await client.callTool({ name: "uis_get_data", arguments: { indicators: ["CR.1"] } });
      expect(r.isError).toBe(true);
      expect(texto(r)).toContain("UNESCO UIS upstream HTTP 504");
      expect(texto(r)).toContain("retrying later may succeed");
      expect(calls.filter((c) => c.url.includes("/data/indicators"))).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it("rede caída: 3 tentativas, erro legível com 'retrying later', não exceção crua", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fn);
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      const r = await client.callTool({ name: "uis_get_data", arguments: { indicators: ["CR.1"] } });
      expect(r.isError).toBe(true);
      expect(texto(r)).toContain("UNESCO UIS upstream unreachable");
      expect(texto(r)).toContain("fetch failed");
      expect(texto(r)).toContain("retrying later may succeed");
      expect(fn).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    } finally {
      await client.close();
    }
  });

  it("o User-Agent identificável chega ao fetch", async () => {
    const { calls } = stubFetch({
      "/versions/default": () => json(RELEASE_BODY),
      "/data/indicators": () => json(dataBody()),
    });
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      await client.callTool({ name: "uis_get_data", arguments: { indicators: ["CR.1"] } });
      for (const c of calls) {
        expect(new Headers(c.init?.headers).get("user-agent")).toContain("uis-mcp-server (https://uis.sidneybissoli.com;");
      }
    } finally {
      await client.close();
    }
  });

  it("catálogo injetado (o D1 do Worker): retrieval null — nada foi à origem", async () => {
    const client = await conectar(envMemoria(catalogoInjetado));
    try {
      const r = await client.callTool({
        name: "uis_search_indicators",
        arguments: { query: "completion rate", provenance_mode: "detailed" },
      });
      expect(r.isError).toBeFalsy();
      expect(retrievalOf(r)).toBeNull();
    } finally {
      await client.close();
    }
  });

  it("catálogo do stdio: os 3 downloads paralelos contam na 1ª busca (requests 3), nunca mais", async () => {
    const { fn } = stubFetch(ROTAS_DO_CATALOGO);
    const client = await conectar(envMemoria());
    try {
      const r1 = await client.callTool({ name: "uis_search_indicators", arguments: { query: "completion rate" } });
      expect(r1.isError).toBeFalsy();
      expect(retrievalOf(r1)).toEqual({ requests: 3, attempts: 3, anomalies: [], unstable: false });
      expect(fn).toHaveBeenCalledTimes(3);

      const r2 = await client.callTool({ name: "uis_list_geo_units", arguments: { search: "Brazil" } });
      expect(r2.isError).toBeFalsy();
      expect(retrievalOf(r2)).toBeNull();
      expect(fn).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
    }
  });

  it("catálogo do stdio com a UIS fora: erro upstream legível, não exceção crua", async () => {
    stubFetch({
      "/definitions/indicators": () => new Response("Service Unavailable", { status: 503 }),
      "/definitions/geounits": () => json(geounitsBody()),
      "/versions/default": () => json(RELEASE_BODY),
    });
    const client = await conectar(envMemoria());
    try {
      const r = await client.callTool({ name: "uis_search_indicators", arguments: { query: "completion rate" } });
      expect(r.isError).toBe(true);
      expect(texto(r)).toContain("UNESCO UIS upstream HTTP 503 (catalogue");
      expect(texto(r)).toContain("(after 3 attempts)");
      expect(texto(r)).toContain("retrying later may succeed");
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    } finally {
      await client.close();
    }
  });

  it("search/fetch (Deep Research) medem também: catálogo na 1ª busca, release + amostra no 1º fetch, depois só a amostra", async () => {
    stubFetch({
      ...ROTAS_DO_CATALOGO,
      "/data/indicators": () => json(dataBody()),
    });
    const client = await conectar(envMemoria());
    try {
      const s1 = await client.callTool({ name: "search", arguments: { query: "completion rate" } });
      expect(s1.isError).toBeFalsy();
      expect(retrievalOf(s1)).toEqual({ requests: 3, attempts: 3, anomalies: [], unstable: false });

      const s2 = await client.callTool({ name: "search", arguments: { query: "completion rate" } });
      expect(retrievalOf(s2)).toBeNull();

      // O catálogo não alimenta o cache da release: o 1º fetch resolve a release (miss) e baixa a amostra.
      const f1 = await client.callTool({ name: "fetch", arguments: { id: "ind:CR.1" } });
      expect(f1.isError).toBeFalsy();
      expect(retrievalOf(f1)).toEqual({ requests: 2, attempts: 2, anomalies: [], unstable: false });

      const f2 = await client.callTool({ name: "fetch", arguments: { id: "ind:CR.1" } });
      expect(retrievalOf(f2)).toEqual(LIMPA);
    } finally {
      await client.close();
    }
  });
});
