// Decide se uma linha de log é erro, aviso ou nada. As regex vêm do plano (cada preset sabe como a
// sua stack escreve erro); quem não manda nenhuma usa as genéricas, as mesmas do monitor do FoodOS.

/** @typedef {{ erro: RegExp, aviso: RegExp }} Padroes */
/** @typedef {'erro' | 'alerta' | 'sistema' | 'traco' | null} Nivel  traco = continuação (stack trace) */

export const PADRAO_DE_ERRO =
  /\b(?:ERROR|CRITICAL|EMERGENCY|FAIL(?:ED)?|Fatal error|Uncaught|SQLSTATE|ECONNREFUSED|EADDRINUSE|Internal server error)\b|Exception\b|\b[Ee]rror\b|\bErro\b/
export const PADRAO_DE_AVISO = /\b(?:WARN(?:ING)?|[Ww]arning|[Ww]arn|DEPRECATED|[Dd]eprecated|NOTICE)\b/

/** @type {Padroes} */
export const PADROES_PADRAO = Object.freeze({ erro: PADRAO_DE_ERRO, aviso: PADRAO_DE_AVISO })

/** Regex em texto (como vem do plano, que é JSON) → RegExp com flag "i"; inválida ou vazia → `padrao`. */
function compilar(texto, padrao) {
  if (texto instanceof RegExp) {
    return texto
  }
  if (typeof texto !== 'string' || !texto) {
    return padrao
  }
  try {
    return new RegExp(texto, 'i')
  } catch {
    return padrao
  }
}

/**
 * @param {{ erro?: string | RegExp, aviso?: string | RegExp } | null | undefined} padroes
 * @returns {Padroes}
 */
export function compilarPadroes(padroes) {
  return {
    erro: compilar(padroes?.erro, PADRAO_DE_ERRO),
    aviso: compilar(padroes?.aviso, PADRAO_DE_AVISO),
  }
}

/**
 * Erro tem prioridade: uma linha com "Warning" e "Exception" conta como erro.
 *
 * @param {string} texto
 * @param {Padroes} [padroes]
 * @returns {'erro' | 'alerta' | null}
 */
export const classificar = (texto, padroes = PADROES_PADRAO) =>
  padroes.erro.test(texto) ? 'erro' : padroes.aviso.test(texto) ? 'alerta' : null
