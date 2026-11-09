// Monta o Plano (src/plano/tipos.mjs) a partir do contexto já resolvido: comandos, portas, URLs,
// saúde e o que cada família quer no painel (logs, cabeçalho, ações, alvos do comando livre).
import { fileURLToPath } from 'node:url'
import { linhaDeComando } from '../ambiente/executar.mjs'
import { PADROES_NODE } from '../presets/padroes.mjs'
import { hostParaAcesso } from '../projeto/urls.mjs'

const BIN = fileURLToPath(new URL('../../bin/codify.mjs', import.meta.url))
const COR_PADRAO = [148, 163, 184]

/**
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @param {{ reiniciar: boolean }} opcoes
 * @returns {import('./tipos.mjs').Plano}
 */
export function montarPlano(contexto, { reiniciar }) {
  const { projeto } = contexto
  const partes = contexto.grupos.map(grupo => grupo.familia.paraOPlano(grupo, contexto))
  const juntar = chave => partes.flatMap(parte => parte[chave] ?? [])

  return {
    projeto: { nome: projeto.config.nome, slogan: projeto.config.slogan, logo: projeto.config.logo, raiz: projeto.raiz },
    processos: contexto.servicos.map(servico => processoDoPlano(servico, contexto)),
    env: Object.assign({}, ...partes.map(parte => parte.env), contexto.envDaExecucao),
    reiniciar,
    logs: semNomesRepetidos(juntar('logs')),
    ambiente: juntar('ambiente'),
    acoes: [
      ...juntar('acoes'),
      {
        titulo: 'Diagnóstico do ambiente',
        detalhe: 'codify doctor, só diagnostica',
        // Pelo caminho do próprio Órbita: o `codify` pode não estar no PATH (instalação só no projeto).
        comando: linhaDeComando(process.execPath, [BIN, 'doctor', '--sem-perguntas']),
        cwd: projeto.raiz,
      },
    ],
    alvos: juntar('alvos'),
  }
}

/**
 * @param {import('../presets/tipos.mjs').Servico} servico
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @returns {import('./tipos.mjs').ProcessoDoPlano}
 */
export function processoDoPlano(servico, contexto) {
  const { preset, porta } = servico
  // Apps Node (Vite no Windows) escutam às vezes só no IPv6: "localhost" acha os dois.
  const host = servico.familia.nome === 'node' ? 'localhost' : hostParaAcesso(servico.host)

  return {
    nome: servico.nome,
    comando: servico.cmd ?? preset.comando(servico, contexto),
    cwd: servico.cwd,
    cor: preset?.cor ?? COR_PADRAO,
    descricao: preset?.descrever?.(servico, contexto) ?? preset?.descricao ?? servico.cmd,
    porta,
    url: porta ? `${preset?.protocolo ?? 'http'}://${host}:${porta}` : null,
    saude: saudeDe(servico, host),
    padroes: preset?.padroes ?? PADROES_NODE,
    metrica: preset?.metrica ?? null,
    detalhesDeRequest: preset?.detalhesDeRequest?.(servico, contexto) ?? null,
  }
}

function saudeDe(servico, host) {
  if (!servico.porta) {
    return null
  }
  if (!servico.health) {
    return { tipo: 'tcp', porta: servico.porta }
  }

  const url = /^https?:\/\//.test(servico.health) ? servico.health : `http://${host}:${servico.porta}${servico.health}`

  return { tipo: 'http', url }
}

/** Dois apps Laravel no mesmo projeto teriam duas abas "laravel": a segunda vira "laravel:pasta". */
function semNomesRepetidos(logs) {
  const vistos = new Set()

  return logs.map(log => {
    const nome = vistos.has(log.nome) ? `${log.nome}:${log.pasta.split(/[\\/]/).at(-3) ?? vistos.size}` : log.nome
    vistos.add(nome)

    return { ...log, nome }
  })
}
