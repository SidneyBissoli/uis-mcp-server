import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyError, errorText, paramNames } from "../src/call-shape.js";
import { withAnalytics, tagRequest } from "../src/analytics.js";
import { withUsage } from "../src/usage-wrap.js";
import type { RecordUsage } from "../src/usage-core.js";

/**
 * A FORMA da chamada (blobs 7 e 8), ligada aqui porque este servidor nao tinha Analytics
 * Engine nenhum: so o UsageTracker, que conta chamadas e erros por tool e por
 * dia, sem contexto de requisicao nem motivo da falha.
 *
 * O teste que mais importa é a GUARDA: ela varre as mensagens de erro do
 * próprio `src/` e reprova se alguma cair em `outro`. Quando passei o
 * classificador por este repositório pela primeira vez, 3 das 4 não tinham
 * classe — as mensagens daqui são em inglês e o vocabulário tinha nascido das
 * mensagens em português dos servidores irmãos. Uma lista de literais copiados
 * aqui fossilizaria o dia da varredura; a guarda continua verdadeira sozinha.
 */

// O fecho exigido é `);` e não `)`: com o parêntese solto o casamento para no
// primeiro parêntese DENTRO da mensagem (um "(e.g. ...)") e a varredura perde a
// mensagem inteira — foi assim que ela mostrou 2 mensagens onde havia 4.
const CHAMADA = /new Uis(?:User|Upstream)Error\(([\s\S]{10,1200}?)\n?\s*\);/g;
const LITERAL = /(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;
/** Mensagem que só repassa o texto de cima; o sinal chega em execução. */
const REPASSE = /:\s*X\.?$/;

function mensagensDeErro(): string[] {
  const achadas = new Set<string>();
  const ande = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        ande(caminho);
        continue;
      }
      if (!entrada.endsWith(".ts") || entrada.includes(".test.")) continue;
      for (const chamada of readFileSync(caminho, "utf8").matchAll(CHAMADA)) {
        const partes = [...(chamada[1] ?? "").matchAll(LITERAL)].map((p) => p[2] ?? "");
        if (partes.length === 0) continue;
        const texto = partes.join("").replace(/\$\{[^}]*\}/g, "X").replace(/\s+/g, " ").trim();
        // Exige espaço: literais colados sem prosa não são mensagem.
        if (texto.length > 15 && /\s/.test(texto)) achadas.add(texto);
      }
    }
  };
  ande(new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  return [...achadas];
}

describe("guarda: as mensagens deste servidor são classificáveis", () => {
  const mensagens = mensagensDeErro();

  it("a varredura encontra as mensagens (senão a guarda passaria vazia)", () => {
    expect(mensagens.length).toBeGreaterThan(2);
  });

  it("nenhuma mensagem própria cai em `outro`", () => {
    const orfas = mensagens.filter((m) => !REPASSE.test(m) && classifyError(m) === "outro");
    expect(orfas, `sem classe:\n${orfas.map((m) => `  - ${m}`).join("\n")}`).toEqual([]);
  });
});

describe("classifyError separa a bifurcação do conserto", () => {
  it("a chamada precisa mudar — as três famílias daqui são contrato", () => {
    expect(classifyError('Empty query: pass one or more search terms (e.g. "literacy rate youth").')).toBe(
      "contrato",
    );
    expect(classifyError("Too many indicators (9) — maximum 5 per call.")).toBe("contrato");
    expect(
      classifyError("The query matched 9000 records — more than the 5000 this tool returns per call. Narrow it."),
    ).toBe("contrato");
  });

  it("chamou certo com um valor que não resolve é nao_encontrado", () => {
    expect(classifyError('Indicator "XX.INVENTADO" not found in the UIS catalog.')).toBe("nao_encontrado");
    expect(classifyError("The UIS API returned an empty response")).toBe("nao_encontrado");
  });

  it("`empty query` é contrato, `empty response` é nao_encontrado", () => {
    // A distinção custou uma correção: o radical `empty` solto mandava a
    // consulta vazia (parâmetro que falta) para a classe errada.
    expect(classifyError("Empty query: pass one or more search terms.")).toBe("contrato");
    expect(classifyError("The UIS API returned an empty response")).toBe("nao_encontrado");
  });

  it("a fonte falhou ou demorou é fonte", () => {
    expect(classifyError("Upstream (UIS) failure: timeout")).toBe("fonte");
    expect(classifyError("The UIS API returned 503")).toBe("fonte");
  });
});

describe("paramNames nunca deixa passar valor", () => {
  it("devolve os NOMES, em ordem", () => {
    const s = paramNames({ indicators: "XX.1", geo_units: "BRA", start_year: "2015" });
    expect(s).toBe("geo_units,indicators,start_year");
    expect(s).not.toContain("BRA");
    expect(s).not.toContain("2015");
  });

  it("aguenta chamada sem argumento, estranha ou com array", () => {
    expect(paramNames([])).toBe("");
    expect(paramNames([null])).toBe("");
    expect(paramNames(["texto"])).toBe("");
    expect(paramNames([["a", "b"]])).toBe("");
  });
});

describe("a forma ATRAVESSA de withUsage até o blob", () => {
  interface Ponto {
    indexes?: string[];
    blobs?: string[];
    doubles?: number[];
  }

  function fake() {
    const points: Ponto[] = [];
    return {
      points,
      dataset: { writeDataPoint: (p: Ponto) => points.push(p) } as unknown as AnalyticsEngineDataset,
    };
  }

  const tag = tagRequest(new Request("https://example.com/mcp"));

  /**
   * O teste de costura. Cada lado passa sozinho; o que perde o argumento é o
   * adaptador entre eles, e TypeScript aceita uma seta de aridade menor onde se
   * espera uma maior. No medical isso subiu para produção gravando vazio.
   */
  it("êxito: nomes gravados, classe vazia", async () => {
    const a = fake();
    const rec: RecordUsage = withAnalytics(() => {}, a.dataset, tag);
    const tool = withUsage("uis_get_data", rec, async () => ({ ok: true }));
    await tool({ indicators: "XX.1", geo_units: "BRA" });
    await Promise.resolve();
    expect(a.points[0]?.blobs?.[1]).toBe("ok");
    expect(a.points[0]?.blobs?.[6]).toBe("");
    expect(a.points[0]?.blobs?.[7]).toBe("geo_units,indicators");
  });

  it("erro: a classe sai da mensagem e os nomes sobrevivem", async () => {
    const a = fake();
    const rec: RecordUsage = withAnalytics(() => {}, a.dataset, tag);
    const tool = withUsage("uis_get_data", rec, async () => ({
      isError: true,
      content: [{ type: "text", text: 'Indicator "XX.INVENTADO" not found in the UIS catalog.' }],
    }));
    await tool({ indicators: "XX.1" });
    await Promise.resolve();
    expect(a.points).toHaveLength(1);
    expect(a.points[0]?.blobs?.[1]).toBe("error");
    expect(a.points[0]?.blobs?.[6]).toBe("nao_encontrado");
    expect(a.points[0]?.blobs?.[7]).toBe("indicators");
  });

  it("exceção relançada também vira classe", async () => {
    const a = fake();
    const rec: RecordUsage = withAnalytics(() => {}, a.dataset, tag);
    const tool = withUsage("uis_get_data", rec, async () => {
      throw new Error("Too many indicators (9) — maximum 5 per call.");
    });
    await expect(tool({ indicators: "XX.1" })).rejects.toThrow();
    await Promise.resolve();
    expect(a.points[0]?.blobs?.[6]).toBe("contrato");
  });

  it("NENHUM blob carrega valor de parâmetro", async () => {
    const a = fake();
    const rec: RecordUsage = withAnalytics(() => {}, a.dataset, tag);
    const tool = withUsage("uis_search_indicators", rec, async () => ({ ok: true }));
    await tool({ query: "literacy rate youth in a small country", geo_units: "BRA" });
    await Promise.resolve();
    const blobs = (a.points[0]?.blobs ?? []).join("|");
    expect(blobs).not.toContain("literacy rate youth in a small country");
    expect(blobs).not.toContain("BRA");
    expect(blobs).toContain("geo_units,query");
  });
});

describe("errorText lê o texto que o handler devolveu", () => {
  it("o erro daqui é texto puro em content[0]", () => {
    expect(errorText({ content: [{ type: "text", text: "failed" }], isError: true })).toBe("failed");
  });

  it("não quebra sem conteúdo", () => {
    expect(errorText({})).toBe("");
    expect(errorText(null)).toBe("");
    expect(errorText({ content: [] })).toBe("");
  });
});
