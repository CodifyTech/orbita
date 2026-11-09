// Aba "Visão geral": pílulas de resumo, a grade de cartões (um por serviço) e, se sobrar altura, o
// quadro do ambiente (o que o plano mandou: versões, banco, fila…) ao lado dos últimos alertas.
import {
  AMARELO,
  APAGADO,
  AZUL,
  CIANO,
  LARANJA,
  marcaCodifyTech,
  pinta,
  ROXO,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { nosCartoes, processos, visiveis } from '../estado.mjs'
import { duracao, mb, plural, SITE_SEM_PROTOCOLO } from '../formato.mjs'
import { contarAlertas } from '../logs.mjs'
import { ajustar, centralizar } from '../texto.mjs'
import { linhaAlerta } from './alertas.mjs'
import { ALTURA_DO_CARTAO, ALTURA_DO_CARTAO_COMPACTO, cartao } from './cartao.mjs'
import { pilula, titulo } from './pecas.mjs'

const TOPO_DO_CONTEUDO = 3
const LARGURA_MINIMA_DO_CARTAO = 37
const MAX_COLUNAS = 4
const LARGURA_DO_AMBIENTE = 46

/**
 * Linhas do quadro "Ambiente": os itens do plano e as URLs dos serviços.
 *
 * @param {import('../estado.mjs').Estado} estado
 */
export function linhasAmbiente(estado) {
  const comUrl = processos(estado).filter(s => s.url)
  const rotulos = [...estado.plano.ambiente.map(a => a.rotulo), ...comUrl.map(s => s.nome)]
  const coluna = Math.max(9, ...rotulos.map(r => r.length + 1))

  return [
    ...estado.plano.ambiente.map(({ rotulo, valor }) => `${pinta(SUAVE, rotulo.padEnd(coluna))}${pinta(TEXTO, valor || '—')}`),
    ...comUrl.map(s => `${pinta(SUAVE, s.nome.padEnd(coluna))}${pinta(CIANO, s.url, SUBLINHADO)}`),
  ]
}

/** Os alertas mais recentes primeiro, ou o "nenhum erro" se não houver. */
export function linhasAlertasRecentes(estado, max) {
  const recentes = estado.alertas.slice(-Math.max(1, max)).reverse()
  if (!recentes.length) {
    return [`${pinta(VERDE, '✔')} ${pinta(TEXTO, 'nenhum erro ou alerta até agora')} ${pinta(SUAVE, '— bom código!')}`]
  }

  return recentes.map(linhaAlerta)
}

/** Pílulas do topo: no ar, reinícios, erros, alertas, memória total, tempo ligado. */
function resumo(estado, t) {
  const lista = processos(estado)
  const noAr = lista.filter(s => s.estado === 'online').length
  const { erros, avisos } = contarAlertas(estado.alertas)
  const reinicios = lista.reduce((n, s) => n + s.reinicios, 0)
  const memoria = lista.reduce((n, s) => n + (s.mem ?? 0), 0)

  return ` ${[
    pilula(noAr === lista.length ? VERDE : AMARELO, `● ${noAr}/${lista.length} no ar`),
    pilula(AMARELO, `↻ ${plural(reinicios, 'reinício')}`, reinicios > 0),
    pilula(VERMELHO, `✖ ${plural(erros, 'erro')}`, erros > 0),
    pilula(AMARELO, `▲ ${plural(avisos, 'alerta')}`, avisos > 0),
    memoria ? pilula(ROXO, `▣ ${mb(memoria)}`) : '',
    pilula(AZUL, `⏱ ${duracao(t - estado.inicio)}`),
  ]
    .filter(Boolean)
    .join(' ')}`
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h altura do conteúdo
 * @param {number} t agora
 */
export function vistaGeral(estado, w, h, t) {
  const L = ['', resumo(estado, t), '']

  const cards = visiveis(estado)
  estado.selCard = Math.max(0, Math.min(estado.selCard, cards.length - 1))
  const colunas = Math.max(1, Math.min(cards.length, Math.floor((w - 1) / LARGURA_MINIMA_DO_CARTAO), MAX_COLUNAS))
  const cw = Math.floor((w - 1 - (colunas - 1)) / colunas)
  const filas = Math.ceil(cards.length / colunas)
  const compacto = 3 + filas * ALTURA_DO_CARTAO > h
  const altura = compacto ? ALTURA_DO_CARTAO_COMPACTO : ALTURA_DO_CARTAO
  estado.regioes.cards = []

  // Grade maior que a tela: mostra as fileiras em volta do cartão escolhido.
  const cabem = Math.max(1, Math.floor((h - L.length - 1) / altura))
  const filaSel = Math.floor(estado.selCard / colunas)
  const primeira = Math.max(0, Math.min(filaSel - cabem + 1, filas - cabem))

  for (let f = primeira; f < Math.min(filas, primeira + cabem); f++) {
    const blocos = cards.slice(f * colunas, (f + 1) * colunas).map((s, c) => {
      const i = f * colunas + c
      const x0 = 1 + c * (cw + 1)
      const y0 = TOPO_DO_CONTEUDO + L.length
      estado.regioes.cards.push({ nome: s.nome, i, x0, x1: x0 + cw, y0, y1: y0 + altura })

      return cartao(s, cw, i === estado.selCard, compacto, t, nosCartoes(estado))
    })
    for (let y = 0; y < altura; y++) {
      L.push(` ${blocos.map(b => b[y]).join(' ')}`)
    }
  }

  const sobra = h - L.length - 1
  if (sobra >= 5) {
    L.push('')
    const ambiente = linhasAmbiente(estado)
    const alertas = linhasAlertasRecentes(estado, sobra - 3)
    if (w >= 110 && ambiente.length) {
      const wb = w - LARGURA_DO_AMBIENTE - 4
      const alturaDoQuadro = Math.min(sobra - 2, Math.max(ambiente.length, alertas.length) + 1)
      L.push(` ${titulo('Ambiente', LARANJA, LARGURA_DO_AMBIENTE)}  ${titulo('Últimos erros e alertas', VERMELHO, wb)}`)
      for (let i = 0; i < alturaDoQuadro - 1; i++) {
        L.push(` ${ajustar(ambiente[i] ?? '', LARGURA_DO_AMBIENTE)}  ${ajustar(alertas[i] ?? '', wb)}`)
      }
    } else {
      L.push(` ${titulo('Últimos erros e alertas', VERMELHO, w - 2)}`)
      L.push(...alertas.slice(0, sobra - 2).map(l => ` ${l}`))
    }
  }

  while (L.length < h - 1) {
    L.push('')
  }
  L.length = h - 1
  const { nome, slogan } = estado.plano.projeto
  const produto = w >= 130 && slogan ? `${nome} — ${slogan} · ` : `${nome} · `
  L.push(
    centralizar(
      `${pinta(APAGADO, '◆ ')}${pinta(SUAVE, `${produto}desenvolvido e mantido pela `)}${marcaCodifyTech(t)}${pinta(APAGADO, ' · ')}${pinta(CIANO, SITE_SEM_PROTOCOLO)}`,
      w,
    ),
  )

  return L.map(l => ajustar(l, w))
}
