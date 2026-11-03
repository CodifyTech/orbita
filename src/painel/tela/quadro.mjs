// Monta a tela inteira (um "quadro"): cabeçalho, abas, a vista da aba atual, toast e rodapé, com a
// caixa aberta sobreposta. Função pura do estado: mesma entrada, mesmas linhas, o que permite testar
// e redesenhar só o que mudou.
import { AMARELO, pinta, TEXTO } from '../cores.mjs'
import { abaAtual } from '../estado.mjs'
import { ajustar, centralizar } from '../texto.mjs'
import { barraDeAbas } from './abas.mjs'
import { vistaAlertas } from './alertas.mjs'
import { cabecalho } from './cabecalho.mjs'
import { caixaAcoes, caixaAjuda, caixaComando, caixaEncerrando } from './caixas.mjs'
import { vistaGeral } from './geral.mjs'
import { vistaLog } from './log.mjs'
import { sobrepor } from './pecas.mjs'
import { linhaDeToast, rodape } from './rodape.mjs'
import { splash } from './splash.mjs'

export const LARGURA_MINIMA = 60
export const ALTURA_MINIMA = 15
/** Linhas fixas fora do conteúdo: cabeçalho, abas, sublinha, toast e rodapé. */
export const LINHAS_FIXAS = 5

/** Quantas linhas de log cabem numa aba de log com o terminal de altura `h`. */
export const alturaDoLog = h => h - LINHAS_FIXAS - 2

const CAIXAS = {
  ajuda: caixaAjuda,
  acoes: caixaAcoes,
  comando: caixaComando,
  encerrando: caixaEncerrando,
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w colunas do terminal
 * @param {number} h linhas do terminal
 * @param {number} [t] agora
 * @returns {string[]} exatamente `h` linhas de largura `w`
 */
export function quadro(estado, w, h, t = Date.now()) {
  if (w < LARGURA_MINIMA || h < ALTURA_MINIMA) {
    const linhas = Array.from({ length: h }, () => '')
    linhas[Math.floor(h / 2)] = centralizar(`${pinta(AMARELO, '▲')} ${pinta(TEXTO, `aumente o terminal: mínimo ${LARGURA_MINIMA}×${ALTURA_MINIMA} (agora ${w}×${h})`)}`, w)

    return linhas.map(l => ajustar(l, w))
  }
  if (estado.splashAte > t) {
    const linhas = splash(estado, w, h, t)
    while (linhas.length < h) {
      linhas.push('')
    }

    return linhas.slice(0, h).map(l => ajustar(l, w))
  }

  const [abas, sublinha] = barraDeAbas(estado, w, t)
  const linhas = [cabecalho(estado, w, t), abas, sublinha]
  const alturaConteudo = h - LINHAS_FIXAS
  const atual = abaAtual(estado)
  const conteudo =
    atual === 'geral'
      ? vistaGeral(estado, w, alturaConteudo, t)
      : atual === 'alertas'
        ? vistaAlertas(estado, w, alturaConteudo, t)
        : vistaLog(estado, w, alturaConteudo, atual, t)
  linhas.push(...conteudo.slice(0, alturaConteudo))
  while (linhas.length < h - 2) {
    linhas.push('')
  }
  linhas.push(linhaDeToast(estado, w, t), rodape(estado, w, t))
  const prontas = linhas.map(l => ajustar(l, w))

  const desenharCaixa = CAIXAS[estado.overlay]

  return desenharCaixa ? sobrepor(prontas, w, desenharCaixa(estado, w, t)) : prontas
}
