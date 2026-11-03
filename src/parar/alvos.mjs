// Quem o `codify parar` encerra. Porta do `PararCommand.php` do FoodOS.
//
// Para cada serviço com porta, olha a porta base e as 10 seguintes (o `dev` pode ter trocado por estar
// ocupada). Encerra a SESSÃO do dev inteira (fila e scheduler juntos, que não ocupam porta). Fora da
// porta base, só encerra se for sessão do dev: um Node qualquer na 5175 não é nosso. Na porta base sem
// sessão, só se o dono for encerrável (php/node/bun); o resto vai para "não vou encerrar".
import { descrever, identificar } from '../ambiente/portas.mjs'
import { raizDaSessao } from '../ambiente/processos.mjs'

export const PORTAS_SEGUINTES = 10

/**
 * @typedef {object} Alvo
 * @property {number} pid           o processo a encerrar (a raiz da sessão, quando há)
 * @property {string} descricao
 * @property {{ porta: number, servico: string }[]} portas
 */

/**
 * Portas candidatas: a base e as seguintes de cada serviço.
 *
 * @param {{ nome: string, porta: number | null }[]} servicos
 * @returns {{ porta: number, servico: string, base: boolean }[]}
 */
export function portasCandidatas(servicos) {
  return servicos
    .filter(servico => servico.porta)
    .flatMap(servico =>
      Array.from({ length: PORTAS_SEGUINTES + 1 }, (_, i) => ({ porta: servico.porta + i, servico: servico.nome, base: i === 0 })),
    )
}

/**
 * @param {{ nome: string, porta: number | null }[]} servicos
 * @param {Map<number, number>} escutando  porta → PID
 * @param {Map<number, import('../ambiente/leitores-do-sistema.mjs').Processo>} processos
 * @returns {{ alvos: Alvo[], ignorados: string[] }}
 */
export function encontrarAlvos(servicos, escutando, processos) {
  const alvos = new Map()
  const ignorados = []

  for (const { porta, servico, base } of portasCandidatas(servicos)) {
    const pid = escutando.get(porta)

    if (pid === undefined) {
      continue
    }

    const quem = identificar(pid, processos.get(pid)?.nome ?? null)
    const raiz = raizDaSessao(pid, processos)

    if (raiz === null && (!base || !quem.encerravel)) {
      if (base) {
        ignorados.push(`Porta ${porta} (${servico}): ${descrever(quem)} — ${quem.dica}`)
      }
      continue
    }

    const alvo = raiz ?? pid

    if (!alvos.has(alvo)) {
      alvos.set(alvo, {
        pid: alvo,
        descricao: raiz !== null ? `sessão do \`dev\` (PID ${raiz}): todos os serviços dela` : descrever(quem),
        portas: [],
      })
    }
    // Duas portas candidatas podem coincidir (serviços com portas próximas): não repete.
    if (!alvos.get(alvo).portas.some(item => item.porta === porta)) {
      alvos.get(alvo).portas.push({ porta, servico })
    }
  }

  return { alvos: [...alvos.values()], ignorados }
}
