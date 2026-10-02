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
 * Desde 2026-10-02 o README é em inglês com par em português, no molde do
 * `ilo-mcp-server` — e a paridade entra junto, porque o traduzido é a cópia
 * que ninguém reabre.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildServer } from "../src/server.js";
import type { Env } from "../src/types.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leia = (f: string) => readFileSync(join(raiz, f), "utf8");

/** Textos vivos, voltados ao público, que podem afirmar um total. */
const TEXTOS = ["README.md", "README.pt-BR.md", "server.json", "package.json", "src/config.ts"];

/** "3 tools", "3 ferramentas". */
const AFIRMACAO = /(\d+)\s+(?:tools|ferramentas)\b/gi;
/** Nomes de ferramenta e de resource citados em crase — o par pt/en tem de bater. */
const CITADAS = /`((?:uis_[a-z_0-9]+)|(?:uis:\/\/[a-z/-]+))`/g;

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

describe("paridade entre o README em inglês e o em português", () => {
  const pt = "README.pt-BR.md";

  it("o README em português existe", () => {
    expect(existsSync(join(raiz, pt)), `${pt} ausente — metade da superfície em pt`).toBe(true);
  });

  it("cita exatamente as mesmas ferramentas e resources que o README em inglês", () => {
    const nomes = (f: string) => new Set([...leia(f).matchAll(CITADAS)].map((m) => m[1]));
    const en = nomes("README.md");
    const ptBR = nomes(pt);
    expect([...en].filter((n) => !ptBR.has(n)).sort(), "no inglês e ausentes do português").toEqual([]);
    expect([...ptBR].filter((n) => !en.has(n)).sort(), "no português e ausentes do inglês").toEqual([]);
  });

  it("tem o mesmo esqueleto de seções", () => {
    const secoes = (f: string) => (leia(f).match(/^#{2,3} /gm) ?? []).length;
    expect(secoes(pt), "número de seções divergente entre os dois READMEs").toBe(secoes("README.md"));
  });
});
