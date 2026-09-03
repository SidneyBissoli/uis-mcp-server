/**
 * Payload público de liveness/status (GET /status): versão do servidor + metadados
 * reais do último deploy (binding version_metadata), para que registries, monitores
 * e usuários verifiquem que o servidor está de pé e em qual build — sem o handshake
 * MCP. O bloco deploy é omitido quando o binding está ausente (dev local/testes).
 *
 * `tools`/`tool_names`: a superfície que este build serve (src/tools/index.ts,
 * presa ao servidor real por teste). É o que o smoke pós-deploy confronta com o
 * `tools/list` de produção — uma contagem que vem do código, não de literal.
 */

import { SERVER_CONFIG } from "./config.js";
import { TOOL_NAMES } from "./tools/index.js";
import type { Env } from "./types.js";

export function buildStatus(env: Env) {
  const meta = env.CF_VERSION_METADATA;
  return {
    status: "ok" as const,
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
    mcp: SERVER_CONFIG.mcpRoute,
    tools: TOOL_NAMES.length,
    tool_names: [...TOOL_NAMES],
    ...(meta
      ? { deploy: { id: meta.id, tag: meta.tag || null, timestamp: meta.timestamp } }
      : {}),
  };
}
