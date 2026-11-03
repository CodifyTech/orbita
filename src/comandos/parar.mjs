// `codify parar`: derruba o ambiente local quando o Ctrl+C não serve (terminal fechado, sobra de
// outro dev). --listar só mostra; --force não pergunta. A regra de quem encerrar está em src/parar/.
import { aguardarLiberar, escutando } from '../ambiente/portas.mjs'
import { encerrarArvore, listarProcessos } from '../ambiente/processos.mjs'
import { ErroDeUso } from '../erros.mjs'
import { encontrarAlvos, portasCandidatas } from '../parar/alvos.mjs'
import { montarContexto } from '../projeto/contexto.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'
import { larguraDoTerminal, linhaDeDetalhe } from '../ui/tabela.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'parar',
  descricao: 'Derruba o ambiente que ficou rodando (terminal fechado, sobra de outro dev). --listar só mostra; --force não pergunta',
  async executar({ argumentos: { opcoes }, projeto, perguntas, saida, estilo, terminal, env }) {
    const mensagens = criarMensagens(saida, estilo)
    const { todos } = montarContexto(projeto, { filtrar: false, perguntas, saida, estilo, terminal, env })
    const mapa = await escutando()

    // Listar os processos é lento no Windows (~1 s): só quando alguma porta nossa está em uso.
    const algumaEmUso = portasCandidatas(todos).some(({ porta }) => mapa.has(porta))
    const processos = algumaEmUso ? await listarProcessos() : new Map()
    const { alvos, ignorados } = encontrarAlvos(todos, mapa, processos)

    for (const ignorado of ignorados) {
      mensagens.aviso(`Não vou encerrar — ${ignorado}.`)
    }

    if (!alvos.length) {
      mensagens.ok('Nada do ambiente local está rodando.')

      return 0
    }

    const largura = larguraDoTerminal(saida)
    mensagens.linha(`\n  ${estilo.negrito('Vou encerrar:')}`)
    for (const alvo of alvos) {
      mensagens.linha(linhaDeDetalhe(alvo.descricao, `portas ${alvo.portas.map(({ porta, servico }) => `${porta} (${servico})`).join(', ')}`, { largura, estilo }))
    }

    if (opcoes.listar) {
      return 0
    }

    if (!opcoes.force) {
      if (!perguntas.interativo) {
        throw new ErroDeUso('Sem terminal interativo: rode com --force para encerrar.')
      }
      if (!(await perguntas.confirmar('Encerrar?', true))) {
        return 0
      }
    }

    let falhas = 0

    for (const alvo of alvos) {
      await encerrarArvore(alvo.pid, processos)

      const presas = []
      for (const { porta } of alvo.portas) {
        if (!(await aguardarLiberar(porta))) {
          presas.push(porta)
        }
      }

      if (presas.length) {
        falhas++
        mensagens.erro(`Continuam em uso: ${presas.join(', ')}. Encerre pelo gerenciador de tarefas (ou \`kill\`) o PID ${alvo.pid}.`)
      } else {
        mensagens.ok(`Encerrado: ${alvo.descricao}.`)
      }
    }

    return falhas === 0 ? 0 : 1
  },
}
