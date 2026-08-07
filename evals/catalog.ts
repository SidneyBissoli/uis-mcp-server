/**
 * Catálogo vivo das tools para os evals de seleção (@sbissoli/mcp-evals).
 * Um grupo por módulo de src/tools/ — grupo faltando encolhe o eval em silêncio.
 */

import { buildCatalog, type CatalogGroup, type CapturingServer } from "@sbissoli/mcp-evals";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerUisTools } from "../src/tools/uis.js";
import type { Env } from "../src/types.js";

const ENV: Env = {}; // registro não executa handlers — bindings não são tocados
const NOOP = () => {};

const asServer = (s: CapturingServer) => s as unknown as McpServer;

const GROUPS: CatalogGroup[] = [
  { area: "uis", register: (s) => registerUisTools(asServer(s), ENV, NOOP) },
];

export const CATALOG = buildCatalog(GROUPS);
