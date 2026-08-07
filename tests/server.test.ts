import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { buildServer, withUsage } from "../src/server.js";
import { UIS_GET_DATA, UIS_LIST_GEO_UNITS, UIS_SEARCH_INDICATORS } from "../src/tools/uis.js";
import type { UsageKind } from "../src/usage-core.js";

const TOOL_NAMES = [UIS_SEARCH_INDICATORS, UIS_LIST_GEO_UNITS, UIS_GET_DATA];

describe("buildServer", () => {
  it("constrói um McpServer com as 3 tools", () => {
    expect(buildServer({})).toBeInstanceOf(McpServer);
  });

  it("nomes de tool respeitam o teto de 64 chars do diretório", () => {
    for (const name of TOOL_NAMES) expect(name.length).toBeLessThanOrEqual(64);
  });

  it("são exatamente as 3 tools do servidor, com prefixo de serviço uis_", () => {
    expect(TOOL_NAMES.sort()).toEqual(["uis_get_data", "uis_list_geo_units", "uis_search_indicators"].sort());
    for (const name of TOOL_NAMES) expect(name.startsWith("uis_")).toBe(true);
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
