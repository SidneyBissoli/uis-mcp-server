import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { DEEP_RESEARCH_TOOLS } from "@sbissoli/mcp-search";
import { buildServer, withUsage } from "../src/server.js";
import { TOOL_NAMES } from "../src/tools/index.js";
import type { UsageKind } from "../src/usage-core.js";

/** O `tools/list` do servidor real, pelo transporte em memória. */
async function toolsServidas(): Promise<string[]> {
  const server = buildServer({});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "server-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools.map((t) => t.name);
  } finally {
    await client.close();
  }
}

describe("buildServer", () => {
  it("constrói um McpServer", () => {
    expect(buildServer({})).toBeInstanceOf(McpServer);
  });

  it("nomes de tool respeitam o teto de 64 chars do diretório", () => {
    for (const name of TOOL_NAMES) expect(name.length).toBeLessThanOrEqual(64);
  });

  it("a lista declarada (src/tools/index.ts) é exatamente o que o servidor serve", async () => {
    expect([...TOOL_NAMES].sort()).toEqual((await toolsServidas()).sort());
  });

  it("toda tool tem o prefixo de serviço uis_, salvo search/fetch (nome fixado pela OpenAI)", () => {
    const semPrefixo = TOOL_NAMES.filter((name) => !name.startsWith("uis_"));
    expect(semPrefixo.sort()).toEqual([...DEEP_RESEARCH_TOOLS].sort());
  });
});

describe("withUsage", () => {
  function recorder() {
    const events: Array<{ kind: UsageKind; name?: string | undefined }> = [];
    return { events, record: (kind: UsageKind, name?: string) => events.push({ kind, name }) };
  }

  it("registra tool_call em sucesso", async () => {
    const { events, record } = recorder();
    const wrapped = withUsage("t", record, async (_: unknown) => ({ ok: true }));
    await wrapped(undefined);
    expect(events).toEqual([{ kind: "tool_call", name: "t" }]);
  });

  it("registra tool_error quando o resultado tem isError (caminho dos erros pedagógicos)", async () => {
    const { events, record } = recorder();
    const wrapped = withUsage("t", record, async (_: unknown) => ({ isError: true }));
    await wrapped(undefined);
    expect(events.map((e) => e.kind)).toEqual(["tool_call", "tool_error"]);
  });

  it("registra tool_error e relança quando o handler lança", async () => {
    const { events, record } = recorder();
    const wrapped = withUsage("t", record, async (_: unknown): Promise<{ isError?: boolean }> => {
      throw new Error("boom");
    });
    await expect(wrapped(undefined)).rejects.toThrow("boom");
    expect(events.map((e) => e.kind)).toEqual(["tool_call", "tool_error"]);
  });
});
