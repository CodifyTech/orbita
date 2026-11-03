// Spinner braille com o tempo correndo, para tarefas demoradas (composer install, bun install…).
// Sem animação (CI, pipe), escreve uma linha "texto…" e espera.
import { CORES } from './estilo.mjs'

const QUADROS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** "3s", "1m05s" — nunca menos de 1s, para não aparecer "0s" numa tarefa que rodou. */
export function formatarTempo(ms) {
  const segundos = Math.max(1, Math.round(ms / 1000))

  return segundos < 60 ? `${segundos}s` : `${Math.floor(segundos / 60)}m${String(segundos % 60).padStart(2, '0')}s`
}

/**
 * Roda `tarefa` mostrando o spinner e devolve o resultado dela junto com o tempo gasto.
 *
 * @template T
 * @param {string} texto
 * @param {() => Promise<T>} tarefa
 * @param {object} opcoes
 * @param {{ write(texto: string): unknown }} opcoes.saida
 * @param {{ animar: boolean }} opcoes.terminal
 * @param {ReturnType<typeof import('./estilo.mjs').criarEstilo>} opcoes.estilo
 * @param {string} [opcoes.recuo]
 * @returns {Promise<{ resultado: T, tempo: string }>}
 */
export async function comSpinner(texto, tarefa, { saida, terminal, estilo, recuo = '      ' }) {
  const inicio = Date.now()
  let timer = null

  if (terminal.animar) {
    let quadro = 0
    saida.write('\x1b[?25l')
    timer = setInterval(() => {
      const tempo = estilo.suave(`(${formatarTempo(Date.now() - inicio)})`)
      saida.write(`\r\x1b[2K${recuo}${estilo.rgb(CORES.AZUL, QUADROS[quadro++ % QUADROS.length])} ${texto} ${tempo}`)
    }, 80)
  } else {
    saida.write(`${recuo}${texto}…\n`)
  }

  try {
    const resultado = await tarefa()

    return { resultado, tempo: formatarTempo(Date.now() - inicio) }
  } finally {
    if (timer) {
      clearInterval(timer)
      saida.write('\r\x1b[2K\x1b[?25h')
    }
  }
}
