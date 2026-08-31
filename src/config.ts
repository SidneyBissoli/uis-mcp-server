/**
 * Identidade e tunáveis do servidor — o arquivo central que uma instância nova edita
 * (junto com wrangler.jsonc e package.json). Os demais módulos leem daqui.
 *
 * Idioma do servidor: inglês (persona-alvo internacional — pesquisadores de educação,
 * política científica e economia da cultura; dados da UIS são publicados em inglês).
 * Fuso: UTC.
 */

import type { ProvenanceContextOptions } from "@sbissoli/mcp-provenance";

export const SERVER_CONFIG = {
  /** Nome curto do servidor (handshake MCP, /status, landing). */
  name: "uis-mcp-server",
  /** Versão do servidor — manter em sincronia com package.json. */
  version: "0.1.0",
  /** Título de exibição (clientes MCP mostram ao usuário). */
  title: "UNESCO UIS — Education, Science & Culture Statistics (provenance-first)",
  /**
   * Site do servidor. Declarado em TRÊS lugares que não podem discordar —
   * `server.json` (o que o registry publica), `package.json` (homepage) e
   * `serverInfo.websiteUrl` do handshake. Até 30/08/2026 só o manifesto
   * declarava e o handshake calava; preso agora por
   * tests/serverinfo-sync.test.ts.
   */
  websiteUrl: "https://uis.sidneybissoli.com",
  /** Uma frase: o que o servidor serve e de qual fonte. */
  description:
    "MCP server for the UNESCO Institute for Statistics (UIS) Data API: search ~5,000 " +
    "indicators on education, science/R&D, culture and communication and retrieve data by " +
    "country, region and year — every response carries a deterministic provenance and " +
    "attribution block with the full source URL and date of extraction.",
  /**
   * Contato exibido na landing page. A URL raiz do Worker é o que sysadmins upstream
   * veem no User-Agent — precisa resolver para identificação humana + contato.
   */
  contactEmail: "sbissoli76@gmail.com",
  /** Rota do endpoint MCP (Streamable HTTP). */
  mcpRoute: "/mcp",
  /**
   * Instruções do handshake MCP: o que o servidor cobre e quando o cliente NÃO deve
   * usá-lo (critério do diretório Anthropic).
   */
  instructions:
    "Statistics from the UNESCO Institute for Statistics (UIS) via the official Data API: " +
    "education (enrolment, completion, literacy, spending), science/R&D (SDG 9.5), culture " +
    "(SDG 11.4) and communication indicators, by country or region and year. Typical flow: " +
    "uis_search_indicators to find an indicator code, uis_list_geo_units for country/region " +
    "codes, then uis_get_data with year filters. Do not use this server for statistics not " +
    "published by the UIS (e.g. labour, health, trade, GDP).",
  /**
   * Hostnames aceitos no header Host. A lista SUBSTITUI os defaults do
   * createMcpHandler (localhost e *.workers.dev) — por isso inclui também o
   * hostname workers.dev e os de dev local, além do domínio próprio.
   */
  extraAllowedHostnames: [
    "uis.sidneybissoli.com",
    "uis-mcp-server.sidneybissoli.workers.dev",
    "localhost",
    "127.0.0.1",
  ] as string[],
} as const;

/** Contexto de proveniência do servidor: namespace reverse-DNS próprio, inglês, UTC. */
export const PROVENANCE_OPTIONS: ProvenanceContextOptions = {
  metaNamespace: "com.sidneybissoli.uis",
  locale: "en",
  timezone: "utc",
};

/**
 * Rate limit de entrada por cliente (IP), aplicado às rotas não-públicas.
 * Token bucket em memória por isolate: proteção contra abuso acidental/burst, não um
 * limite global exato (recicla com o isolate; instâncias em POPs distintos não somam).
 */
export const RATE_LIMIT = {
  /** Burst máximo por cliente. */
  clientBurst: 20,
  /** Reposição de tokens por segundo por cliente. */
  clientRefillPerSec: 5,
  /** Teto de buckets rastreados por isolate (evicção FIFO ao estourar). */
  maxClientBuckets: 1000,
} as const;

/** Tunáveis do domínio UIS (medições do mini-spike, docs/06 do projeto ilostat). */
export const UIS_LIMITS = {
  /** Teto de indicadores por chamada de uis_get_data. */
  maxIndicatorsPerCall: 25,
  /**
   * Teto de registros devolvidos numa resposta (proteção do contexto do cliente
   * MCP — o upstream aceita até 100k). Acima disso: erro pedagógico com a
   * contagem real; nunca truncar silenciosamente (dado parcial apresentado como
   * completo viola o contrato anti-alucinação). Reavaliar com uso real.
   */
  maxRecordsPerResponse: 5000,
  /** TTL do cache KV da release corrente (/versions/default — fonte do data_vintage). */
  releaseTtlSeconds: 24 * 3600,
} as const;

/**
 * Texto da LANDING PAGE — a única superfície própria do produto, e por isso a
 * única que responde por ele numa busca. Até 2026-08-31 a página tinha oito
 * linhas de corpo, sem `meta description`, sem og:, sem dado estruturado e sem
 * link para o repositório: não havia o que indexar.
 *
 * `lang` segue o PÚBLICO do produto, não a língua do código. O bloco
 * `emOutroIdioma` não é rodapé de cortesia: é seção com resumo e exemplos
 * próprios, porque é texto indexável.
 */
export const LANDING = {
  lang: "en" as "pt-BR" | "en",
  resumo:
    "MCP server for the UNESCO Institute for Statistics: ~5,000 indicators on " +
    "education, science, culture and communication, by country, region and year.",
  exemplos: [
    "“What is Brazil’s out-of-school rate for primary education?”",
    "“Compare R&D spending as a share of GDP across South America.”",
    "“Which UIS indicators cover adult literacy?”",
  ] as readonly string[],
  destaques: [
    "The data release is pinned on every query, so the same question gives the same answer tomorrow.",
    "Every response carries a provenance block with the full source URL and the date of extraction.",
    "The indicator catalogue and the 462 geo units are served locally — searching costs no upstream call.",
  ] as readonly string[],
  repoUrl: "https://github.com/SidneyBissoli/uis-mcp-server",
  npmUrl: "" as string,
  docsUrl: "https://github.com/SidneyBissoli/uis-mcp-server/blob/main/README.md",
  emOutroIdioma: {
    lang: "pt-BR" as "pt-BR" | "en",
    resumo:
      "Em português: estatísticas do Instituto de Estatística da UNESCO (UIS) para o seu " +
      "assistente de IA — educação, ciência e P&D, cultura e comunicação, por país, " +
      "região e ano, com release fixada e procedência em toda resposta.",
    exemplos: [
      "“Qual a taxa de crianças fora da escola no ensino fundamental no Brasil?”",
      "“Compare o gasto em P&D como % do PIB na América do Sul.”",
    ] as readonly string[],
  },
} as const;
