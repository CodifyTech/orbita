// Processos que o Órbita sobe e supervisiona (serviços do painel, ações rápidas, comandos livres).
// Iniciar é sempre com shell (o comando vem da config como texto) e encerrar derruba a árvore inteira:
// `php artisan serve` e `npm run dev` abrem filhos, e é o filho que segura a porta.
import { spawn as spawnPadrao, spawnSync as spawnSyncPadrao } from 'node:child_process'

/** Quanto esperar o SIGTERM antes de partir para o SIGKILL (Linux/macOS). */
export const ESPERA_ANTES_DE_FORCAR = 4000

/**
 * @typedef {object} Opcoes injetáveis nos testes
 * @property {NodeJS.Platform} [plataforma]
 * @property {typeof spawnPadrao} [criarProcesso]
 * @property {typeof spawnSyncPadrao} [rodarSincrono]
 * @property {(pid: number, sinal: string) => void} [sinalizar]  como `process.kill`
 * @property {typeof setTimeout} [agendar]
 */

/**
 * Sobe `comando` com shell, saída em pipe. Fora do Windows vira líder de um grupo de processos
 * (`detached`), para que um sinal no grupo alcance os netos.
 *
 * @param {string} comando
 * @param {{ cwd?: string, env?: Record<string, string | undefined> } & Opcoes} [opcoes]
 * @returns {import('node:child_process').ChildProcess}
 */
export function iniciarFilho(comando, { cwd, env, plataforma = process.platform, criarProcesso = spawnPadrao } = {}) {
  return criarProcesso(comando, {
    cwd,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: plataforma !== 'win32',
  })
}

/** O processo ainda não terminou? */
export const estaVivo = filho => Boolean(filho?.pid) && filho.exitCode === null && filho.signalCode === null

/**
 * Pede para a árvore encerrar. No Windows o `taskkill /T /F` já é definitivo; fora dele manda
 * SIGTERM ao grupo e, se em 4 s ainda houver alguém vivo, SIGKILL.
 *
 * @param {import('node:child_process').ChildProcess} filho
 * @param {{ forcar?: boolean, espera?: number } & Opcoes} [opcoes]
 */
export function encerrarFilho(filho, opcoes = {}) {
  const {
    forcar = false,
    espera = ESPERA_ANTES_DE_FORCAR,
    plataforma = process.platform,
    criarProcesso = spawnPadrao,
    sinalizar = (pid, sinal) => process.kill(pid, sinal),
    agendar = setTimeout,
  } = opcoes

  if (!filho?.pid) {
    return
  }
  if (plataforma === 'win32') {
    criarProcesso('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {})

    return
  }
  try {
    // PID negativo = o grupo inteiro (o shell e tudo que ele abriu).
    sinalizar(-filho.pid, forcar ? 'SIGKILL' : 'SIGTERM')
  } catch {}
  if (!forcar) {
    agendar(() => estaVivo(filho) && encerrarFilho(filho, { ...opcoes, forcar: true }), espera).unref?.()
  }
}

/**
 * Último recurso, síncrono (erro inesperado, evento `exit`): nada pode ficar órfão segurando porta.
 *
 * @param {import('node:child_process').ChildProcess} filho
 * @param {Opcoes} [opcoes]
 */
export function encerrarFilhoJa(filho, opcoes = {}) {
  const {
    plataforma = process.platform,
    rodarSincrono = spawnSyncPadrao,
    sinalizar = (pid, sinal) => process.kill(pid, sinal),
  } = opcoes

  if (!estaVivo(filho)) {
    return
  }
  try {
    plataforma === 'win32'
      ? rodarSincrono('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      : sinalizar(-filho.pid, 'SIGKILL')
  } catch {}
}
