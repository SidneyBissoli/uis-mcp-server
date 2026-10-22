/**
 * Smoke do endpoint MCP em produção (Streamable HTTP, JSON-RPC) — roda também
 * no fim do deploy (.github/workflows/deploy-worker.yml): initialize →
 * tools/list confrontado com o que GET /status anuncia → as tools uis_* com
 * consultas reais, incluindo a atribuição UIS (URL completa + data de extração)
 * e a release fixada → search → fetch (Deep Research) e id desconhecido.
 *
 * A contagem de tools NÃO é literal: vem de /status (`tool_names`, lista de
 * src/tools/index.ts presa ao servidor real por teste). O único baseline HTTP
 * é o de produção, então derivar a contagem do baseline seria circular.
 *
 * O script fala com o SERVIDOR, nunca com a UIS diretamente — quem consulta a
 * Data API é o servidor. A única exceção é a SONDA (abaixo): um GET mínimo
 * direto na fonte, só quando uma tool falhou.
 *
 * Uso:
 *   node scripts/smoke-mcp.mjs                       # produção
 *   node scripts/smoke-mcp.mjs http://localhost:8787  # outra base (wrangler dev)
 *   node scripts/smoke-mcp.mjs --sonda               # só pergunta à UIS se ela está servindo (sai 0/2)
 *
 * FONTE FORA NÃO É DEPLOY QUEBRADO. Medido em 22/10/2026 nos irmãos: o bcb
 * reprovou duas reexecuções com o SGS em 502 e o ibge ficou vermelho com o
 * Worker na versão certa e o IBGE recusando conexões de parte das nuvens; o
 * painel abriu "Deploy FALHOU" para deploy que não falhou. O smoke só vê o que
 * viaja no fio (`isError` + texto; a classe do erro da origem não viaja), então
 * a decisão é do `criarSmoke` do @sbissoli/mcp-live-source: tool com `isError`
 * inesperado → sonda direta na fonte declarada → fonte fora = AVISO
 * (`::warning title=Fonte indisponível`, saída 0); fonte servindo = FALHA com o
 * texto da tool (saída 1). Verificação que lança (asserção, HTTP, JSON-RPC) é
 * defeito do deploy e sai vermelha sem sondar. Verificação que só lê o catálogo
 * (D1: `uis_search_indicators`, `uis_list_geo_units`, `search`) declara
 * `sondas: []` — uma falha ali não tem fonte externa que a explique.
 */

import { criarSmoke } from "@sbissoli/mcp-live-source";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "https://uis.sidneybissoli.com";

/**
 * As fontes que as tools deste roteiro consultam, num pedido mínimo cada: um
 * recurso que EXISTE, com corpo pequeno. `SMOKE_SONDA_<NOME>` aponta a sonda
 * para outro lugar — para provar o `--sonda` dizendo FORA sem esperar a UIS
 * cair. A Data API é um host só (`api.uis.unesco.org`, `UIS_BASE` em
 * src/uis/api.ts), mas `uis_get_data` e a amostra do `fetch` fazem DUAS idas:
 * a release corrente (`/versions/default`, KV 24 h) e os dados
 * (`/data/indicators`, atrás de um CloudFront). Sondar as duas separa "a API
 * caiu" de "só a consulta de dados está fora". Medido em 22/10/2026: as duas
 * respondem 200 sem User-Agent de navegador.
 */
const ehJson = (f) => (corpo) => {
  try {
    return f(JSON.parse(corpo));
  } catch {
    return false;
  }
};
const smoke = criarSmoke({
  sondas: [
    {
      nome: "release",
      url: process.env.SMOKE_SONDA_RELEASE ?? "https://api.uis.unesco.org/api/public/versions/default",
      aceita: ehJson((j) => typeof j?.version === "string" && j.version.length > 0),
    },
    {
      nome: "dados",
      url:
        process.env.SMOKE_SONDA_DADOS ??
        "https://api.uis.unesco.org/api/public/data/indicators?indicator=CR.1&geoUnit=BRA&start=2015&end=2015",
      aceita: ehJson((j) => Array.isArray(j?.records)),
    },
  ],
});

// Sair no mesmo tick em que o socket do fetch fecha derruba o Node 24 no
// Windows ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", rc 127
// em vez do código pedido). Um respiro resolve; medido no bcb em 22/10/2026.
async function sair(codigo) {
  await new Promise((r) => setTimeout(r, 200));
  process.exit(codigo);
}

if (args.includes("--sonda")) {
  const estados = await smoke.sondar();
  await sair(estados.every((e) => e.veredito === "servindo") ? 0 : 2);
}

/**
 * O smoke fala pela ROTA DE USO PRÓPRIO, e isso não é detalhe de estilo.
 *
 * Ele exercita caminhos de erro DE PROPÓSITO, para afirmar que a ferramenta
 * recusa o que tem de recusar. Pela rota pública essas recusas entram na
 * telemetria indistinguíveis de gente batendo numa porta emperrada — e
 * entravam: medido em 11/09/2026, os DOIS primeiros itens da fila de urgências
 * do painel eram este arquivo. No `ilo_get_data`, 30 dos 36 erros da janela
 * vinham das redes da Azure, que são os runners do GitHub Actions, e os outros
 * 6 da máquina do dono: nenhum de terceiro.
 *
 * O desconto de varredura do monitor não pega isto. Ele procura rajada de
 * catálogo e assinatura de sessão repetida, e um smoke é uma sessão pequena e
 * arrumada; pior, a repetição depende da CADÊNCIA DE DEPLOY, então ele era
 * detectado nas semanas movimentadas e passava batido nas calmas. Detecção que
 * depende de quantas vezes publicamos não é critério. Quem sabe que este
 * tráfego é nosso é este arquivo, então é ele que se identifica.
 *
 * A cobertura da rota pública não se perde: `confereRotaPublica()` abre um
 * handshake contra a rota pública antes do roteiro. `initialize` é método de
 * protocolo e o painel os exclui, então sai de graça na telemetria.
 */
const ROTA_MCP = process.env.SMOKE_MCP_ROUTE ?? "/mcp/uso-proprio";

let nextId = 1;
let sessionId = null;

async function rpc(method, params) {
  const res = await fetch(`${BASE}${ROTA_MCP}`, {
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

const chamar = (name, args) => rpc("tools/call", { name, arguments: args });

/** Asserção do roteiro: lança, e o `verificar` registra como defeito do deploy. */
function exigir(condicao, msg) {
  if (!condicao) throw new Error(msg);
}

/** Verificação de que o resto depende: se falhou, conclui e sai agora. */
async function ouPara(resultado) {
  if (resultado !== undefined) return resultado;
  const resumo = smoke.concluir();
  await sair(resumo.codigoDeSaida);
}

// --- Roteiro ----------------------------------------------------------------

/** Handshake contra a rota PÚBLICA, para uma quebra só nela não passar batida. */
async function confereRotaPublica() {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-rota-publica", version: "0.0.0" },
      },
    }),
  });
  const texto = await res.text();
  exigir(res.ok, `rota pública /mcp: HTTP ${res.status} ${texto.slice(0, 200)}`);
  const linha = texto.includes("data:")
    ? texto.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim()
    : texto;
  const nome = JSON.parse(linha)?.result?.serverInfo?.name;
  exigir(nome, `rota pública /mcp sem serverInfo (${texto.slice(0, 200)})`);
  return nome;
}

/**
 * CONTRATO DE SESSÃO (desde 2026-09-17). O Worker emite `Mcp-Session-Id` no
 * initialize para a telemetria ligar as mensagens de um aperto de mão; o
 * handler é stateless e IGNORA o cabeçalho que o cliente devolve. Este teste
 * existe porque isso depende do modo stateless do SDK e do `agents`: um
 * upgrade que passasse a validar sessão quebraria todo cliente que devolve o
 * id — e quebraria aqui, no deploy, antes de virar incidente. O DELETE é 405
 * nos sete servidores (servidor sem sessão não encerra sessão).
 */
async function contratoDeSessao(endpoint) {
  const cab = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const init = await fetch(endpoint, {
    method: "POST", headers: cab,
    body: JSON.stringify({ jsonrpc: "2.0", id: 91, method: "initialize", params: {
      protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "smoke-contrato-sessao", version: "0.0.0" } } })
  });
  await init.text();
  const sid = init.headers.get("mcp-session-id") ?? "";
  exigir(/^[A-Za-z0-9._~-]{1,64}$/.test(sid), `initialize sem Mcp-Session-Id legível (${JSON.stringify(sid)})`);
  const lista = await fetch(endpoint, {
    method: "POST", headers: { ...cab, "mcp-session-id": "contrato-inexistente-" + Date.now() },
    body: JSON.stringify({ jsonrpc: "2.0", id: 92, method: "tools/list", params: {} })
  });
  await lista.text();
  exigir(lista.status === 200, `tools/list com id desconhecido respondeu HTTP ${lista.status} (o handler stateless tem de ignorar o cabeçalho)`);
  const del = await fetch(endpoint, { method: "DELETE", headers: { "mcp-session-id": sid } });
  await del.text();
  exigir(del.status === 405, `DELETE respondeu HTTP ${del.status}, esperado 405 (servidor sem sessão)`);
  return "id emitido no initialize, id desconhecido ignorado, DELETE 405";
}

if (ROTA_MCP !== "/mcp") await ouPara(await smoke.verificar("rota pública /mcp", confereRotaPublica, { detalhe: (n) => n }));
await ouPara(await smoke.verificar("contrato de sessão", () => contratoDeSessao(`${BASE}${ROTA_MCP}`), { detalhe: (d) => d }));

await ouPara(
  await smoke.verificar(
    "initialize",
    async () => {
      const init = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0.0.0" },
      });
      await rpc("notifications/initialized", {}).catch(() => {});
      return init;
    },
    { detalhe: (init) => `${init.serverInfo?.name} ${init.serverInfo?.version} | ${(init.instructions ?? "").slice(0, 60)}...` },
  ),
);

await ouPara(
  await smoke.verificar(
    "tools/list = /status.tool_names",
    async () => {
      const tools = await rpc("tools/list", {});
      const servidas = tools.tools.map((t) => t.name).sort();
      const status = await (await fetch(`${BASE}/status`)).json();
      const anunciadas = [...(status.tool_names ?? [])].sort();
      exigir(anunciadas.length, "/status sem tool_names — o build no ar é anterior a 0.2.0?");
      exigir(
        JSON.stringify(servidas) === JSON.stringify(anunciadas),
        `tools/list ${JSON.stringify(servidas)} ≠ /status.tool_names ${JSON.stringify(anunciadas)}`,
      );
      return servidas;
    },
    { detalhe: (s) => s.join(", ") },
  ),
);

// 1) Catálogo (D1): licença UIS e resposta servida do seed. O `code` do
// primeiro resultado alimenta o uis_get_data abaixo.
const busca = await smoke.verificar(
  "uis_search_indicators (catálogo, licença, cache do seed)",
  async () => {
    const search = await chamar("uis_search_indicators", { query: "completion rate primary", limit: 3, provenance_mode: "detailed" });
    if (search.isError) return search;
    const sc = search.structuredContent;
    exigir(sc.provenance.license.id === "CC-BY-SA-4.0", "licença UIS errada");
    exigir(sc.provenance.served_from_cache === true, "catálogo deveria vir do seed (cache)");
    exigir(sc.indicators?.[0]?.code, "nenhum indicador devolvido para alimentar o uis_get_data");
    return sc;
  },
  { sondas: [], detalhe: (sc) => `${JSON.stringify(sc.indicators.slice(0, 2).map((i) => i.code))} | ${sc.provenance.citation}` },
);

// 2) Geo units (D1).
await smoke.verificar(
  "uis_list_geo_units brazil",
  async () => {
    const geo = await chamar("uis_list_geo_units", { search: "brazil" });
    if (geo.isError) return geo;
    return geo.structuredContent.geo_units;
  },
  { sondas: [], detalhe: (g) => JSON.stringify(g) },
);

// 3) Dados da UIS (release fixada, atribuição com data de extração, nada de ILO).
// Duas idas à Data API: release corrente e dados — as duas sondas explicam uma falha.
if (busca === undefined) {
  smoke.naoMedida("uis_get_data BRA desde 2015", "depende do código que o uis_search_indicators devolveria");
} else {
  const code = busca.indicators[0].code;
  await smoke.verificar(
    `uis_get_data ${code} BRA desde 2015 (release fixada, atribuição, sem ILO)`,
    async () => {
      const data = await chamar("uis_get_data", {
        indicators: [code],
        geo_units: ["BRA"],
        start_year: 2015,
        include_footnotes: true,
        provenance_mode: "detailed",
      });
      if (data.isError) return data;
      const sc = data.structuredContent;
      exigir(sc.provenance.source_url.includes("version="), "consulta UIS sem release fixada");
      exigir(sc.provenance.citation.includes("date of extraction"), "atribuição UIS sem data de extração");
      // Segregação estrutural: nada de ILO neste servidor.
      exigir(!JSON.stringify(sc.provenance).includes("ILOSTAT"), "resposta UIS contaminada com fonte ILO");
      return { sc, footer: data.content[data.content.length - 1].text };
    },
    {
      sondas: ["release", "dados"],
      // A release corrente sai no log de propósito: se diferir da do seed, re-semear (CLAUDE.md).
      detalhe: ({ sc }) =>
        `rows ${sc.rows_count} | release ${sc.provenance.dataset?.version ?? sc.provenance.data_vintage ?? "?"} | ` +
        `sample ${JSON.stringify(sc.rows?.slice(0, 1))}`,
    },
  );
}

// 4) Erro pedagógico — teto de 25 indicadores por chamada: a recusa é o certo,
// e é decidida antes de qualquer ida à origem.
await smoke.verificar(
  "uis_get_data >25 indicadores → isError",
  () => chamar("uis_get_data", { indicators: Array.from({ length: 26 }, (_, i) => `X${i}`) }),
  { esperaErro: true, detalhe: (e) => (e.content?.[0]?.text ?? "").replaceAll(/\s+/g, " ").slice(0, 90) },
);

// 5) Paginação do catálogo (D1).
await smoke.verificar(
  "uis_search_indicators paginação offset=5",
  async () => {
    const page = await chamar("uis_search_indicators", { query: "rate", limit: 5, offset: 5 });
    if (page.isError) return page;
    return page.structuredContent;
  },
  { sondas: [], detalhe: (p) => `showing ${p.showing} | has_more ${p.has_more} | next_offset ${p.next_offset}` },
);

// 6) Deep Research: search (índice sobre o catálogo, D1) → fetch com o 1º id
// devolvido (linha do catálogo + AMOSTRA da Data API) → id desconhecido.
const found = await smoke.verificar(
  "search (Deep Research)",
  async () => {
    const found = await chamar("search", { query: "adult literacy rate" });
    if (found.isError) return found;
    const results = found.structuredContent?.results ?? [];
    exigir(results.length, "search sem resultado");
    exigir(results[0].id.startsWith("ind:"), `id de search sem prefixo ind:: ${results[0].id}`);
    exigir(
      results[0].url.startsWith("https://databrowser.uis.unesco.org/view#indicatorPaths="),
      `url de search não é a página pública do Data Browser: ${results[0].url}`,
    );
    exigir(found.structuredContent.provenance?.license === "CC-BY-SA-4.0", "search sem proveniência UIS");
    exigir(JSON.parse(found.content[0].text).results?.length === results.length, "content de search não é o JSON do contrato");
    return { primeiro: results[0], total: results.length };
  },
  { sondas: [], detalhe: (f) => `${f.total} resultados | [0] = ${f.primeiro.id} — ${f.primeiro.title}` },
);

if (found === undefined) {
  smoke.naoMedida("fetch (Deep Research)", "depende do id que o search devolveria");
} else {
  await smoke.verificar(
    "fetch (Deep Research)",
    async () => {
      const doc = await chamar("fetch", { id: found.primeiro.id });
      if (doc.isError) return doc;
      const d = doc.structuredContent;
      exigir(d?.id === found.primeiro.id, "fetch não devolveu o documento pedido");
      exigir(d.provenance?.source_url?.includes("indicator="), "fetch sem proveniência da amostra (source_url da Data API)");
      exigir(d.provenance.citation.includes("date of extraction"), "fetch sem atribuição UIS");
      return d;
    },
    {
      sondas: ["release", "dados"],
      detalhe: (d) => `${d.title} | url ${d.url} | text: ${(d.text ?? "").split("\n").slice(0, 2).join(" / ").slice(0, 100)}`,
    },
  );
}

// Id desconhecido: recusado pelo índice, sem tocar a origem — a recusa é o certo.
await smoke.verificar(
  "fetch id desconhecido → isError",
  () => chamar("fetch", { id: "ind:NAO.EXISTE" }),
  { esperaErro: true, detalhe: (e) => (e.content?.[0]?.text ?? "").replaceAll(/\s+/g, " ").slice(0, 80) },
);

const resumo = smoke.concluir();
console.log(resumo.codigoDeSaida === 0 ? (resumo.naoMedidas.length > 0 ? "\nSMOKE OK com aviso de fonte" : "\nSMOKE OK") : "\nSMOKE FALHOU");
await sair(resumo.codigoDeSaida);
