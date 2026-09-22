/**
 * A fronteira de palavra, provada nos DOIS caminhos de busca deste servidor.
 *
 * `searchUisCatalog` empurra o filtro para o D1 quando há banco, e cai em
 * `CATALOG_MEMORY` no runtime stdio. Os dois têm de responder igual — senão a
 * resposta muda com o transporte, que é pior que errar nos dois.
 *
 * Até a 0.4.x o SQL era `name_lc LIKE '%p%'`, substring em qualquer posição. O
 * defeito deste catálogo estava até DOCUMENTADO na tabela de vocabulário —
 * `boys → male (palavra inteira)` — só que a mecânica não sabia fazer palavra
 * inteira: `boy` casava também os 1.252 nomes com `female`, e mais da metade da
 * resposta era o sexo oposto ao perguntado, calado.
 *
 * O D1 falso de `tests/vocabulary.test.ts` roteia por trechos de SQL e NÃO
 * executa SQL — ele abençoaria um `GLOB` errado do mesmo jeito que abençoava o
 * `LIKE`. Aqui o WHERE de PRODUÇÃO é capturado e rodado contra um SQLite DE
 * VERDADE (`node:sqlite`, o mesmo motor do D1).
 */

import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { searchUisCatalog } from "../src/uis/catalog.js";
import { expandQuery, matchesTerm } from "../src/uis/vocabulary.js";
import type { Env } from "../src/types.js";

/** Como `name_lc` e `code_lc` são de fato construídos (scripts/seed-uis-catalog.mjs). */
const lc = (s: string): string => s.toLowerCase();

/** D1 falso que só CAPTURA o SQL — o elo entre o código de produção e o SQLite. */
function capturaSql(): { db: D1Database; visto: { sql: string; params: unknown[] }[] } {
  const visto: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: (...params: unknown[]) => {
          visto.push({ sql, params });
          return stmt;
        },
        async first() {
          return sql.includes("COUNT(*)") ? { n: 0 } : null;
        },
        async all() {
          if (sql.includes("uis_meta")) {
            return { results: [{ key: "retrieved_at", value: "2026-09-22T00:00:00Z" }] };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, visto };
}

/** O WHERE REAL de `searchUisCatalog`, pronto para rodar no SQLite. */
async function whereReal(query: string): Promise<{ sql: string; params: string[] }> {
  const { db, visto } = capturaSql();
  await searchUisCatalog({ CATALOG_DB: db } as Env, query, undefined, 20, 0);
  const sel = visto.find((v) => v.sql.includes("SELECT code"));
  if (!sel) throw new Error("searchUisCatalog não emitiu o SELECT do catálogo");
  const m = /WHERE ([\s\S]+?) ORDER BY/.exec(sel.sql);
  const where = m?.[1];
  if (!where) throw new Error(`WHERE não encontrado em: ${sel.sql}`);
  return { sql: where, params: sel.params as string[] };
}

/** Nomes REAIS de indicadores da UIS, e os vizinhos que o defeito trazia junto. */
const NOMES = [
  "Gross enrolment ratio, primary, male (%)",
  "Gross enrolment ratio, primary, female (%)",
  "Completion rate, primary education, male (%)",
  "Completion rate, primary education, female (%)",
  "Youth illiterate population, 15-24 years, both sexes (number)",
  "Government expenditure on education as % of GDP (%)",
  "Enrolment in vocational education, both sexes (number)",
  "Immigrant students as a percentage of total students",
];

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE uis_indicators (code TEXT, name TEXT, name_lc TEXT, code_lc TEXT)");
const ins = db.prepare("INSERT INTO uis_indicators VALUES (?, ?, ?, ?)");
for (const [i, nome] of NOMES.entries()) ins.run(`IND.${i}`, nome, lc(nome), `ind.${i}`);

/** O caminho do D1: o WHERE que `catalog.ts` monta, rodado no SQLite. */
const noSql = async (query: string): Promise<string[]> => {
  const { sql, params } = await whereReal(query);
  return db
    .prepare(`SELECT name FROM uis_indicators WHERE ${sql}`)
    .all(...params)
    .map((r) => String(r.name));
};

/** O caminho de memória: o casador de `@sbissoli/mcp-search`. */
const naMemoria = (query: string): string[] => {
  const expanded = expandQuery(query);
  return NOMES.filter((n) => expanded.every((t) => matchesTerm(lc(n), t)));
};

describe("o padrão casa o INÍCIO de uma palavra, nunca o miolo", () => {
  it("'boys' não traz mais os indicadores de 'female' — o defeito que a tabela já previa", () => {
    // A tabela diz `boys → male (palavra inteira)` desde sempre; só agora é verdade.
    // Antes, `boy` casava os 1.252 nomes com `female` junto com os 1.196 de `male`.
    return expect(noSql("boys")).resolves.toEqual([
      "Gross enrolment ratio, primary, male (%)",
      "Completion rate, primary education, male (%)",
    ]);
  });

  it("e 'girls' continua trazendo os de 'female'", async () => {
    expect(await noSql("girls")).toEqual([
      "Gross enrolment ratio, primary, female (%)",
      "Completion rate, primary education, female (%)",
    ]);
  });

  it("RADICAL da tabela segue valendo — é prefixo de palavra, não miolo", async () => {
    // illiteracy → illiterate; tvet → vocational; migrants → immigrant.
    expect(await noSql("illiteracy")).toContain(
      "Youth illiterate population, 15-24 years, both sexes (number)",
    );
    expect(await noSql("tvet")).toContain("Enrolment in vocational education, both sexes (number)");
    expect(await noSql("migrants")).toContain(
      "Immigrant students as a percentage of total students",
    );
    // spending → expenditure
    expect(await noSql("spending")).toContain(
      "Government expenditure on education as % of GDP (%)",
    );
  });

  it("separador que não é espaço abre palavra: vírgula, parêntese e hífen", async () => {
    expect(await noSql("primary")).toHaveLength(4);
    expect(await noSql("number")).toHaveLength(2);
    expect(await noSql("24")).toHaveLength(1);
  });

  it("consulta feita só de metacaractere de GLOB não casa TUDO", async () => {
    // Sem a guarda o padrão vira "" e `GLOB '*'` traz o catálogo inteiro — o
    // oposto de zero, e mais difícil de perceber.
    const { sql } = await whereReal("***");
    expect(sql).toContain("0 = 1");
    expect(await noSql("***")).toEqual([]);
  });
});

describe("o SQL de produção é GLOB, não LIKE", () => {
  it("`LIKE '%p%'` É o casamento sem fronteira — não pode voltar", async () => {
    const { sql, params } = await whereReal("boys");
    expect(sql).toContain("GLOB");
    expect(sql).not.toContain("LIKE");
    expect(params).toContain("male*");
    expect(params).toContain("*[^a-z0-9]male*");
  });
});

describe("os dois caminhos de busca respondem igual", () => {
  // Se divergirem, a resposta muda conforme o transporte (HTTP com D1 × stdio
  // em memória), que é a pior forma de errar: nem sempre, e sem aviso.
  it.each([
    "boys",
    "girls",
    "illiteracy",
    "tvet",
    "migrants",
    "spending",
    "enrollment",
    "primary",
    "completion",
  ])("'%s' devolve o mesmo no D1 e em memória", async (query) => {
    expect((await noSql(query)).sort()).toEqual(naMemoria(query).sort());
  });
});
