// Integração com a área de trabalho: copiar texto para a área de transferência e abrir uma URL ou
// um arquivo no programa padrão. Nunca lança: sem o programa (ex.: xclip ausente) devolve false.
import { spawn as spawnPadrao } from 'node:child_process'

/**
 * @typedef {object} Opcoes injetáveis nos testes
 * @property {NodeJS.Platform} [plataforma]
 * @property {Record<string, string | undefined>} [env]
 * @property {typeof spawnPadrao} [criarProcesso]
 */

/**
 * Programa que recebe o texto no stdin e o põe na área de transferência.
 *
 * @param {{ plataforma: NodeJS.Platform, env?: Record<string, string | undefined> }} sistema
 * @returns {[string, string[]]}
 */
export function comandoDeCopiar({ plataforma, env = {} }) {
  if (plataforma === 'win32') {
    return ['clip', []]
  }
  if (plataforma === 'darwin') {
    return ['pbcopy', []]
  }

  return env.WAYLAND_DISPLAY ? ['wl-copy', []] : ['xclip', ['-selection', 'clipboard']]
}

/**
 * O `clip` do Windows lê na página de código do console: em UTF-16 com BOM os acentos chegam certos.
 *
 * @param {string} texto
 * @param {NodeJS.Platform} plataforma
 * @returns {string | Buffer}
 */
export const conteudoParaCopiar = (texto, plataforma) =>
  plataforma === 'win32' ? Buffer.from(`﻿${texto}`, 'utf16le') : texto

/**
 * Como abrir `alvo` no programa padrão. No Windows o `start` é um comando interno do cmd; o `""`
 * é o título da janela, sem ele uma URL entre aspas viraria o título.
 *
 * @param {string} alvo
 * @param {NodeJS.Platform} plataforma
 * @returns {[string, string[], object]}
 */
export function comandoDeAbrir(alvo, plataforma) {
  if (plataforma === 'win32') {
    return ['cmd', ['/d', '/s', '/c', `start "" "${alvo}"`], { windowsVerbatimArguments: true }]
  }

  return [plataforma === 'darwin' ? 'open' : 'xdg-open', [alvo], {}]
}

/**
 * Põe `texto` na área de transferência do sistema.
 *
 * @param {string} texto
 * @param {Opcoes} [opcoes]
 * @returns {Promise<boolean>}
 */
export function copiarParaAreaDeTransferencia(texto, opcoes = {}) {
  const { plataforma = process.platform, env = process.env, criarProcesso = spawnPadrao } = opcoes
  const [comando, args] = comandoDeCopiar({ plataforma, env })

  return new Promise(resolve => {
    const processo = criarProcesso(comando, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
    processo.on('error', () => resolve(false))
    processo.on('close', codigo => resolve(codigo === 0))
    processo.stdin.on('error', () => {})
    processo.stdin.end(conteudoParaCopiar(texto, plataforma))
  })
}

/**
 * Abre uma URL ou um arquivo no programa padrão (navegador, editor) sem esperar ele fechar.
 *
 * @param {string} alvo
 * @param {Opcoes} [opcoes]
 * @returns {Promise<boolean>} false se nem deu para chamar o programa
 */
export function abrirNoPadrao(alvo, opcoes = {}) {
  const { plataforma = process.platform, criarProcesso = spawnPadrao } = opcoes
  const [comando, args, extras] = comandoDeAbrir(alvo, plataforma)

  return new Promise(resolve => {
    const processo = criarProcesso(comando, args, {
      stdio: 'ignore',
      detached: plataforma !== 'win32',
      windowsHide: true,
      ...extras,
    })
    processo.on('error', () => resolve(false))
    processo.on('spawn', () => resolve(true))
    processo.unref()
  })
}
