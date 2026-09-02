import type { UsageTracker } from "./usage.js";

export interface Env {
  /** Bearer auth opcional (`wrangler secret put API_KEY`). Ausente = acesso aberto. */
  API_KEY?: string;
  /** Origin permitida no CORS do endpoint MCP. Default "*" (wrangler.jsonc). */
  ALLOWED_ORIGIN?: string;
  /**
   * Cache UIS (KV): release corrente (/versions/default, TTL 24 h — fonte do
   * data_vintage e da pinagem de `version`). Opcional para dev/teste sem binding:
   * sem ele, toda chamada resolve a release no upstream.
   */
  UIS_CACHE?: KVNamespace;
  /**
   * Catálogo UIS (D1): uis_indicators + uis_geounits + uis_meta — busca de
   * indicadores e geo units 100% local. Obrigatório em produção; opcional aqui
   * para que testes unitários construam o servidor sem D1.
   */
  CATALOG_DB?: D1Database;
  /**
   * Durable Object de estatísticas de uso. Opcional para que testes e dev local rodem
   * sem o binding: sem ele, nada é registrado e /metrics responde com aviso.
   */
  USAGE?: DurableObjectNamespace<UsageTracker>;
  /**
   * Binding version_metadata (id/tag/timestamp do deploy). Opcional: GET /status
   * omite o bloco deploy quando ausente (dev local / testes).
   */
  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
  /**
   * Token temporário do claim no mcpindex.ai (`wrangler secret put
   * MCPINDEX_CHALLENGE`), servido em /.well-known/mcpindex-challenge durante a
   * janela de 15 min da verificação de posse. Ausente = a rota responde 404.
   */
  MCPINDEX_CHALLENGE?: string;
}
