/**
 * Conversão de erros de domínio em resposta de tool MCP (isError=true):
 * erro de USO (UisUserError) devolve a mensagem pedagógica intacta;
 * erro de UPSTREAM devolve status + contexto sem stack; o resto relança
 * (bug do servidor — o SDK produz a resposta de erro padrão e o withUsage conta).
 */

import { UisUpstreamError, UisUserError } from "../uis/api.js";
import { CLASSE_DO_ERRO, type ErrorClass } from "../call-shape.js";

// Type alias (não interface): CallToolResult do SDK tem index signature
// `[x: string]: unknown`, e só aliases de objeto recebem index signature implícita.
export type ToolErrorResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
};

export function toToolError(e: unknown): ToolErrorResult {
  if (e instanceof UisUserError) {
    // A classe declarada pelo erro, não a frase: a frase ecoa o argumento
    // ("LR.INVALID") e o regex decidia por ele. Ver UisUserError.
    return comClasse({ content: [{ type: "text", text: e.message }], isError: true }, e.classe);
  }
  if (e instanceof UisUpstreamError) {
    const r: ToolErrorResult = {
      content: [
        {
          type: "text",
          text:
            `${e.message}\n` +
            "This is an upstream (UNESCO UIS) failure, not an invalid query — retrying later may succeed.",
        },
      ],
      isError: true,
    };
    // A classe vai pelo TIPO, fora do fio: pela frase, o "invalid" do sufixo
    // acima mandava toda falha da UIS para `contrato`. Ver CLASSE_DO_ERRO.
    return comClasse(r, e.classe);
  }
  throw e;
}

/**
 * ÚNICO lugar que monta resultado de erro: todo `isError: true` sai daqui com a
 * classe anexada (chave-símbolo não enumerável — o fio não muda). A guarda
 * `tests/sem-iserror-literal.test.ts` reprova `isError: true` em outro arquivo.
 */
function comClasse(r: ToolErrorResult, classe: ErrorClass): ToolErrorResult {
  Object.defineProperty(r, CLASSE_DO_ERRO, { value: classe, enumerable: false });
  return r;
}

/** Envolve um handler assíncrono com a conversão de erros acima. */
export function withToolErrors<A, R>(
  cb: (args: A) => Promise<R>,
): (args: A) => Promise<R | ToolErrorResult> {
  return async (args: A) => {
    try {
      return await cb(args);
    } catch (e) {
      return toToolError(e);
    }
  };
}
