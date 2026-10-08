/**
 * Proveniência UNESCO UIS — contexto único do servidor + builder da fonte.
 *
 * Base legal (docs/02 do projeto ilostat, verificada em 04/08/2026 e confirmada
 * manualmente em 07/08/2026): dados da UIS sob CC BY-SA 4.0 (Terms do Data
 * Browser, regime que governa a Data API — a própria documentação da API declara
 * a licença). Atribuição obrigatória com URL completa + data de extração.
 *
 * Segregação (contrato de proveniência, §Segregação): este servidor serve EXCLUSIVAMENTE a
 * UIS — a segregação CC BY / CC BY-SA em relação ao ILOSTAT (servidor irmão
 * ilo-mcp-server) é estrutural: os dois regimes nunca coabitam um servidor.
 */

import { createProvenanceContext, type CanonicalProvenance } from "@sbissoli/mcp-provenance";
import { PROVENANCE_OPTIONS } from "../config.js";
import { UIS_API_VERSION, UIS_BASE, type UisRelease } from "./api.js";
import { currentCall } from "@sbissoli/mcp-upstream/als";
import { currentRetrieval } from "./upstream.js";

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

/**
 * Uma parte da resposta que veio de OUTRO endpoint ou de OUTRO instante (contrato §3,
 * `field_sources`): a release corrente (KV), os dados (agora), a linha do catálogo
 * (seed). Cada parte traz o próprio instante e se veio do cache — o servidor sabe;
 * `fields` diz quais campos do payload ela produziu.
 */
export interface UisPart {
  fields: string[];
  sourceUrl: string;
  datasetId?: string | null;
  dataVintage?: string | null;
  /** Instante REAL da extração desta parte (o original, se veio do cache). */
  retrievedAt: string;
  servedFromCache: boolean;
}

export interface UisProvenanceInput {
  dataset?: { id: string; version: string | null; name: string | null } | null;
  dimensionKey?: Record<string, string> | null;
  dataVintage?: string | null;
  /**
   * Instante da extração da parte que `sourceUrl` nomeia — é o que a citação embute
   * (a UIS exige a URL completa E a data de extração DELA). Com `parts`, o
   * `retrieved_at` do bloco é o mais antigo entre este e os das partes.
   */
  retrievedAt: string;
  sourceUrl: string;
  /** Sem `parts`: o que o chamador declara. Com `parts`: ignorado — vale "todas do cache". */
  servedFromCache?: boolean | null;
  notices?: string[];
  /** Partes de procedência distinta; duas ou mais viram `field_sources`. */
  parts?: UisPart[];
}

/**
 * Bloco canônico para uma resposta da UIS. `retrieval` é o que o
 * coletor da chamada mediu (idas, tentativas, anomalias — `upstream.ts`);
 * `null` quando nada foi à origem (catálogo D1, acerto de KV) ou fora de um
 * coletor — acerto de cache não é ida à origem (contrato §3).
 *
 * `retrieved_at` é o instante REAL da extração. Resposta de uma parte só (as tools
 * de catálogo, `search`): o dessa parte. Resposta que junta partes (`uis_get_data`:
 * release + dados; `fetch`: linha do catálogo + release + amostra): o MAIS ANTIGO
 * entre elas, `served_from_cache` verdadeiro só se TODAS vieram do cache, e
 * `field_sources` com uma entrada por parte.
 */
export function uisProvenance(input: UisProvenanceInput): CanonicalProvenance {
  const fieldSources = input.parts && input.parts.length > 1 ? input.parts.map(fieldSourceOf) : null;
  // O topo é o MAIS ANTIGO entre a parte citada e todas as sub-fontes — por
  // construção (contrato §3; na 1.2 a lib lança `ProvenanceContractError` se o
  // topo for mais novo que alguma sub-fonte). Até a 1.5.0 o topo era o instante
  // dos dados, o mais NOVO da resposta.
  const retrievedAt = fieldSources
    ? new Date(Math.min(Date.parse(input.retrievedAt), ...fieldSources.map((f) => Date.parse(f.retrieved_at)))).toISOString()
    : input.retrievedAt;
  const servedFromCache = fieldSources
    ? fieldSources.every((f) => f.served_from_cache === true)
    : (input.servedFromCache ?? null);
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
    retrieved_at: retrievedAt,
    source_url: input.sourceUrl,
    api_version: UIS_API_VERSION,
    license: UIS_LICENSE,
    citation: uisCitation(input.sourceUrl, input.retrievedAt),
    ...(input.notices?.length ? { notices: input.notices } : {}),
    served_from_cache: servedFromCache,
    retrieval: currentRetrieval(),
    ...(fieldSources ? { field_sources: fieldSources } : {}),
    revision: UIS_REVISION,
  });
}

/**
 * Uma parte na forma de `field_sources`. Dentro de um coletor, o instante e o cache
 * vêm dos acessos REGISTRADOS para a URL da parte (`call.fieldSource` — rede ou
 * `recordCache`), o caminho comum do portfólio; o que a parte declara é o piso
 * para quando o coletor não a viu (fora de um coletor, em teste, ou parte que não
 * passa pelo upstream). Entre os dois, vale o mais antigo e "do cache" só se ambos dizem.
 */
function fieldSourceOf(part: UisPart): {
  fields: string[];
  source_url: string;
  dataset_id: string | null;
  data_vintage: string | null;
  retrieved_at: string;
  served_from_cache: boolean;
} {
  const base = {
    fields: part.fields,
    source_url: part.sourceUrl,
    dataset_id: part.datasetId ?? null,
    data_vintage: part.dataVintage ?? null,
  };
  const lida = currentCall()?.fieldSource(base);
  if (!lida || lida.retrieved_at === null) {
    return { ...base, retrieved_at: part.retrievedAt, served_from_cache: part.servedFromCache };
  }
  const declarado = Date.parse(part.retrievedAt);
  const visto = Date.parse(lida.retrieved_at);
  return {
    ...base,
    retrieved_at: visto <= declarado ? lida.retrieved_at : part.retrievedAt,
    served_from_cache: lida.served_from_cache === true && part.servedFromCache,
  };
}

/**
 * Situação de revisão (contrato §3, v1.3): `current` em toda resposta — o valor é o da
 * release vigente da UIS, e uma release nova pode revisá-lo. Nunca `final`: a UIS não
 * declara valor a valor que um número não muda mais (decisão do dono, 08/10/2026). A
 * `note` reaproveita o que o servidor já publica nas instructions e na descrição de
 * `uis_get_data` (Parte 1, 1.4.0) — nenhuma afirmação nova sobre a fonte. Enquanto o
 * servidor emitir 1.2 a chave não sai no fio; fica no canônico.
 */
export const UIS_REVISION = {
  status: "current",
  note: "Values are those of the UIS release named in data_vintage; a new release can revise past years (new national data, re-estimation).",
} as const;

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
