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
import { resetIndex } from "../src/tools/deep-research.js";
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
  framework_id: "UIS-SDG4Monitoring",
  group_id: "IG-CR",
  group_name: "Completion rate",
};

/**
 * Indicador com TODAS as colunas anuláveis do catálogo nulas — `uis_indicators`
 * declara `last_data_update`, `record_count`, `year_min`, `year_max`,
 * `geo_types` e as três colunas do Data Browser sem NOT NULL, então esta é a
 * linha que o schema tem de admitir. Sem `year_max`, o `fetch` de Deep Research
 * não amostra dados (zero chamadas ao upstream).
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
  framework_id: null,
  group_id: null,
  group_name: null,
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

function stubUisFetch(dataBody: unknown) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/versions/default")) return new Response(JSON.stringify(RELEASE_BODY), { status: 200 });
    return new Response(JSON.stringify(dataBody), { status: 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
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
  // Deep Research (ChatGPT): o índice nasce da listagem do catálogo (mesmo fakeDb —
  // qualquer `.all()` fora de uis_meta devolve as linhas) e o `fetch` amostra
  // dados pelo mesmo stub de rede das uis_*.
  {
    nome: "search",
    cobre: "busca com achado (indicador cheio e magro no índice)",
    env: CATALOGO([INDICADOR_CHEIO, INDICADOR_MAGRO], 2),
    dados: { records: [] },
    args: { query: "completion rate" },
  },
  {
    nome: "search",
    cobre: "busca sem achado (results vazio)",
    env: CATALOGO([INDICADOR_CHEIO], 1),
    dados: { records: [] },
    args: { query: "zzzznaoexiste" },
  },
  {
    nome: "fetch",
    cobre: "indicador cheio — documento com amostra de dados (1 chamada à Data API)",
    env: CATALOGO([INDICADOR_CHEIO], 1),
    dados: { records: [REGISTRO_CHEIO, REGISTRO_MAGRO] },
    args: { id: "ind:CR.1" },
  },
  {
    nome: "fetch",
    cobre: "indicador cheio — amostra sem registro",
    env: CATALOGO([INDICADOR_CHEIO], 1),
    dados: { records: [] },
    args: { id: "ind:CR.1" },
  },
  {
    nome: "fetch",
    cobre: "indicador magro — sem year_max não há amostra nem chamada ao upstream",
    env: CATALOGO([INDICADOR_MAGRO], 1),
    dados: { records: [] },
    args: { id: "ind:ZZ.9" },
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

afterEach(() => {
  vi.unstubAllGlobals();
  // O índice de search/fetch é de módulo (24 h): cada caso monta o seu do próprio fakeDb.
  resetIndex();
});

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
    expect(tools).toHaveLength(5);
  });

  /**
   * Os dois lados do contrato Deep Research que o schema não prova: o `fetch`
   * de id desconhecido é erro (sem tocar a rede) e o de id conhecido traz o
   * bloco de proveniência da AMOSTRA (chamada real à Data API, release fixada)
   * — a proveniência viaja em `structuredContent`, não no texto, que é o JSON
   * do contrato.
   */
  it("fetch: id desconhecido é erro sem rede; id conhecido carrega a proveniência da amostra", async () => {
    const fetchSpy = stubUisFetch({ records: [REGISTRO_CHEIO] });
    const client = await conectar(CATALOGO([INDICADOR_CHEIO], 1));
    try {
      const desconhecido = await client.callTool({ name: "fetch", arguments: { id: "ind:NAO.EXISTE" } });
      expect(desconhecido.isError).toBe(true);
      expect((desconhecido.content as Array<{ text: string }>)[0]?.text).toContain("ind:NAO.EXISTE");
      expect(fetchSpy).not.toHaveBeenCalled();

      const conhecido = await client.callTool({ name: "fetch", arguments: { id: "ind:CR.1" } });
      expect(conhecido.isError).toBeFalsy();
      const sc = conhecido.structuredContent as {
        id: string;
        url: string;
        text: string;
        provenance: { source_url: string; data_vintage: string; citation: string; license: string };
      };
      expect(sc.id).toBe("ind:CR.1");
      expect(sc.url).toBe("https://databrowser.uis.unesco.org/view#indicatorPaths=UIS-SDG4Monitoring%3A0%3ACR.1");
      expect(sc.text).toContain("| BRA | 2024 | 97.6 |");
      expect(sc.provenance.source_url).toContain("indicator=CR.1");
      expect(sc.provenance.source_url).toContain("version=20260507-91260335");
      expect(sc.provenance.data_vintage).toBe("20260507-91260335 (published 2026-05-08)"); // release da amostra, não do seed
      expect(sc.provenance.license).toBe("CC-BY-SA-4.0"); // modo conciso: license é o id
      expect(sc.provenance.citation).toContain("date of extraction");
      const texto = (conhecido.content as Array<{ text: string }>)[0]!.text;
      expect(JSON.parse(texto)).toMatchObject({ id: "ind:CR.1" }); // content = JSON do contrato, sem rodapé
    } finally {
      await client.close();
    }
  });
});
