import { describe, expect, it } from "vitest";
import { validateFixtures } from "@sbissoli/mcp-evals";
import { CATALOG } from "../../evals/catalog.js";
import { FIXTURES } from "../../evals/fixtures/queries.js";

describe("evals: catálogo e fixtures", () => {
  it("o catálogo vivo captura exatamente as 3 tools do servidor", () => {
    expect([...CATALOG.toolNames].sort()).toEqual([
      "uis_get_data",
      "uis_list_geo_units",
      "uis_search_indicators",
    ]);
  });

  it("toda tool tem descrição não-vazia e schema de entrada", () => {
    for (const t of CATALOG.tools) {
      expect(t.description.length, t.name).toBeGreaterThan(40);
      expect(t.inputSchema, t.name).toBeTruthy();
    }
  });

  it("fixtures válidas contra o catálogo vivo (sinal offline de regressão)", () => {
    expect(
      validateFixtures(FIXTURES, CATALOG, { minFixtures: 20, maxFixtures: 40, minAreas: 1 }),
    ).toEqual([]);
  });
});
