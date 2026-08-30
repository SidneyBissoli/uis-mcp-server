/**
 * Entrypoint do Worker — template de hosting da Fase 0.
 *
 * Fluxo por request: rotas públicas (landing, /health, /status, /metrics) →
 * Bearer auth opcional → rate limit por cliente → createMcpHandler (stateless,
 * factory cria um McpServer novo por request — MCP SDK v2 + agents 0.20+).
 */

import { createMcpHandler } from "agents/mcp/server";
import { checkAuth } from "./auth.js";
import { SERVER_CONFIG } from "./config.js";
import { ICON_PNG_BASE64 } from "./icon.js";
import { landingResponse } from "./landing.js";
import { logger } from "./logger.js";
import { cursorRejection } from "./pagination.js";
import { checkRateLimit } from "./rate-limit.js";
import { buildServer } from "./server.js";
import { buildStatus } from "./status.js";
import type { Env } from "./types.js";
import { createUsageRecorder, usageSnapshot, UsageTracker } from "./usage.js";

// O runtime instancia o Durable Object a partir do export do entrypoint.
export { UsageTracker };

// Decodificado uma vez por isolate, nao por request.
const ICON_PNG = Uint8Array.from(atob(ICON_PNG_BASE64), (c) => c.charCodeAt(0));

function json(data: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * O Origin desta requisição está entre os hostnames que o servidor serve? Sem
 * header Origin (todo cliente MCP que não é navegador) a resposta é sim.
 *
 * Serve só para ORDENAR as recusas — quem devolve 403 para origem estrangeira é
 * o createMcpHandler, que valida o Origin com a própria lista. Esta função nunca
 * libera nada: no máximo deixa de responder cedo e entrega a requisição a ele.
 */
function origemAceita(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return SERVER_CONFIG.extraAllowedHostnames.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();
    const record = createUsageRecorder(env, ctx);

    // --- Rotas públicas, servidas antes de qualquer auth ---
    if (url.pathname === "/") return landingResponse();
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    if (url.pathname === "/status") {
      return json(buildStatus(env), { "Cache-Control": "no-store" });
    }
    // Icone do servidor — publico: e o que server.json declara e o que os
    // diretorios buscam. Mesmo host do servidor, como o schema do MCP recomenda.
    if (url.pathname === "/icon.png") {
      return new Response(ICON_PNG, {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      });
    }
    if (url.pathname === "/metrics") {
      const snap = await usageSnapshot(env);
      return json(snap ?? { aviso: "binding USAGE ausente — estatísticas de uso desativadas" });
    }

    // Preflight CORS nunca carrega Authorization — o handler MCP responde o OPTIONS.
    if (request.method !== "OPTIONS") {
      const authResponse = await checkAuth(request, env.API_KEY);
      if (authResponse) {
        record("auth_failure", url.pathname);
        logger.warn("auth_failure", {
          method: request.method,
          path: url.pathname,
          status: authResponse.status,
        });
        return authResponse;
      }

      const clientId = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const decision = checkRateLimit(clientId);
      if (!decision.allowed) {
        record("rate_limited", url.pathname);
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": String(decision.retryAfterS), "Content-Type": "text/plain" },
        });
      }
    }

    record("request", url.pathname);

    // Cursor de paginação inválido → -32602 (ver src/pagination.ts: os handlers
    // de lista do SDK ignoram o cursor). O gate de origem mantém a ordem
    // "segurança antes de protocolo": requisição com Origin estrangeiro não
    // recebe a recusa de protocolo aqui, cai no handler e leva a recusa dele.
    if (url.pathname === SERVER_CONFIG.mcpRoute && request.method === "POST" && origemAceita(request)) {
      const recusa = await cursorRejection(request, env.ALLOWED_ORIGIN || "*");
      if (recusa) {
        logger.info("invalid_cursor", { path: url.pathname });
        return recusa;
      }
    }

    const handler = createMcpHandler(() => buildServer(env, record), {
      route: SERVER_CONFIG.mcpRoute,
      // Sem a opção, o handler aceita localhost e *.workers.dev. Ao definir
      // extraAllowedHostnames (domínio próprio), a lista SUBSTITUI os defaults —
      // inclua nela também o hostname workers.dev se ele continuar servido.
      ...(SERVER_CONFIG.extraAllowedHostnames.length
        ? { allowedHostnames: [...SERVER_CONFIG.extraAllowedHostnames] }
        : {}),
      corsOptions: {
        origin: env.ALLOWED_ORIGIN || "*",
        methods: "GET, POST, DELETE, OPTIONS",
        headers: "Content-Type, Accept, mcp-session-id, MCP-Protocol-Version, Authorization",
        maxAge: 86400,
      },
    });

    const response = await handler(request, env, ctx);
    logger.info("request", {
      method: request.method,
      path: url.pathname,
      status: response.status,
      ms: Date.now() - start,
    });
    return response;
  },
} satisfies ExportedHandler<Env>;
