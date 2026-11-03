// Ferramentas da máquina (php, composer, bun, dotnet…): estão no PATH? Qual versão?
import { executar as executarPadrao, precisaDeShell } from './executar.mjs'

/**
 * Primeira versão "x.y" ou "x.y.z" de um texto (ex.: "PHP 8.5.0 (cli) …" → "8.5.0").
 *
 * @param {string} texto
 * @returns {string | null}
 */
export function extrairVersao(texto) {
  return /\d+\.\d+(?:\.\d+)?/.exec(texto)?.[0] ?? null
}

/**
 * Versão de uma ferramenta, ou null se ela não está no PATH (ou não respondeu).
 *
 * @param {string} comando
 * @param {string[]} [args]
 * @param {{ executar?: import('./executar.mjs').Executor }} [opcoes]
 * @returns {Promise<string | null>}
 */
export async function versaoDe(comando, args = ['--version'], { executar = executarPadrao } = {}) {
  const { ok, saida, erro } = await executar(comando, args, { shell: precisaDeShell(), timeout: 30_000 })

  if (!ok) {
    return null
  }

  const primeira = (saida || erro).trim().split('\n')[0] ?? ''

  return extrairVersao(primeira) ?? (primeira.slice(0, 40) || null)
}

/**
 * Compara versões "x.y.z". Negativo se `a` < `b`, zero se iguais, positivo se `a` > `b`.
 *
 * @param {string} a
 * @param {string} b
 */
export function compararVersoes(a, b) {
  const partes = versao => versao.split('.').map(Number)
  const [pa, pb] = [partes(a), partes(b)]

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diferenca !== 0) {
      return diferenca
    }
  }

  return 0
}
