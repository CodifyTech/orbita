// Aba "Alertas": a lista de erros e avisos de todos os serviços (o mais novo em cima) e, embaixo,
// o detalhe do escolhido com as linhas vizinhas no log.
import {
  AMARELO,
  APAGADO,
  BRANCO,
  clarear,
  compor,
  escurecer,
  forte,
  FUNDO_SEL,
  misturar,
  pinta,
  SUAVE,
  TEXTO,
  TEXTO_AVISO,
  TEXTO_ERRO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { horaDe, plural } from '../formato.mjs'
import { contarAlertas } from '../logs.mjs'
import { ajustar, centralizar, fatiarPlano, juntar, quebrar, RE_ANSI } from '../texto.mjs'
import { caixa, pilula } from './pecas.mjs'
import { realce } from './realce.mjs'

/** Linhas do conteúdo acima da lista (cabeçalho, abas e sublinha): é onde a lista começa na tela. */
const TOPO_DO_CONTEUDO = 3

/**
 * "✖ 14:03:59 server   mensagem ×3".
 *
 * @param {{ nivel: string, t: number, s: any, texto: string, vezes: number }} a
 */
export function linhaAlerta(a) {
  const icone = a.nivel === 'erro' ? pinta(VERMELHO, '✖') : pinta(AMARELO, '▲')
  const vezes = a.vezes > 1 ? pinta(SUAVE, ` ×${a.vezes}`) : ''

  return `${icone} ${pinta(APAGADO, horaDe(a.t))} ${pinta(a.s.cor, a.s.nome.padEnd(8))} ${pinta(a.nivel === 'erro' ? TEXTO_ERRO : TEXTO_AVISO, a.texto)}${vezes}`
}

/** A lista vazia: um ✔ pulsando e o que vai aparecer ali. */
function semAlertas(L, w, h, t) {
  const k = (Math.sin(t / 400) + 1) / 2
  for (let i = 0; i < Math.floor((h - 2) / 2) - 2; i++) {
    L.push('')
  }
  L.push(centralizar(forte(misturar(escurecer(VERDE, 0.2), clarear(VERDE, 0.3), k), '✔'), w))
  L.push('')
  L.push(centralizar(forte(TEXTO, 'Nenhum erro ou alerta até agora'), w))
  L.push(centralizar(pinta(SUAVE, 'Erros, avisos e quedas de qualquer serviço aparecem aqui assim que acontecem.'), w))
  while (L.length < h) {
    L.push('')
  }

  return L.map(l => ajustar(l, w))
}

/** Caixa de detalhes: o alerta inteiro e as linhas em volta dele no log do serviço. */
function detalhe(a, w, altura) {
  const erro = a.nivel === 'erro'
  const quando = `${horaDe(a.t)}${a.vezes > 1 ? ` · ${a.vezes} vezes no último minuto` : ''}`
  const linhas = [
    `${forte(erro ? VERMELHO : AMARELO, erro ? '✖ erro' : '▲ alerta')}  ${pinta(a.s.cor, a.s.nome)}  ${pinta(SUAVE, quando)}`,
    ...quebrar(a.texto, w - 8)
      .slice(0, 3)
      .map(p => pinta(TEXTO, p)),
  ]
  const posicao = a.s.linhas.findIndex(l => l.seq === a.seq)
  if (posicao >= 0) {
    linhas.push(pinta(APAGADO, '─ contexto no log ─'))
    const vizinhas = a.s.linhas.slice(Math.max(0, posicao - 2), posicao + 4)
    for (const l of vizinhas.slice(0, altura - linhas.length - 2)) {
      const marca = l.seq === a.seq ? pinta(AMARELO, '▶') : pinta(APAGADO, '▎')
      linhas.push(`${pinta(APAGADO, horaDe(l.t))} ${marca} ${realce(l.texto, l)}`)
    }
  }
  while (linhas.length < altura - 2) {
    linhas.push('')
  }

  return caixa(forte(BRANCO, 'Detalhes'), linhas.slice(0, altura - 2), w - 2, escurecer(a.nivel === 'erro' ? VERMELHO : AMARELO, 0.2)).map(l => ` ${l}`)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h altura do conteúdo
 * @param {number} t agora
 */
export function vistaAlertas(estado, w, h, t) {
  const lista = [...estado.alertas].reverse()
  const { erros, avisos } = contarAlertas(lista)
  const pilulas = `${pilula(VERMELHO, `✖ ${plural(erros, 'erro')}`, erros > 0)} ${pilula(AMARELO, `▲ ${plural(avisos, 'alerta')}`, avisos > 0)}`
  const L = [juntar(` ${pilulas}  ${pinta(SUAVE, 'de todos os serviços e logs; repetidos em 1 min viram ×N')}`, '', w), '']
  estado.regioes.alertas = []

  if (!lista.length) {
    return semAlertas(L, w, h, t)
  }

  let sel = lista.indexOf(estado.selAlerta)
  if (sel < 0) {
    sel = 0
    estado.selAlerta = lista[0]
  }
  const alturaDetalhe = h >= 22 ? Math.min(13, Math.floor(h * 0.42)) : 0
  const alturaLista = h - 2 - alturaDetalhe
  // A lista rola para manter o escolhido no meio.
  const ini = Math.max(0, Math.min(sel - Math.floor(alturaLista / 2), lista.length - alturaLista))

  for (let i = ini; i < Math.min(lista.length, ini + alturaLista); i++) {
    const a = lista[i]
    estado.regioes.alertas.push({ y: TOPO_DO_CONTEUDO + L.length, alerta: a })
    if (i === sel) {
      L.push(compor([[BRANCO, fatiarPlano(` › ${linhaAlerta(a).replace(RE_ANSI, '')}`, 0, w), true]], FUNDO_SEL))
    } else {
      L.push(`   ${linhaAlerta(a)}`)
    }
  }
  while (L.length < h - alturaDetalhe) {
    L.push('')
  }
  if (alturaDetalhe) {
    L.push(...detalhe(lista[sel], w, alturaDetalhe))
  }

  L.length = Math.min(L.length, h)
  while (L.length < h) {
    L.push('')
  }

  return L.map(l => ajustar(l, w))
}
