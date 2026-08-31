/**
 * Toda contagem de ferramentas escrita em texto para HUMANO bate com a
 * superfície real do servidor.
 *
 * POR QUE ESTE ARQUIVO EXISTE (a lição veio de fora deste repositório). Em
 * 2026-08-31 a mesma classe de defeito foi medida no portfólio inteiro: a
 * landing do `ibge-br-mcp` anunciava 22 ferramentas com 21 registradas; o
 * `server.json` do `medical-terminologies-mcp` — que é o que o MCP Registry
 * publica e os diretórios copiam — dizia 37 com 31 no padrão; o
 * `README.pt-BR.md` do `bcb-br-mcp` dizia 8 com 15 e listava 9. Nenhum quebrava
 * nada, e por isso nenhum aparecia: contagem escrita em prosa não tem quem a
 * confira.
 *
 * Aqui a superfície é pequena e está certa. O teste é o que mantém, e a
 * contagem vem do `tools/list` real, nunca de um literal
 * ([[verificacao-deriva-da-fonte]]).
 *
 * NÃO há teste de paridade pt/en como nos servidores irmãos, e é de propósito:
 * o README deste repositório já é em português, e o servidor está sob
 * pré-requisito de divulgação (`dir_prereq`) — o desenvolvimento vem antes da
 * superfície de divulgação, que foi a ordem seguida no ilo.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildServer } from "../src/server.js";
import type { Env } from "../src/types.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leia = (f: string) => readFileSync(join(raiz, f), "utf8");

/** Textos vivos, voltados ao público, que podem afirmar um total. */
const TEXTOS = ["README.md", "server.json", "package.json", "src/config.ts"];

/** "3 tools", "3 ferramentas". */
const AFIRMACAO = /(\d+)\s+(?:tools|ferramentas)\b/gi;

let real = 0;
let client: Client;

beforeAll(async () => {
  const server = buildServer({} as Env);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "contagem-nos-textos", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  real = tools.length;
});

afterAll(async () => {
  await client.close();
});

describe("contagem de ferramentas nos textos públicos", () => {
  it("o servidor real é a fonte da contagem", () => {
    expect(real).toBeGreaterThan(0);
  });

  for (const arquivo of TEXTOS) {
    it(`${arquivo} não afirma uma contagem diferente da real`, () => {
      for (const m of leia(arquivo).matchAll(AFIRMACAO)) {
        expect(
          Number(m[1]),
          `${arquivo} anuncia "${m[0]}", mas o servidor registra ${real} ferramentas`,
        ).toBe(real);
      }
    });
  }
});
