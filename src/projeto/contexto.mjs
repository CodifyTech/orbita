// Monta o Contexto (o projeto resolvido) que doctor, dev, parar e setup compartilham, e roda a
// consulta das famílias (ex.: o ambiente.php do Laravel) quando o comando precisa do estado real.
import { resolve } from 'node:path'
import { executar as executarPadrao } from '../ambiente/executar.mjs'
import { binarioDoPhp } from '../presets/laravel/consulta.mjs'
import { buscarPreset } from '../presets/index.mjs'
import { lerPreferencias } from './preferencias.mjs'
import { agrupar, filtrarServicos, resolverServicos } from './servicos.mjs'

/**
 * @param {import('../config/carregar-config.mjs').Projeto} projeto
 * @param {object} dependencias
 * @param {Record<string, string | true>} [dependencias.opcoes]  --only/--except desta execução
 * @param {boolean} [dependencias.filtrar]                        false = todos os serviços (parar, setup)
 * @param {Record<string, string | undefined>} [dependencias.env]
 * @returns {import('../presets/tipos.mjs').Contexto}
 */
export function montarContexto(projeto, { opcoes = {}, filtrar = true, env = process.env, executar = executarPadrao, ...resto }) {
  const previa = Object.values(projeto.config.servicos).map(servico => ({
    familia: buscarPreset(servico.preset)?.familia ?? 'generico',
    cwd: resolve(projeto.raiz, servico.cwd),
  }))
  const preferencias = lerPreferencias(projeto.raiz, previa)
  const todos = resolverServicos(projeto, preferencias)
  const servicos = filtrar ? filtrarServicos(todos, opcoes, preferencias.valores) : todos

  return {
    projeto,
    todos,
    servicos,
    grupos: agrupar(servicos),
    preferencias,
    php: binarioDoPhp(env),
    executar,
    envDaExecucao: {},
    ...resto,
  }
}

/**
 * Pergunta a cada família o estado real (ambiente.php etc.) e aplica os ajustes dela, como
 * Horizon × queue:listen. Devolve os serviços que ficaram de fora, com o motivo.
 *
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 * @returns {Promise<{ nome: string, motivo: string }[]>}
 */
export async function consultarFamilias(contexto) {
  await Promise.all(contexto.grupos.map(grupo => grupo.familia.consultar?.(grupo, contexto)))

  const removidos = contexto.grupos.flatMap(grupo => grupo.familia.ajustar?.(grupo, contexto).removidos ?? [])
  removerServicos(contexto, removidos.map(({ nome }) => nome))

  return removidos
}

/** Tira serviços desta execução (porta ocupada que o dev preferiu pular, Horizon sem pcntl…). */
export function removerServicos(contexto, nomes) {
  contexto.servicos = contexto.servicos.filter(servico => !nomes.includes(servico.nome))

  for (const grupo of contexto.grupos) {
    grupo.servicos = grupo.servicos.filter(servico => !nomes.includes(servico.nome))
  }
  contexto.grupos = contexto.grupos.filter(grupo => grupo.servicos.length)
}
