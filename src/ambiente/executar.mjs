// Roda programas do sistema (netstat, ps, php, composer…). Duas formas:
//   executar  → guarda a saída e devolve no fim; nunca lança (programa ausente vira `ok: false`)
//   executarVisivel → a saída vai direto para o terminal do dev (migrate, composer install…)
import { execFile, spawn } from 'node:child_process'

/**
 * @typedef {object} Resultado
 * @property {boolean} ok     terminou com código 0
 * @property {string} saida   stdout
 * @property {string} erro    stderr (ou a mensagem, se o programa nem chegou a rodar)
 */

/**
 * @typedef {object} OpcoesDeExecucao
 * @property {string} [cwd]
 * @property {number} [timeout]                 ms (padrão 15 s; 0 = sem limite)
 * @property {Record<string, string>} [env]     somadas ao ambiente atual
 * @property {boolean} [shell]                  passa por cmd/sh: necessário no Windows para .bat/.cmd (php do Herd, composer, npm)
 */

/**
 * @typedef {(comando: string, args?: string[], opcoes?: OpcoesDeExecucao) => Promise<Resultado>} Executor
 */

/** @type {Executor} */
export function executar(comando, args = [], { cwd, timeout = 15_000, env, shell = false } = {}) {
  const [programa, argumentos] = shell ? [linhaDeComando(comando, args), []] : [comando, args]

  return new Promise(resolve => {
    execFile(
      programa,
      argumentos,
      {
        cwd,
        timeout,
        shell,
        env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      },
      (falha, saida, stderr) =>
        resolve({ ok: !falha, saida: saida ?? '', erro: stderr || (falha && !saida ? falha.message : '') || '' }),
    )
  })
}

/**
 * Roda com a saída no terminal do dev (stdio herdado). Devolve o código de saída (1 se nem rodou).
 *
 * @param {string} comando
 * @param {string[]} [args]
 * @param {Omit<OpcoesDeExecucao, 'timeout'>} [opcoes]
 * @returns {Promise<number>}
 */
export function executarVisivel(comando, args = [], { cwd, env, shell = false } = {}) {
  const [programa, argumentos] = shell ? [linhaDeComando(comando, args), []] : [comando, args]

  return new Promise(resolve => {
    const filho = spawn(programa, argumentos, {
      cwd,
      shell,
      stdio: 'inherit',
      env: env ? { ...process.env, ...env } : process.env,
    })

    filho.once('error', () => resolve(1))
    filho.once('close', codigo => resolve(codigo ?? 1))
  })
}

/**
 * Junta comando e argumentos numa linha para o shell, pondo aspas onde precisa. Com `shell: true` o
 * Node não aspeia nada, e um caminho com espaço quebraria em dois argumentos.
 */
export function linhaDeComando(comando, args = []) {
  return [comando, ...args].map(aspear).join(' ')
}

const aspear = parte => (/[\s"&|<>^()%!]/.test(parte) ? `"${parte.replace(/"/g, '""')}"` : parte)

/** No Windows os gerenciadores e o php do Herd são .cmd/.bat: só rodam via shell. */
export const precisaDeShell = (plataforma = process.platform) => plataforma === 'win32'
