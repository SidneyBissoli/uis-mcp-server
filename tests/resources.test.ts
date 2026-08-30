/**
 * As resources (src/resources.ts) pelo servidor REAL, e a promessa que elas
 * fazem ao cliente.
 *
 * A promessa é uma só e é verificável: TODO código de indicador citado existe
 * no catálogo que este servidor consulta. Documentação que cita código
 * inexistente é pior que documentação nenhuma — manda o cliente gastar uma
 * chamada para descobrir que mentimos, e a mentira não dá erro em lugar nenhum.
 *
 * A verificação não pina lista: compara o que as resources citam com
 * `tests/fixtures/catalog-ids.txt`, derivado do seed por
 * `scripts/gen-catalog-fixture.mjs`. Quando o catálogo mudar e um indicador for
 * aposentado, é este teste que avisa.
 *
 * A rede nunca é tocada: as três resources são estáticas.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  KEY_INDICATORS,
  KEY_INDICATOR_CODES,
  RESOURCE_URIS,
  guideMarkdown,
  keyIndicatorsMarkdown,
  provenanceMarkdown,
} from "../src/resources.js";
import { UIS_LIMITS } from "../src/config.js";
import { UIS_THEMES } from "../src/uis/catalog.js";
import { buildServer } from "../src/server.js";

const raiz = join(__dirname, "..");

/** Códigos do catálogo, sem os comentários do cabeçalho do fixture. */
const catalogo = new Set(
  readFileSync(join(raiz, "tests", "fixtures", "catalog-ids.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#")),
);

let client: Client;

beforeAll(async () => {
  const server = buildServer({});
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "resources", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});
afterAll(async () => {
  await client.close();
});

describe("o fixture do catálogo", () => {
  it("tem o acervo inteiro, não uma amostra", () => {
    // O seed traz ~5.000 indicadores; um fixture pequeno silenciaria a
    // verificação abaixo em vez de reprovar códigos inexistentes.
    expect(catalogo.size).toBeGreaterThan(5000);
  });
});

describe("resources anunciadas e legíveis", () => {
  it("resources/list anuncia exatamente RESOURCE_URIS, todas com título e descrição", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([...RESOURCE_URIS].sort());
    for (const r of resources) {
      expect(r.title).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.mimeType).toBe("text/markdown");
    }
  });

  it("toda resource lê como markdown não vazio, com o uri pedido", async () => {
    for (const uri of RESOURCE_URIS) {
      const { contents } = await client.readResource({ uri });
      expect(contents).toHaveLength(1);
      const c = contents[0] as { uri: string; mimeType?: string; text?: string };
      expect(c.uri).toBe(uri);
      expect(c.mimeType).toBe("text/markdown");
      expect(c.text?.length ?? 0).toBeGreaterThan(500);
      expect(c.text?.startsWith("# ")).toBe(true);
    }
  });

  it("ler um recurso inexistente é erro do recurso, não do método", async () => {
    // Era o achado `readiness_2026_error_code_migration`: sem resources
    // registradas, o servidor respondia -32601 (method not found) e o cliente
    // não tinha como distinguir "não existe esse recurso" de "não sirvo
    // recursos".
    // -32602 (Invalid params) é o que a SEP-2164 pede para recurso ausente, e é
    // o que o SDK devolve assim que HÁ resources registradas.
    await expect(client.readResource({ uri: "uis://nao-existe" })).rejects.toMatchObject({
      code: -32602,
    });
  });
});

describe("os códigos citados existem", () => {
  it("todo indicador de KEY_INDICATORS está no catálogo", () => {
    const ausentes = KEY_INDICATOR_CODES.filter((c) => !catalogo.has(c));
    expect(ausentes, `códigos citados que não existem no catálogo: ${ausentes.join(", ")}`).toEqual([]);
  });

  it("não há código repetido entre os temas", () => {
    expect(new Set(KEY_INDICATOR_CODES).size).toBe(KEY_INDICATOR_CODES.length);
  });

  it("todo tema citado é um tema real do catálogo", () => {
    for (const g of KEY_INDICATORS) {
      expect(UIS_THEMES as readonly string[]).toContain(g.tema);
    }
  });

  it("os quatro temas do catálogo aparecem na referência", () => {
    const citados = new Set(KEY_INDICATORS.map((g) => g.tema));
    for (const t of UIS_THEMES) expect(citados).toContain(t);
  });

  it("a resource renderizada cita cada código dentro de crase", () => {
    const md = keyIndicatorsMarkdown();
    for (const code of KEY_INDICATOR_CODES) expect(md).toContain("`" + code + "`");
  });
});

describe("o guia diz a verdade sobre os limites", () => {
  it("os números vêm do config, não de literais escritas no texto", () => {
    const md = guideMarkdown();
    expect(md).toContain(`${UIS_LIMITS.maxIndicatorsPerCall} indicators per call`);
    expect(md).toContain(UIS_LIMITS.maxRecordsPerResponse.toLocaleString("en-US"));
  });

  it("o guia nomeia as três tools e aponta a resource de referência", () => {
    const md = guideMarkdown();
    for (const t of ["uis_search_indicators", "uis_list_geo_units", "uis_get_data"]) {
      expect(md).toContain(t);
    }
    expect(md).toContain("uis://reference/key-indicators");
  });
});

describe("o contrato de proveniência", () => {
  it("nomeia os campos que as tools de fato devolvem", () => {
    const md = provenanceMarkdown();
    for (const campo of ["source_url", "data_vintage", "retrieved_at", "license", "citation", "derived"]) {
      expect(md).toContain(campo);
    }
  });

  it("traz a licença correta e o ShareAlike explicado", () => {
    const md = provenanceMarkdown();
    expect(md).toContain("CC-BY-SA-4.0");
    expect(md).toContain("ShareAlike");
  });
});
