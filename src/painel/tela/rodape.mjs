// As duas últimas linhas: a do toast (mensagem passageira) e o rodapé com as dicas de teclas da
// vista atual, ou a linha de digitação do filtro.
import {
  AMARELO,
  APAGADO,
  AZUL,
  BRANCO,
  compor,
  escurecer,
  forte,
  pinta,
  SUAVE,
  TEXTO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { abaAtual, vista } from '../estado.mjs'
import { SITE_SEM_PROTOCOLO } from '../formato.mjs'
import { cortar, juntar, RE_ANSI, vis } from '../texto.mjs'

const TRILHO = [34, 39, 52]

/** Dicas de cada vista, na ordem de importância (as do fim saem primeiro quando falta espaço). */
export const DICAS = {
  geral: [
    ['←→', 'abas'],
    ['↑↓', 'serviço'],
    ['⏎', 'logs'],
    ['r', 'reiniciar'],
    ['s', 'parar/subir'],
    ['o', 'abrir'],
    ['a', 'ações'],
    [':', 'comando'],
    ['?', 'ajuda'],
    ['q', 'sair'],
  ],
  log: [
    ['←→', 'abas'],
    ['↑↓ PgUp PgDn', 'rolar'],
    ['End', 'seguir'],
    ['/', 'filtrar'],
    ['r', 'reiniciar'],
    ['s', 'parar/subir'],
    ['c', 'limpar'],
    ['y', 'copiar'],
    ['a', 'ações'],
    [':', 'comando'],
    ['?', 'ajuda'],
    ['q', 'sair'],
  ],
  alertas: [
    ['←→', 'abas'],
    ['↑↓', 'escolher'],
    ['⏎', 'ver no log'],
    ['y', 'copiar'],
    ['r', 'reiniciar serviço'],
    ['c', 'limpar'],
    ['?', 'ajuda'],
    ['q', 'sair'],
  ],
}

/** Cursor piscando (meio segundo aceso, meio apagado). */
export const cursor = t => (Math.floor(t / 500) % 2 ? '▏' : ' ')

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} t agora
 */
export function rodape(estado, w, t) {
  const atual = abaAtual(estado)
  if (estado.digitando) {
    const v = vista(estado, atual)

    return juntar(` ${forte(AMARELO, '/')} ${pinta(BRANCO, v.filtro)}${pinta(AMARELO, cursor(t))}`, `${pinta(SUAVE, '⏎ aplicar · Esc limpar')} `, w)
  }
  const dicas = DICAS[atual === 'geral' || atual === 'alertas' ? atual : 'log']
  const direita = w >= 130 ? `${estado.mouse ? pinta(SUAVE, 'mouse ligado · ') : ''}${pinta(APAGADO, SITE_SEM_PROTOCOLO)} ` : ''

  // Só as dicas que cabem inteiras; `?` (a ajuda completa) e `q` nunca saem.
  const essenciais = dicas.filter(([k]) => k === '?' || k === 'q')
  const opcionais = dicas.filter(([k]) => k !== '?' && k !== 'q')
  const montar = lista => ` ${lista.map(([k, d]) => `${forte(TEXTO, k)} ${pinta(SUAVE, d)}`).join(pinta(APAGADO, '  '))}`
  let escolhidas = opcionais
  while (escolhidas.length && vis(montar([...escolhidas, ...essenciais])) > w - vis(direita) - 1) {
    escolhidas = escolhidas.slice(0, -1)
  }

  return juntar(montar([...escolhidas, ...essenciais]), direita, w)
}

/**
 * A linha do toast: um traço discreto, com a mensagem à direita enquanto ela não expira.
 *
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} t agora
 */
export function linhaDeToast(estado, w, t) {
  const toast = estado.toast
  if (!toast || t > toast.ate) {
    return pinta(TRILHO, '─'.repeat(w))
  }
  const cor = toast.nivel === 'erro' ? VERMELHO : toast.nivel === 'ok' ? VERDE : AZUL
  const icone = toast.nivel === 'erro' ? '✖ ' : ''
  const corpo = compor([[BRANCO, ` ${icone}${cortar(toast.texto, Math.min(w - 8, 110)).replace(RE_ANSI, '')} `, true]], escurecer(cor, 0.45))

  return `${pinta(TRILHO, '─'.repeat(Math.max(0, w - vis(corpo) - 2)))}${corpo}${pinta(TRILHO, '──')}`
}
