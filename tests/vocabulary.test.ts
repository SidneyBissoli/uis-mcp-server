/**
 * O vocabulário da pergunta contra o da fonte.
 *
 * Os casos são os MEDIDOS no catálogo oficial em 2026-09-16 (5.063
 * indicadores): "enrollment", "spending", "preschool", "university", "wages",
 * "scientists", "girls", "graduation", "pupil-teacher" e "foreign" devolviam
 * ZERO, com o indicador existindo sob a grafia da UNESCO. As linhas de fixture
 * abaixo são pares código/nome REAIS, lidos de /api/public/definitions/indicators,
 * para o teste não provar uma tabela contra si mesma — e o primeiro caso
 * confere cada código contra a lista versionada do seed, porque código montado
 * por padrão é hipótese, não fato.
 *
 * A busca de verdade é SQL no D1 (src/uis/catalog.ts); aqui a mesma semântica
 * (LIKE %p% em name_lc OU code_lc, OR dentro do termo, AND entre termos) é
 * aplicada em memória pela mesma função que gera os padrões, e um caso à parte
 * prova que o WHERE gerado carrega a expansão.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { searchUisCatalog } from "../src/uis/catalog.js";
import type { Env } from "../src/types.js";
import { askedWordsFor, expandQuery, expandTerm, matchesTerm, queryTerms, vocabularyNotes } from "../src/uis/vocabulary.js";

interface Linha {
  code: string;
  name: string;
  records: number;
}

const row = (code: string, name: string, records: number): Linha => ({ code, name, records });

// Pares código/nome REAIS, lidos do catálogo oficial em 2026-09-16; `records` é
// o totalRecordCount da própria UIS, o critério de ordenação da busca. O teste
// `códigos do catálogo` abaixo impede que esta fixture derive para ficção.
const CATALOGO: Linha[] = [
  row("20062", "Enrolment in primary education, both sexes (number)", 21071),
  row("NERT.1.CP", "Total net enrolment rate, primary, both sexes (%)", 4898),
  row("GER.5T8", "Gross enrolment ratio for tertiary education, both sexes (%)", 15168),
  row("XGDP.FSGOV", "Government expenditure on education as a percentage of GDP (%)", 5159),
  row("TSALARY.1", "Average teacher salary in primary education relative to other professions requiring a comparable level of qualification, both sexes", 276),
  row("CR.1", "Completion rate, primary education, both sexes (%)", 2568),
  row("CR.1.Q1", "Completion rate, primary education, poorest quintile, both sexes (%)", 702),
  row("RESDEN.INHAB.TFTE", "Researchers per million inhabitants (FTE)", 3376),
  row("EXPGDP.TOT", "GERD as a percentage of GDP", 3867),
  row("26637", "Total inbound internationally mobile students, both sexes (number)", 7394),
  row("PTRHC.1.QUALIFIED", "Pupil-qualified teacher ratio in primary education (headcount basis)", 3581),
  row("ILLPOP.AG15T99", "Adult illiterate population, 15+ years, both sexes (number)", 7142),
  row("25001", "Teachers in tertiary education ISCED 5 programmes, both sexes (number)", 1111),
  row("FOSGP.5T8.F500600700", "Percentage of graduates from Science, Technology, Engineering and Mathematics programmes in tertiary education, both sexes (%)", 1827),
  row("EV1524P.2T5.V", "Proportion of 15- to 24-year-olds enrolled in vocational education, both sexes (%)", 10646),
  row("SCHBSP.1.WWASH", "Proportion of primary schools with basic handwashing facilities (%)", 2788),
  row("SCHBSP.1.WTOILA", "Proportion of primary schools with single-sex basic sanitation facilities (%)", 2827),
  row("ROFST.1.CP", "Out-of-school rate for children of primary school age, both sexes (%)", 5707),
  row("ROFST.2.CP", "Out-of-school rate for adolescents of lower secondary school age, both sexes (%)", 4266),
  row("EA.1T8.AG25T99.NATIVE", "Educational attainment rate, completed primary education or higher, population 25+ years, non-immigrant background, both sexes (%)", 580),
  row("FTP.1.QUALIFIED", "Percentage of teachers in primary education who are qualified according to national standards and who are female (%)", 1018),
];

/** A semântica do SQL de src/uis/catalog.ts, em memória: LIKE em name_lc OU code_lc, OR no termo, AND entre termos. */
function busca(q: string) {
  const expanded = expandQuery(q);
  const entries = CATALOGO.filter((l) =>
    expanded.every((t) => matchesTerm(l.name.toLowerCase(), t) || matchesTerm(l.code.toLowerCase(), t)),
  ).sort((a, b) => b.records - a.records || a.code.localeCompare(b.code));
  return { entries, total: entries.length, notes: vocabularyNotes(expanded) };
}

const codigos = (r: { entries: Linha[] }) => r.entries.map((e) => e.code);

describe("a fixture é o catálogo, não uma invenção", () => {
  it("todo código da fixture existe na lista versionada do seed", () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
    const ids = new Set(
      readFileSync(join(raiz, "tests/fixtures/catalog-ids.txt"), "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    );
    for (const r of CATALOGO) expect(ids, `código ausente do catálogo: ${r.code}`).toContain(r.code);
  });
});

describe("expansão de termo", () => {
  it("grafia americana medida: enrollment → enrolment", () => {
    expect(expandTerm("enrollment")).toContain("enrolment");
  });

  it("plural e sinônimo medidos: wages → salary; universities → tertiary", () => {
    expect(expandTerm("wages")).toContain("salary");
    expect(expandTerm("universities")).toContain("tertiary");
  });

  it("o próprio termo vem primeiro — expandir nunca perde o que já casava", () => {
    expect(expandTerm("literacy")[0]).toBe("literacy");
    expect(expandTerm("rates")).toContain("rate");
  });

  it("a flexão não fabrica caco: wages não vira wag", () => {
    expect(expandTerm("wages")).not.toContain("wag");
    expect(expandTerm("countries")).toContain("country");
  });

  it("stopword não entra no AND, mas consulta só de stopword continua valendo", () => {
    expect(queryTerms("out of school")).toEqual(["out", "school"]);
    expect(queryTerms("of")).toEqual(["of"]);
  });
});

describe("busca com o vocabulário do usuário", () => {
  it("enrollment (grafia americana) acha o enrolment da UNESCO", () => {
    const r = busca("enrollment primary");
    expect(r.total).toBeGreaterThan(0);
    expect(codigos(r)).toContain("20062");
    expect(codigos(r)).toContain("NERT.1.CP");
  });

  it("spending, que não existe em nenhum nome do catálogo, acha expenditure", () => {
    expect(codigos(busca("education spending gdp"))).toContain("XGDP.FSGOV");
  });

  it("wages acha teacher salary", () => {
    expect(codigos(busca("teacher wages"))).toContain("TSALARY.1");
  });

  it("university acha tertiary", () => {
    expect(codigos(busca("university enrollment"))).toContain("GER.5T8");
  });

  it("scientists acha researchers", () => {
    expect(codigos(busca("scientists per million"))).toContain("RESDEN.INHAB.TFTE");
  });

  it("r&d acha GERD", () => {
    expect(codigos(busca("r&d gdp"))).toContain("EXPGDP.TOT");
  });

  it("foreign students acha internationally mobile students", () => {
    expect(codigos(busca("foreign students"))).toContain("26637");
  });

  it("pupil-teacher ratio (com hífen) acha o pupil-qualified teacher ratio", () => {
    expect(codigos(busca("pupil-teacher ratio primary"))).toContain("PTRHC.1.QUALIFIED");
  });

  it("illiteracy acha illiterate", () => {
    expect(codigos(busca("adult illiteracy"))).toContain("ILLPOP.AG15T99");
  });

  it("professors acha teachers in tertiary education", () => {
    expect(codigos(busca("professors tertiary"))).toContain("25001");
  });

  it("stem acha science, technology, engineering and mathematics", () => {
    expect(codigos(busca("stem graduates"))).toContain("FOSGP.5T8.F500600700");
  });

  it("tvet acha vocational", () => {
    expect(codigos(busca("tvet enrolled"))).toContain("EV1524P.2T5.V");
  });

  it("hygiene e toilets acham handwashing e sanitation", () => {
    expect(codigos(busca("schools hygiene"))).toContain("SCHBSP.1.WWASH");
    expect(codigos(busca("schools toilets"))).toContain("SCHBSP.1.WTOILA");
  });

  it("graduation acha completion (o próprio termo continua valendo)", () => {
    expect(codigos(busca("graduation primary"))).toContain("CR.1");
  });

  it("poverty acha poorest quintile", () => {
    expect(codigos(busca("poverty completion"))).toContain("CR.1.Q1");
  });

  it("kids e teenagers acham children e adolescents", () => {
    expect(codigos(busca("kids out of school"))).toContain("ROFST.1.CP");
    expect(codigos(busca("teenagers out of school"))).toContain("ROFST.2.CP");
  });

  it("migrants acha immigrant", () => {
    expect(codigos(busca("migrants attainment"))).toContain("EA.1T8.AG25T99.NATIVE");
  });

  it("girls e certified acham female e qualified", () => {
    expect(codigos(busca("certified teachers girls"))).toContain("FTP.1.QUALIFIED");
  });

  it("primary school completion acha 'completion rate, primary education' (school → education)", () => {
    expect(codigos(busca("primary school completion"))).toContain("CR.1");
  });

  it("o que já funcionava continua funcionando, e na ordem da contagem de registros da UIS", () => {
    const r = busca("primary education");
    expect(r.total).toBeGreaterThan(3);
    const maior = CATALOGO.filter((c) => r.entries.some((e) => e.code === c.code)).sort((a, b) => b.records - a.records)[0];
    expect(r.entries[0]?.code).toBe(maior?.code);
  });

  it("termo sem correspondência nenhuma segue devolvendo zero — expandir não inventa dado", () => {
    expect(busca("dropout").total).toBe(0);
    expect(busca("unemployment").total).toBe(0);
    expect(busca("cryptocurrency").total).toBe(0);
  });
});

describe("a tradução é dita, não é silenciosa", () => {
  it("a nota nomeia o termo e a grafia da UNESCO", () => {
    const notas = busca("enrollment").notes;
    expect(notas).toHaveLength(1);
    expect(notas[0]).toContain('"enrollment"');
    expect(notas[0]).toContain("enrolment");
  });

  it("termo que já é o da UNESCO não gera nota", () => {
    expect(busca("literacy rate").notes).toEqual([]);
  });

  it("vocabularyNotes só fala dos termos que a TABELA traduziu, não do plural", () => {
    expect(vocabularyNotes(expandQuery("rates"))).toEqual([]);
  });
});

describe("o WHERE do D1 carrega a expansão", () => {
  it("um termo traduzido vira OR de GLOBs de fronteira, com os padrões da tabela nos parâmetros", async () => {
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
            if (sql.includes("uis_meta")) return { results: [{ key: "retrieved_at", value: "2026-09-16T00:00:00Z" }] };
            return { results: [] };
          },
        };
        return stmt;
      },
    } as unknown as D1Database;
    const env: Env = { CATALOG_DB: db };

    const r = await searchUisCatalog(env, "enrollment rate", undefined, 20, 0);

    const consulta = visto.find((v) => v.sql.includes("SELECT code"));
    expect(consulta).toBeDefined();
    // Cada padrão gasta DOIS parâmetros: `p*` (começa o texto) e
    // `*[^a-z0-9]p*` (vem logo depois de algo que não é letra nem dígito).
    // Juntos, casam o INÍCIO de uma palavra — `LIKE '%p%'` casava o miolo.
    const glob = (n: number, m: number): string =>
      `name_lc GLOB ?${n} OR name_lc GLOB ?${m} OR code_lc GLOB ?${n} OR code_lc GLOB ?${m}`;
    expect(consulta?.sql).toContain(`(${glob(1, 2)} OR ${glob(3, 4)} OR ${glob(5, 6)})`);
    expect(consulta?.sql).toContain(` AND (${glob(7, 8)})`);
    expect(consulta?.sql).not.toContain("LIKE");
    expect(consulta?.params).toEqual([
      "enrollment*",
      "*[^a-z0-9]enrollment*",
      "enrolment*",
      "*[^a-z0-9]enrolment*",
      "enrolled*",
      "*[^a-z0-9]enrolled*",
      "rate*",
      "*[^a-z0-9]rate*",
    ]);
    expect(r.notes).toEqual(['"enrollment" was also searched as enrolment, enrolled — the wording the UIS uses.']);
  });
});

describe("a ponta inversa, para o índice de search (Deep Research)", () => {
  it("um indicador de enrolment é encontrável por enrollment", () => {
    expect(askedWordsFor("Enrolment in primary education, both sexes (number)")).toContain("enrollment");
  });

  it("um indicador de expenditure é encontrável por spending, budget e investment", () => {
    const k = askedWordsFor("Government expenditure on education as a percentage of GDP (%)");
    expect(k).toEqual(expect.arrayContaining(["spending", "budget", "investment"]));
  });

  it("nome sem palavra da tabela não ganha keyword", () => {
    expect(askedWordsFor("GERD as a percentage of GDP")).toEqual(["r&d"]);
    expect(askedWordsFor("Researchers per million inhabitants (FTE)")).toEqual(["scientist", "r&d"]);
    expect(askedWordsFor("Number of newspaper titles")).toEqual([]);
  });
});
