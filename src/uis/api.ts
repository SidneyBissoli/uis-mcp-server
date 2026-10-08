/**
 * Cliente da UIS Data API (api.uis.unesco.org) com cache KV da release corrente.
 *
 * Medições do mini-spike (docs/06 do projeto, 07/08/2026):
 *  - JSON puro (não SDMX): `{hints, records[], indicatorMetadata[]}`;
 *  - sem autenticação e sem rate limiting declarado; cache CloudFront agressivo
 *    keyed pela URL completa — por isso toda chamada de dados fixa `version`
 *    explícita (release corrente resolvida de /versions/default, KV TTL 24 h);
 *  - teto upstream de 100.000 registros por consulta (HTTP 400 pedagógico com a
 *    contagem exata — a mensagem é repassada ao cliente).
 *
 * A ida à rede (timeout, retry, contagem para o `retrieval` da proveniência)
 * é de `upstream.ts`, desde a 1.1.0; aqui fica o que a resposta SIGNIFICA.
 */

import type { ErrorClass } from "../call-shape.js";
import { UIS_LIMITS } from "../config.js";
import type { Env } from "../types.js";
import {
  translateUpstreamError,
  upstreamBody,
  upstreamCall,
  upstreamStatus,
  USER_AGENT,
  UisUpstreamError,
} from "./upstream.js";

// A classe vive em `upstream.ts` (nasce da tradução do erro do pacote); quem
// sempre a importou daqui continua importando daqui.
export { UisUpstreamError };

export const UIS_BASE = "https://api.uis.unesco.org/api/public";
export const UIS_API_VERSION = "1.0.2";

/**
 * Erro de USO da tool (não é falha do servidor nem do upstream): a mensagem é
 * pedagógica e volta intacta ao cliente como isError.
 *
 * A classe nasce com o erro (ver `CLASSE_DO_ERRO` em call-shape.ts) e
 * `toToolError` a anexa ao resultado: o hook não cai na frase. Padrão
 * `contrato` (culpa de quem chamou); quem lança por OUTRO motivo — a UIS
 * respondeu que o código não existe — declara a classe no construtor. Sem
 * isso, o código ecoado na frase decidia: `LR.INVALID` casava `invalid` e
 * saía `contrato`.
 */
export class UisUserError extends Error {
  readonly classe: ErrorClass;
  constructor(message: string, classe: ErrorClass = "contrato") {
    super(message);
    this.name = "UisUserError";
    this.classe = classe;
  }
}

/** ISO-8601 sem milissegundos (formato canônico do contrato de proveniência). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Headers de toda chamada ao upstream — o mesmo User-Agent do seed (scripts/seed-uis-catalog.mjs). */
export function upstreamHeaders(): Record<string, string> {
  return { "User-Agent": USER_AGENT };
}

/**
 * UMA ida JSON à UIS pelo coletor da chamada corrente: política de rede do
 * servidor, contagem no `retrieval`, e o erro do pacote traduzido para o que
 * `tools/errors.ts` lê. `context` é o que a mensagem diz entre parênteses.
 */
async function getUisJson<T>(url: string, context: string): Promise<T> {
  try {
    return await upstreamCall().json<T>(url, { headers: upstreamHeaders() });
  } catch (e) {
    throw translateUpstreamError(e, context);
  }
}

export interface UisRelease {
  version: string;
  publicationDate: string;
  themes: Array<{ theme: string; lastUpdate: string; description: string }>;
}

export interface UisReleaseWithOrigin {
  release: UisRelease;
  retrievedAt: string;
  servedFromCache: boolean;
}

const RELEASE_KV_KEY = "uis:default-version";

/** O endpoint da release corrente — também a `source_url` da sub-fonte "release" na proveniência. */
export const UIS_RELEASE_URL = `${UIS_BASE}/versions/default`;

interface Cached<T> {
  retrievedAt: string;
  value: T;
}

/**
 * Release corrente (`/versions/default`) — KV TTL 24 h. É a fonte do
 * `data_vintage` UIS e a `version` fixada em toda consulta de dados.
 *
 * O acerto de KV é registrado no coletor da chamada (`recordCache`) com o
 * instante da extração ORIGINAL: não conta como ida à origem no `retrieval`
 * (contrato §3), mas entra no instante e no `served_from_cache` da resposta.
 * Até a 1.5.0 este instante era devolvido e descartado por quem chamava, e a
 * resposta de dados dizia "extraído agora" com uma release de até 24 h.
 */
export async function getDefaultRelease(env: Env): Promise<UisReleaseWithOrigin> {
  const url = UIS_RELEASE_URL;
  const hit = await env.UIS_CACHE?.get<Cached<UisRelease>>(RELEASE_KV_KEY, "json");
  if (hit) {
    if (!Number.isNaN(Date.parse(hit.retrievedAt))) upstreamCall().recordCache(url, hit.retrievedAt);
    return { release: hit.value, retrievedAt: hit.retrievedAt, servedFromCache: true };
  }

  // `!ok` de qualquer status (404 incluído) sempre foi `UisUpstreamError`
  // aqui — a tradução do pacote preserva isso.
  const body = await getUisJson<{
    version: string;
    publicationDate: string;
    themeDataStatus?: Array<{ theme: string; lastUpdate: string; description: string }>;
  }>(url, "default version");
  const retrievedAt = nowIso();
  const release: UisRelease = {
    version: body.version,
    publicationDate: body.publicationDate,
    themes: body.themeDataStatus ?? [],
  };
  await env.UIS_CACHE?.put(RELEASE_KV_KEY, JSON.stringify({ retrievedAt, value: release }), {
    expirationTtl: UIS_LIMITS.releaseTtlSeconds,
  });
  return { release, retrievedAt, servedFromCache: false };
}

export interface UisFootnote {
  type: string | null;
  subtype: string | null;
  value: string | null;
}

export interface UisRecord {
  indicatorId: string;
  geoUnit: string;
  year: number;
  value: number | null;
  magnitude: string | null;
  qualifier: string | null;
  footnotes?: UisFootnote[];
}

export interface UisDataQuery {
  indicators: string[];
  geoUnits?: string[] | undefined;
  start?: number | undefined;
  end?: number | undefined;
  footnotes?: boolean | undefined;
}

/**
 * A dica que o PRÓPRIO upstream manda junto da resposta. Medido em 24/09/2026
 * — a API distingue três ausências, com código para cada uma, e o servidor
 * jogava as três fora:
 *
 *   001  "The indicator could not be found, XX.INDICADOR.FALSO"
 *   003  "The geoUnit could not be found, ZZZ"
 *   004  "No data for the given time range, available time range for
 *         indicator LR.AG15T99= start: 1970, end: 2024"
 *
 * As duas primeiras dizem que o CÓDIGO não existe; a terceira, que o código
 * existe e não tem dado naquele recorte. São conclusões opostas, e até
 * 24/09/2026 o servidor respondia às três com a mesma frase — "many indicators
 * do not cover all countries or years" —, que afirma o contrário da fonte para
 * as duas primeiras.
 */
export interface UisHint {
  code?: string;
  message?: string;
}

/** Os códigos em que a fonte diz "esse identificador não existe". */
export const UIS_HINTS_INEXISTENCIA = new Set(["UIS::HINT::001", "UIS::HINT::003"]);

/** As mensagens de inexistência da resposta, na palavra da própria fonte. */
export function mensagensDeInexistencia(hints: readonly UisHint[]): string[] {
  return hints
    .filter((h) => h.code !== undefined && UIS_HINTS_INEXISTENCIA.has(h.code))
    .map((h) => h.message?.trim())
    .filter((m): m is string => Boolean(m));
}

/** Toda mensagem de dica da resposta, inexistência ou não. */
export function mensagensDeDica(hints: readonly UisHint[]): string[] {
  return hints.map((h) => h.message?.trim()).filter((m): m is string => Boolean(m));
}

export interface UisDataWithOrigin {
  records: UisRecord[];
  /** As dicas que a fonte mandou — vazio quando ela não tem ressalva nenhuma. */
  hints: UisHint[];
  /** Instante da extração dos DADOS (buscados nesta chamada — dados nunca são cacheados). */
  retrievedAt: string;
  /** URL canônica que reproduz a consulta, com a release fixada (vai na proveniência). */
  sourceUrl: string;
  release: UisRelease;
  /**
   * A release é OUTRA parte da resposta, de outro endpoint e quase sempre de outro
   * instante (KV, até 24 h): dela saem `data_vintage` e `dataset.version`. A
   * proveniência a declara como sub-fonte própria (`field_sources`).
   */
  releaseRetrievedAt: string;
  releaseServedFromCache: boolean;
}

/**
 * URL canônica de dados — sempre com `version` explícita (pinagem da release +
 * aproveitamento do cache CloudFront, que é keyed pela URL completa).
 */
export function uisDataUrl(query: UisDataQuery, version: string): string {
  const qs = new URLSearchParams();
  for (const ind of query.indicators) qs.append("indicator", ind);
  for (const g of query.geoUnits ?? []) qs.append("geoUnit", g);
  if (query.start !== undefined) qs.set("start", String(query.start));
  if (query.end !== undefined) qs.set("end", String(query.end));
  if (query.footnotes) qs.set("footnotes", "true");
  qs.set("version", version);
  return `${UIS_BASE}/data/indicators?${qs.toString()}`;
}

/** Dados nunca são cacheados: toda chamada é um fetch real ao upstream. */
export async function fetchUisData(env: Env, query: UisDataQuery): Promise<UisDataWithOrigin> {
  const { release, retrievedAt: releaseRetrievedAt, servedFromCache: releaseServedFromCache } =
    await getDefaultRelease(env);
  const url = uisDataUrl(query, release.version);
  let body: { records?: UisRecord[]; hints?: UisHint[] };
  try {
    body = await upstreamCall().json(url, { headers: upstreamHeaders() });
  } catch (e) {
    if (upstreamStatus(e) === 400) {
      // O 400 do upstream é pedagógico (traz a contagem exata quando estoura o
      // teto de 100k registros; medido em 27/09/2026: chega em 0,9 s, a UIS
      // conta antes de servir) — repassa a mensagem e orienta os filtros da
      // tool. O pacote não repete 4xx e entrega o corpo no erro.
      throw new UisUserError(
        `${mensagemDo400(upstreamBody(e)) ?? "The UIS API rejected the query (HTTP 400)."} ` +
          "Narrow the query: fewer indicators, specific geo_units, or a shorter start/end year range.",
        // Declarado, não pelo padrão por acaso: a UIS recusou o recorte pedido.
        "contrato",
      );
    }
    throw translateUpstreamError(e, `data ${query.indicators.join(",")}`);
  }
  const retrievedAt = nowIso();
  const records = body.records ?? [];
  const hints = body.hints ?? [];
  // Ausência na BORDA DA REDE, não no formatador. Quando a fonte diz que o
  // identificador não existe E não sobrou registro nenhum, a resposta honesta é
  // a dela — não um zero com conselho de cobertura. O caso MISTO (medido: um
  // indicador bom e um falso devolvem `records: 2` + a dica 001) NÃO cai aqui:
  // lançar apagaria dado real. Ali a ressalva viaja com os dados, em `warnings`.
  const inexistencia = mensagensDeInexistencia(hints);
  if (records.length === 0 && inexistencia.length > 0) {
    // A classe é DECLARADA (`nao_encontrado`: a fonte respondeu que não
    // existe). Pela frase, a dica da UIS vem na frente e ecoa o código pedido:
    // com `LR.INVALID`, `invalid` casava antes de "was not found" e saía
    // `contrato`. "was not found" fica no texto para o leitor e para a guarda
    // de `call-shape`, que varre estas mensagens.
    throw new UisUserError(
      `${inexistencia.join(" ")} This code was not found in the current UIS release — ` +
        "check it with uis_search_indicators (indicators) or uis_list_geo_units (geo units).",
      "nao_encontrado",
    );
  }
  return { records, hints, retrievedAt, sourceUrl: url, release, releaseRetrievedAt, releaseServedFromCache };
}

/** A `message` do corpo JSON do 400 da UIS; `undefined` se o corpo não for esse JSON. */
function mensagemDo400(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { message?: unknown } | null;
    return typeof parsed?.message === "string" ? parsed.message : undefined;
  } catch {
    return undefined;
  }
}
