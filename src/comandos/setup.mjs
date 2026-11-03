// `codify setup`: prepara o projeto pela primeira vez. A lógica está em src/setup/.
import { montarContexto } from '../projeto/contexto.mjs'
import { rodarSetup } from '../setup/index.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'setup',
  descricao: 'Prepara o projeto pela primeira vez: dependências, .env, chaves, banco (+ seed em banco vazio)',
  // O setup tem a abertura própria (logo e boas-vindas digitadas).
  banner: false,
  async executar({ projeto, perguntas, saida, estilo, terminal, env }) {
    const contexto = montarContexto(projeto, { filtrar: false, perguntas, saida, estilo, terminal, env })
    const interromper = () => {
      saida.write(`\n\n  ${estilo.amarelo('Setup interrompido.')} Pode rodar ${estilo.verde('codify setup')} de novo quando quiser: ele continua de onde parou.\n\n`)
      process.exit(130)
    }

    process.once('SIGINT', interromper)
    try {
      return await rodarSetup(contexto)
    } finally {
      process.removeListener('SIGINT', interromper)
    }
  },
}
