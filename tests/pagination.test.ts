/**
 * O guarda de cursor (src/pagination.ts) e as DUAS premissas que o sustentam.
 *
 *   1. nenhuma lista deste servidor pagina — sem `nextCursor`, todo cursor é
 *      inválido, e é isso que autoriza recusar qualquer um;
 *   2. a lista de métodos guardados é a dos métodos que o servidor SERVE. Para
 *      um método não registrado a resposta certa é `-32601` (method not found),
 *      e recusar com `-32602` fingiria que o método existe.
 *
 * Nenhuma das duas é declarada aqui: as duas são lidas do servidor REAL, pelo
 * transporte em memória. No dia em que alguém registrar resources ou prompts —
 * ou paginar alguma lista — sem mexer no guarda, é este teste que quebra.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  INVALID_PARAMS,
  PAGINATED_LIST_METHODS,
  cursorRejection,
  unknownCursorError,
} from "../src/pagination.js";
import { buildServer } from "../src/server.js";

/** Os quatro métodos de lista paginável que a spec define. */
const TODAS_AS_LISTAS = [
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "prompts/list",
] as const;

const METHOD_NOT_FOUND = -32601;

describe("premissas, lidas do servidor real", () => {
  let client: Client;

  beforeAll(async () => {
    const server = buildServer({});
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "pagination", version: "0.0.0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
  });
  afterAll(async () => {
    await client.close();
  });

  it("o guarda cobre exatamente as listas que este servidor serve", async () => {
    const servidas: string[] = [];
    for (const method of TODAS_AS_LISTAS) {
      try {
        await client.request({ method, params: {} }, undefined);
        servidas.push(method);
      } catch (e) {
        // Método não registrado responde -32601; qualquer outro erro é notícia.
        const code = (e as { code?: number }).code;
        expect(code, `${method} falhou por um motivo inesperado`).toBe(METHOD_NOT_FOUND);
      }
    }
    expect(
      servidas.sort(),
      "a lista de src/pagination.ts divergiu do que o servidor serve",
    ).toEqual([...PAGINATED_LIST_METHODS].sort());
  });

  it("a lista de tools cabe numa página só — não devolve nextCursor", async () => {
    const pagina = await client.listTools();
    expect(
      (pagina as { nextCursor?: string }).nextCursor,
      "tools/list passou a paginar — a recusa de src/pagination.ts deixou de valer",
    ).toBeUndefined();
  });
});

describe("unknownCursorError", () => {
  const requisicao = (method: string, params?: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: 7,
    method,
    ...(params ? { params } : {}),
  });

  it("recusa a lista guardada com -32602, preservando o id", () => {
    for (const method of PAGINATED_LIST_METHODS) {
      const erro = unknownCursorError(requisicao(method, { cursor: "invalido" }));
      expect(erro?.error.code).toBe(INVALID_PARAMS);
      expect(erro?.id).toBe(7);
      expect(erro?.error.message).toContain(method);
    }
  });

  it("deixa passar a lista sem cursor — o caso normal", () => {
    for (const method of PAGINATED_LIST_METHODS) {
      expect(unknownCursorError(requisicao(method))).toBeUndefined();
      expect(unknownCursorError(requisicao(method, {}))).toBeUndefined();
    }
  });

  it("cursor vazio ou nulo também é cursor: recusado, não ignorado", () => {
    expect(unknownCursorError(requisicao("tools/list", { cursor: "" }))?.error.code).toBe(INVALID_PARAMS);
    expect(unknownCursorError(requisicao("tools/list", { cursor: null }))?.error.code).toBe(INVALID_PARAMS);
  });

  it("não se mete com método que este servidor não serve — lá o -32601 é a resposta certa", () => {
    expect(unknownCursorError(requisicao("resources/list", { cursor: "x" }))).toBeUndefined();
    expect(unknownCursorError(requisicao("prompts/list", { cursor: "x" }))).toBeUndefined();
  });

  it("não se mete com o que não é requisição de lista", () => {
    expect(unknownCursorError(requisicao("tools/call", { cursor: "x" }))).toBeUndefined();
    expect(unknownCursorError(requisicao("initialize", { cursor: "x" }))).toBeUndefined();
    // Notificação (sem id): não há resposta a devolver.
    expect(unknownCursorError({ jsonrpc: "2.0", method: "tools/list", params: { cursor: "x" } })).toBeUndefined();
    // Lote e lixo ficam com o SDK, que já tem erro próprio para eles.
    expect(unknownCursorError([requisicao("tools/list", { cursor: "x" })])).toBeUndefined();
    expect(unknownCursorError("tools/list")).toBeUndefined();
    expect(unknownCursorError(null)).toBeUndefined();
    expect(unknownCursorError({ id: 1, method: "tools/list", params: { cursor: "x" } })).toBeUndefined();
  });
});

describe("cursorRejection (borda HTTP)", () => {
  const post = (body: unknown): Request =>
    new Request("https://uis.sidneybissoli.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("responde 200 com o erro JSON-RPC no corpo — a falha é de protocolo", async () => {
    const req = post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { cursor: "x" } });
    const res = await cursorRejection(req, "*");
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Content-Type")).toBe("application/json");
    expect(res?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const corpo = (await res!.json()) as { error: { code: number } };
    expect(corpo.error.code).toBe(INVALID_PARAMS);
  });

  it("lê uma cópia: o corpo original segue disponível para o handler", async () => {
    const req = post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(await cursorRejection(req, "*")).toBeUndefined();
    expect(req.bodyUsed).toBe(false);
    expect(((await req.json()) as { method: string }).method).toBe("tools/list");
  });

  it("corpo que não é JSON não é assunto deste guarda", async () => {
    expect(await cursorRejection(post("nao e json"), "*")).toBeUndefined();
  });
});
