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
 * Desde 04/10/2026 o teste tem FORMA DE CLIENTE (ideia de leitor,
 * https://dev.to/arhancanli/comment/3g4i4): o servidor de verdade
 * (`buildServer`) é interrogado pelo `Client` do SDK, que faz `tools/list` e
 * `tools/call` e reprova o resultado contra o schema LISTADO — o teste falha
 * como a sessão do usuário falharia, sem validador escolhido por nós.
 *
 * A armadilha que isto fecha, e que este arquivo tinha: o `Client` só valida
 * contra o schema que tem em cache do `tools/list`. Cada caso abria um cliente
 * novo e chamava `callTool` direto, sem `listTools` — a validação do cliente
 * estava DESLIGADA, e quem validava era um `CfWorkerJsonSchemaValidator` nosso,
 * sobre um `structuredContent` serializado à mão. O circuito agora é o
 * `@sbissoli/mcp-surface/cliente`, comum aos sete servidores: `tools/list`
 * uma vez por conexão antes do `tools/call`, e toda mensagem do servidor
 * passa por JSON antes de chegar ao cliente, como passaria pela rede. A rede
 * de verdade nunca é tocada.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { chamarComoCliente, conectarComoCliente, controlesNegativos } from "@sbissoli/mcp-surface/cliente";
import { buildServer } from "../src/server.js";
import { resetIndex } from "../src/tools/deep-research.js";
import type { Env } from "../src/types.js";

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

/** Conexão no percurso do cliente (JSON no fio), sobre o servidor de verdade. */
function conectar(env: Env): Promise<Client> {
  return conectarComoCliente(buildServer(env));
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
      // Percurso do cliente: tools/list → tools/call, e o `Client` reprova o
      // resultado contra o schema listado. O que ele vê é o que atravessou como
      // JSON: `JSON.stringify` apaga chave cujo valor é `undefined` — num campo
      // obrigatório isso é "missing required property" do outro lado. O helper
      // serializa cada mensagem, porque o transporte em memória não serializa.
      // Lança se o cliente reprovar ou se a tool responder isError.
      const resultado = await chamarComoCliente(client, nome, caso.args);
      expect(resultado.structuredContent, `${nome} sem structuredContent`).toBeDefined();
    } finally {
      await client.close();
    }
  });

  /**
   * Um teste que não pode falhar não vale nada. Controle negativo pelo lado do
   * RESULTADO, no percurso do cliente: o servidor responde certo e o resultado
   * é quebrado NO FIO, entre servidor e cliente — como chegaria de um servidor
   * com defeito. Cada quebra tem de fazer a chamada FALHAR. As quebras saem do
   * schema listado (structuredContent ausente, cada obrigatório ausente, tipo
   * trocado); o último veredito é a armadilha: sem `tools/list` antes, o
   * `Client` não valida — se o SDK mudar isso, o veredito acusa.
   *
   * A do campo a mais só vale onde o schema FECHA o objeto. Medido em
   * 04/10/2026: o nível de cima de `uis_search_indicators` é aberto
   * (`looseObject` — cabe proveniência e o que vier), e ali um campo a mais
   * passa; cada item de `indicators` é `z.object`, publicado com
   * `additionalProperties: false`, e o recusa.
   */
  it("o validador do cliente reprova resultado quebrado no fio (uis_search_indicators)", async () => {
    const env = CATALOGO([INDICADOR_CHEIO], 1);
    const vs = await controlesNegativos(() => buildServer(env), "uis_search_indicators", { query: "completion rate" }, [
      {
        descricao: "campo que o schema proíbe, onde ele fecha o objeto (indicators[0])",
        adulterar: (r) => {
          const itens = r.structuredContent?.indicators as Array<Record<string, unknown>> | undefined;
          if (itens?.[0]) itens[0].intruso = 1;
        },
      },
    ]);
    expect(vs.length).toBeGreaterThanOrEqual(4);
    for (const v of vs) expect(v.obtido, `${v.descricao}: ${v.mensagem ?? ""}`).toBe(v.esperado);
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
   * Parâmetro que não existe tem de ser RECUSADO, nunca descartado em silêncio.
   *
   * Sem `.strict()`, o zod tira a chave desconhecida, aplica o default do
   * parâmetro que faltou e a tool responde OUTRA pergunta com cara de resposta.
   * Medido no irmão ibge em 11/09/2026: `periodo` no singular, que o esquema
   * não tem, devolveu a população de 2026 para uma pergunta sobre 2023, sem
   * nenhum aviso. Resposta errada é pior que erro — erro o modelo corrige na
   * chamada seguinte, resposta errada vira número em relatório.
   *
   * Vale para TODA tool anunciada, `search`/`fetch` inclusive: o contrato é
   * da OpenAI e quem os registra é `@sbissoli/mcp-search`, que desde a 0.9.0
   * publica os dois esquemas estritos. Antes disso esta varredura só olhava as
   * `uis_*`, e a chave desconhecida em `search` sumia em silêncio.
   */
  it("toda tool anunciada recusa parâmetro que não existe", async () => {
    const { tools } = await clienteBase.listTools();

    expect(tools.length).toBeGreaterThanOrEqual(5);
    for (const t of tools) {
      const schema = t.inputSchema as { additionalProperties?: unknown };
      expect(schema.additionalProperties, `${t.name} aceita chave desconhecida`).toBe(false);
    }
  });

  it("a recusa NOMEIA a chave, para o modelo se corrigir sozinho", async () => {
    const r = await clienteBase.callTool({
      name: "uis_search_indicators",
      arguments: { query: "literacy", limite: 5 },
    });

    expect(r.isError).toBe(true);
    const texto = Array.isArray(r.content)
      ? r.content.map((c) => ("text" in c ? c.text : "")).join(" ")
      : "";
    expect(texto).toContain("limite");
  });

  it("`search` também recusa chave desconhecida e a NOMEIA", async () => {
    const r = await clienteBase.callTool({
      name: "search",
      arguments: { query: "literacy", year: 2020 },
    });

    expect(r.isError).toBe(true);
    const texto = Array.isArray(r.content)
      ? r.content.map((c) => ("text" in c ? c.text : "")).join(" ")
      : "";
    expect(texto).toContain("year");
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

      const conhecido = await chamarComoCliente(client, "fetch", { id: "ind:CR.1" });
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
