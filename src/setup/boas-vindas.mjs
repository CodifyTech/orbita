// A abertura do `codify setup`: logo do projeto, assinatura e as boas-vindas digitadas letra a letra.
import { LOGO_PADRAO, montarLogo } from '../banner.mjs'
import { pausa } from '../pausa.mjs'
import { CORES } from '../ui/estilo.mjs'

/** Escreve o texto letra a letra (sem animação, de uma vez). */
export async function digitar(texto, { saida, terminal }, atraso = 14) {
  if (!terminal.animar) {
    saida.write(`${texto}\n`)

    return
  }
  for (const letra of texto) {
    saida.write(letra)
    await pausa(atraso)
  }
  saida.write('\n')
}

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 */
export async function boasVindas(contexto) {
  const { saida, terminal, estilo, projeto } = contexto
  const { nome, slogan, logo } = projeto.config

  saida.write('\n')
  for (const linha of montarLogo(estilo, logo ?? LOGO_PADRAO)) {
    saida.write(`${linha}\n`)
    if (terminal.animar) {
      await pausa(70)
    }
  }

  const regua = estilo.suave('─'.repeat(25))
  saida.write(`\n  ${regua} ${estilo.negrito('por')} ${estilo.degrade('CodifyTech', CORES.AZUL, CORES.ROXO)} ${regua}\n\n`)

  await digitar(`  ${estilo.negrito('Bem-vindo(a) à CodifyTech!')} 👋`, contexto)
  await digitar(`  Você está prestes a rodar o ${estilo.negrito(nome)}${slogan ? `: ${slogan.charAt(0).toLowerCase()}${slogan.slice(1)}` : ''}.`, contexto)
  await digitar('  Vou preparar tudo na sua máquina e explicar cada passo.', contexto)
  saida.write(`\n  ${estilo.suave('Leva alguns minutos na primeira vez. Pode rodar de novo a qualquer momento: nada é sobrescrito.')}\n\n`)

  if (terminal.animar) {
    await pausa(400)
  }
}
