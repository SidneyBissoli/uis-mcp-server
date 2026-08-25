/**
 * Contrato de saída: o `structuredContent` obedece ao `outputSchema` anunciado.
 *
 * Por que este arquivo existe. O SDK v2 exige `structuredContent` em todo
 * sucesso de tool com `outputSchema`; a spec do MCP exige, além disso, que o
 * conteúdo OBEDEÇA ao schema, e cliente que valida — o MCP Inspector valida —
 * rejeita a resposta INTEIRA quando não obedece. Rodar o Inspector em
 * `tools/list` não pega nada: só `tools/call` expõe.
 *
 * Os schemas nascem do zod, então o caminho feliz passa mesmo com um schema
 * desonesto. O defeito mora nos caminhos que produzem ausência: colunas
 * anuláveis do catálogo (`last_data_update`, `record_count`, `year_min/max`,
 * `geo_types`), seleção sem registro, e campos que a UIS não publica em cada
 * registro (`magnitude`, `qualifier`, `footnotes`). Cada tool tem um caso CHEIO
 * e um caso MAGRO.
 *
 * O teste roda o servidor de verdade (`buildServer`) pelo transporte em
 * memória e valida contra o schema que o `tools/list` publica, com o mesmo
 * validador do SDK. A rede nunca é tocada.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { buildServer } from "../src/server.js";
import type { Env } from "../src/types.js";

const validador = new CfWorkerJsonSchemaValidator();

// ---------------------------------------------------------------------------
// Fontes falsas
// ---------------------------------------------------------------------------

/** D1 falso: roteia pelos trechos de SQL usados por src/uis/catalog.ts. */
function fakeDb(opts: { rows: unknown[]; total: number; retrievedAt: string | null; release?: string }): D1Database {
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: (..._params: unknown[]) => stmt,
        async first() {
          if (sql.includes("COUNT(*)")) return { n: opts.total };
          return null;
        },
        async all() {
          if (sql.includes("uis_meta")) {
            const results: Array<Record<string, string>> = [];
            if (opts.retrievedAt !== null) {
              results.push({ key: "retrieved_at", value: opts.retrievedAt });
              if (opts.release) results.push({ key: "release_version", value: opts.release });
            }
            return { results };
          }
          return { results: opts.rows };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

const INDICADOR_CHEIO = {
  code: "CR.1",
  name: "Completion rate, primary education, both sexes (%)",
  theme: "EDUCATION",
  last_data_update: "2026-02-09",
  record_count: 3000,
  year_min: 2000,
  year_max: 2024,
  geo_types: "NATIONAL,REGIONAL",
};

/**
 * Indicador com TODAS as colunas anuláveis do catálogo nulas — `uis_indicators`
 * declara `last_data_update`, `record_count`, `year_min`, `year_max` e
 * `geo_types` sem NOT NULL, então esta é a linha que o schema tem de admitir.
 */
const INDICADOR_MAGRO = {
  code: "ZZ.9",
  name: "Indicator without availability metadata",
  theme: "SCIENCE_TECHNOLOGY_INNOVATION",
  last_data_update: null,
  record_count: null,
  year_min: null,
  year_max: null,
  geo_types: null,
};

const GEO_BRA = { id: "BRA", name: "Brazil", type: "NATIONAL" };

const RELEASE_BODY = {
  version: "20260507-91260335",
  publicationDate: "2026-05-08T16:58:36.233Z",
  themeDataStatus: [{ theme: "EDUCATION", lastUpdate: "02/09/2026", description: "February 2026 Data Release" }],
};

const REGISTRO_CHEIO = {
  indicatorId: "CR.1",
  geoUnit: "BRA",
  year: 2024,
  value: 97.6,
  magnitude: null,
  qualifier: null,
  footnotes: [{ type: "Source", subtype: "Data sources", value: "PNAD-C 2024" }],
};

/** Registro como a UIS publica quando não há valor nem notas: só as chaves de eixo. */
const REGISTRO_MAGRO = { indicatorId: "CR.1", geoUnit: "BRA", year: 2024, value: null };

function stubUisFetch(dataBody: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/versions/default")) return new Response(JSON.stringify(RELEASE_BODY), { status: 200 });
      return new Response(JSON.stringify(dataBody), { status: 200 });
    }),
  );
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

interface Caso {
  nome: string;
  cobre: string;
  env: Env;
  dados: unknown;
  args: Record<string, unknown>;
}

const CATALOGO = (rows: unknown[], total: number): Env => ({
  CATALOG_DB: fakeDb({ rows, total, retrievedAt: "2026-08-07T18:00:00Z", release: "20260507-91260335" }),
});

const CASOS: Caso[] = [
  {
    nome: "uis_search_indicators",
    cobre: "indicador com disponibilidade completa",
    env: CATALOGO([INDICADOR_CHEIO], 1),
    dados: { records: [] },
    args: { query: "completion rate" },
  },
  {
    nome: "uis_search_indicators",
    cobre: "indicador com todas as colunas anuláveis nulas",
    env: CATALOGO([INDICADOR_MAGRO], 1),
    dados: { records: [] },
    args: { query: "indicator" },
  },
  {
    nome: "uis_search_indicators",
    cobre: "busca sem achado (indicators vazio, next_offset ausente)",
    env: CATALOGO([], 0),
    dados: { records: [] },
    args: { query: "zzzznaoexiste" },
  },
  {
    nome: "uis_search_indicators",
    cobre: "página intermediária (next_offset presente) + modo detailed",
    env: CATALOGO([INDICADOR_CHEIO], 50),
    dados: { records: [] },
    args: { query: "rate", limit: 1, offset: 0, provenance_mode: "detailed" },
  },
  {
    nome: "uis_list_geo_units",
    cobre: "geo unit por busca",
    env: CATALOGO([GEO_BRA], 1),
    dados: { records: [] },
    args: { search: "brazil" },
  },
  {
    nome: "uis_list_geo_units",
    cobre: "filtro sem achado (geo_units vazio)",
    env: CATALOGO([], 0),
    dados: { records: [] },
    args: { search: "zzzznaoexiste" },
  },
  {
    nome: "uis_get_data",
    cobre: "registro com footnotes",
    env: {},
    dados: { records: [REGISTRO_CHEIO] },
    args: { indicators: ["CR.1"], geo_units: ["BRA"], include_footnotes: true, provenance_mode: "detailed" },
  },
  {
    nome: "uis_get_data",
    cobre: "registro sem magnitude/qualifier/footnotes e com value nulo",
    env: {},
    dados: { records: [REGISTRO_MAGRO] },
    args: { indicators: ["CR.1"], geo_units: ["BRA"] },
  },
  {
    nome: "uis_get_data",
    cobre: "seleção sem registro (rows vazio, campo hint fora do schema)",
    env: {},
    dados: { records: [] },
    args: { indicators: ["CR.1"], geo_units: ["XKX"] },
  },
];

// ---------------------------------------------------------------------------

let schemas: Map<string, unknown>;
let clienteBase: Client;

async function conectar(env: Env): Promise<Client> {
  const server = buildServer(env);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "output-contract", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

beforeAll(async () => {
  clienteBase = await conectar({});
  const { tools } = await clienteBase.listTools();
  schemas = new Map(tools.map((t) => [t.name, t.outputSchema]));
});

afterAll(async () => {
  await clienteBase.close();
});

afterEach(() => vi.unstubAllGlobals());

describe("structuredContent obedece ao outputSchema anunciado", () => {
  it.each(CASOS.map((c) => [c.nome, c.cobre, c] as const))("%s — %s", async (nome, _cobre, caso) => {
    const schema = schemas.get(nome);
    expect(schema, `tool ${nome} sem outputSchema em tools/list`).toBeDefined();

    stubUisFetch(caso.dados);
    const client = await conectar(caso.env);
    try {
      const resultado = await client.callTool({ name: nome, arguments: caso.args });
      const texto = (resultado.content as Array<{ text?: string }> | undefined)?.[0]?.text;
      expect(resultado.isError, `${nome} devolveu erro: ${texto}`).toBeFalsy();
      expect(resultado.structuredContent, `${nome} sem structuredContent`).toBeDefined();

      // Valida o que o CLIENTE vê: o `structuredContent` atravessa como JSON, e
      // `JSON.stringify` apaga chave cujo valor é `undefined` — num campo
      // obrigatório isso é "missing required property" do outro lado. O
      // transporte em memória não serializa, então serializa-se aqui.
      const noFio = JSON.parse(JSON.stringify(resultado.structuredContent)) as unknown;
      const veredicto = validador.getValidator(schema as never)(noFio);
      expect(veredicto.valid, `${nome}: ${veredicto.errorMessage}`).toBe(true);
    } finally {
      await client.close();
    }
  });

  /**
   * Um teste que não pode falhar não vale nada: uma saída REAL contra um schema
   * deliberadamente desonesto — a mentira exata que este arquivo existe para
   * pegar (campo anulável anunciado como string).
   */
  it("reprova um schema desonesto (prova de que o portão pode falhar)", async () => {
    stubUisFetch({ records: [] });
    const client = await conectar(CATALOGO([INDICADOR_MAGRO], 1));
    try {
      const resultado = await client.callTool({ name: "uis_search_indicators", arguments: { query: "indicator" } });
      const honesto = schemas.get("uis_search_indicators") as Record<string, unknown>;
      expect(validador.getValidator(honesto as never)(resultado.structuredContent).valid).toBe(true);

      const desonesto = JSON.parse(JSON.stringify(honesto)) as {
        properties: { indicators: { items: { properties: Record<string, unknown> } } };
      };
      desonesto.properties.indicators.items.properties.last_data_update = { type: "string" };

      const veredicto = validador.getValidator(desonesto as never)(resultado.structuredContent);
      expect(veredicto.valid).toBe(false);
      expect(veredicto.errorMessage).toContain("last_data_update");
    } finally {
      await client.close();
    }
  });

  it("toda tool anunciada declara outputSchema e tem ao menos um caso", async () => {
    const { tools } = await clienteBase.listTools();
    const cobertas = new Set(CASOS.map((c) => c.nome));
    const semCaso = tools.map((t) => t.name).filter((n) => !cobertas.has(n));
    expect(semCaso, `tools sem caso de contrato: ${semCaso.join(", ")}`).toEqual([]);
    for (const t of tools) expect(t.outputSchema, `${t.name} sem outputSchema`).toBeDefined();
    expect(tools).toHaveLength(3);
  });
});
