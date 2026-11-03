import { readFileSync } from 'node:fs'

/** Versão do próprio Órbita, lida do package.json que veio no pacote. */
export function versaoDoOrbita() {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

  return version
}
