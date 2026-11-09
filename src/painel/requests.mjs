// Os requests de uma aba de servidor: escolher com ↑↓ ou clique e abrir os detalhes com ⏎. Quem sabe
// descrever um request é o programa que o plano indicou (`detalhesDeRequest`); o painel só o roda e
// desenha as seções que vierem, sem saber de que stack elas são.
import { executar as executarPadrao, precisaDeShell } from '../ambiente/executar.mjs'
import { casa, vista } from './estado.mjs'
import { limpar } from './texto.mjs'

/** Consultar sobe o framework inteiro: com banco lento leva alguns segundos. */
const TEMPO_DA_CONSULTA = 30_000

/** Esta aba tem requests para escolher? (Sem isso, ↑↓ só rolam o log.) */
export const navegavel = s => Boolean(s?.detalhesDeRequest)

/**
 * Muda o request escolhido: -1 é o anterior (mais antigo), +1 o seguinte. Sem escolha válida na tela
 * (nada escolhido, ou a roda levou o escolhido embora), começa pelo que está visível.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {any} s o serviço da aba
 * @param {-1 | 1} passo
 * @returns {boolean} false = não havia o que escolher e a tecla deve rolar o log
 */
export function moverSelecao(estado, s, passo) {
  if (!navegavel(s)) {
    return false
  }
  const v = vista(estado, s.nome)
  const requests = s.linhas.filter(l => l.req && casa(l, v.filtro))
  if (!requests.length) {
    return false
  }
  const naTela = estado.regioes.log.map(r => r.linha).filter(l => l.req && l.s === s)
  const i = requests.findIndex(l => l.seq === v.sel)
  const saiuDaTela = i >= 0 && !v.revelar && naTela.length > 0 && !naTela.some(l => l.seq === v.sel)

  if (i < 0 || saiuDaTela) {
    // Seguindo o fim e sem escolha, ↓ não tem para onde ir.
    if (!naTela.length || (i < 0 && passo > 0 && v.rolagem === 0)) {
      return false
    }
    selecionar(v, passo < 0 ? naTela.at(-1) : naTela[0])

    return true
  }
  const alvo = requests[i + passo]
  if (alvo) {
    selecionar(v, alvo)

    return true
  }
  if (passo < 0) {
    return false
  }
  // Passou do mais novo: larga a escolha e volta a seguir o log.
  v.sel = null
  v.rolagem = 0
  v.novos = 0

  return true
}

function selecionar(v, linha) {
  v.sel = linha.seq
  v.revelar = true
}

/** O request escolhido na aba, se ele ainda estiver no log. */
export function escolhido(estado, s) {
  const { sel } = vista(estado, s.nome)

  return sel === null ? null : (s.linhas.findLast(l => l.seq === sel && l.req) ?? null)
}

/** Clique numa linha do log: o primeiro escolhe, o segundo (no já escolhido) abre os detalhes. */
export function cliqueNoRequest(ctx, s, linha) {
  const v = vista(ctx.estado, s.nome)
  if (v.sel === linha.seq) {
    return abrirDetalhe(ctx, s, linha)
  }
  selecionar(v, linha)
}

/**
 * Abre a tela de detalhes já em "carregando" e pede os dados.
 *
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {any} s
 * @param {import('./estado.mjs').Linha & { req: { caminho: string, ms: number } }} linha
 */
export function abrirDetalhe(ctx, s, linha) {
  ctx.estado.detalheRequest = { s, linha, situacao: 'carregando', resumo: null, secoes: [], falha: null, secao: 0, rolagem: 0, cache: null }
  ctx.consultarRequest(ctx.estado.detalheRequest)
}

/**
 * @param {import('./estado.mjs').Estado} estado
 * @param {{ executar?: import('../ambiente/executar.mjs').Executor, shell?: boolean }} [deps]
 * @returns {(detalhe: any) => Promise<void>}
 */
export function criarConsultaDeRequest(estado, { executar = executarPadrao, shell = precisaDeShell() } = {}) {
  return async function consultarRequest(detalhe) {
    const { linha, s } = detalhe
    const { programa, args, cwd } = s.detalhesDeRequest
    const resposta = lerResposta(
      await executar(programa, args, {
        cwd,
        shell,
        timeout: TEMPO_DA_CONSULTA,
        env: { ORBITA_REQUEST: paraVariavel({ caminho: linha.req.caminho, t: linha.t, ms: linha.req.ms, metodo: linha.req.metodo }) },
      }),
    )
    // O dev pode ter fechado (ou aberto outro) enquanto o programa rodava.
    if (estado.detalheRequest !== detalhe) {
      return
    }
    if (resposta.ok) {
      Object.assign(detalhe, { situacao: 'pronto', resumo: resposta.resumo ?? {}, secoes: resposta.secoes ?? [] })
    } else {
      Object.assign(detalhe, { situacao: 'falha', falha: { erro: limpar(String(resposta.erro)), dica: resposta.dica ? limpar(String(resposta.dica)) : null } })
    }
  }
}

/** JSON só com ASCII: um acento na variável de ambiente pode chegar trocado no PHP do Windows. */
export const paraVariavel = dados => JSON.stringify(dados).replace(/[\u0080-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

/**
 * Lê o JSON que o programa imprimiu. Avisos do interpretador podem vir antes dele.
 *
 * @param {import('../ambiente/executar.mjs').Resultado} resultado
 * @returns {{ ok: boolean } & Record<string, any>}
 */
export function lerResposta({ saida, erro }) {
  const inicio = saida.indexOf('{"ok"')
  if (inicio >= 0) {
    try {
      return JSON.parse(saida.slice(inicio))
    } catch {
      // cai no erro abaixo
    }
  }

  return { ok: false, etapa: 'resposta', erro: (erro || saida).trim().split('\n')[0]?.slice(0, 300) || 'o programa não respondeu' }
}

/**
 * A seção como texto, para copiar.
 *
 * @param {import('../plano/tipos.mjs').SecaoDoRequest} secao
 */
export function textoDaSecao(secao) {
  if (secao.tipo === 'lista') {
    return (secao.itens ?? []).map(i => (i.detalhe ? `${i.texto}\n  ${i.detalhe}` : i.texto)).join('\n')
  }

  return typeof secao.valor === 'string' ? secao.valor : JSON.stringify(secao.valor, null, 2)
}

/** Teclas com a tela de detalhes aberta; o resto não faz nada, para não agir no serviço sem querer. */
export function teclaDetalhe(ctx, nome) {
  const { estado } = ctx
  const d = estado.detalheRequest
  const pagina = Math.max(1, ctx.alturaDoLog() - 3)
  switch (nome) {
    case 'esc':
    case 'q':
    case 'backspace':
      estado.detalheRequest = null

      return
    case 'direita':
    case 'tab':
      return trocarSecao(d, 1)
    case 'esquerda':
    case 'shifttab':
      return trocarSecao(d, -1)
    case 'cima':
    case 'k':
      return rolarDetalhe(d, -1)
    case 'baixo':
    case 'j':
      return rolarDetalhe(d, 1)
    case 'pgup':
      return rolarDetalhe(d, -pagina)
    case 'pgdn':
      return rolarDetalhe(d, pagina)
    case 'home':
    case 'g':
      d.rolagem = 0

      return
    case 'end':
    case 'G':
      d.rolagem = Number.MAX_SAFE_INTEGER

      return
    case 'y': {
      const secao = d.secoes[d.secao]

      return secao ? ctx.copiar(textoDaSecao(secao), secao.titulo) : undefined
    }
  }
}

/** Rola o conteúdo da seção; a tela limita ao fim de verdade na hora de desenhar. */
export function rolarDetalhe(d, n) {
  d.rolagem = Math.max(0, d.rolagem + n)
}

export function trocarSecao(d, passo) {
  if (d.secoes.length) {
    irParaSecao(d, (d.secao + passo + d.secoes.length) % d.secoes.length)
  }
}

export function irParaSecao(d, i) {
  d.secao = i
  d.rolagem = 0
}
