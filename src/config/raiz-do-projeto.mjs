// Descobre qual é a raiz do projeto a partir da pasta onde o dev rodou o comando.
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ARQUIVO_DE_CONFIG } from '../constantes.mjs'

/**
 * Sobe de pasta em pasta, a partir de `inicio`, até `procurado` dizer sim.
 *
 * @param {string} inicio
 * @param {(pasta: string) => boolean} procurado
 * @returns {string | null} a primeira pasta que satisfaz, ou null se chegar na raiz do disco
 */
export function subirAte(inicio, procurado) {
  let atual = resolve(inicio)

  while (true) {
    if (procurado(atual)) {
      return atual
    }
    const pai = dirname(atual)
    if (pai === atual) {
      return null
    }
    atual = pai
  }
}

/**
 * A raiz é a pasta do orbita.config.mjs mais próxima. Sem config, vale a do package.json mais
 * próximo e, sem ele também, a própria pasta onde o comando rodou.
 *
 * @param {string} inicio
 * @param {(caminho: string) => boolean} [existe] injetável para os testes
 * @returns {{ raiz: string, arquivoDeConfig: string | null }}
 */
export function encontrarRaiz(inicio, existe = existsSync) {
  const comConfig = subirAte(inicio, pasta => existe(join(pasta, ARQUIVO_DE_CONFIG)))

  if (comConfig) {
    return { raiz: comConfig, arquivoDeConfig: join(comConfig, ARQUIVO_DE_CONFIG) }
  }

  const comPacote = subirAte(inicio, pasta => existe(join(pasta, 'package.json')))

  return { raiz: comPacote ?? resolve(inicio), arquivoDeConfig: null }
}
