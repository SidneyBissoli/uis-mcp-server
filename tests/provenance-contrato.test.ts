/**
 * A versão do contrato de proveniência que o servidor EMITE, e o terreno da v1.3.
 *
 * Por que este arquivo existe. A lib `@sbissoli/mcp-provenance` 0.4.0 publica o contrato
 * v1.3 mas emite 1.1 por padrão; o servidor escolhe a versão no contexto (contrato §8,
 * rollout em dois tempos). Três coisas podem dar errado em silêncio, e cada uma tem um
 * caso aqui:
 *
 * - um texto mostrar ao cliente a versão PADRÃO da lib (`CONTRACT_VERSION`) em vez da
 *   escolhida pelo servidor (`provenance.contractVersion`) — a resource
 *   `uis://guide/provenance` interpola a versão;
 * - ligar a 1.2 mudar o que o leitor recebe numa resposta de uma parte só (as tools de
 *   catálogo): o `concise` e o rodapé têm de sair byte a byte iguais aos da 1.1. (As que
 *   fundem partes — `uis_get_data`, `fetch` — levam `field_sources` desde a 1.5.1; ver
 *   tests/retrieved-at-mais-antigo.test.ts);
 * - a `revision` decidida (`current` + a nota que o servidor já publica) não chegar ao
 *   canônico — chave que a lib não conhece some sem erro (contrato §8), então se assere a
 *   PRESENÇA;
 * - o esquema LISTADO recusar um bloco 1.3 completo, o que derrubaria toda chamada no dia
 *   em que o servidor ligar a 1.3 (foi o que um bloco transcrito à mão fez em 26/09).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/client/validators/cf-worker";
import {
  CONTRACT_VERSION,
  createProvenanceContext,
  type CanonicalProvenance,
} from "@sbissoli/mcp-provenance";
import { conectarComoCliente } from "@sbissoli/mcp-surface/cliente";
import { PROVENANCE_OPTIONS, SERVER_CONFIG } from "../src/config.js";
import { provenanceMarkdown } from "../src/resources.js";
import { buildServer } from "../src/server.js";
import { noticesFromUisRecords } from "../src/tools/uis.js";
import { UIS_REVISION, provenance, uisProvenance } from "../src/uis/provenance.js";

/**
 * Um bloco de UMA parte só, com avisos da UIS (qualifier/magnitude). Até a 1.5.0 era
 * "como o de `uis_get_data`"; desde a 1.5.1 o de `uis_get_data` junta release + dados e
 * leva `field_sources` (tests/retrieved-at-mais-antigo.test.ts). O que se prende aqui é a
 * regra da lib para resposta sem fusão — a das tools de catálogo.
 */
function blocoDeDados(): CanonicalProvenance {
  return uisProvenance({
    dataset: { id: "CR.1", version: "20260507-91260335", name: null },
    dimensionKey: { indicator: "CR.1", geoUnit: "BRA" },
    dataVintage: "20260507-91260335 (published 2026-05-07)",
    retrievedAt: "2026-10-08T12:00:00Z",
    sourceUrl: "https://api.uis.unesco.org/api/public/data/indicators?indicator=CR.1&geoUnit=BRA&version=20260507-91260335",
    servedFromCache: false,
    notices: noticesFromUisRecords([
      { indicatorId: "CR.1", geoUnit: "BRA", year: 2022, value: 90.1, qualifier: "UIS_EST" },
      { indicatorId: "CR.1", geoUnit: "BRA", year: 2023, value: 91.2, magnitude: "NA" },
    ] as never),
  });
}

describe("a versão do contrato é a escolhida pelo servidor", () => {
  it("o servidor emite 1.2 — não o padrão da lib", () => {
    expect(provenance.contractVersion).toBe("1.2");
    expect(PROVENANCE_OPTIONS.contractVersion).toBe(provenance.contractVersion);
    // Se o padrão da lib um dia for 1.2, o caso abaixo deixa de provar a origem.
    expect(CONTRACT_VERSION).not.toBe(provenance.contractVersion);
  });

  it("a resource de proveniência mostra a versão do contexto, não a constante da lib", () => {
    const md = provenanceMarkdown();
    expect(md).toContain(`(contract v${provenance.contractVersion})`);
    expect(md).not.toContain(`contract v${CONTRACT_VERSION}`);
  });

  it("o bloco carrega a versão do contexto", () => {
    expect(blocoDeDados().contract_version).toBe(provenance.contractVersion);
    expect((provenance.render(blocoDeDados(), "detailed") as unknown as Record<string, unknown>).contract_version).toBe(provenance.contractVersion);
  });
});

describe("ligar a 1.2 não muda o bloco de uma parte só (sem fusão de sub-fontes)", () => {
  it("concise e rodapé byte a byte iguais aos da 1.1", () => {
    const p12 = blocoDeDados();
    const p11 = { ...p12, contract_version: "1.1" } as CanonicalProvenance;
    expect(JSON.stringify(provenance.render(p12, "concise"))).toBe(JSON.stringify(provenance.render(p11, "concise")));
    expect(provenance.footer(p12)).toBe(provenance.footer(p11));
  });

  it("nem field_sources nem as chaves da 1.3 saem no concise", () => {
    const c = provenance.render(blocoDeDados(), "concise") as unknown as Record<string, unknown>;
    expect(Object.keys(c)).toEqual([
      "source",
      "source_url",
      "data_vintage",
      "retrieved_at",
      "retrieval",
      "citation",
      "license",
    ]);
  });

  it("no detailed, só o contract_version muda; revision fica de fora até a 1.3", () => {
    const p12 = blocoDeDados();
    const d12 = provenance.render(p12, "detailed") as unknown as Record<string, unknown>;
    const d11 = provenance.render({ ...p12, contract_version: "1.1" } as CanonicalProvenance, "detailed") as unknown as Record<string, unknown>;
    expect({ ...d12, contract_version: "1.1" }).toEqual(d11);
    expect("revision" in d12).toBe(false);
  });
});

describe("revision: current, com a nota que o servidor já publica", () => {
  it("o canônico carrega a revisão decidida", () => {
    expect(blocoDeDados().revision).toEqual({ status: "current", note: UIS_REVISION.note });
    expect(UIS_REVISION.status).toBe("current");
  });

  it("a nota não afirma nada novo: o trecho está nas instructions do servidor", () => {
    expect(SERVER_CONFIG.instructions).toContain("a new release can revise past years (new national data, re-estimation)");
    expect(UIS_REVISION.note).toContain("a new release can revise past years (new national data, re-estimation)");
  });

  it("derived segue false: o servidor não transforma valores (ShareAlike intacto)", () => {
    const p = blocoDeDados();
    expect(p.derived).toBe(false);
    expect(p.license.id).toBe("CC-BY-SA-4.0");
  });
});

/**
 * O que a 1.3 vai mostrar ao ligar (prévia, mesmo bloco): os avisos da UIS sobem ao
 * concise e ganham linha no rodapé; `current` não ganha linha (contrato §6).
 */
describe("prévia da 1.3 sobre o mesmo bloco", () => {
  it("notices e revision chegam ao concise; o rodapé ganha só a linha dos avisos", () => {
    const p13 = { ...blocoDeDados(), contract_version: "1.3" } as CanonicalProvenance;
    const c = provenance.render(p13, "concise") as unknown as Record<string, unknown>;
    expect(c.notices).toEqual(["Magnitude NA: 1 record(s)", "Qualifier UIS_EST: 1 record(s)"]);
    expect(c.revision).toEqual({ status: "current", note: UIS_REVISION.note });
    expect("derived" in c).toBe(false);
    const rodape = provenance.footer(p13);
    expect(rodape).toContain("Magnitude NA: 1 record(s); Qualifier UIS_EST: 1 record(s)");
    expect(rodape).not.toContain(UIS_REVISION.note);
  });
});

describe("o esquema LISTADO aceita um bloco 1.3 completo (tempo 1 da 1.3 no ar)", () => {
  let client: Client;
  let schemas: Map<string, Record<string, unknown>>;

  beforeAll(async () => {
    client = await conectarComoCliente(buildServer({}));
    const { tools } = await client.listTools();
    schemas = new Map(tools.map((t) => [t.name, t.outputSchema as Record<string, unknown>]));
  });

  afterAll(async () => {
    await client.close();
  });

  it("as quatro chaves da 1.3, concise e detailed, em toda tool que declara provenance", () => {
    const ctx13 = createProvenanceContext({ ...PROVENANCE_OPTIONS, contractVersion: "1.3" });
    const base = blocoDeDados();
    const p13 = ctx13.build({
      source: base.source,
      source_url: base.source_url,
      citation: base.citation,
      license: base.license,
      retrieved_at: base.retrieved_at,
      data_vintage: base.data_vintage,
      notices: base.notices,
      derived: true,
      derivation_note: "synthetic block for the schema test only",
      revision: UIS_REVISION,
    });
    const concise = ctx13.render(p13, "concise") as unknown as Record<string, unknown>;
    for (const k of ["notices", "derived", "derivation_note", "revision"]) expect(concise).toHaveProperty(k);

    const validador = new CfWorkerJsonSchemaValidator();
    const comProv = [...schemas].filter(
      ([, s]) => (s?.properties as Record<string, unknown> | undefined)?.provenance !== undefined,
    );
    expect(comProv.map(([n]) => n)).toEqual(expect.arrayContaining(["uis_search_indicators", "uis_list_geo_units", "uis_get_data"]));
    for (const [nome, s] of comProv) {
      const provSchema = (s.properties as Record<string, unknown>).provenance;
      for (const modo of ["concise", "detailed"] as const) {
        const v = validador.getValidator(provSchema as never)(ctx13.render(p13, modo));
        expect(v.valid, `${nome} (${modo}) recusa o bloco 1.3: ${JSON.stringify(v)}`).toBe(true);
      }
    }
  });
});
