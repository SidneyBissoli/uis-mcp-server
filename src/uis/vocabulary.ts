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
 * A MECÂNICA (expansão em OR dentro do termo e AND entre termos, stopwords,
 * singular, a nota dita, a ponta inversa para o índice de `search`) mora em
 * `@sbissoli/mcp-search` desde a 0.5.0; aqui fica só a tabela. Os nomes
 * exportados são os de sempre, para quem chama não mudar.
 */

import { createVocabulary, type ExpandedTerm, type VocabularyEntry } from "@sbissoli/mcp-search";

export type { ExpandedTerm, VocabularyEntry };

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

const vocabulary = createVocabulary({ entries: VOCABULARY, locale: "en", sourceName: "the UIS" });

/** Os termos efetivos da consulta: minúsculos, sem stopword, sem vazio. */
export const queryTerms = vocabulary.queryTerms;
/** Um termo e as substrings que o representam na busca (o próprio termo primeiro). */
export const expandTerm = vocabulary.expandTerm;
/** A consulta inteira, termo a termo, pronta para virar WHERE ou filtro. */
export const expandQuery = vocabulary.expandQuery;
/** A frase que conta ao chamador que a palavra dele não é a da UNESCO. */
export const vocabularyNotes = vocabulary.vocabularyNotes;
/** Um nome (ou código) de indicador casa o termo expandido? (mesma semântica do LIKE do D1) */
export const matchesTerm = vocabulary.matchesTerm;
/** A ponta inversa: as palavras com que se PERGUNTA por este nome — keywords do índice de `search`. */
export const askedWordsFor = vocabulary.askedWordsFor;
