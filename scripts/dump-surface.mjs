#!/usr/bin/env node
/**
 * Captura um dump NORMALIZADO da superfície MCP (tools + resources + prompts)
 * para provar que uma mudança não a moveu — ou medir exatamente o quanto moveu.
 *
 * Transplantado de bcb-br-mcp/scripts/dump-surface.mjs (a implementação de
 * referência do portfólio). Diferenças deliberadas: este repositório é
 * WORKER-ONLY — não há canal stdio (sem `bin`, sem build Node, `private: true`),
 * então não existem os modos `--stdio` e `--source`; a única superfície
 * observável é a servida por HTTP. O baseline aqui não compara dois canais
 * (a classe de divergência do bcb não existe): ele registra a superfície de
 * PRODUÇÃO no tempo, para deriva aparecer num diff em vez de em silêncio.
 *
 * Modo:
 *   node scripts/dump-surface.mjs --url <endpoint>   POST JSON-RPC num endpoint hospedado/local
 *
 * Sempre escreve em stdout; redirecione para baselines/ para guardar artefato:
 *   node scripts/dump-surface.mjs --url https://uis.sidneybissoli.com/mcp > baselines/surface-http-prod-<versao>.json
 *
 * Normalização: chaves ordenadas recursivamente, tools/resources/prompts
 * ordenados por name/uri, versão do servidor DROPADA (mudaria a cada release e
 * sujaria todo diff — /status e package.json são onde versão se confere).
 */

// ==================== normalização ====================

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(k => [k, sortDeep(value[k])])
    );
  }
  return value;
}

function byKey(list, key) {
  return [...(list ?? [])].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function normalizeSurface({ tools, resources, prompts, serverInfo }) {
  return sortDeep({
    serverName: serverInfo?.name ?? null,
    toolCount: (tools ?? []).length,
    tools: byKey(tools, "name"),
    resources: byKey(resources, "uri"),
    prompts: byKey(prompts, "name")
  });
}

// ==================== transporte HTTP ====================

async function captureHttp(url) {
  let id = 1;
  const rpc = async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params })
    });
    const text = await res.text();
    // Streamable HTTP pode responder como SSE; nesse caso, a última linha data:.
    if (text.startsWith("event:") || text.includes("\ndata:")) {
      const line = text
        .split("\n")
        .filter(l => l.startsWith("data:"))
        .pop();
      return JSON.parse(line.slice(5).trim());
    }
    return JSON.parse(text);
  };

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "dump-surface", version: "1.0.0" }
  });
  const tools = await rpc("tools/list", {});
  const resources = await rpc("resources/list", {}).catch(() => ({ result: { resources: [] } }));
  const prompts = await rpc("prompts/list", {}).catch(() => ({ result: { prompts: [] } }));

  return normalizeSurface({
    tools: tools.result?.tools,
    resources: resources.result?.resources,
    prompts: prompts.result?.prompts,
    serverInfo: init.result?.serverInfo
  });
}

// ==================== main ====================

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");

if (urlIndex < 0) {
  console.error("uso: dump-surface.mjs --url <endpoint>");
  process.exit(2);
}

const surface = await captureHttp(args[urlIndex + 1]);
process.stdout.write(`${JSON.stringify(surface, null, 2)}\n`);
