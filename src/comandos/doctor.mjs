// `codify doctor`: confere o ambiente e oferece consertar. Respeita --only/--except (checa só o que
// vai subir); --sem-perguntas (ou sem terminal) só diagnostica.
import { rodarDoctor } from '../doctor/index.mjs'
import { consultarFamilias, montarContexto } from '../projeto/contexto.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'doctor',
  descricao: 'Confere o ambiente (chaves, banco, portas, variáveis) e oferece consertar o que estiver errado',
  async executar({ argumentos: { opcoes }, projeto, perguntas, saida, estilo, terminal, env }) {
    const contexto = montarContexto(projeto, { opcoes, perguntas, saida, estilo, terminal, env })
    const removidos = await consultarFamilias(contexto)

    avisarRemovidos(removidos, saida, estilo)

    const { ok } = await rodarDoctor(contexto, { perguntar: perguntas.interativo && !opcoes['sem-perguntas'] })

    return ok ? 0 : 1
  },
}

/** "horizon fica de fora: sem pcntl" — o dev entende por que o serviço não aparece. */
export function avisarRemovidos(removidos, saida, estilo) {
  const mensagens = criarMensagens(saida, estilo)

  for (const { nome, motivo } of removidos) {
    mensagens.linha(estilo.suave(`  ${nome} fica de fora: ${motivo}.`))
  }
}
