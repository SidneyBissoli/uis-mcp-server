/**
 * Proveniência UNESCO UIS — contexto único do servidor + builder da fonte.
 *
 * Base legal (docs/02 do projeto ilostat, verificada em 04/08/2026 e confirmada
 * manualmente em 07/08/2026): dados da UIS sob CC BY-SA 4.0 (Terms do Data
 * Browser, regime que governa a Data API — a própria documentação da API declara
 * a licença). Atribuição obrigatória com URL completa + data de extração.
 *
 * Segregação (contrato v1.0, §Segregação): este servidor serve EXCLUSIVAMENTE a
 * UIS — a segregação CC BY / CC BY-SA em relação ao ILOSTAT (servidor irmão
 * ilo-mcp-server) é estrutural: os dois regimes nunca coabitam um servidor.
 */

import { createProvenanceContext, type CanonicalProvenance } from "@sbissoli/mcp-provenance";
import { PROVENANCE_OPTIONS } from "../config.js";
import { UIS_API_VERSION, UIS_BASE, type UisRelease } from "./api.js";

export const provenance = createProvenanceContext(PROVENANCE_OPTIONS);

export const UIS_LICENSE = {
  id: "CC-BY-SA-4.0",
  name: "Creative Commons Attribution-ShareAlike 4.0 International",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
  terms_url: "https://databrowser.uis.unesco.org/terms-and-conditions",
  /** Data da verificação verbatim da licença (docs/02 do projeto ilostat). */
  verified_at: "2026-08-04",
} as const;

/**
 * Atribuição UIS no formato exigido pelos Terms: nome, URL COMPLETA da consulta
 * e data de extração.
 */
export function uisCitation(sourceUrl: string, retrievedAtIso: string): string {
  return `Source: UNESCO Institute for Statistics (UIS), ${sourceUrl}, date of extraction ${retrievedAtIso.slice(0, 10)}.`;
}

/** `data_vintage` UIS = release publicada (versão nomeada + data de publicação). */
export function uisDataVintage(release: UisRelease): string {
  return `${release.version} (published ${release.publicationDate.slice(0, 10)})`;
}

export interface UisProvenanceInput {
  dataset?: { id: string; version: string | null; name: string | null } | null;
  dimensionKey?: Record<string, string> | null;
  dataVintage?: string | null;
  retrievedAt: string;
  sourceUrl: string;
  servedFromCache?: boolean | null;
  notices?: string[];
}

/** Bloco canônico v1.0 para uma resposta da UIS. */
export function uisProvenance(input: UisProvenanceInput): CanonicalProvenance {
  return provenance.build({
    source: {
      name: "UNESCO Institute for Statistics (UIS)",
      agency: "UNESCO",
      database: "UIS Data API",
      endpoint: UIS_BASE,
    },
    dataset: input.dataset ?? null,
    dimension_key: input.dimensionKey ?? null,
    data_vintage: input.dataVintage ?? null,
    retrieved_at: input.retrievedAt,
    source_url: input.sourceUrl,
    api_version: UIS_API_VERSION,
    license: UIS_LICENSE,
    citation: uisCitation(input.sourceUrl, input.retrievedAt),
    ...(input.notices?.length ? { notices: input.notices } : {}),
    served_from_cache: input.servedFromCache ?? null,
  });
}

/**
 * O bloco de proveniência como extras de envelope — `structuredContent`
 * ({provenance, attribution}) e `_meta` — sem o texto ao leitor. É como a
 * proveniência viaja em `search`/`fetch` (src/tools/deep-research.ts), cujo
 * `content` é o JSON do contrato Deep Research, sem rodapé.
 */
export function provenanceExtras(p: CanonicalProvenance): {
  structured: Record<string, unknown>;
  meta: Record<string, unknown>;
} {
  const { structuredContent, _meta } = provenance.result({}, p);
  return { structured: structuredContent, meta: _meta };
}
