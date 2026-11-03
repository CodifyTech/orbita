// Menu de ações rápidas (`a`): primeiro as do plano (cada preset traz as suas: limpar cache, rodar
// migrations, instalar dependências…), depois as fixas do painel: reiniciar todos, abrir no navegador
// cada serviço com URL e conhecer a CodifyTech.
import { SITE } from '../constantes.mjs'
import { processos } from './estado.mjs'

/**
 * @typedef {object} Acao
 * @property {'tarefa' | 'reiniciarTodos' | 'abrir'} tipo
 * @property {string} titulo
 * @property {string} detalhe
 * @property {string} [comando]  tarefa: o que rodar (a saída vai para a aba tarefas)
 * @property {string} [cwd]      tarefa: onde rodar
 * @property {string} [alvo]     abrir: URL
 */

/**
 * @param {import('./estado.mjs').Estado} estado
 * @returns {Acao[]}
 */
export function listarAcoes(estado) {
  return [
    ...estado.plano.acoes.map(a => ({ tipo: 'tarefa', titulo: a.titulo, detalhe: a.detalhe || a.comando, comando: a.comando, cwd: a.cwd })),
    { tipo: 'reiniciarTodos', titulo: 'Reiniciar todos os serviços', detalhe: 'R' },
    ...processos(estado)
      .filter(s => /^https?:\/\//.test(s.url ?? ''))
      .map(s => ({ tipo: 'abrir', titulo: `Abrir o ${s.nome} no navegador`, detalhe: s.url, alvo: s.url })),
    { tipo: 'abrir', titulo: 'Conhecer a CodifyTech', detalhe: SITE, alvo: SITE },
  ]
}

/**
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {Acao} acao
 */
export function executarAcao(ctx, acao) {
  if (acao.tipo === 'tarefa') {
    return ctx.rodarTarefa({ titulo: acao.titulo, comando: acao.comando, cwd: acao.cwd })
  }
  if (acao.tipo === 'reiniciarTodos') {
    return ctx.reiniciarTodos()
  }
  if (acao.tipo === 'abrir') {
    return ctx.abrir(acao.alvo)
  }
}

/**
 * Teclas com o menu aberto: ↑↓ escolhem, ⏎ ou o número rodam, Esc/a/q fecham.
 *
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {string} nome nome da tecla (teclas.mjs)
 * @param {string} k a tecla crua
 */
export function teclaAcoes(ctx, nome, k) {
  const { estado } = ctx
  const lista = listarAcoes(estado)
  if (nome === 'esc' || nome === 'a' || nome === 'q') {
    estado.overlay = null

    return
  }
  if (nome === 'cima' || nome === 'k') {
    estado.selAcao = (estado.selAcao - 1 + lista.length) % lista.length
  }
  if (nome === 'baixo' || nome === 'j') {
    estado.selAcao = (estado.selAcao + 1) % lista.length
  }
  const escolhida = nome === 'enter' ? lista[estado.selAcao] : /^[1-9]$/.test(k) ? lista[Number(k) - 1] : null
  if (escolhida) {
    estado.overlay = null
    executarAcao(ctx, escolhida)
  }
}
