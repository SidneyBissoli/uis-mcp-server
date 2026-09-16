/**
 * O vocabulário da PERGUNTA contra o vocabulário da FONTE.
 *
 * `uis_search_indicators` casa substrings do que o usuário escreveu contra o
 * NOME (e o código) do indicador, em AND. Quem pergunta com a palavra errada
 * não recebe um resultado ruim: recebe ZERO, sem dizer por quê. Medido no
 * catálogo oficial de 5.063 indicadores em 2026-09-16
 * (`/api/public/definitions/indicators`, nomes em minúsculas, substring):
 *
 *   perguntado          n     a UNESCO escreve                       n
 *   enrollment          0     enrolment                            227
 *   spending, budget    0     expenditure                          116
 *   wages, salaries     0     salary                                 4
 *   kindergarten,
 *   preschool           0     pre-primary / early childhood      64 / 49
 *   elementary          0     primary                              886
 *   university, college 0     tertiary                             448
 *   undergraduate       0     bachelor's                            35
 *   postgraduate, phd   0     master's / doctoral                24 / 24
 *   professor, lecturer 0     teachers (in tertiary education)     145
 *   scientists          0     researchers                           11
 *   stem                0     science, technology, engineering       9
 *   tvet                0     vocational                            33
 *   maths               0     mathematics                           79
 *   girls, women        0     female                             1.252
 *   boys                0     male (palavra inteira)             1.196
 *   kids                0     children                             161
 *   teenagers           0     adolescents                          131
 *   illiteracy          0     illiterate / literacy             24 / 244
 *   graduation          4     completion                           342
 *   pupil-teacher       0     teacher ratio                         10
 *   migrants            0     immigrant                            122
 *   foreign             0     internationally mobile               979
 *   abroad              8     outbound                             164
 *   poverty, income   1 / 0   poorest / wealth                 232 / 171
 *   toilets             0     sanitation                             3
 *   hygiene             0     handwashing                            3
 *   certified           0     qualified                             33
 *   r&d                 0     gerd / research                   1 / 11
 *   school            499     education                          1.736
 *
 * "enrollment" é o caso mais caro: a grafia americana devolvia zero no
 * catálogo inteiro — o mesmo defeito medido no irmão ilo ("labor" × labour) e
 * consertado lá primeiro (ilo-mcp-server 0.6.0). "school" não é zero, mas
 * "primary school" acha 118 nomes contra 487 de "primary education", e
 * "school completion"/"school enrolment" acham zero: a UNESCO diz "education"
 * onde o usuário diz "school".
 *
 * Regra desta tabela: só entra par MEDIDO — a palavra perguntada ausente (ou
 * quase) do catálogo e a palavra da fonte presente. Nada de sinônimo plausível
 * sem contagem; termo que a UIS não publica fica de fora, porque inventar
 * apelido para dado inexistente é prometer o que a fonte não tem. Medido e
 * deixado de fora em 2026-09-16: labor/labour (0/0 — estatística de trabalho
 * é da OIT, servidor irmão), unemployment/jobs (0), dropout (0 — a UIS
 * publica "survival rate" e "repeaters", não evasão), tuition/fees (0),
 * classroom/textbook/library (0), museum/film/cinema/radio/television (0 — o
 * tema cultura é emprego cultural e gasto com patrimônio), innovation/patents
 * (0), covid/remote learning (0).
 *
 * Vale para os dois caminhos de busca, pelas duas pontas da mesma tabela:
 * `uis_search_indicators` expande o TERMO da consulta (OR dentro do termo, AND
 * entre termos — expandir só aumenta o recall, nunca perde casamento que já
 * havia) e o índice de `search` (Deep Research) recebe a palavra perguntada
 * como KEYWORD do indicador cujo nome traz a palavra da fonte.
 *
 * Mesma receita de `src/ilostat/vocabulary.ts` do ilo-mcp-server; se um
 * terceiro servidor precisar dela, o lugar passa a ser `@sbissoli/mcp-search`.
 */

export interface VocabularyEntry {
  /** Como o usuário escreve (um token, minúsculo). */
  readonly asked: string;
  /** Como a UNESCO escreve — substrings, podendo ser frase ("teacher ratio"). */
  readonly source: readonly string[];
}

export const VOCABULARY: readonly VocabularyEntry[] = [
  { asked: "enrollment", source: ["enrolment", "enrolled"] },
  { asked: "enroll", source: ["enrolment", "enrolled"] },
  { asked: "spending", source: ["expenditure"] },
  { asked: "spend", source: ["expenditure"] },
  { asked: "budget", source: ["expenditure"] },
  { asked: "financing", source: ["expenditure"] },
  { asked: "finance", source: ["expenditure"] },
  { asked: "investment", source: ["expenditure"] },
  { asked: "wage", source: ["salary"] },
  { asked: "wages", source: ["salary"] },
  { asked: "salaries", source: ["salary"] },
  { asked: "kindergarten", source: ["pre-primary", "early childhood"] },
  { asked: "preschool", source: ["pre-primary", "early childhood"] },
  { asked: "pre-school", source: ["pre-primary", "early childhood"] },
  { asked: "elementary", source: ["primary"] },
  { asked: "university", source: ["tertiary"] },
  { asked: "universities", source: ["tertiary"] },
  { asked: "college", source: ["tertiary"] },
  { asked: "undergraduate", source: ["bachelor"] },
  { asked: "postgraduate", source: ["master", "doctoral"] },
  { asked: "phd", source: ["doctoral"] },
  { asked: "professor", source: ["teacher"] },
  { asked: "lecturer", source: ["teacher"] },
  { asked: "scientist", source: ["researcher"] },
  { asked: "stem", source: ["science, technology, engineering"] },
  { asked: "tvet", source: ["vocational"] },
  { asked: "maths", source: ["mathematics"] },
  { asked: "girl", source: ["female"] },
  { asked: "women", source: ["female"] },
  { asked: "woman", source: ["female"] },
  { asked: "boy", source: ["male"] },
  { asked: "men", source: ["male"] },
  { asked: "kid", source: ["children", "child"] },
  { asked: "teenager", source: ["adolescent"] },
  { asked: "illiteracy", source: ["illiterate", "literacy"] },
  { asked: "graduation", source: ["graduation", "completion"] },
  { asked: "pupil-teacher", source: ["teacher ratio"] },
  { asked: "student-teacher", source: ["teacher ratio"] },
  { asked: "migrant", source: ["immigrant"] },
  { asked: "migration", source: ["immigrant"] },
  { asked: "foreign", source: ["internationally mobile"] },
  { asked: "abroad", source: ["abroad", "outbound"] },
  { asked: "poverty", source: ["poorest", "wealth"] },
  { asked: "income", source: ["wealth", "poorest"] },
  { asked: "toilet", source: ["sanitation"] },
  { asked: "hygiene", source: ["handwashing"] },
  { asked: "certified", source: ["qualified"] },
  { asked: "r&d", source: ["gerd", "research"] },
  { asked: "school", source: ["school", "education"] },
];

const BY_ASKED: ReadonlyMap<string, readonly string[]> = new Map(VOCABULARY.map((e) => [e.asked, e.source]));

/**
 * Palavras que não carregam significado no nome de um indicador e, em AND,
 * excluem resultado certo ("out of school" não pode morrer no "of"). Só saem
 * quando sobra algum termo — consulta feita só de stopword continua valendo.
 */
const STOPWORDS: ReadonlySet<string> = new Set(["a", "an", "the", "of", "in", "on", "for", "and", "to", "per", "by", "with"]);

/**
 * Forma singular de um termo — a substring mais curta casa o plural também.
 * Só a regra do "s" final (e a do "ies"): tirar "es" fabricaria cacos como
 * "wages" → "wag", que casam por acidente e sujam a nota ao usuário.
 */
function singulars(term: string): string[] {
  if (term.length > 4 && term.endsWith("ies")) return [`${term.slice(0, -3)}y`];
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) return [term.slice(0, -1)];
  return [];
}

/** Os termos efetivos da consulta: minúsculos, sem stopword, sem vazio. */
export function queryTerms(query: string): string[] {
  const all = query.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = all.filter((t) => !STOPWORDS.has(t));
  return kept.length ? kept : all;
}

/**
 * Um termo e as substrings que o representam na busca (o próprio termo primeiro).
 * A expansão só acrescenta alternativas em OR: o que casava antes segue casando.
 */
export function expandTerm(term: string): string[] {
  const t = term.toLowerCase();
  const out = [t, ...(BY_ASKED.get(t) ?? []), ...singulars(t).flatMap((s) => [s, ...(BY_ASKED.get(s) ?? [])])];
  return [...new Set(out)];
}

export interface ExpandedTerm {
  readonly term: string;
  readonly patterns: readonly string[];
  /** A tabela (não a mera flexão de plural) mudou o que se procura. */
  readonly translated: boolean;
}

/** A consulta inteira, termo a termo, pronta para virar WHERE ou filtro. */
export function expandQuery(query: string): ExpandedTerm[] {
  return queryTerms(query).map((term) => {
    const patterns = expandTerm(term);
    const t = term.toLowerCase();
    const translated = BY_ASKED.has(t) || singulars(t).some((s) => BY_ASKED.has(s));
    return { term, patterns, translated };
  });
}

/**
 * A frase que conta ao chamador que a palavra dele não é a da UNESCO — sem
 * isto a tradução é invisível e o resultado parece vir do que ele escreveu.
 */
export function vocabularyNotes(expanded: readonly ExpandedTerm[]): string[] {
  return expanded
    .filter((e) => e.translated)
    .map((e) => {
      const outros = e.patterns.filter((p) => p !== e.term.toLowerCase());
      return `"${e.term}" was also searched as ${outros.join(", ")} — the wording the UIS uses.`;
    });
}

/** Um nome (ou código) de indicador casa o termo expandido? (mesma semântica do LIKE do D1) */
export function matchesTerm(haystack: string, expanded: ExpandedTerm): boolean {
  return expanded.patterns.some((p) => haystack.includes(p));
}

/**
 * A ponta inversa da tabela: as palavras com que se PERGUNTA por este nome de
 * indicador — keywords do índice de `search`, que ranqueia por relevância em
 * vez de casar substring.
 */
export function askedWordsFor(name: string): string[] {
  const lc = name.toLowerCase();
  const out = VOCABULARY.filter((e) => e.source.some((s) => lc.includes(s))).map((e) => e.asked);
  return [...new Set(out)];
}
