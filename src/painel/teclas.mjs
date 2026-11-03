// O que cada tecla faz. A ordem de prioridade: Ctrl+C sempre encerra; durante o splash qualquer tecla
// pula; encerrando, nada mais responde; digitando o filtro ou com uma caixa aberta, a tecla é dela;
// senão vêm os atalhos globais e, por fim, os da aba atual (visão geral, alertas ou log).
//
// As funções mudam o `estado` e chamam as ações com efeito (reiniciar, copiar, abrir…) pelo `ctx`,
// então os testes passam um ctx falso e conferem o estado e as chamadas.
import { teclaAcoes } from './acoes.mjs'
import { abrirComando, imprimivel, teclaComando } from './comando-livre.mjs'
import { abaAtual, abas, irPara, mostrarToast, servicoDe, trocarAba, verNoLog, visiveis, vista } from './estado.mjs'
import { limparAlertas, limparLog, limparTodos, linhasVisiveis, textoDoAlerta } from './logs.mjs'

/**
 * @typedef {object} Contexto o estado e as ações com efeito que as teclas disparam
 * @property {import('./estado.mjs').Estado} estado
 * @property {() => number} alturaDoLog         linhas visíveis numa aba de log
 * @property {() => void} encerrar
 * @property {(s: any) => void} reiniciar
 * @property {(s: any) => void} alternar        para/sobe
 * @property {() => void} reiniciarTodos
 * @property {(alvo: string) => void} abrir      URL ou arquivo no programa padrão
 * @property {(s: any) => void} abrirServico
 * @property {(texto: string, rotulo: string) => void} copiar
 * @property {() => void} alternarMouse
 * @property {() => void} redesenharTudo        Ctrl+L
 * @property {(tarefa: import('./tarefas.mjs').Tarefa) => void} rodarTarefa
 * @property {() => number} [agora]
 */

/** Sequências do terminal → nome da tecla. O que não está aqui é a própria letra. */
export const NOMES = {
  '\x1b[A': 'cima',
  '\x1b[B': 'baixo',
  '\x1b[C': 'direita',
  '\x1b[D': 'esquerda',
  '\x1bOA': 'cima',
  '\x1bOB': 'baixo',
  '\x1bOC': 'direita',
  '\x1bOD': 'esquerda',
  '\x1b[5~': 'pgup',
  '\x1b[6~': 'pgdn',
  '\x1b[H': 'home',
  '\x1b[1~': 'home',
  '\x1bOH': 'home',
  '\x1b[F': 'end',
  '\x1b[4~': 'end',
  '\x1bOF': 'end',
  '\t': 'tab',
  '\x1b[Z': 'shifttab',
  '\r': 'enter',
  '\n': 'enter',
  '\x1b': 'esc',
  '\x7f': 'backspace',
  '\b': 'backspace',
  '\x03': 'ctrlc',
  '\x0c': 'ctrll',
  '\x15': 'ctrlu',
}

/** Mouse (SGR), sequência CSI, SS3, Esc sozinho ou um caractere (um emoji inteiro conta como um). */
const RE_TECLA = /\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[[0-9;]*[~A-Za-z]|\x1bO[A-Za-z]|\x1b|[\s\S]/gu

/**
 * Um `data` do stdin pode trazer várias teclas (colar texto, rolar rápido): separa uma a uma.
 *
 * @param {string} dados
 * @returns {string[]}
 */
export const separarTeclas = dados => [...dados.matchAll(RE_TECLA)].map(([k]) => k)

export const nomeDaTecla = k => NOMES[k] ?? k

const agoraDe = ctx => ctx.agora?.() ?? Date.now()

/**
 * Rola a aba de log `n` linhas para cima (negativo: para baixo). Rolagem 0 = seguindo o fim.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {string} id
 * @param {number} n
 */
export function rolar(estado, id, n) {
  const v = vista(estado, id)
  v.rolagem = Math.max(0, v.rolagem + n)
  if (v.rolagem === 0) {
    v.novos = 0
  }
}

/**
 * @param {Contexto} ctx
 * @param {string} k a tecla crua (um item de `separarTeclas`)
 */
export function tratarTecla(ctx, k) {
  const { estado } = ctx
  const nome = nomeDaTecla(k)
  if (nome === 'ctrlc') {
    return ctx.encerrar()
  }
  if (estado.splashAte > agoraDe(ctx)) {
    estado.splashAte = 0

    return
  }
  if (estado.encerrando) {
    return
  }
  if (estado.digitando) {
    return digitarFiltro(ctx, nome, k)
  }
  if (estado.overlay === 'comando') {
    return teclaComando(ctx, nome, k)
  }
  if (estado.overlay === 'ajuda') {
    estado.overlay = null

    return
  }
  if (estado.overlay === 'acoes') {
    return teclaAcoes(ctx, nome, k)
  }

  switch (nome) {
    case 'q':
      return ctx.encerrar()
    case '?':
      estado.overlay = 'ajuda'

      return
    case 'direita':
    case 'tab':
      return trocarAba(estado, 1)
    case 'esquerda':
    case 'shifttab':
      return trocarAba(estado, -1)
    case 'a':
      estado.overlay = 'acoes'
      estado.selAcao = 0

      return
    case ':':
    case 'x':
      return abrirComando(estado, abaAtual(estado))
    case 'e':
      return irPara(estado, 'alertas')
    case 'm':
      return ctx.alternarMouse()
    case 'R':
      return ctx.reiniciarTodos()
    case 'ctrll':
      return ctx.redesenharTudo()
  }
  if (/^[1-9]$/.test(k)) {
    return irPara(estado, abas(estado)[Number(k) - 1]?.id)
  }

  const atual = abaAtual(estado)
  if (atual === 'geral') {
    return teclaGeral(ctx, nome)
  }
  if (atual === 'alertas') {
    return teclaAlertas(ctx, nome)
  }
  teclaLog(ctx, nome, atual === 'todos' ? null : servicoDe(estado, atual))
}

/** Visão geral: ↑↓ escolhem o cartão; as outras teclas agem no serviço escolhido. */
export function teclaGeral(ctx, nome) {
  const { estado } = ctx
  const cards = visiveis(estado)
  const s = cards[estado.selCard]
  switch (nome) {
    case 'cima':
    case 'k':
      estado.selCard = (estado.selCard - 1 + cards.length) % cards.length
      break
    case 'baixo':
    case 'j':
      estado.selCard = (estado.selCard + 1) % cards.length
      break
    case 'enter':
      irPara(estado, s?.nome)
      break
    case 'r':
      s && ctx.reiniciar(s)
      break
    case 's':
      s && ctx.alternar(s)
      break
    case 'o':
      s && ctx.abrirServico(s)
      break
    case 'c':
      s && limparLogComAviso(ctx, s)
      break
  }
}

/** Aba de log de um serviço (`s`) ou a "Todos" (`s` null). */
export function teclaLog(ctx, nome, s) {
  const { estado } = ctx
  const id = s ? s.nome : 'todos'
  const v = vista(estado, id)
  const pagina = ctx.alturaDoLog() - 2
  switch (nome) {
    case 'cima':
    case 'k':
      return rolar(estado, id, 1)
    case 'baixo':
    case 'j':
      return rolar(estado, id, -1)
    case 'pgup':
      return rolar(estado, id, pagina)
    case 'pgdn':
      return rolar(estado, id, -pagina)
    case 'home':
    case 'g':
      // A vista limita ao topo de verdade na hora de desenhar.
      v.rolagem = Number.MAX_SAFE_INTEGER

      return
    case 'end':
    case 'f':
    case 'G':
      v.rolagem = 0
      v.novos = 0

      return
    case '/':
      estado.digitando = true

      return
    case 'esc':
      v.filtro = ''

      return
    case 'y': {
      const { texto, quantidade } = linhasVisiveis(estado, s, ctx.alturaDoLog())

      return ctx.copiar(texto, `${quantidade} linha(s)`)
    }
    case 'c':
      if (s) {
        return limparLogComAviso(ctx, s)
      }
      limparTodos(estado)

      return mostrarToast(estado, 'todos os logs limpos', 'ok', 2000, agoraDe(ctx))
    case 'r':
      return s ? ctx.reiniciar(s) : mostrarToast(estado, 'escolha um serviço (ou R para reiniciar todos)', 'info', 4500, agoraDe(ctx))
    case 's':
      return s ? ctx.alternar(s) : mostrarToast(estado, 'escolha um serviço para parar ou subir', 'info', 4500, agoraDe(ctx))
    case 'o':
      return s ? ctx.abrirServico(s) : null
  }
}

/** Aba de alertas: ↑↓ escolhem; ⏎ leva à linha no log; y copia com o contexto. */
export function teclaAlertas(ctx, nome) {
  const { estado } = ctx
  const lista = [...estado.alertas].reverse()
  let i = Math.max(0, lista.indexOf(estado.selAlerta))
  const a = lista[i]
  switch (nome) {
    case 'cima':
    case 'k':
      i = Math.max(0, i - 1)
      break
    case 'baixo':
    case 'j':
      i = Math.min(lista.length - 1, i + 1)
      break
    case 'pgup':
      i = Math.max(0, i - 10)
      break
    case 'pgdn':
      i = Math.min(lista.length - 1, i + 10)
      break
    case 'home':
      i = 0
      break
    case 'end':
      i = lista.length - 1
      break
    case 'enter':
      return a && verNoLog(estado, a, ctx.alturaDoLog(), agoraDe(ctx))
    case 'y':
      return a && ctx.copiar(textoDoAlerta(a), 'alerta')
    case 'r':
      return a && ctx.reiniciar(a.s)
    case 'c':
      limparAlertas(estado)

      return mostrarToast(estado, 'alertas limpos', 'ok', 2000, agoraDe(ctx))
  }
  estado.selAlerta = lista[i] ?? null
}

function limparLogComAviso(ctx, s) {
  limparLog(ctx.estado, s)
  mostrarToast(ctx.estado, `log do ${s.nome} limpo`, 'ok', 2000, agoraDe(ctx))
}

/** Digitando o filtro (`/`): ⏎ aplica, Esc limpa; o log já filtra a cada letra. */
function digitarFiltro(ctx, nome, k) {
  const { estado } = ctx
  const v = vista(estado, abaAtual(estado))
  if (nome === 'enter') {
    estado.digitando = false
  } else if (nome === 'esc') {
    estado.digitando = false
    v.filtro = ''
  } else if (nome === 'backspace') {
    v.filtro = [...v.filtro].slice(0, -1).join('')
  } else if (imprimivel(k)) {
    v.filtro += k
  }
  v.rolagem = 0
  v.novos = 0
}
