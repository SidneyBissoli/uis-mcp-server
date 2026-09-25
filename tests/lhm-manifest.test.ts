/**
 * lhm.plugin.json — a ficha do LobeHub — é DERIVADA da superfície real do
 * servidor, nunca mantida à mão.
 *
 * POR QUE ISTO EXISTE (25/09/2026). O LobeHub não relê o repositório nem o
 * npm: a ficha só muda quando `lhm plugin update` publica o manifesto. A do
 * uis nasceu de uma leitura automática em 08/08/2026 — versão 0.1.0, método
 * de instalação "clonar e semear", ZERO tools — e ficou "Unvalidated" (sem
 * letra no badge) enquanto o produto chegava à 1.0.0 e os cinco irmãos com
 * manifesto tinham letra A. Nada quebrava; a ficha só mentia em silêncio.
 *
 * O teste não pina nome nem contagem: compara o arquivo com o `tools/list`,
 * `resources/list` e `prompts/list` do servidor real, e a identidade com o
 * server.json (a ficha que o MCP Registry publica). Quem mantém a sincronia é
 * scripts/gen-lhm-manifest.mjs (`npm run build && npm run manifest:lhm`).
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
const leJson = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(raiz, f), "utf8")) as Record<string, unknown>;

type Nomeado = { name: string };
type Endereco = { uri: string };
const porNome = <T extends Nomeado>(lista: T[]): T[] =>
  [...lista].sort((a, b) => a.name.localeCompare(b.name));
const porUri = <T extends Endereco>(lista: T[]): T[] =>
  [...lista].sort((a, b) => a.uri.localeCompare(b.uri));

const manifesto = leJson("lhm.plugin.json") as {
  identifier: string;
  name: string;
  cloudEndpoint: string;
  homepage: string;
  description: string;
  tools: Nomeado[];
  resources: Endereco[];
  prompts: Nomeado[];
};

let client: Client;

beforeAll(async () => {
  const server = buildServer({} as Env);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "lhm-manifest", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

describe("lhm.plugin.json espelha a superfície servida", () => {
  it("tools: as mesmas do tools/list, com descrição e esquemas iguais", async () => {
    const { tools } = await client.listTools();
    // JSON round-trip dos dois lados: o servidor entrega objetos com `undefined`
    // em campos opcionais e o arquivo não os tem — a comparação é do que é
    // publicado, não da representação em memória.
    expect(porNome(manifesto.tools)).toEqual(porNome(JSON.parse(JSON.stringify(tools))));
  });

  it("resources: os mesmos do resources/list", async () => {
    const { resources } = await client.listResources();
    expect(porUri(manifesto.resources)).toEqual(porUri(JSON.parse(JSON.stringify(resources))));
  });

  it("prompts: os mesmos do prompts/list", async () => {
    const { prompts } = await client.listPrompts();
    expect(porNome(manifesto.prompts)).toEqual(porNome(JSON.parse(JSON.stringify(prompts))));
  });
});

describe("lhm.plugin.json carrega a mesma identidade do server.json", () => {
  const registro = leJson("server.json") as {
    title: string;
    repository: { url: string };
    remotes: Array<{ url: string }>;
  };

  it("o identificador é o da conta no LobeHub", () => {
    expect(manifesto.identifier).toBe("sidneybissoli-uis-mcp-server");
  });

  it("o nome exibido é o título do registro (uma identidade, não duas)", () => {
    expect(manifesto.name).toBe(registro.title);
  });

  it("o endpoint hospedado é o remote do registro", () => {
    expect(manifesto.cloudEndpoint).toBe(registro.remotes[0]?.url);
  });

  it("a homepage é o repositório", () => {
    expect(manifesto.homepage).toBe(registro.repository.url);
  });

  it("a descrição não anuncia contagem de ferramentas", () => {
    // Contagem em prosa não tem quem a confira (tests/contagem-nos-textos.test.ts).
    expect(manifesto.description).not.toMatch(/\d+\s+(?:tools|ferramentas)\b/i);
  });
});
