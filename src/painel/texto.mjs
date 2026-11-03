// Medir e cortar texto de terminal. A largura "visível" não é o `length`: os códigos de cor não
// ocupam coluna, emoji e ideogramas ocupam duas, acentos combinantes nenhuma. Errar isso desalinha
// o painel inteiro, então toda conta de largura passa por aqui.
import { pinta, RESET, SUAVE } from './cores.mjs'

/** Um código de cor/estilo (CSI). */
export const RE_ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const RE_PEDACO = /\x1b\[[0-9;?]*[ -/]*[@-~]|[\s\S]/gu

/**
 * Quantas colunas o caractere ocupa: 0 (controle, combinante), 1 ou 2 (largos: CJK, emoji).
 *
 * @param {number} cp code point
 * @returns {0 | 1 | 2}
 */
export function larguraDe(cp) {
  if (
    cp < 32 ||
    (cp >= 0x7f && cp < 0xa0) ||
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x200b ||
    cp === 0x200d
  ) {
    return 0
  }
  const larga =
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)

  return larga ? 2 : 1
}

/** O texto sem os códigos de cor. */
export const semCores = texto => texto.replace(RE_ANSI, '')

/**
 * Largura visível (sem os códigos de cor).
 *
 * @param {string} texto
 * @returns {number}
 */
export function vis(texto) {
  let n = 0
  for (const letra of semCores(texto)) {
    n += larguraDe(letra.codePointAt(0))
  }

  return n
}

/**
 * Corta na largura visível preservando as cores; `…` indica que havia mais.
 *
 * @param {string} texto
 * @param {number} max
 * @param {boolean} [reticencias]
 */
export function cortar(texto, max, reticencias = true) {
  if (max <= 0) {
    return ''
  }
  if (vis(texto) <= max) {
    return texto
  }
  const limite = reticencias ? max - 1 : max
  let saida = ''
  let n = 0
  for (const [pedaco] of texto.matchAll(RE_PEDACO)) {
    // Códigos de cor passam sempre: o corte não pode deixar o terminal pintado pela metade.
    if (pedaco.length > 1 && pedaco[0] === '\x1b') {
      saida += pedaco
      continue
    }
    const w = larguraDe(pedaco.codePointAt(0))
    if (n + w > limite) {
      break
    }
    saida += pedaco
    n += w
  }

  return `${saida}${RESET}${reticencias ? pinta(SUAVE, '…') : ''}`
}

/** Corta ou completa com espaços até a largura exata `w`. */
export const ajustar = (texto, w) => {
  const cortado = cortar(texto, w)

  return cortado + ' '.repeat(Math.max(0, w - vis(cortado)))
}

/** `esquerda` e `direita` na mesma linha de largura `w`; quem cede espaço é a esquerda. */
export const juntar = (esquerda, direita, w) => {
  const d = vis(direita)
  const e = cortar(esquerda, Math.max(0, w - d - 1))

  return e + ' '.repeat(Math.max(0, w - vis(e) - d)) + direita
}

export const centralizar = (texto, w) => {
  const cortado = cortar(texto, w)
  const sobra = Math.max(0, w - vis(cortado))

  return ' '.repeat(Math.floor(sobra / 2)) + cortado + ' '.repeat(Math.ceil(sobra / 2))
}

/**
 * Fatia as colunas [ini, fim) de um texto sem cores, completando com espaços. Um caractere largo
 * cortado ao meio vira espaço (é o que permite sobrepor uma caixa no meio de uma linha qualquer).
 *
 * @param {string} texto
 * @param {number} ini
 * @param {number} fim
 */
export function fatiarPlano(texto, ini, fim) {
  let saida = ''
  let x = 0
  for (const letra of texto) {
    const w = larguraDe(letra.codePointAt(0))
    if (x >= ini && x + w <= fim) {
      saida += letra
    } else if (x < ini && x + w > ini) {
      saida += ' '
    }
    x += w
    if (x >= fim) {
      break
    }
  }

  return saida + ' '.repeat(Math.max(0, fim - ini - vis(saida)))
}

/**
 * Quebra um texto sem cores em linhas de largura `w`, preferindo quebrar num espaço (se ele estiver
 * no último terço da linha; antes disso a linha ficaria curta demais e quebra no meio da palavra).
 *
 * @param {string} texto
 * @param {number} w
 * @returns {string[]}
 */
export function quebrar(texto, w) {
  if (w <= 0) {
    return [texto]
  }
  const partes = []
  let atual = ''
  let n = 0
  for (const letra of texto) {
    const lw = larguraDe(letra.codePointAt(0))
    if (n + lw > w) {
      const corte = atual.lastIndexOf(' ')
      if (corte > w * 0.6) {
        partes.push(atual.slice(0, corte))
        atual = atual.slice(corte + 1)
        n = vis(atual)
      } else {
        partes.push(atual)
        atual = ''
        n = 0
      }
    }
    atual += letra
    n += lw
  }
  partes.push(atual)

  return partes
}

/**
 * Tira da saída de um processo o que bagunçaria o painel: cores e títulos (OSC) do próprio processo,
 * tabs (viram 4 espaços) e caracteres de controle.
 *
 * @param {string} texto
 */
export const limpar = texto =>
  texto
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '')
    .replace(/\t/g, '    ')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
