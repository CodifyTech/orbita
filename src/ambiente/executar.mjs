// Roda um programa do sistema (netstat, ps, taskkill…) e devolve o resultado. Nunca lança: programa
// ausente ou com erro vira `ok: false`, e quem chamou decide o que fazer (ex.: tentar o `ss` se não há `lsof`).
import { execFile } from 'node:child_process'

/**
 * @typedef {object} Resultado
 * @property {boolean} ok     terminou com código 0
 * @property {string} saida   stdout
 * @property {string} erro    stderr
 */

/**
 * @typedef {(comando: string, args?: string[], opcoes?: { cwd?: string, timeout?: number }) => Promise<Resultado>} Executor
 */

/** @type {Executor} */
export function executar(comando, args = [], { cwd, timeout = 15_000 } = {}) {
  return new Promise(resolve => {
    execFile(
      comando,
      args,
      { cwd, timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      (erro, saida, stderr) => resolve({ ok: !erro, saida: saida ?? '', erro: stderr ?? '' }),
    )
  })
}
