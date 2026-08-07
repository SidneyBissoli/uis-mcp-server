/**
 * Fixtures de eval de seleção de tool — consultas realistas na persona-alvo
 * (pesquisadores de educação, política científica e economia da cultura;
 * jornalistas de dados). `expectedTools` = tools aceitáveis como PRIMEIRO passo.
 *
 * Regra prática: pergunta sem código de indicador conhecido → uis_search_indicators;
 * valor estatístico com código em mãos → uis_get_data; "qual o código do país/região"
 * → uis_list_geo_units.
 */

import type { EvalFixture } from "@sbissoli/mcp-evals";

export const FIXTURES: EvalFixture[] = [
  {
    id: "search-01",
    query: "Which UNESCO indicators track out-of-school children?",
    expectedTools: ["uis_search_indicators"],
    note: "Descoberta de indicador por tema — não há código em mãos.",
  },
  {
    id: "search-02",
    query: "Does UNESCO publish statistics on R&D researchers per million inhabitants?",
    expectedTools: ["uis_search_indicators"],
    note: "Ciência/P&D (SDG 9.5) — pergunta de existência = busca de catálogo.",
  },
  {
    id: "search-03",
    query: "Quero indicadores da UNESCO sobre patrimônio cultural e museus.",
    expectedTools: ["uis_search_indicators"],
    note: "Tema de cultura, persona lusófona.",
  },
  {
    id: "search-04",
    query: "What education spending indicators are available from the UIS?",
    expectedTools: ["uis_search_indicators"],
    note: "Fonte nomeada (UIS) + descoberta temática.",
  },
  {
    id: "search-05",
    query: "Find me a UIS indicator for the literacy rate of adults, by sex.",
    expectedTools: ["uis_search_indicators"],
    note: "Busca por palavras-chave com desagregação.",
  },
  {
    id: "search-06",
    query: "Is there any UNESCO series on government expenditure on education as share of GDP?",
    expectedTools: ["uis_search_indicators"],
    note: "Pergunta de existência de série = busca de catálogo.",
  },
  {
    id: "search-07",
    query: "What does the UIS have on gross enrolment in tertiary education?",
    expectedTools: ["uis_search_indicators"],
    note: "Tema amplo, primeiro passo é o catálogo.",
  },
  {
    id: "search-08",
    query: "Procuro estatísticas de produção de filmes por país (feature films).",
    expectedTools: ["uis_search_indicators"],
    note: "Cultura — nicho onde a UIS é fonte primária mundial.",
  },
  {
    id: "data-01",
    query: "Get the UIS completion rate indicator CR.1 for Brazil since 2010.",
    expectedTools: ["uis_get_data"],
    note: "Código de indicador UIS em mãos — buscar o dado.",
  },
  {
    id: "data-02",
    query: "Pull UNESCO literacy data for indicator LR.AG15T99 in Argentina and Chile, 2015-2023.",
    expectedTools: ["uis_get_data"],
    note: "Consulta de valores com códigos e recorte completos.",
  },
  {
    id: "data-03",
    query: "Using indicator CR.1, compare primary completion in Brazil, Peru and Colombia after 2015.",
    expectedTools: ["uis_get_data"],
    note: "Código em mãos, múltiplos países — chamada direta de dados.",
  },
  {
    id: "data-04",
    query: "Série do indicador 20062 da UIS para o Brasil desde 2000, por favor.",
    expectedTools: ["uis_get_data"],
    note: "Persona lusófona com código conhecido.",
  },
  {
    id: "data-05",
    query: "Fetch the latest values of indicator CR.1 for the SDG: Latin America and the Caribbean region.",
    expectedTools: ["uis_get_data", "uis_list_geo_units"],
    note: "Código em mãos; o código da região pode exigir uis_list_geo_units antes.",
  },
  {
    id: "geo-01",
    query: "What geo unit code does the UNESCO UIS API use for the Ivory Coast?",
    expectedTools: ["uis_list_geo_units"],
    note: "Código de país = busca de geo units.",
  },
  {
    id: "geo-02",
    query: "List the regional aggregates available in the UIS Data API.",
    expectedTools: ["uis_list_geo_units"],
    note: "Filtro por tipo REGIONAL.",
  },
  {
    id: "geo-03",
    query: "Quais os códigos da UIS para os países do Mercosul (Brasil, Argentina, Paraguai, Uruguai)?",
    expectedTools: ["uis_list_geo_units"],
    note: "Descoberta de códigos, persona lusófona.",
  },
  {
    id: "flow-01",
    query: "I want to chart how many researchers per million inhabitants BRICS countries have since 2010.",
    expectedTools: ["uis_search_indicators"],
    note: "Fluxo completo começa descobrindo o código do indicador.",
  },
  {
    id: "flow-02",
    query: "How did school completion evolve in Sub-Saharan Africa in the last decade?",
    expectedTools: ["uis_search_indicators"],
    note: "Sem código em mãos — catálogo primeiro.",
  },
  {
    id: "flow-03",
    query: "Compare cultural employment across South American countries using UNESCO data.",
    expectedTools: ["uis_search_indicators"],
    note: "Tema (emprego cultural) ainda sem indicador identificado.",
  },
  {
    id: "flow-04",
    query: "Get me UIS out-of-school numbers for every country in the world for 2023.",
    expectedTools: ["uis_search_indicators", "uis_list_geo_units"],
    note: "Painel amplo: achar o indicador e/ou os códigos de país para filtrar.",
  },
];
