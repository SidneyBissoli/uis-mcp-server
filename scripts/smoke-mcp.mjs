/**
 * Smoke do endpoint MCP em produção (Streamable HTTP, JSON-RPC) — roda também
 * no fim do deploy (.github/workflows/deploy-worker.yml): initialize →
 * tools/list confrontado com o que GET /status anuncia → as tools uis_* com
 * consultas reais, incluindo a atribuição UIS (URL completa + data de extração)
 * e a release fixada → search → fetch (Deep Research) e id desconhecido.
 *
 * A contagem de tools NÃO é literal: vem de /status (`tool_names`, lista de
 * src/tools/index.ts presa ao servidor real por teste). Este repositório é
 * worker-only — o único baseline é o de produção, então derivar a contagem do
 * baseline seria circular.
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
const servidas = tools.tools.map((t) => t.name).sort();
console.log("tools/list:", servidas);
const status = await (await fetch(`${BASE}/status`)).json();
const anunciadas = [...(status.tool_names ?? [])].sort();
if (!anunciadas.length) throw new Error("/status sem tool_names — o build no ar é anterior a 0.2.0?");
if (JSON.stringify(servidas) !== JSON.stringify(anunciadas)) {
  throw new Error(`tools/list ${JSON.stringify(servidas)} ≠ /status.tool_names ${JSON.stringify(anunciadas)}`);
}

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

// Deep Research: search → fetch com o 1º id devolvido, e id desconhecido.
const t0 = Date.now();
const found = await rpc("tools/call", { name: "search", arguments: { query: "adult literacy rate" } });
const results = found.structuredContent?.results ?? [];
console.log(`\nsearch "adult literacy rate" (${Date.now() - t0} ms):`, JSON.stringify(results.slice(0, 3)));
if (found.isError || !results.length) throw new Error("search sem resultado");
if (!results[0].id.startsWith("ind:")) throw new Error(`id de search sem prefixo ind:: ${results[0].id}`);
if (!results[0].url.startsWith("https://databrowser.uis.unesco.org/view#indicatorPaths=")) {
  throw new Error(`url de search não é a página pública do Data Browser: ${results[0].url}`);
}
if (found.structuredContent.provenance?.license !== "CC-BY-SA-4.0") throw new Error("search sem proveniência UIS");
if (JSON.parse(found.content[0].text).results?.length !== results.length) throw new Error("content de search não é o JSON do contrato");

const t1 = Date.now();
const doc = await rpc("tools/call", { name: "fetch", arguments: { id: results[0].id } });
const d = doc.structuredContent;
console.log(`fetch ${results[0].id} (${Date.now() - t1} ms):`, d?.title, "| url:", d?.url);
console.log("fetch text (head):", (d?.text ?? "").split("\n").slice(0, 6).join(" / "));
if (doc.isError || d?.id !== results[0].id) throw new Error("fetch não devolveu o documento pedido");
if (!d.provenance?.source_url?.includes("indicator=")) throw new Error("fetch sem proveniência da amostra (source_url da Data API)");
if (!d.provenance.citation.includes("date of extraction")) throw new Error("fetch sem atribuição UIS");

const missing = await rpc("tools/call", { name: "fetch", arguments: { id: "ind:NAO.EXISTE" } });
console.log("fetch id desconhecido → isError:", missing.isError, "|", (missing.content?.[0]?.text ?? "").slice(0, 80));
if (!missing.isError) throw new Error("fetch de id desconhecido deveria ser erro");

console.log("\nSMOKE OK");
