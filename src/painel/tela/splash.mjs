// Tela de abertura (1,7 s, qualquer tecla pula): o logo do projeto se revelando em degradê, a
// assinatura, os serviços subindo e uma barra de progresso.
import { LOGO_PADRAO } from '../../banner.mjs'
import { SITE } from '../../constantes.mjs'
import {
  APAGADO,
  CIANO,
  compor,
  degrade,
  LARANJA,
  MAGENTA,
  marcaCodifyTech,
  pinta,
  SUAVE,
  SUBLINHADO,
  TEXTO,
} from '../cores.mjs'
import { processos } from '../estado.mjs'
import { centralizar } from '../texto.mjs'
import { ponto } from './pecas.mjs'

export const DURACAO_DO_SPLASH = 1700
const LARGURA_DA_BARRA = 44

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h
 * @param {number} t agora
 * @returns {string[]}
 */
export function splash(estado, w, h, t) {
  const logo = estado.plano.projeto.logo ?? LOGO_PADRAO
  const progresso = 1 - Math.max(0, estado.splashAte - t) / DURACAO_DO_SPLASH
  // O logo aparece da esquerda para a direita no primeiro pedaço da animação.
  const revelar = Math.min(1, progresso / 0.45)
  const linhas = []
  const topo = Math.max(0, Math.floor((h - (logo.length + 10)) / 2))

  for (let i = 0; i < topo; i++) {
    linhas.push('')
  }
  for (const linha of logo) {
    const letras = [...linha]
    const visivel = letras.slice(0, Math.ceil(letras.length * revelar)).join('')
    linhas.push(centralizar(degrade(visivel.padEnd(linha.length), LARANJA, MAGENTA, progresso * 2), w))
  }
  linhas.push('')
  linhas.push(centralizar(`${pinta(SUAVE, 'desenvolvido e mantido por ')}${marcaCodifyTech(t, 900)}`, w))
  linhas.push(centralizar(pinta(CIANO, SITE, SUBLINHADO), w))
  linhas.push('')
  linhas.push(centralizar(processos(estado).map(s => compor([ponto(s, t), [TEXTO, ` ${s.nome}`]])).join('   '), w))
  linhas.push('')
  const cheio = Math.round(LARGURA_DA_BARRA * progresso)
  linhas.push(centralizar(`${degrade('━'.repeat(Math.max(1, cheio)), LARANJA, MAGENTA)}${pinta(APAGADO, '─'.repeat(Math.max(0, LARGURA_DA_BARRA - cheio)))}`, w))
  linhas.push('')
  linhas.push(centralizar(pinta(APAGADO, 'subindo os serviços · qualquer tecla pula'), w))

  return linhas
}
