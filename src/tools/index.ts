/**
 * A lista das tools que o servidor serve — fonte para o que é escrito FORA do
 * `tools/list`: o payload de GET /status (`tools`, `tool_names`), que o smoke
 * pós-deploy confronta com o `tools/list` real de produção.
 *
 * O McpServer do SDK v2 não expõe as tools registradas (campo privado), então
 * a lista é declarada aqui e PRESA ao servidor real por tests/server.test.ts:
 * o `tools/list` em memória tem de ser exatamente isto. Um nome a mais ou a
 * menos em qualquer dos dois lados é teste vermelho, nunca deriva silenciosa.
 */

import { DEEP_RESEARCH_TOOLS } from "./deep-research.js";
import { UIS_GET_DATA, UIS_LIST_GEO_UNITS, UIS_SEARCH_INDICATORS } from "./uis.js";

export const TOOL_NAMES: readonly string[] = [
  UIS_SEARCH_INDICATORS,
  UIS_LIST_GEO_UNITS,
  UIS_GET_DATA,
  ...DEEP_RESEARCH_TOOLS,
];
