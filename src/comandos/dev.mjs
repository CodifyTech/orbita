// `codify dev`: resolve tudo antes de subir (filtros, portas ocupadas, doctor), monta o plano e
// entrega ao painel, que sobe e vigia cada serviço.
//
//   --only=a,b | --except=a,b   filtra os serviços desta execução (fixo: DEV_ONLY/DEV_EXCEPT no .env)
//   --inline                    sem painel: linhas prefixadas por serviço (também sem TTY, ex.: CI)
//   --no-restart                não reinicia sozinho o serviço que cair
//   --sem-checagem              pula o doctor
//   --listar                    só mostra os serviços que subiriam nesta máquina (e com que comando)
//   --plano=<arquivo>           grava o plano em JSON em vez de subir (para depurar)
//   ORBITA_PLANO=<arquivo>      sobe direto de um plano pronto, sem checar nada
import { readFileSync, writeFileSync } from 'node:fs'
import { rodarDoctor } from '../doctor/index.mjs'
import { montarPlano, processoDoPlano } from '../plano/montar.mjs'
import { resolverPortas } from '../plano/portas.mjs'
import { consultarFamilias, montarContexto } from '../projeto/contexto.mjs'
import { criarMensagens } from '../ui/mensagens.mjs'
import { larguraDoTerminal, linhaDeDetalhe } from '../ui/tabela.mjs'
import { avisarRemovidos } from './doctor.mjs'

/** @type {import('./tipos.mjs').Comando} */
export default {
  nome: 'dev',
  descricao: 'Sobe os serviços do projeto num painel de terminal (abas, logs, alertas, ações rápidas), checando o ambiente antes',
  async executar({ argumentos: { opcoes }, projeto, perguntas, saida, estilo, terminal, env, entrada }) {
    const modo = opcoes.inline || !terminal.tty || !entrada?.isTTY ? 'inline' : 'painel'

    if (env.ORBITA_PLANO) {
      return subir(JSON.parse(readFileSync(env.ORBITA_PLANO, 'utf8')), modo)
    }

    const contexto = montarContexto(projeto, { opcoes, perguntas, saida, estilo, terminal, env })
    avisarRemovidos(await consultarFamilias(contexto), saida, estilo)

    if (opcoes.listar) {
      listar(contexto)

      return 0
    }

    if (!(await resolverPortas(contexto))) {
      return 1
    }

    if (!opcoes['sem-checagem']) {
      const { ok, alterou } = await rodarDoctor(contexto, { perguntar: perguntas.interativo })

      if (!ok) {
        criarMensagens(saida, estilo).linha(`  Corrija os itens acima ou rode com ${estilo.amarelo('--sem-checagem')}.`)

        return 1
      }
      if (alterou) {
        await Promise.all(contexto.grupos.map(grupo => grupo.familia.consultar?.(grupo, contexto)))
      }
    }

    const plano = montarPlano(contexto, { reiniciar: !opcoes['no-restart'] })

    if (typeof opcoes.plano === 'string') {
      writeFileSync(opcoes.plano, JSON.stringify(plano, null, 2))
      criarMensagens(saida, estilo).ok(`Plano gravado em ${opcoes.plano}. Para subir com ele: ORBITA_PLANO=${opcoes.plano} codify dev`)

      return 0
    }

    return subir(plano, modo)
  },
}

/** "server (laravel, porta 8000) ........ php artisan serve --host=127.0.0.1 --port=8000" */
function listar(contexto) {
  const { saida, estilo, servicos } = contexto
  const largura = larguraDoTerminal(saida)

  saida.write('\n')
  for (const servico of servicos) {
    const sobre = [servico.preset?.nome ?? 'cmd', servico.porta ? `porta ${servico.porta}` : null, servico.pasta].filter(Boolean).join(', ')
    saida.write(`${linhaDeDetalhe(`${estilo.negrito(servico.nome)} ${estilo.suave(`(${sobre})`)}`, processoDoPlano(servico, contexto).comando, { largura, estilo })}\n`)
  }
  saida.write('\n')
}

/** O painel é grande: só é carregado quando vai subir de verdade. */
async function subir(plano, modo) {
  const { iniciarPainel } = await import('../painel/index.mjs')

  return iniciarPainel(plano, { modo })
}
