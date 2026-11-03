// Porta de entrada do stdin do painel: separa o que chegou em teclas e manda cada uma para o mouse
// ou para o teclado.
import { tratarMouse } from './mouse.mjs'
import { separarTeclas, tratarTecla } from './teclas.mjs'

/**
 * @param {import('./teclas.mjs').Contexto} ctx
 * @param {string} dados o que o stdin entregou (em modo raw, utf8)
 */
export function tratarEntrada(ctx, dados) {
  for (const k of separarTeclas(dados)) {
    k.startsWith('\x1b[<') ? tratarMouse(ctx, k) : tratarTecla(ctx, k)
  }
}
