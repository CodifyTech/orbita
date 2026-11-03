// Paleta e códigos ANSI do painel. O painel só existe num terminal de verdade, então pinta direto em
// cor de 24 bits; quem pode rodar sem cor (o modo inline, o resumo final) decide antes de chamar.
import { CORES, misturar as misturarSemLimite } from '../ui/estilo.mjs'

/** @typedef {import('../plano/tipos.mjs').Cor} Cor */

export const { LARANJA, MAGENTA, AZUL, ROXO } = CORES
export const VERDE = [74, 222, 128]
export const VERMELHO = [248, 113, 113]
export const AMARELO = [251, 191, 36]
export const CIANO = [34, 211, 238]
export const TEXTO = [214, 219, 228]
export const SUAVE = [128, 137, 155]
export const APAGADO = [72, 80, 97]
export const BRANCO = [250, 250, 252]
export const PRETO = [17, 20, 28]
export const FUNDO_SEL = [38, 45, 64]
export const FUNDO_CAIXA = [21, 25, 35]
/** Tons do texto das linhas de erro e de aviso (mais legíveis que o vermelho e o amarelo puros). */
export const TEXTO_ERRO = [254, 202, 202]
export const TEXTO_AVISO = [253, 230, 138]

export const RESET = '\x1b[0m'
export const NEGRITO = '\x1b[1m'
export const ITALICO = '\x1b[3m'
export const SUBLINHADO = '\x1b[4m'

export const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`
export const bg = ([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`

/** Texto numa cor; `extra` acrescenta estilo (negrito, sublinhado…). Sempre termina com reset. */
export const pinta = (cor, texto, extra = '') => `${extra}${fg(cor)}${texto}${RESET}`
export const forte = (cor, texto) => pinta(cor, texto, NEGRITO)

/** Como o `misturar` da ui, mas com `t` preso entre 0 e 1 (as animações passam do limite). */
export const misturar = (de, ate, t) => misturarSemLimite(de, ate, Math.min(1, Math.max(0, t)))
export const clarear = (cor, t) => misturar(cor, BRANCO, t)
export const escurecer = (cor, t) => misturar(cor, [0, 0, 0], t)

/**
 * Partes [cor, texto, negrito?] sobre um fundo opcional, sem reset no meio: o fundo não se perde
 * entre uma parte e outra (é assim que a aba ativa e as pílulas ficam com o fundo inteiro).
 *
 * @param {[Cor, string, boolean?][]} partes
 * @param {Cor | null} [fundo]
 */
export const compor = (partes, fundo = null) =>
  `${fundo ? bg(fundo) : ''}${partes.map(([cor, texto, negrito]) => `${negrito ? NEGRITO : '\x1b[22m'}${fg(cor)}${texto}`).join('')}${RESET}`

/**
 * Degradê coluna a coluna; `fase` (0..2) desliza o degradê, dando o brilho que corre pelo texto.
 *
 * @param {string} texto
 * @param {Cor} de
 * @param {Cor} ate
 * @param {number} [fase]
 * @param {string} [extra] estilo aplicado a cada letra (ex.: NEGRITO)
 */
export function degrade(texto, de, ate, fase = 0, extra = '') {
  const letras = [...texto]
  const ultima = Math.max(letras.length - 1, 1)

  return `${letras
    .map((letra, i) => {
      if (letra === ' ') {
        return letra
      }
      const x = (((i / ultima + fase) % 2) + 2) % 2

      return `${extra}${fg(misturar(de, ate, x <= 1 ? x : 2 - x))}${letra}`
    })
    .join('')}${RESET}`
}

/** Brilho da assinatura que corre devagar pelo nome; o mesmo em todo o painel. */
export const marcaCodifyTech = (agora, velocidade = 1400) => degrade('CodifyTech', AZUL, ROXO, (agora / velocidade) % 2, NEGRITO)

/**
 * Aceita a cor do plano como [r, g, b] ou "#rrggbb"; qualquer outra coisa vira `padrao`.
 *
 * @param {unknown} valor
 * @param {Cor} padrao
 * @returns {Cor}
 */
export function corDe(valor, padrao) {
  if (Array.isArray(valor) && valor.length === 3 && valor.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
    return /** @type {Cor} */ (valor)
  }
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(typeof valor === 'string' ? valor : '')

  return m ? /** @type {Cor} */ (m.slice(1).map(x => Number.parseInt(x, 16))) : padrao
}
