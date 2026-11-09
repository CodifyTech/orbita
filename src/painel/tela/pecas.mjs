// Peças pequenas reaproveitadas pelas vistas: o ponto de estado (com spinner e pulsação), o texto do
// estado, o gráfico de atividade, a pílula, o título de seção, a caixa e a sobreposição da caixa.
import {
  AMARELO,
  APAGADO,
  AZUL,
  bg,
  BRANCO,
  CIANO,
  clarear,
  compor,
  escurecer,
  fg,
  forte,
  FUNDO_CAIXA,
  misturar,
  pinta,
  RESET,
  SUAVE,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { duracao } from '../formato.mjs'
import { ajustar, fatiarPlano, RE_ANSI, vis } from '../texto.mjs'

/** Como cada estado aparece. `spin`: ícone animado (algo está acontecendo). */
export const ESTADOS = {
  subindo: { texto: 'subindo', cor: AZUL, spin: true },
  online: { texto: 'no ar', cor: VERDE, icone: '●' },
  instavel: { texto: 'sem resposta', cor: AMARELO, icone: '◐' },
  reiniciando: { texto: 'reiniciando', cor: AMARELO, spin: true },
  parando: { texto: 'parando', cor: SUAVE, spin: true },
  parado: { texto: 'parado', cor: SUAVE, icone: '○' },
  caiu: { texto: 'caiu', cor: VERMELHO, icone: '✖' },
  ocioso: { texto: 'ocioso', cor: SUAVE, icone: '○' },
  rodando: { texto: 'rodando', cor: CIANO, spin: true },
}

export const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export const BARRAS = '▁▂▃▄▅▆▇█'
const ESMAECIDO = [52, 58, 72]

/** Quadro do spinner no instante `t` (um quadro a cada 80 ms). */
export const spinner = t => SPIN[Math.floor(t / 80) % SPIN.length]

/**
 * [cor, ícone] do estado do serviço; "no ar" pulsa devagar, os estados em andamento giram.
 *
 * @returns {[import('../cores.mjs').Cor, string]}
 */
export function ponto(s, t = Date.now()) {
  const e = ESTADOS[s.estado] ?? ESTADOS.parado
  if (e.spin) {
    return [e.cor, spinner(t)]
  }
  if (s.estado === 'online') {
    const k = (Math.sin(t / 280) + 1) / 2

    return [misturar(escurecer(VERDE, 0.35), clarear(VERDE, 0.25), k), '●']
  }

  return [e.cor, e.icone]
}

/** "reiniciando em 3s", "subindo 12s", o detalhe da saúde ou o nome do estado. */
export function textoEstado(s, t = Date.now()) {
  if (s.estado === 'reiniciando' && s.timer) {
    return `reiniciando em ${Math.max(1, Math.ceil((s.retomarEm - t) / 1000))}s`
  }
  if (s.estado === 'subindo' && s.filho) {
    return `subindo ${duracao(t - s.inicio)}`
  }

  return s.detalhe ?? ESTADOS[s.estado]?.texto ?? s.estado
}

export const corLatencia = ms => (ms < 150 ? VERDE : ms < 600 ? AMARELO : VERMELHO)

export const corDoStatus = status => (status >= 500 ? VERMELHO : status >= 400 ? AMARELO : status >= 300 ? CIANO : VERDE)

/**
 * As barras do gráfico (sem cor): cada valor vira um de ▁▂▃▄▅▆▇█ proporcional ao maior. Zero é
 * sempre ▁, e qualquer valor acima de zero é no mínimo ▂, para não se confundir com o vazio.
 *
 * @param {number[]} valores
 * @returns {string}
 */
export function barrasDoGrafico(valores) {
  const max = Math.max(1, ...valores)

  return valores.map(v => (v ? BARRAS[Math.max(1, Math.ceil((v / max) * 7))] : BARRAS[0])).join('')
}

/** O gráfico pintado: quanto mais alto, mais claro. */
export function sparkline(valores, cor) {
  const max = Math.max(1, ...valores)
  const barras = [...barrasDoGrafico(valores)]

  return valores
    .map((v, i) => (v ? pinta(misturar(escurecer(cor, 0.25), clarear(cor, 0.3), v / max), barras[i]) : pinta(APAGADO, barras[i])))
    .join('')
}

/** Etiqueta com fundo; apagada quando não há o que destacar (ex.: "0 erros"). */
export function pilula(cor, texto, ativo = true) {
  return ativo ? compor([[BRANCO, ` ${texto} `, true]], escurecer(cor, 0.45)) : compor([[SUAVE, ` ${texto} `]], [30, 35, 48])
}

/** "Título ────────" ocupando a largura `w`. */
export function titulo(texto, cor, w) {
  return `${forte(cor, texto)} ${pinta(APAGADO, '─'.repeat(Math.max(0, w - vis(texto) - 1)))}`
}

/**
 * Caixa com fundo próprio e borda arredondada. O conteúdo pode ter cores: cada reset volta para o
 * fundo da caixa, senão o fundo "vazaria" no meio da linha.
 *
 * @param {string} rotulo título na borda de cima
 * @param {string[]} conteudo
 * @param {number} w largura total, com a borda
 * @param {import('../cores.mjs').Cor} cor da borda
 * @returns {string[]}
 */
export function caixa(rotulo, conteudo, w, cor) {
  const fundo = bg(FUNDO_CAIXA)
  const borda = fg(cor)
  const dentro = t => `${fundo}${ajustar(t, w - 4).replaceAll(RESET, RESET + fundo)}`
  const topo = `${fundo}${borda}╭─ ${RESET}${fundo}${rotulo.replaceAll(RESET, RESET + fundo)}${fundo}${borda} ${'─'.repeat(Math.max(0, w - 5 - vis(rotulo)))}╮${RESET}`

  return [
    topo,
    ...conteudo.map(t => `${fundo}${borda}│ ${RESET}${dentro(t)}${fundo}${borda} │${RESET}`),
    `${fundo}${borda}╰${'─'.repeat(w - 2)}╯${RESET}`,
  ]
}

/**
 * Esmaece a tela inteira e põe a caixa no meio (ajuda, ações, comando, encerramento).
 *
 * @param {string[]} linhas a tela já pronta, cada linha com largura `w`
 * @param {number} w
 * @param {string[]} caixaLinhas
 */
export function sobrepor(linhas, w, caixaLinhas) {
  const bw = vis(caixaLinhas[0])
  const x = Math.max(0, Math.floor((w - bw) / 2))
  const y0 = Math.max(0, Math.floor((linhas.length - caixaLinhas.length) / 2))

  return linhas.map((linha, y) => {
    const plano = linha.replace(RE_ANSI, '')
    if (y < y0 || y >= y0 + caixaLinhas.length) {
      return pinta(ESMAECIDO, plano)
    }

    return pinta(ESMAECIDO, fatiarPlano(plano, 0, x)) + caixaLinhas[y - y0] + pinta(ESMAECIDO, fatiarPlano(plano, x + bw, w))
  })
}
