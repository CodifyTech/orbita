// Repasse para a instalação local (como Vite e ESLint fazem): o `codify` instalado global procura
// o @codifytech/orbita dentro do projeto e, se achar, delega a ele. Assim cada projeto fixa a
// versão do Órbita no lockfile, e todo mundo do time roda a mesma.
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { subirAte } from './config/raiz-do-projeto.mjs'

const CLI_NO_PACOTE = join('node_modules', '@codifytech', 'orbita', 'src', 'cli.mjs')

/**
 * @param {string} cwd      pasta onde o dev rodou o comando
 * @param {string} cliAtual caminho do cli.mjs que está rodando agora
 * @returns {string | null} o cli.mjs da instalação local, ou null se não há (ou se já é o atual)
 */
export function localizarInstalacaoLocal(cwd, cliAtual) {
  const pasta = subirAte(cwd, candidata => existsSync(join(candidata, CLI_NO_PACOTE)))

  if (!pasta) {
    return null
  }

  const local = join(pasta, CLI_NO_PACOTE)

  // Já é ele mesmo (comando local, ou `npm link` apontando para este repositório): nada a delegar.
  return realpathSync(local) === realpathSync(cliAtual) ? null : local
}
