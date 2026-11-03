// Roda uma ação rápida ou um comando livre e joga a saída na aba "tarefas", que aparece na hora.
// Várias podem rodar juntas; a aba fica "rodando" até a última terminar.
import { iniciarFilho as iniciarFilhoPadrao } from '../ambiente/filhos.mjs'
import { irPara, mostrarToast, tarefasDe, vista } from './estado.mjs'
import { duracao } from './formato.mjs'
import { lerFluxo, linhaDoProcesso, registrar } from './logs.mjs'

/**
 * @typedef {object} Tarefa
 * @property {string} titulo   como aparece no log e no toast
 * @property {string} comando  rodado com shell
 * @property {string} [cwd]    pasta; padrão: raiz do projeto
 */

/**
 * @param {import('./estado.mjs').Estado} estado
 * @param {{ envFilhos: () => Record<string, string | undefined>, iniciarFilho?: typeof iniciarFilhoPadrao, relogio?: () => number }} deps
 * @returns {(tarefa: Tarefa) => void}
 */
export function criarExecutorDeTarefas(estado, { envFilhos, iniciarFilho = iniciarFilhoPadrao, relogio = Date.now }) {
  return function rodarTarefa(tarefa) {
    const s = tarefasDe(estado)
    const inicio = relogio()
    registrar(estado, s, `▶ ${tarefa.titulo} — ${tarefa.comando}`, 'sistema', { agora: inicio })
    irPara(estado, s.nome)
    vista(estado, s.nome).rolagem = 0
    s.estado = 'rodando'
    s.metricas.total = (s.metricas.total ?? 0) + 1

    const filho = iniciarFilho(tarefa.comando, { cwd: tarefa.cwd ?? estado.plano.projeto.raiz, env: envFilhos() })
    estado.tarefas.add(filho)
    lerFluxo(filho.stdout, linha => linhaDoProcesso(estado, s, linha, relogio()))
    lerFluxo(filho.stderr, linha => linhaDoProcesso(estado, s, linha, relogio()))

    let terminou = false
    const terminar = codigo => {
      if (terminou) {
        return
      }
      terminou = true
      estado.tarefas.delete(filho)
      s.estado = estado.tarefas.size ? 'rodando' : 'ocioso'
      const agora = relogio()
      if (codigo === 0) {
        registrar(estado, s, `✔ ${tarefa.titulo}: concluído em ${duracao(agora - inicio)}`, 'sistema', { agora })
        mostrarToast(estado, `✔ ${tarefa.titulo}: concluído`, 'ok', 4500, agora)
      } else {
        registrar(estado, s, `${tarefa.titulo} falhou (código ${codigo})`, 'erro', { agora })
      }
    }
    filho.on('error', erro => {
      registrar(estado, s, `Não consegui rodar: ${erro.message}`, 'erro', { agora: relogio() })
      if (!filho.pid) {
        terminar(1)
      }
    })
    filho.on('exit', codigo => terminar(codigo))
  }
}
