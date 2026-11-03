// Escreve o quadro no terminal reescrevendo só as linhas que mudaram desde o anterior: redesenhar a
// tela inteira 10 vezes por segundo piscaria e gastaria CPU à toa.
import { RESET } from '../cores.mjs'

/** Sincronização (DEC 2026): o terminal aplica o lote de uma vez, sem mostrar a tela pela metade. */
const INICIO_DO_LOTE = '\x1b[?2026h'
const FIM_DO_LOTE = '\x1b[?2026l'

/**
 * @param {(texto: string) => void} escrever
 */
export function criarDesenhista(escrever) {
  let anterior = []

  return {
    /** Escreve as linhas que mudaram; devolve quantas foram. */
    desenhar(linhas) {
      let saida = ''
      let mudaram = 0
      for (let y = 0; y < linhas.length; y++) {
        if (linhas[y] !== anterior[y]) {
          // Posiciona na linha (1-based), apaga e escreve.
          saida += `\x1b[${y + 1};1H\x1b[2K${linhas[y]}${RESET}`
          mudaram++
        }
      }
      anterior = linhas
      if (saida) {
        escrever(`${INICIO_DO_LOTE}${saida}${FIM_DO_LOTE}`)
      }

      return mudaram
    },
    /** Esquece o quadro anterior: o próximo desenho reescreve tudo (resize, Ctrl+L). */
    invalidar() {
      anterior = []
    },
  }
}
