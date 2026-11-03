// O que o terminal em uso aguenta. Sem TTY, com CI ou NO_COLOR a saída vira texto puro.

/**
 * @typedef {object} Terminal
 * @property {boolean} tty     a saída é um terminal de verdade (não um pipe nem um arquivo)
 * @property {boolean} usaCor  pode usar cores ANSI
 * @property {boolean} animar  pode animar (pausas, cursor escondido)
 */

/**
 * @param {{ stdout?: { isTTY?: boolean }, env?: Record<string, string | undefined> }} [fontes]
 * @returns {Terminal}
 */
export function detectarTerminal({ stdout = process.stdout, env = process.env } = {}) {
  const tty = Boolean(stdout.isTTY)

  return { tty, usaCor: tty && !env.NO_COLOR, animar: tty && !env.CI }
}
