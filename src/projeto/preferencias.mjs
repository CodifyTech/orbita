// Preferências DESTA máquina (não versionadas): DEV_ONLY, DEV_EXCEPT, DEV_SERVER_HOST e as portas
// escolhidas pelo doctor. Ficam no .env do primeiro serviço Laravel (onde o FoodOS sempre as guardou)
// ou, sem Laravel, no .env da raiz do projeto.
import { join } from 'node:path'
import { lerEnv } from '../ambiente/env.mjs'

/**
 * @param {string} raiz
 * @param {{ familia: string, cwd: string }[]} servicos
 * @returns {{ arquivo: string, valores: Record<string, string> }}
 */
export function lerPreferencias(raiz, servicos) {
  const laravel = servicos.find(servico => servico.familia === 'laravel')
  const arquivo = join(laravel?.cwd ?? raiz, '.env')

  return { arquivo, valores: lerEnv(arquivo) }
}

/** "a, b,,c" → ['a', 'b', 'c'] */
export const listaDe = texto => (texto ?? '').split(',').map(item => item.trim()).filter(Boolean)

/** Chave genérica da porta preferida de um serviço: web → DEV_WEB_PORT, api-pix → DEV_API_PIX_PORT. */
export const chaveDaPorta = nome => `DEV_${nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_PORT`

/** Lê um número de porta válido de um texto (ou null). */
export function portaValida(texto) {
  const numero = Number(texto)

  return Number.isInteger(numero) && numero >= 1 && numero <= 65535 ? numero : null
}
