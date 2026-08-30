// Gera tests/fixtures/catalog-ids.txt a partir do seed do catálogo.
//
// POR QUE UM ARQUIVO, e não ler o .sql no teste: o seed tem 1,7 MB e um parser
// de SQL dentro do teste seria mais frágil que o dado que ele verifica. O
// fixture é derivado, versionado e regenerável — nunca digitado.
//
// Uso: node scripts/gen-catalog-fixture.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "scripts", "seed-uis-catalog.sql"), "utf8");

const codigos = new Set();
for (const bloco of sql.matchAll(/INSERT INTO uis_indicators[^;]*?VALUES(.*?);\s*\n/gs)) {
  // Primeiro campo de cada tupla: o código, entre aspas simples.
  for (const m of bloco[1].matchAll(/\(\s*'((?:[^']|'')*)'/g)) {
    codigos.add(m[1].replace(/''/g, "'"));
  }
}
if (codigos.size < 1000) {
  throw new Error(`só ${codigos.size} códigos extraídos — o formato do seed mudou?`);
}

const cabecalho = [
  "# Códigos de indicador do seed do catálogo (scripts/seed-uis-catalog.sql).",
  "# Gerado por scripts/gen-catalog-fixture.mjs — não editar à mão.",
  "# Serve ao teste que prova que toda resource cita indicador que existe.",
  "",
].join("\n");
writeFileSync(
  join(root, "tests", "fixtures", "catalog-ids.txt"),
  cabecalho + [...codigos].sort().join("\n") + "\n",
);
console.log(`${codigos.size} códigos gravados em tests/fixtures/catalog-ids.txt`);
