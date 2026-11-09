// Tela de detalhes de um request: o resumo em cima (método, status, tempos, controller), uma aba por
// seção (payload, headers, response, queries…) e o conteúdo da seção com barra de rolagem.
import {
  AMARELO,
  APAGADO,
  AZUL,
  BRANCO,
  CIANO,
  compor,
  escurecer,
  forte,
  FUNDO_SEL,
  pinta,
  SUAVE,
  TEXTO,
  TEXTO_AVISO,
  TEXTO_ERRO,
} from '../cores.mjs'
import { horaDe } from '../formato.mjs'
import { centralizar, cortar, juntar, limpar, quebrar, vis } from '../texto.mjs'
import { corDoStatus, spinner } from './pecas.mjs'

/** Linha da tela (0-based) onde o conteúdo da aba começa: depois do cabeçalho, das abas e da sublinha. */
const TOPO_DO_CONTEUDO = 3
/** Linhas do conteúdo acima da seção: resumo (3) e barra de seções. */
const LINHAS_DO_TOPO = 4

const COR_DA_CHAVE = [147, 197, 253]
const COR_DE_TEXTO_JSON = [134, 239, 172]
const COR_DE_NUMERO = [192, 132, 252]
const RE_CHAVE = /^(\s*)("(?:[^"\\]|\\.)*")(: ?)(.*)$/

function pintarValor(valor) {
  const puro = valor.trim().replace(/,$/, '')
  const cor = puro.startsWith('"') ? COR_DE_TEXTO_JSON : /^-?\d/.test(puro) ? COR_DE_NUMERO : /^(?:true|false|null)$/.test(puro) ? AZUL : TEXTO

  return pinta(cor, valor)
}

/** Colore um pedaço de JSON formatado (a chave, se o pedaço começar por uma, e o valor). */
function pintarJson(pedaco) {
  const m = RE_CHAVE.exec(pedaco)

  return m ? `${m[1]}${pinta(COR_DA_CHAVE, m[2])}${pinta(TEXTO, m[3])}${pintarValor(m[4])}` : pintarValor(pedaco)
}

const ehVazio = valor => valor == null || valor === '' || (typeof valor === 'object' && !Object.keys(valor).length)

/**
 * As linhas prontas de uma seção, já quebradas na largura.
 *
 * @param {import('../../plano/tipos.mjs').SecaoDoRequest} secao
 * @param {number} w
 * @returns {string[]}
 */
export function linhasDaSecao(secao, w) {
  if (secao.tipo === 'lista') {
    return (secao.itens ?? []).flatMap(item => {
      const cor = item.nivel === 'erro' ? TEXTO_ERRO : item.nivel === 'alerta' ? TEXTO_AVISO : TEXTO

      return [
        ...quebrar(limpar(String(item.texto)), w - 2).map((p, k) => `${k === 0 ? pinta(APAGADO, '• ') : '  '}${pinta(cor, p)}`),
        ...(item.detalhe ? quebrar(limpar(String(item.detalhe)), w - 2).map(p => `  ${pinta(SUAVE, p)}`) : []),
      ]
    })
  }
  if (ehVazio(secao.valor)) {
    return []
  }
  if (typeof secao.valor === 'string') {
    return secao.valor.split('\n').flatMap(l => quebrar(limpar(l), w).map(p => pinta(TEXTO, p)))
  }

  return JSON.stringify(secao.valor, null, 2)
    .split('\n')
    .flatMap(l => quebrar(l, w).map(pintarJson))
}

/** As três linhas do resumo. Antes da resposta só existe o que a linha do log contou. */
function resumoDoRequest(d, w) {
  const r = { metodo: d.linha.req.metodo, status: d.linha.req.status, ...d.resumo }
  const caminho = limpar(String(r.caminho ?? d.linha.req.caminho))
  const metodo = r.metodo ? `${compor([[BRANCO, ` ${limpar(String(r.metodo))} `, true]], escurecer(AZUL, 0.45))} ` : ''
  const status = r.status ? compor([[BRANCO, ` ${r.status} `, true]], escurecer(corDoStatus(r.status), 0.45)) : ''
  const numeros = [
    `${Math.round(r.duracaoMs ?? d.linha.req.ms)} ms`,
    r.memoriaMb != null ? `${r.memoriaMb} MB` : '',
    r.ip ? limpar(String(r.ip)) : '',
    r.host ? limpar(String(r.host)) : '',
    r.hora ? limpar(String(r.hora)) : horaDe(d.linha.t),
  ].filter(Boolean)
  const middleware = (r.middleware ?? []).map(m => limpar(String(m))).join(', ')

  return [
    juntar(` ${metodo}${pinta(BRANCO, caminho)}`, `${status} `, w),
    ` ${pinta(SUAVE, numeros.join(' · '))}`,
    r.controller || middleware
      ? ` ${pinta(TEXTO, limpar(String(r.controller ?? '')))}${middleware ? `  ${pinta(APAGADO, `middleware: ${middleware}`)}` : ''}`
      : '',
  ]
}

/** Barra das seções; se não couber tudo, some o que está à esquerda da seção atual. */
function barraDeSecoes(estado, d, w, y) {
  const rotulo = s => ` ${s.titulo}${s.tipo === 'lista' ? ` ${s.itens?.length ?? 0}` : ''} `
  let primeira = 0
  const largura = (de, ate) => d.secoes.slice(de, ate + 1).reduce((soma, s) => soma + vis(rotulo(s)) + 1, 1)
  while (primeira < d.secao && largura(primeira, d.secao) > w) {
    primeira++
  }
  let x = 1
  let barra = ' '
  estado.regioes.secoes = []
  for (let i = primeira; i < d.secoes.length && x + vis(rotulo(d.secoes[i])) <= w; i++) {
    const texto = rotulo(d.secoes[i])
    barra += `${i === d.secao ? compor([[BRANCO, texto, true]], FUNDO_SEL) : pinta(SUAVE, texto)} `
    estado.regioes.secoes.push({ y, x0: x, x1: x + vis(texto), i })
    x += vis(texto) + 1
  }

  return barra
}

/** Consultando ou falhou: uma mensagem no meio da área livre. */
function mensagem(L, w, h, linhas) {
  while (L.length < Math.max(LINHAS_DO_TOPO, Math.floor((h - linhas.length) / 2))) {
    L.push('')
  }
  L.push(...linhas.map(l => centralizar(l, w)))

  return L
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h altura do conteúdo
 * @param {number} t agora
 * @returns {string[]}
 */
export function vistaDetalheRequest(estado, w, h, t) {
  const d = estado.detalheRequest
  const L = resumoDoRequest(d, w)
  estado.regioes.secoes = []

  if (d.situacao === 'carregando') {
    return mensagem(L, w, h, [`${pinta(AZUL, spinner(t))} ${pinta(SUAVE, 'buscando os detalhes do request…')}`])
  }
  if (d.situacao === 'falha') {
    return mensagem(L, w, h, [`${pinta(AMARELO, '▲')} ${forte(TEXTO, d.falha.erro)}`, ...(d.falha.dica ? [pinta(SUAVE, d.falha.dica)] : [])])
  }
  if (!d.secoes.length) {
    return mensagem(L, w, h, [pinta(SUAVE, 'sem detalhes para mostrar')])
  }

  L.push(cortar(barraDeSecoes(estado, d, w, TOPO_DO_CONTEUDO + L.length), w))
  const secao = d.secoes[d.secao]
  const altura = h - LINHAS_DO_TOPO
  const larguraTexto = Math.max(10, w - 4)
  // Um response de 64 KB seria quebrado de novo a cada quadro.
  if (d.cache?.secao !== d.secao || d.cache.largura !== larguraTexto) {
    d.cache = { secao: d.secao, largura: larguraTexto, linhas: linhasDaSecao(secao, larguraTexto) }
  }
  const { linhas } = d.cache
  d.rolagem = Math.min(d.rolagem, Math.max(0, linhas.length - altura))

  if (!linhas.length) {
    return mensagem(L, w, h, [pinta(SUAVE, `nada em ${secao.titulo}`)])
  }

  const polegar = linhas.length > altura ? Math.max(1, Math.round((altura * altura) / linhas.length)) : 0
  const posicao = polegar ? Math.round((d.rolagem / Math.max(1, linhas.length - altura)) * (altura - polegar)) : 0
  for (let y = 0; y < altura; y++) {
    const trilho = polegar && y >= posicao && y < posicao + polegar ? pinta(d.s.cor, '┃') : pinta([40, 46, 60], '│')
    L.push(juntar(`  ${linhas[d.rolagem + y] ?? ''}`, trilho, w))
  }

  return L
}
