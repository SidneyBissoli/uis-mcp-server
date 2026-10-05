/**
 * `/.well-known/mcp/server-card.json` (@sbissoli/mcp-surface/card): o card que
 * scanners de diretório (Smithery) leem quando a varredura do /mcp não completa.
 * Derivado da mesma superfície que a trava normaliza — e por isso conferido
 * contra o sha256 da seção `declarada` do `surface.lock.json`, não contra uma
 * lista transcrita aqui.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { impressaoDigital, lerTrava, normalizarSuperficie } from "@sbissoli/mcp-surface";
import { superficieDoCard } from "@sbissoli/mcp-surface/card";
import { describe, expect, it } from "vitest";

import worker from "../src/index.js";
import type { Env } from "../src/types.js";

const raiz = fileURLToPath(new URL("../", import.meta.url).href);
const versao = (JSON.parse(readFileSync(`${raiz}package.json`, "utf8")) as { version: string }).version;
const trava = lerTrava(`${raiz}surface.lock.json`);

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const pedir = (env: Env) =>
  worker.fetch(new Request("https://uis.sidneybissoli.com/.well-known/mcp/server-card.json"), env, ctx);

describe("GET /.well-known/mcp/server-card.json", () => {
  it("responde 200 em JSON, com a versão do package.json no serverInfo", async () => {
    const res = await pedir({} as Env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const card = (await res.json()) as { serverInfo: { name: string; version: string } };
    expect(card.serverInfo.version).toBe(versao);
    expect(card.serverInfo.name).toBe("uis-mcp-server");
  });

  it("é público mesmo com API_KEY configurada (descoberta não carrega credencial)", async () => {
    const res = await pedir({ API_KEY: "chave-qualquer" } as Env);
    expect(res.status).toBe(200);
  });

  it("o card normalizado tem o MESMO sha256 da seção declarada da trava", async () => {
    const card = (await (await pedir({} as Env)).json()) as Record<string, unknown>;
    expect(trava.declarada?.sha256).toBeTruthy();
    expect(impressaoDigital(normalizarSuperficie(superficieDoCard(card)))).toBe(trava.declarada?.sha256);
  });

  it("authentication.required sai da medição semToken da trava (tools/list responde sem token)", async () => {
    const medido = (trava.semToken?.conteudo as Record<string, Record<string, Record<string, boolean>>>)[
      "apiKeyAusente"
    ]?.["POST /mcp"]?.["tools/list"];
    expect(medido).toBe(true);
    const card = (await (await pedir({} as Env)).json()) as { authentication: { required: boolean } };
    expect(card.authentication).toEqual({ required: false });
  });

  it("método não servido fica fora do card (prompts/list não existe aqui)", async () => {
    const card = (await (await pedir({} as Env)).json()) as Record<string, unknown>;
    expect(card).not.toHaveProperty("prompts");
    expect(Array.isArray(card["tools"])).toBe(true);
  });
});
