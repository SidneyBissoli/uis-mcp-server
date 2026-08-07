/**
 * Smoke manual do endpoint MCP em produção (Streamable HTTP, JSON-RPC):
 * initialize → tools/list → as 3 tools uis_* com consultas reais, incluindo a
 * atribuição UIS (URL completa + data de extração) e a release fixada.
 *
 * Uso: node scripts/smoke-mcp.mjs [base-url]
 */

const BASE = process.argv[2] ?? "https://uis.sidneybissoli.com";
let nextId = 1;
let sessionId = null;

async function rpc(method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  sessionId ??= res.headers.get("mcp-session-id");
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  // Streamable HTTP pode responder SSE; extrair o(s) data:
  const payloads = text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    : [text];
  const msg = JSON.parse(payloads[payloads.length - 1]);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error).slice(0, 400)}`);
  return msg.result;
}

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0.0.0" },
});
console.log("initialize:", init.serverInfo, "| instructions:", (init.instructions ?? "").slice(0, 60) + "...");

await rpc("notifications/initialized", {}).catch(() => {});

const tools = await rpc("tools/list", {});
console.log("tools/list:", tools.tools.map((t) => t.name));
if (tools.tools.length !== 3) throw new Error("esperava exatamente 3 tools uis_*");

const search = await rpc("tools/call", {
  name: "uis_search_indicators",
  arguments: { query: "completion rate primary", limit: 3, provenance_mode: "detailed" },
});
const searchSc = search.structuredContent;
console.log("\nuis_search_indicators:", JSON.stringify(searchSc.indicators?.slice(0, 2)));
console.log("license:", searchSc.provenance.license.id, "| citation:", searchSc.provenance.citation);
if (searchSc.provenance.license.id !== "CC-BY-SA-4.0") throw new Error("licença UIS errada");
if (searchSc.provenance.served_from_cache !== true) throw new Error("catálogo deveria vir do seed (cache)");

const geo = await rpc("tools/call", { name: "uis_list_geo_units", arguments: { search: "brazil" } });
console.log("\nuis_list_geo_units brazil:", JSON.stringify(geo.structuredContent.geo_units));

const code = searchSc.indicators[0].code;
const data = await rpc("tools/call", {
  name: "uis_get_data",
  arguments: {
    indicators: [code],
    geo_units: ["BRA"],
    start_year: 2015,
    include_footnotes: true,
    provenance_mode: "detailed",
  },
});
const sc = data.structuredContent;
console.log("\nuis_get_data", code, "rows:", sc.rows_count, "| sample:", JSON.stringify(sc.rows?.slice(0, 2)));
console.log("provenance detailed:", JSON.stringify(sc.provenance, null, 1));
console.log("footer:", data.content[data.content.length - 1].text);
if (!sc.provenance.source_url.includes("version=")) throw new Error("consulta UIS sem release fixada");
if (!sc.provenance.citation.includes("date of extraction")) throw new Error("atribuição UIS sem data de extração");
// Segregação estrutural: nada de ILO neste servidor.
if (JSON.stringify(sc.provenance).includes("ILOSTAT")) throw new Error("resposta UIS contaminada com fonte ILO");

// Erros pedagógicos: teto de indicadores e paginação
const err1 = await rpc("tools/call", {
  name: "uis_get_data",
  arguments: { indicators: Array.from({ length: 26 }, (_, i) => `X${i}`) },
});
console.log("\n>25 indicadores → isError:", err1.isError, "|", (err1.content?.[0]?.text ?? "").slice(0, 90));

const page = await rpc("tools/call", {
  name: "uis_search_indicators",
  arguments: { query: "rate", limit: 5, offset: 5 },
});
console.log("paginação offset=5 → showing:", page.structuredContent.showing, "| has_more:", page.structuredContent.has_more, "| next_offset:", page.structuredContent.next_offset);

console.log("\nSMOKE OK");
