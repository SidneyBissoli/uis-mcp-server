#!/usr/bin/env node
/**
 * Regenera os blocos `tools`, `resources` e `prompts` de lhm.plugin.json
 * (a ficha do LobeHub) a partir da superfície REAL do servidor — o mesmo
 * dump normalizado de scripts/dump-surface.mjs --stdio que alimenta os
 * baselines/ — e sincroniza `version` com package.json.
 *
 * POR QUE EXISTE (2026-09-26). O LobeHub NÃO relê o repositório nem o npm: a
 * ficha só muda quando `lhm plugin update` publica este manifesto. A ficha do
 * uis nasceu de uma leitura automática do repo em 08/08/2026 (0.1.0, método
 * de instalação "clonar e semear", ZERO tools) e ficou "Unvalidated" enquanto
 * o produto chegava à 1.0.0 — os cinco irmãos com manifesto tinham letra A.
 * Transplantado de bcb-br-mcp/scripts/gen-lhm-manifest.mjs (02/09/2026):
 * derivar da fonte, nunca copiar para texto.
 *
 * Rodar após mudança de superfície (exige dist/ fresco):
 *   npm run build && node scripts/gen-lhm-manifest.mjs
 * Depois publicar: npx -y @lobehub/market-cli plugin update --dir .
 *
 * A suíte (tests/lhm-manifest.test.ts) prende o arquivo à superfície:
 * manifesto velho reprova antes do release.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const dump = JSON.parse(
  execFileSync(process.execPath, [join(root, "scripts", "dump-surface.mjs"), "--stdio"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifestPath = join(root, "lhm.plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.version = version;
manifest.tools = dump.tools;
manifest.resources = dump.resources;
manifest.prompts = dump.prompts;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `lhm.plugin.json: v${version}, ${dump.tools.length} tools, ` +
    `${dump.resources.length} resources, ${dump.prompts.length} prompts`,
);
