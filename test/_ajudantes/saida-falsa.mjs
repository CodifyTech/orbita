// Ajudantes dos testes (a pasta começa com "_" e não termina em .test.mjs: não é executada como teste).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Um "stdout" que guarda o que foi escrito. `tty` simula terminal de verdade (cores). */
export function criarSaidaFalsa({ tty = false } = {}) {
  let conteudo = ''

  return {
    isTTY: tty,
    write(texto) {
      conteudo += texto

      return true
    },
    texto: () => conteudo,
  }
}

/** Cria uma pasta temporária com os arquivos dados ({ 'backend/.env': 'A=1' }) e devolve o caminho. */
export function criarProjetoTemporario(arquivos = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'orbita-teste-'))

  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const destino = join(raiz, caminho)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, conteudo)
  }

  return raiz
}

/** Terminal falso: texto puro, sem animação (o que o banner vê no CI). */
export const TERMINAL_SIMPLES = { tty: false, usaCor: false, animar: false }
