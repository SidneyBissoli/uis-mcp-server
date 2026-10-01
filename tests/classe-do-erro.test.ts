/**
 * A classe do erro sai do TIPO da falha da origem, não da frase.
 *
 * Medido em 30/09/2026, rodando `classifyError` sobre o texto que `toToolError`
 * monta: toda falha de origem (timeout, rede, abort, 429, 5xx, 4xx, 404, corpo
 * que não é JSON) saía `contrato` — o sufixo "not an invalid query" casa
 * `\binvalid` no ramo de contrato, e `contrato` fica FORA da taxa de erro do
 * painel. O teste atravessa o caminho do hook — tradução do `UpstreamError`,
 * `toToolError`, `withUsage` — porque a frase de cada fragmento sempre esteve
 * certa; o texto MONTADO é que não estava.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError, type UpstreamErrorKind } from "@sbissoli/mcp-upstream";
import { translateUpstreamError } from "../src/uis/upstream.js";
import { UisUserError } from "../src/uis/api.js";
import { withToolErrors } from "../src/tools/errors.js";
import { withUsage } from "../src/usage-wrap.js";
import { uisGetDataHandler } from "../src/tools/uis.js";
import { CLASSE_DO_ERRO } from "../src/call-shape.js";
import type { Env } from "../src/types.js";

async function classeGravada(erro: unknown): Promise<{ classe: string; result: unknown }> {
  const classes: string[] = [];
  const handler = withUsage(
    "uis_get_data",
    (kind, _name, forma) => {
      if (kind === "tool_error" && forma) classes.push(forma.classe);
    },
    withToolErrors(async () => {
      throw erro;
    }),
  );
  const result = await handler({ indicator: "X" });
  expect(classes).toHaveLength(1);
  return { classe: classes[0] ?? "", result };
}

function falha(kind: UpstreamErrorKind, status?: number, body?: string): unknown {
  return translateUpstreamError(
    new UpstreamError({
      url: "https://api.uis.unesco.org/api/public/data/indicators",
      kind,
      status,
      body,
      retryable: kind !== "not_found",
      transport: status === undefined,
      attempts: 3,
      cause: kind === "network" ? new TypeError("fetch failed") : undefined,
    }),
    "data X",
  );
}

describe("falha da UIS é `fonte`, nunca `contrato`", () => {
  const casos: Array<[string, unknown]> = [
    ["timeout", falha("timeout")],
    ["rede", falha("network")],
    ["abort", falha("aborted")],
    ["429 com o corpo que diz 'Too Many Requests'", falha("rate_limited", 429, "Too Many Requests")],
    ["503", falha("http_5xx", 503, "<html>Service Unavailable</html>")],
    ["400", falha("http_4xx", 400, "Bad request")],
    ["corpo que não é JSON", falha("malformed_body", 200)],
  ];
  for (const [nome, erro] of casos) {
    it(nome, async () => {
      const { classe, result } = await classeGravada(erro);
      // O texto ao usuário continua o de sempre, com o sufixo.
      expect(JSON.stringify(result)).toContain("not an invalid query");
      expect(classe).toBe("fonte");
    });
  }
});

describe("o que não é falha da origem continua como era", () => {
  it("404 da origem é ausência respondida", async () => {
    expect((await classeGravada(falha("not_found", 404))).classe).toBe("nao_encontrado");
  });

  it("erro de USO é `contrato` por declaração (a instrução ao chamador)", async () => {
    const { classe } = await classeGravada(
      new UisUserError("The query is too broad. Narrow it: fewer areas (maximum 30 per call)."),
    );
    expect(classe).toBe("contrato");
  });
});

/**
 * Erro de USO com a classe DECLARADA, atravessando o handler real da tool
 * (fetch trocado por stub, nenhuma rede). Antes, `toToolError` devolvia o
 * erro de uso sem classe e o hook caía na frase — que ecoa o argumento.
 */
describe("erro de uso: a classe é a declarada, não a da frase", () => {
  afterEach(() => vi.unstubAllGlobals());

  const RELEASE = {
    version: "20260507-91260335",
    publicationDate: "2026-05-08T16:58:36.233Z",
    themeDataStatus: [{ theme: "EDUCATION", lastUpdate: "02/09/2026", description: "February 2026 Data Release" }],
  };

  function stubUis(dataBody: unknown, dataStatus = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/versions/default")
          ? new Response(JSON.stringify(RELEASE), { status: 200 })
          : new Response(JSON.stringify(dataBody), { status: dataStatus }),
      ),
    );
  }

  async function classeDoGetData(args: { indicators: string[]; geo_units?: string[] }) {
    const classes: string[] = [];
    const h = withUsage(
      "uis_get_data",
      (kind, _n, forma) => {
        if (kind === "tool_error" && forma) classes.push(forma.classe);
      },
      uisGetDataHandler({} as Env),
    );
    const result = await h(args);
    expect(classes).toHaveLength(1);
    return { classe: classes[0] ?? "", result };
  }

  it("RISCO: código que a UIS diz não existir é `nao_encontrado`, mesmo ecoando \"LR.INVALID\"", async () => {
    stubUis({
      records: [],
      hints: [{ code: "UIS::HINT::001", message: "The indicator could not be found, LR.INVALID" }],
    });
    const { classe, result } = await classeDoGetData({ indicators: ["LR.INVALID"], geo_units: ["BRA"] });
    expect(JSON.stringify(result)).toContain("LR.INVALID");
    expect(JSON.stringify(result)).toContain("was not found in the current UIS release");
    expect(classe).toBe("nao_encontrado");
  });

  it("400 da UIS (recorte grande demais) é `contrato`, declarado", async () => {
    stubUis({ message: "The query would return 250000 records, more than the 100000 limit." }, 400);
    const { classe, result } = await classeDoGetData({ indicators: ["CR.1"] });
    expect(JSON.stringify(result)).toContain("Narrow the query");
    expect(classe).toBe("contrato");
  });

  it("o erro de uso também leva a classe anexada, fora do fio", async () => {
    const { result } = await classeGravada(new UisUserError("Empty query: pass one or more search terms."));
    expect((result as { [CLASSE_DO_ERRO]?: unknown })[CLASSE_DO_ERRO]).toBe("contrato");
    expect(Object.keys(result as object).sort()).toEqual(["content", "isError"]);
  });
});

describe("a classe viaja FORA do fio", () => {
  it("o resultado serializado não ganha chave nenhuma", async () => {
    const { result } = await classeGravada(falha("timeout"));
    expect(Object.keys(result as object).sort()).toEqual(["content", "isError"]);
  });
});
