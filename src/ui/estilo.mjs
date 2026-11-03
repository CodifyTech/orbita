// Cores e degradês do terminal. `criarEstilo` devolve funções que já respeitam o terminal:
// com `usaCor: false` todas devolvem o texto sem enfeite, então quem usa não precisa checar nada.

export const CORES = Object.freeze({
  LARANJA: [255, 138, 0],
  MAGENTA: [214, 36, 159],
  AZUL: [64, 196, 255],
  ROXO: [124, 77, 255],
})

/** Cor intermediária entre `de` e `ate`; `t` vai de 0 (só `de`) a 1 (só `ate`). */
export const misturar = (de, ate, t) => de.map((valor, k) => Math.round(valor + (ate[k] - valor) * t))

/**
 * @param {{ usaCor: boolean }} terminal
 */
export function criarEstilo({ usaCor }) {
  const esc = (codigo, texto) => (usaCor ? `\x1b[${codigo}m${texto}\x1b[0m` : texto)
  const rgb = ([r, g, b], texto) => (usaCor ? `\x1b[38;2;${r};${g};${b}m${texto}\x1b[0m` : texto)

  /** Degradê coluna a coluna; `fase` (0..1) desliza o degradê, dando o brilho que corre pela linha. */
  const degrade = (texto, de, ate, fase = 0) => {
    const ultima = Math.max(texto.length - 1, 1)

    return [...texto]
      .map((letra, i) => {
        if (letra === ' ') {
          return letra
        }
        const x = (i / ultima + fase) % 2

        return rgb(misturar(de, ate, x <= 1 ? x : 2 - x), letra)
      })
      .join('')
  }

  return {
    negrito: texto => esc('1', texto),
    suave: texto => esc('2', texto),
    ciano: texto => esc('1;36', texto),
    amarelo: texto => esc('1;33', texto),
    verde: texto => esc('32', texto),
    vermelho: texto => esc('31', texto),
    rgb,
    degrade,
  }
}
