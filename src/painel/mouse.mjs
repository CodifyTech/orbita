// Mouse (`m` liga e desliga): a roda rola o log ou a lista da aba; o clique escolhe a aba, o cartão, o
// alerta ou o request (o segundo clique no já escolhido abre). Usa as regiões que a tela anotou ao
// desenhar.
import { teclaAcoes } from './acoes.mjs'
import { abaAtual, irPara, moverCartao, servicoDe, verNoLog } from './estado.mjs'
import { cliqueNoRequest, irParaSecao, navegavel, rolarDetalhe } from './requests.mjs'
import { rolar, teclaAlertas } from './teclas.mjs'

/** Linha (0-based) da barra de abas na tela. */
const LINHA_DAS_ABAS = 1
const RODA_PARA_CIMA = 64
const RODA_PARA_BAIXO = 65
const BOTAO_ESQUERDO = 0
/** Linhas por passo da roda no log. */
const PASSO_DA_RODA = 3

/**
 * Sequência SGR do mouse (`\x1b[<botao;x;yM`, `m` no fim = soltou) → dados, com x/y a partir de 0.
 *
 * @param {string} sequencia
 * @returns {{ botao: number, x: number, y: number, soltou: boolean } | null}
 */
export function lerMouse(sequencia) {
  const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(sequencia)

  return m ? { botao: Number(m[1]), x: Number(m[2]) - 1, y: Number(m[3]) - 1, soltou: m[4] === 'm' } : null
}

/**
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {string} sequencia
 */
export function tratarMouse(ctx, sequencia) {
  const { estado } = ctx
  const evento = lerMouse(sequencia)
  if (!evento) {
    return
  }
  const { botao, x, y, soltou } = evento
  const atual = abaAtual(estado)

  if (botao === RODA_PARA_CIMA || botao === RODA_PARA_BAIXO) {
    const tecla = botao === RODA_PARA_CIMA ? 'cima' : 'baixo'
    if (estado.overlay === 'acoes') {
      return teclaAcoes(ctx, tecla, '')
    }
    if (estado.overlay) {
      return
    }
    if (estado.detalheRequest) {
      return rolarDetalhe(estado.detalheRequest, botao === RODA_PARA_CIMA ? -PASSO_DA_RODA : PASSO_DA_RODA)
    }
    if (atual === 'geral') {
      return moverCartao(estado, botao === RODA_PARA_CIMA ? -1 : 1)
    }
    if (atual === 'alertas') {
      return teclaAlertas(ctx, tecla)
    }

    return rolar(estado, atual, botao === RODA_PARA_CIMA ? PASSO_DA_RODA : -PASSO_DA_RODA)
  }
  // Só o clique (apertar) do botão esquerdo; soltar e os outros botões não fazem nada.
  if (botao !== BOTAO_ESQUERDO || soltou) {
    return
  }
  if (estado.overlay) {
    if (estado.overlay === 'ajuda') {
      estado.overlay = null
    }

    return
  }
  if (y === LINHA_DAS_ABAS) {
    return irPara(estado, estado.regioes.abas.find(a => x >= a.x0 && x < a.x1)?.id)
  }
  if (estado.detalheRequest) {
    const secao = estado.regioes.secoes.find(r => r.y === y && x >= r.x0 && x < r.x1)

    return secao ? irParaSecao(estado.detalheRequest, secao.i) : undefined
  }
  const servico = servicoDe(estado, atual)
  if (navegavel(servico)) {
    const linha = estado.regioes.log.find(r => r.y === y)?.linha

    return linha?.req ? cliqueNoRequest(ctx, servico, linha) : undefined
  }
  if (atual === 'geral') {
    const card = estado.regioes.cards.find(c => x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1)
    if (card && card.i === estado.selCard) {
      irPara(estado, card.nome)
    } else if (card) {
      estado.selCard = card.i
      estado.focoNosCartoes = true
    }
  }
  if (atual === 'alertas') {
    const linha = estado.regioes.alertas.find(l => l.y === y)
    if (linha) {
      linha.alerta === estado.selAlerta ? verNoLog(estado, linha.alerta, ctx.alturaDoLog(), ctx.agora?.() ?? Date.now()) : (estado.selAlerta = linha.alerta)
    }
  }
}
