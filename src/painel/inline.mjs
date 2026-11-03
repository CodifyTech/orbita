// Modo sem painel (`codify dev --inline`, ou sem TTY, como no CI): cada linha de cada serviço sai no
// stdout com o nome do serviço na frente, colorida por serviço quando o terminal aguenta cor.
import { APAGADO, pinta } from './cores.mjs'
import { realce } from './tela/realce.mjs'

const LARGURA_MINIMA = 8
const LARGURA_MAXIMA = 16

/**
 * Largura da coluna do nome: o maior nome de serviço, entre 8 e 16, para as linhas alinharem.
 *
 * @param {{ nome: string }[]} servicos
 */
export const larguraDoPrefixo = servicos =>
  Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, ...servicos.map(s => s.nome.length)))

/**
 * "server   │ texto" (com cor) ou "server   | texto" (sem cor).
 *
 * @param {{ nome: string, cor: import('./cores.mjs').Cor }} s
 * @param {{ texto: string, nivel: import('./classificacao.mjs').Nivel }} linha
 * @param {{ usaCor: boolean, largura?: number }} opcoes
 */
export function formatarLinhaInline(s, linha, { usaCor, largura = LARGURA_MINIMA }) {
  const nome = s.nome.padEnd(largura)

  return usaCor ? `${pinta(s.cor, nome)}${pinta(APAGADO, ' │ ')}${realce(linha.texto, linha)}` : `${nome} | ${linha.texto}`
}

/**
 * Faz cada linha registrada sair no stdout.
 *
 * @param {import('./estado.mjs').Estado} estado
 * @param {{ escrever: (texto: string) => void, usaCor: boolean }} opcoes
 */
export function ligarInline(estado, { escrever, usaCor }) {
  const largura = larguraDoPrefixo(estado.servicos)
  estado.inline = true
  estado.aoRegistrar = (s, linha) => escrever(`${formatarLinhaInline(s, linha, { usaCor, largura })}\n`)
}
