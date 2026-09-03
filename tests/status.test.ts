import { describe, expect, it } from "vitest";
import { SERVER_CONFIG } from "../src/config.js";
import { buildStatus } from "../src/status.js";
import { TOOL_NAMES } from "../src/tools/index.js";

describe("buildStatus", () => {
  it("sem binding version_metadata → sem bloco deploy", () => {
    const status = buildStatus({});
    expect(status).toEqual({
      status: "ok",
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
      mcp: SERVER_CONFIG.mcpRoute,
      tools: TOOL_NAMES.length,
      tool_names: [...TOOL_NAMES],
    });
  });

  it("anuncia a superfície de tools que o smoke pós-deploy confronta com o tools/list", () => {
    const status = buildStatus({});
    expect(status.tools).toBe(status.tool_names.length);
    expect(status.tool_names).toContain("search");
    expect(status.tool_names).toContain("uis_get_data");
  });

  it("com binding → bloco deploy com id/tag/timestamp", () => {
    const status = buildStatus({
      CF_VERSION_METADATA: { id: "abc123", tag: "", timestamp: "2026-08-06T12:00:00Z" },
    });
    expect(status).toMatchObject({
      deploy: { id: "abc123", tag: null, timestamp: "2026-08-06T12:00:00Z" },
    });
  });
});
