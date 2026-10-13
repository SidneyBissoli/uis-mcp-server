/**
 * A página `/examples` existe, é encontrável e não cita indicador inventado.
 *
 * POR QUE ESTE ARQUIVO EXISTE. A página nasceu em 13/10/2026 da ação
 * `geo:uis-mcp-server` para capturar a busca "UNESCO education statistics MCP".
 * Ela só serve a isso se três coisas continuarem verdadeiras, e nenhuma delas
 * quebra nada quando deixa de ser: o sitemap listar a rota (sem isso o
 * rastreador não chega), a landing apontar para ela (o único link de entrada
 * dentro do domínio) e cada código de indicador citado existir no catálogo —
 * um exemplo com código montado ensinaria o leitor a pedir o que não há
 * ([[url-montada-e-hipotese]]). Nada aqui pina literal: tudo vem de `EXEMPLOS`,
 * `EXAMPLES_ROUTE` e `SERVER_CONFIG`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ALTERNATIVAS, EXAMPLES_ROUTE, EXEMPLOS, examplesHtml } from "../src/examples.js";
import { SERVER_CONFIG } from "../src/config.js";
import { discoveryResponseForPath, sitemapXml } from "../src/discovery.js";
import { landingHtml } from "../src/landing.js";

const raiz = join(__dirname, "..");
const html = examplesHtml();

const catalogo = new Set(
  readFileSync(join(raiz, "tests", "fixtures", "catalog-ids.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")),
);

describe("página de exemplos — conteúdo", () => {
  it("cobre matrícula, alfabetização e gasto, como pede a ação", () => {
    const temas = EXEMPLOS.map((e) => e.tema.toLowerCase()).join(" | ");
    expect(temas).toMatch(/enrolment/);
    expect(temas).toMatch(/literacy/);
    expect(temas).toMatch(/spending/);
  });

  it("todo código citado existe no catálogo real", () => {
    for (const e of EXEMPLOS) {
      for (const codigo of e.codigos) {
        expect(catalogo.has(codigo), `${e.tema}: ${codigo} não está no catálogo`).toBe(true);
      }
    }
  });

  it("o código declarado é o mesmo que o passo de dados pede", () => {
    for (const e of EXEMPLOS) {
      const passoDeDados = e.passos.find((p) => p.startsWith("uis_get_data"));
      expect(passoDeDados, `${e.tema} sem passo uis_get_data`).toBeTruthy();
      for (const codigo of e.codigos) expect(passoDeDados).toContain(`"${codigo}"`);
    }
  });

  it("cada pergunta tem par em português", () => {
    for (const e of EXEMPLOS) expect(e.perguntaPt.length).toBeGreaterThan(0);
  });

  it("a comparação traz o ator da Apify, que é a alternativa que a ação nomeia", () => {
    expect(ALTERNATIVAS.some((a) => a.url.startsWith("https://apify.com/"))).toBe(true);
  });

  it("canonical e og:url apontam para a rota no domínio próprio", () => {
    const url = `${SERVER_CONFIG.websiteUrl}${EXAMPLES_ROUTE}`;
    expect(html).toContain(`<link rel="canonical" href="${url}">`);
    expect(html).toContain(`<meta property="og:url" content="${url}">`);
  });

  it("publica um FAQPage com uma pergunta por exemplo", () => {
    const bruto = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
    expect(bruto, "página sem bloco JSON-LD").toBeTruthy();
    const dados = JSON.parse(bruto as string) as { "@type": string; mainEntity: { name: string }[] };
    expect(dados["@type"]).toBe("FAQPage");
    expect(dados.mainEntity.map((q) => q.name)).toEqual(EXEMPLOS.map((e) => e.pergunta));
  });
});

describe("página de exemplos — encontrável", () => {
  it("está no sitemap", () => {
    expect(sitemapXml()).toContain(`<loc>${SERVER_CONFIG.websiteUrl}${EXAMPLES_ROUTE}</loc>`);
  });

  it("a landing aponta para ela", () => {
    expect(landingHtml()).toContain(`<a href="${EXAMPLES_ROUTE}">`);
  });

  it("não é rota de descoberta (é servida pela entrada do Worker, antes da auth)", () => {
    expect(discoveryResponseForPath(EXAMPLES_ROUTE)).toBeNull();
    const index = readFileSync(join(raiz, "src", "index.ts"), "utf8");
    const posRota = index.indexOf("url.pathname === EXAMPLES_ROUTE");
    const posAuth = index.indexOf("checkAuth(");
    expect(posRota, "index.ts não serve EXAMPLES_ROUTE").toBeGreaterThan(-1);
    expect(posRota).toBeLessThan(posAuth);
  });
});
