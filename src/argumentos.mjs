// Leitor de argumentos da linha de comando, pequeno de propósito (o Órbita não tem dependências).
//
//   codify dev --only=server,web --no-restart -v
//   → posicionais: ['dev'], opcoes: { only: 'server,web', 'no-restart': true, v: true }
//
// Valor de opção só com "=" (`--only=a,b`). Tudo depois de `--` é posicional, mesmo começando com "-".

/**
 * @typedef {object} Argumentos
 * @property {string[]} posicionais
 * @property {Record<string, string | true>} opcoes
 */

/**
 * @param {string[]} argv argumentos já sem `node` e sem o caminho do script
 * @returns {Argumentos}
 */
export function lerArgumentos(argv) {
  const posicionais = []
  const opcoes = {}
  let soPosicionais = false

  for (const arg of argv) {
    if (soPosicionais || !arg.startsWith('-') || arg === '-') {
      posicionais.push(arg)
    } else if (arg === '--') {
      soPosicionais = true
    } else if (arg.startsWith('--')) {
      const [nome, ...valor] = arg.slice(2).split('=')
      opcoes[nome] = valor.length ? valor.join('=') : true
    } else {
      opcoes[arg.slice(1)] = true
    }
  }

  return { posicionais, opcoes }
}
