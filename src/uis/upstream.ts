/**
 * A ida à origem: timeout, retry, orçamento — e a CONTAGEM que alimenta o bloco
 * `retrieval` do contrato de proveniência.
 *
 * Até a 1.0.0 nenhum dos três `fetch` deste servidor (release corrente, dados,
 * catálogo em memória do stdio) tinha timeout, retry ou AbortSignal: uma
 * conexão pendurada prendia a chamada da tool até o cliente desistir, e um
 * 503 transitório virava erro na primeira tentativa. Desde a 1.1.0
 * (27/09/2026) a ida é do `@sbissoli/mcp-upstream`, o fetch comum do
 * portfólio: retry com backoff e `Retry-After`, timeout por tentativa,
 * orçamento total por ida e a contagem de idas, tentativas e anomalias que
 * sai na proveniência de toda resposta. O pacote CLASSIFICA; este módulo DECIDE.
 *
 * Os números (`UPSTREAM_POLICY`) são a PRIMEIRA política que o servidor tem,
 * não a preservação de uma antiga — decisão de 27/09/2026, MEDIDA antes de
 * fixar (curl à Data API, mesmo User-Agent do servidor). A UIS é rápida e
 * está atrás de CloudFront + API Gateway da AWS (cabeçalhos `Via: CloudFront`
 * e `x-amzn-RequestId`): release corrente 1,1 s; consulta pequena 0,8 s; um
 * indicador inteiro (todas as geo units, todos os anos) 1,4 s e 317 KB; cinco
 * indicadores inteiros 2,9 s e 3,5 MB (5,2 MB com footnotes); os dois
 * downloads do catálogo 1,9 s e 0,8 s. A consulta que ESTOURA o teto de 100k
 * registros é recusada em 0,9 s com o 400 pedagógico — a UIS conta antes de
 * servir, não baixa para depois recusar. Nenhum 504 observado.
 *  - 35 s por tentativa: dez vezes o pior caso legítimo medido, e acima dos
 *    29 s de timeout de integração do API Gateway — se a origem da UIS
 *    pendurar, o 5xx do próprio gateway chega antes do nosso corte, e a
 *    mensagem que sai é a dele. O teto existe para a conexão pendurada, não
 *    para apressar a UIS (o ilo precisou de 65 s porque o gateway da OIT leva
 *    61 s para recusar; aqui o número é outro porque a origem é outra);
 *  - 2 retries (3 tentativas) para o que é transitório, backoff 1 s → 4 s
 *    sem jitter (os testes contam o relógio);
 *  - 45 s de orçamento total: cabem 3 tentativas de falha rápida (503 em
 *    menos de 1 s, 429) com as esperas; não cabe uma segunda tentativa de
 *    35 s — e não deve caber, o cliente MCP tem paciência finita.
 *
 * O que repete e o que não (`retryOn`):
 *  - 5xx, 429 (honrando `Retry-After`) e falha de rede repetem — o padrão do pacote;
 *  - **timeout NÃO repete**: a tentativa que estourou já gastou 35 s; a
 *    resposta é o erro legível ("timed out"), com "retrying later may
 *    succeed" acrescentado por `toToolError`;
 *  - **504 NÃO repete**: no API Gateway é o timeout de integração de 29 s —
 *    a mesma classe do nosso timeout, com o mesmo custo já pago;
 *  - **400 NÃO repete** (o pacote já não repete 4xx): é o 400 PEDAGÓGICO da
 *    UIS, com a contagem exata de registros — `fetchUisData` lê o corpo pelo
 *    `body` do erro e o devolve como `UisUserError`, como sempre fez;
 *  - 404 não repete (o pacote já não repete): na Data API é rota inexistente,
 *    não ausência de dado — a UIS responde ausência com 200 e `hints`; segue
 *    sendo `UisUpstreamError`, como sempre foi;
 *  - **200 que não é JSON NÃO repete**: nunca medido na UIS. O pacote
 *    repetiria por padrão porque o bcb mediu HTML-em-200 transitório na origem
 *    DELE; aqui é paridade com o que este servidor sempre fez (o `res.json()`
 *    lançava e a chamada caía). Quando for medido, é uma linha em `retryOn`.
 *
 * O que MUDOU para quem chama: timeout e falha de rede deixam de vazar o
 * `TypeError` do fetch — que `toToolError` relançava como erro JSON-RPC cru e
 * `classifyThrown` gravava como `defeito` — e viram `UisUpstreamError` com
 * status 0: isError legível ("retrying later may succeed") e classe `fonte`
 * na telemetria (a mensagem diz "upstream"). O erro genérico do catálogo em
 * memória ("UNESCO UIS catalogue HTTP …", que relançava) vira o mesmo
 * `UisUpstreamError`.
 *
 * O coletor por chamada: `withUpstreamCall` abre UM `UpstreamCall` por chamada
 * de tool, propagado por `AsyncLocalStorage` (Worker com `nodejs_compat`;
 * stdio em Node). `withUsage` o chama para toda tool `uis_*`; os handlers de
 * `search`/`fetch` (registrados pelo `@sbissoli/mcp-search`, fora do
 * `withUsage`) o chamam eles mesmos — senão o `retrieval` deles sairia `null`
 * mentindo. Chamada aninhada REUSA o coletor aberto. `uisProvenance` lê
 * `currentRetrieval()`. Fora de um coletor (chamada direta de handler em
 * teste) a ida ganha um descartável — a política vale — e a proveniência sai
 * `retrieval: null` ("não medido"), nunca quebra.
 *
 * O acerto de KV da release é registrado no coletor (`recordCache`, com o instante
 * da extração original guardado junto ao valor) e a linha do catálogo do `fetch`
 * também (o instante do seed): não contam no `retrieval` — não foram idas à
 * origem —, mas entram no `field_sources` que `uisProvenance` monta pelo
 * `call.fieldSource`, e o `retrieved_at` do bloco é o mais antigo entre as
 * partes (desde a 1.5.1; até a 1.5.0 era o dos dados, o mais novo). Os três downloads paralelos do
 * catálogo em memória (`Promise.all`) contam como 3 idas na chamada que os
 * dispara — a primeira busca do stdio — e nunca mais (promise compartilhada).
 */

import {
  createUpstream,
  defaultRetryOn,
  UpstreamError,
  type RetryContext,
  type Upstream,
  type UpstreamCall,
} from "@sbissoli/mcp-upstream";
import { currentCall, withCall } from "@sbissoli/mcp-upstream/als";
import type { RetrievalInput } from "@sbissoli/mcp-provenance";
import type { ErrorClass } from "../call-shape.js";

/**
 * User-Agent identificável (política do portfólio: sysadmins upstream devem
 * conseguir chegar ao contato). O mesmo do seed (scripts/seed-uis-catalog.mjs).
 */
export const USER_AGENT = "uis-mcp-server (https://uis.sidneybissoli.com; sbissoli76@gmail.com)";

/** A política de rede do servidor (ver o cabeçalho: números medidos em 27/09/2026). */
export const UPSTREAM_POLICY = {
  /** Teto de UMA tentativa (cabeçalhos + corpo) — acima dos 29 s do API Gateway. */
  timeoutMs: 35_000,
  /** Retries além da primeira tentativa (só para o que é transitório — ver `retryUpstream`). */
  retries: 2,
  /** Orçamento TOTAL de uma ida, esperas incluídas. */
  budgetMs: 45_000,
  backoff: { baseMs: 1_000, maxMs: 4_000, jitterMs: 0 },
} as const;

/**
 * Erro do upstream UIS (não é uso errado da tool): status + trecho do corpo.
 * `status` 0 = a origem não respondeu (timeout, rede): a mensagem diz
 * "unreachable" em vez de "HTTP 0". Nos dois casos ela contém "upstream", que
 * é o que `classifyError` lê para a classe `fonte`.
 */
export class UisUpstreamError extends Error {
  readonly status: number;
  /**
   * A classe pelo TIPO, não pela frase (ver `CLASSE_DO_ERRO` em call-shape.ts):
   * 404 é a origem dizendo que não existe; todo o resto é a origem falhando.
   */
  readonly classe: ErrorClass;
  constructor(status: number, context: string, bodySnippet: string) {
    super(
      status === 0
        ? `UNESCO UIS upstream unreachable (${context}): ${bodySnippet}`
        : `UNESCO UIS upstream HTTP ${status} (${context}): ${bodySnippet}`,
    );
    this.name = "UisUpstreamError";
    this.status = status;
    this.classe = status === 404 ? "nao_encontrado" : "fonte";
  }
}

/**
 * I/O da espera entre tentativas, num objeto para os testes trocarem
 * (`vi.spyOn(upstreamIo, "sleep")`): o 503 permanente de um stub custaria
 * 3 s reais de backoff por teste.
 */
export const upstreamIo = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A decisão de repetir uma tentativa que falhou (o pacote diz a classe). */
export function retryUpstream(ctx: RetryContext): boolean {
  // A tentativa que estourou já gastou 35 s — ninguém espera isso duas vezes.
  if (ctx.kind === "timeout") return false;
  // O timeout de integração do API Gateway (29 s): mesma classe, mesmo custo já pago.
  if (ctx.status === 504) return false;
  // 200 que não é JSON: nunca medido na UIS — paridade (ver cabeçalho).
  if (ctx.kind === "malformed_body") return false;
  return defaultRetryOn(ctx);
}

/**
 * A política de rede na forma do pacote, com a ligação TARDIA ao `fetch`
 * global — os testes o dublam depois de o módulo carregar.
 */
export function upstreamUis(): Upstream {
  return createUpstream({
    userAgent: USER_AGENT,
    timeoutMs: UPSTREAM_POLICY.timeoutMs,
    retries: UPSTREAM_POLICY.retries,
    budgetMs: UPSTREAM_POLICY.budgetMs,
    backoff: UPSTREAM_POLICY.backoff,
    honorRetryAfter: true,
    retryOn: retryUpstream,
    sleep: (ms) => upstreamIo.sleep(ms),
    fetchImpl: (input, init) => globalThis.fetch(input, init),
  });
}

/**
 * Abre o coletor de UMA chamada de tool e roda `fn` dentro dele — ou reusa o
 * que já está aberto, se `fn` é um passo de uma chamada maior.
 */
export function withUpstreamCall<T>(fn: () => Promise<T>): Promise<T> {
  return currentCall() ? fn() : withCall(upstreamUis(), () => fn());
}

/** O coletor da chamada corrente; fora de uma, um descartável (a ida ainda tem política). */
export function upstreamCall(): UpstreamCall {
  return currentCall() ?? upstreamUis().call();
}

/** O `retrieval` medido nesta chamada — `null` fora de um coletor ou sem ida à origem. */
export function currentRetrieval(): RetrievalInput | null {
  return currentCall()?.retrieval() ?? null;
}

/** O status HTTP da resposta final, quando uma chegou. */
export function upstreamStatus(e: unknown): number | undefined {
  return e instanceof UpstreamError ? e.status : undefined;
}

/** O corpo da resposta final (texto cru), quando uma chegou — é nele que a UIS explica o 400. */
export function upstreamBody(e: unknown): string | undefined {
  return e instanceof UpstreamError ? e.body : undefined;
}

/**
 * Do erro do pacote (classe + contagem) ao erro que o resto do servidor lê
 * (`UisUpstreamError`, por `instanceof` em `tools/errors.ts`). Qualquer
 * outro erro passa intacto.
 */
export function translateUpstreamError(e: unknown, context: string): unknown {
  if (!(e instanceof UpstreamError)) return e;
  const tries = e.attempts === 1 ? "1 attempt" : `${e.attempts} attempts`;
  switch (e.kind) {
    // Cada fragmento abaixo tem de ter classe SOZINHO em `classifyError` (a
    // guarda de call-shape.test.ts lê os literais desta chamada, não a
    // mensagem montada): "timeout", "upstream" → `fonte`.
    case "timeout":
      return new UisUpstreamError(
        0,
        context,
        `timeout after ${tries} (${UPSTREAM_POLICY.timeoutMs / 1000} s each)`,
      );
    case "network":
      return new UisUpstreamError(0, context, `network error after ${tries}: ${causeText(e.cause)}`);
    case "aborted":
      return new UisUpstreamError(0, context, "upstream request aborted");
    case "malformed_body":
      return new UisUpstreamError(e.status ?? 200, context, "malformed upstream response: body is not valid JSON");
    default: {
      // Um status chegou: http_4xx, http_5xx, rate_limited, not_found. O corpo
      // vai junto, cortado — é nele que a UIS diz o motivo.
      const snippet = (e.body ?? "").slice(0, 300);
      return new UisUpstreamError(
        e.status ?? 0,
        context,
        e.attempts > 1 ? `${snippet} (after ${tries})` : snippet,
      );
    }
  }
}

function causeText(cause: unknown): string {
  if (cause instanceof Error) return cause.message || cause.name;
  return cause === undefined ? "unknown" : String(cause);
}
