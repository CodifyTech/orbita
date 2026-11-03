// Cores de uma linha de log: erro, aviso, mensagem do painel e stack trace têm cor fixa; o resto
// ganha realce por token (URL, data, duração, método HTTP, rota, string, classe…), como num editor.
import {
  AMARELO,
  APAGADO,
  AZUL,
  BRANCO,
  CIANO,
  compor,
  ITALICO,
  NEGRITO,
  pinta,
  PRETO,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  TEXTO_AVISO,
  TEXTO_ERRO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'

/** Cada grupo nomeado é um tipo de token; o primeiro que casar ganha. */
const RE_TOKENS = new RegExp(
  [
    String.raw`(?<data>\b\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:[.,]\d+)?\b)`,
    String.raw`(?<url>\b(?:https?|wss?):\/\/[^\s'")\]]+)`,
    String.raw`(?<pontos>\.{3,}|·{3,})`,
    String.raw`(?<dur>~\s?[\d.]+\s?(?:ms|s)\b|\b\d+(?:\.\d+)?\s?ms\b)`,
    String.raw`(?<ok>\b(?:DONE|ready)\b|✔|➜)`,
    String.raw`(?<run>\bRUNNING\b)`,
    String.raw`(?<falha>\b(?:FAIL|FAILED|ERROR)\b)`,
    String.raw`(?<info>\b(?:INFO|WARN|WARNING)\b)`,
    String.raw`(?<metodo>\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b)`,
    String.raw`(?<rota>(?<=\s|^)\/[\w\-./{}:?=&%]*)`,
    String.raw`(?<str>'[^'\n]{0,120}'|"[^"\n]{0,120}")`,
    // Classe com namespace de barra invertida (PHP, .NET): App\Models\User, Illuminate\Database\…
    String.raw`(?<classe>\b[A-Z]\w*(?:\\[A-Z_]\w*)+)`,
  ].join('|'),
  'g',
)

const COR_DO_TOKEN = {
  data: [APAGADO],
  url: [CIANO, SUBLINHADO],
  pontos: [[52, 58, 74]],
  dur: [[192, 132, 252]],
  ok: [VERDE, NEGRITO],
  run: [AZUL, NEGRITO],
  falha: [VERMELHO, NEGRITO],
  info: [AZUL, NEGRITO],
  metodo: [BRANCO, NEGRITO],
  rota: [[147, 197, 253]],
  str: [[134, 239, 172]],
  classe: [[249, 168, 212]],
}

/**
 * Qual token começa em cada trecho da linha (útil para testar o realce sem comparar códigos ANSI).
 *
 * @param {string} texto
 * @returns {{ tipo: string, trecho: string }[]}
 */
export function tokens(texto) {
  return [...texto.matchAll(RE_TOKENS)].map(m => ({
    tipo: Object.keys(m.groups).find(k => m.groups[k] !== undefined),
    trecho: m[0],
  }))
}

/**
 * @param {string} texto um pedaço (já quebrado) do texto da linha
 * @param {{ nivel: import('../classificacao.mjs').Nivel }} linha
 */
export function realce(texto, linha) {
  switch (linha.nivel) {
    case 'erro':
      return pinta(TEXTO_ERRO, texto)
    case 'alerta':
      return pinta(TEXTO_AVISO, texto)
    case 'sistema':
      return pinta([125, 211, 252], texto, ITALICO)
    case 'traco':
      return pinta(SUAVE, texto)
    default:
      return texto.replace(RE_TOKENS, (trecho, ...resto) => {
        const grupos = resto.at(-1)
        const tipo = Object.keys(grupos).find(k => grupos[k] !== undefined)
        const [cor, extra = ''] = COR_DO_TOKEN[tipo] ?? [TEXTO]

        return pinta(cor, trecho, extra)
      })
  }
}

/**
 * Com filtro ativo o realce é outro: o trecho que casou fica com fundo amarelo.
 *
 * @param {string} texto
 * @param {string} filtro já em minúsculas
 */
export function realceFiltro(texto, filtro) {
  const baixo = texto.toLowerCase()
  let saida = ''
  let i = 0
  for (let j = baixo.indexOf(filtro); j >= 0 && filtro; j = baixo.indexOf(filtro, i)) {
    saida += pinta(TEXTO, texto.slice(i, j)) + compor([[PRETO, texto.slice(j, j + filtro.length), true]], AMARELO)
    i = j + filtro.length
  }

  return saida + pinta(TEXTO, texto.slice(i))
}
