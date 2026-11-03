// Cabeçalho CodifyTech exibido antes de cada comando: logo, assinatura e descrição do comando.
//
// As funções `montar*` são puras (recebem dados e devolvem texto), então dá para testar sem terminal.
// Só `exibirBanner` mexe na saída: é ela que cuida das pausas e do cursor da animação.
import { BINARIO, SITE } from './constantes.mjs'
import { pausa } from './pausa.mjs'
import { CORES, criarEstilo } from './ui/estilo.mjs'
import { detectarTerminal } from './ui/terminal.mjs'

const { LARANJA, MAGENTA, AZUL, ROXO } = CORES

/** Logo do próprio Órbita; um projeto troca pelo seu com a chave `logo` da config. */
export const LOGO_PADRAO = [
  ' ██████╗ ██████╗ ██████╗ ██╗████████╗ █████╗ ',
  '██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝██╔══██╗',
  '██║   ██║██████╔╝██████╔╝██║   ██║   ███████║',
  '██║   ██║██╔══██╗██╔══██╗██║   ██║   ██╔══██║',
  '╚██████╔╝██║  ██║██████╔╝██║   ██║   ██║  ██║',
  ' ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═╝',
]

const QUADROS_DA_ASSINATURA = 21

export const montarLogo = (estilo, logo = LOGO_PADRAO) => logo.map(linha => `  ${estilo.degrade(linha, LARANJA, MAGENTA)}`)

/** Assinatura com o brilho correndo da esquerda para a direita (`fase` de 0 a 2). */
export function montarAssinatura(estilo, fase = 0) {
  const regua = estilo.suave('─'.repeat(14))
  const marca = estilo.negrito(estilo.degrade('CodifyTech', AZUL, ROXO, fase))

  return `  ${regua} ${estilo.negrito('desenvolvido e mantido por')} ${marca} ${regua}`
}

/** Slogan do projeto (se houver) e o site da CodifyTech. */
export function montarApresentacao(estilo, { slogan = '' } = {}) {
  const site = estilo.ciano(SITE)

  return slogan ? `  ${estilo.suave(slogan)}  ${estilo.suave('·')}  ${site}` : `  ${site}`
}

/** `▶ codify dev — descrição` seguido da régua em degradê. */
export function montarLinhaDoComando(estilo, { execucao, descricao = '' }) {
  const texto = descricao ? `  ${estilo.suave('—')}  ${estilo.suave(descricao)}` : ''

  return [
    `  ${estilo.rgb(LARANJA, '▶')} ${estilo.negrito(execucao)}${texto}`,
    `  ${estilo.degrade('━'.repeat(60), LARANJA, MAGENTA)}`,
  ]
}

/** Versão de uma linha só, usada quando um script encadeia várias etapas (ORBITA_BANNER=compacto). */
export function montarLinhaCompacta(estilo, { comando, nome }) {
  const rotulo = estilo.negrito(estilo.degrade(`CodifyTech › ${comando}`, AZUL, ROXO))

  return `  ${estilo.rgb(LARANJA, '▶')} ${rotulo}  ${estilo.suave(`${nome} · ${SITE}`)}`
}

/**
 * Escreve o banner na saída.
 *
 * @param {object} opcoes
 * @param {string} [opcoes.comando]    nome do comando/script; vazio mostra só o logo e a assinatura
 * @param {string} [opcoes.execucao]   como o comando foi chamado, como aparece depois do ▶
 *                                     (padrão: "codify <comando>"; um script do projeto: "bun run lint")
 * @param {string} [opcoes.descricao]  o que o comando faz (vem de `descricoes` na config)
 * @param {import('./config/define-config.mjs').Config} opcoes.config
 * @param {import('./ui/terminal.mjs').Terminal} [opcoes.terminal]
 * @param {{ write(texto: string): unknown }} [opcoes.saida]
 * @param {Record<string, string | undefined>} [opcoes.env]
 */
export async function exibirBanner({
  comando = '',
  execucao = `${BINARIO} ${comando}`,
  descricao = '',
  config,
  terminal = detectarTerminal(),
  saida = process.stdout,
  env = process.env,
}) {
  const estilo = criarEstilo(terminal)
  const escrever = texto => saida.write(texto)

  if (env.ORBITA_BANNER === 'compacto') {
    escrever(`\n${montarLinhaCompacta(estilo, { comando, nome: config.nome })}\n\n`)

    return
  }

  const restaurarCursor = terminal.animar ? esconderCursor(saida) : () => {}

  try {
    escrever('\n')
    for (const [i, linha] of montarLogo(estilo, config.logo ?? LOGO_PADRAO).entries()) {
      escrever(`${linha}\n`)
      if (terminal.animar) {
        await pausa(45 + i * 5)
      }
    }

    escrever('\n')
    if (terminal.animar) {
      for (let quadro = 0; quadro < QUADROS_DA_ASSINATURA; quadro++) {
        escrever(`\r${montarAssinatura(estilo, quadro / 10)}`)
        await pausa(28)
      }
      escrever('\n')
    } else {
      escrever(`${montarAssinatura(estilo)}\n`)
    }

    escrever(`${montarApresentacao(estilo, config)}\n\n`)

    if (comando) {
      escrever(`${montarLinhaDoComando(estilo, { execucao, descricao }).join('\n')}\n\n`)
    }
  } finally {
    restaurarCursor()
  }
}

/** Esconde o cursor durante a animação e garante que ele volte, até com Ctrl+C. */
function esconderCursor(saida) {
  const mostrar = () => saida.write('\x1b[?25h')
  const aoInterromper = () => {
    mostrar()
    process.exit(130)
  }

  saida.write('\x1b[?25l')
  process.once('SIGINT', aoInterromper)

  return () => {
    process.removeListener('SIGINT', aoInterromper)
    mostrar()
  }
}
