// Processos da máquina: listar, achar a "sessão do dev" de um processo e encerrar (com a árvore).
// Funciona no Windows (PowerShell, tasklist, taskkill) e no Linux/macOS (ps, kill).
import { executar as executarPadrao } from './executar.mjs'
import { lerNomeDoTasklist, lerProcessosDoPowerShell, lerPs } from './leitores-do-sistema.mjs'

/**
 * Linhas de comando que identificam a raiz de uma sessão do dev. Encerrar a raiz derruba também
 * fila e scheduler, que não ocupam porta e por isso não aparecem em `portas.escutando()`.
 */
export const PADROES_DE_SESSAO = [
  /codify(?:\.(?:mjs|cmd|js))?["']?\s+dev(?:\s|$)/,
  /monitor\.mjs|concurrently|@laravel\/multiplex/,
  /artisan\s+(?:foodos:)?dev(?:\s|$)/,
]

const LIMITE_DA_ARVORE = 30

/**
 * @typedef {object} Opcoes injetáveis nos testes
 * @property {import('./executar.mjs').Executor} [executar]
 * @property {NodeJS.Platform} [plataforma]
 */

/**
 * Todos os processos da máquina, por PID, numa chamada só (o Windows demora ~1 s).
 *
 * @param {Opcoes} [opcoes]
 * @returns {Promise<Map<number, import('./leitores-do-sistema.mjs').Processo>>}
 */
export async function listarProcessos({ executar = executarPadrao, plataforma = process.platform } = {}) {
  if (plataforma === 'win32') {
    const { saida } = await executar('powershell', [
      '-NoProfile',
      '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
    ])

    return lerProcessosDoPowerShell(saida)
  }

  const { saida } = await executar('ps', ['-axo', 'pid=,ppid=,args='])

  return lerPs(saida)
}

/**
 * Ancestral mais alto de `pid` que é a sessão do dev.
 *
 * @param {number} pid
 * @param {Map<number, import('./leitores-do-sistema.mjs').Processo>} processos
 * @param {RegExp[]} [padroes]
 * @returns {number | null} null se nenhum ancestral (nem o próprio processo) é uma sessão do dev
 */
export function raizDaSessao(pid, processos, padroes = PADROES_DE_SESSAO) {
  let raiz = null
  let atual = pid

  for (let passos = 0; processos.has(atual) && passos < LIMITE_DA_ARVORE; passos++) {
    const processo = processos.get(atual)

    if (padroes.some(padrao => padrao.test(processo.comando))) {
      raiz = atual
    }
    if (processo.ppid === atual) {
      break
    }
    atual = processo.ppid
  }

  return raiz
}

/**
 * PIDs de `pid` e de todos os seus descendentes, o pai primeiro.
 *
 * @param {number} pid
 * @param {Map<number, import('./leitores-do-sistema.mjs').Processo>} processos
 * @returns {number[]}
 */
export function arvoreDe(pid, processos) {
  const arvore = [pid]

  for (let i = 0; i < arvore.length; i++) {
    for (const processo of processos.values()) {
      if (processo.ppid === arvore[i] && !arvore.includes(processo.pid)) {
        arvore.push(processo.pid)
      }
    }
  }

  return arvore
}

/**
 * Encerra o processo (no Windows, com os filhos: `/T`).
 *
 * @param {number} pid
 * @param {Opcoes} [opcoes]
 * @returns {Promise<boolean>}
 */
export async function encerrar(pid, { executar = executarPadrao, plataforma = process.platform } = {}) {
  const [comando, args] =
    plataforma === 'win32' ? ['taskkill', ['/PID', String(pid), '/T', '/F']] : ['kill', [String(pid)]]

  return (await executar(comando, args)).ok
}

/**
 * Encerra o processo e todos os descendentes. No Linux/macOS o pai vai antes dos filhos: com o
 * supervisor (concurrently, multiplex) vivo, ele reiniciaria os filhos.
 *
 * @param {number} pid
 * @param {Map<number, import('./leitores-do-sistema.mjs').Processo>} processos
 * @param {Opcoes} [opcoes]
 * @returns {Promise<boolean>}
 */
export async function encerrarArvore(pid, processos, opcoes = {}) {
  const { executar = executarPadrao, plataforma = process.platform } = opcoes

  if (plataforma === 'win32') {
    return encerrar(pid, opcoes)
  }

  return (await executar('kill', arvoreDe(pid, processos).map(String))).ok
}

/**
 * Nome do executável de um PID (ex.: "node.exe"), ou null se o processo não existe mais.
 *
 * @param {number} pid
 * @param {Opcoes} [opcoes]
 * @returns {Promise<string | null>}
 */
export async function nomeDoProcesso(pid, { executar = executarPadrao, plataforma = process.platform } = {}) {
  if (plataforma === 'win32') {
    const { saida } = await executar('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])

    return lerNomeDoTasklist(saida)
  }

  const { saida } = await executar('ps', ['-p', String(pid), '-o', 'comm='])

  return saida.trim() || null
}
