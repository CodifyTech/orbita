// Da config para os serviços "de verdade": aplica o preset, decide porta e host desta máquina,
// filtra (--only/--except/DEV_ONLY/DEV_EXCEPT) e agrupa por família e pasta.
import { relative, resolve } from 'node:path'
import { lerEnv } from '../ambiente/env.mjs'
import { ErroDeUso } from '../erros.mjs'
import { buscarPreset, FAMILIAS, NOMES_DOS_PRESETS } from '../presets/index.mjs'
import { chaveDaPorta, listaDe, portaValida } from './preferencias.mjs'

/**
 * Serviços da config com o preset aplicado. Porta: a preferida desta máquina (.env), senão a da
 * config, senão a padrão do preset.
 *
 * @param {import('../config/carregar-config.mjs').Projeto} projeto
 * @param {{ arquivo: string, valores: Record<string, string> }} preferencias
 * @returns {import('../presets/tipos.mjs').Servico[]}
 */
export function resolverServicos(projeto, preferencias) {
  const desconhecidos = Object.entries(projeto.config.servicos).filter(([, servico]) => servico.preset && !buscarPreset(servico.preset))

  if (desconhecidos.length) {
    throw new ErroDeUso(
      `Preset desconhecido em ${desconhecidos.map(([nome, servico]) => `servicos.${nome} ("${servico.preset}")`).join(', ')}.`,
      `Os presets são: ${NOMES_DOS_PRESETS.join(', ')}. Sem preset, use só "cmd".`,
    )
  }

  const servicos = Object.entries(projeto.config.servicos).map(([nome, config]) => {
    const preset = config.preset ? buscarPreset(config.preset) : null
    const cwd = resolve(projeto.raiz, config.cwd)

    return {
      nome,
      preset,
      familia: FAMILIAS[preset?.familia ?? 'generico'],
      cwd,
      pasta: nomeDaPasta(projeto.raiz, cwd),
      porta: null,
      host: '127.0.0.1',
      cmd: config.cmd,
      health: config.health ?? preset?.health ?? null,
      portaDaConfig: config.porta ?? preset?.porta ?? null,
      grupo: null,
    }
  })

  agrupar(servicos)

  const contextoMinimo = { preferencias, servicos }

  for (const servico of servicos) {
    const onde = servico.familia.preferenciaDePorta?.(servico, contextoMinimo) ?? { arquivo: preferencias.arquivo, chave: chaveDaPorta(servico.nome) }
    const preferida = portaValida(lerEnv(onde.arquivo)[onde.chave])

    servico.porta = servico.portaDaConfig === null && preferida === null ? null : (preferida ?? servico.portaDaConfig)
    servico.host = servico.familia.hostPreferido?.(servico, contextoMinimo) ?? '127.0.0.1'
  }

  return servicos
}

/** Pasta para mensagens: relativa à raiz ("backend"); fora da raiz, o caminho completo. */
export function nomeDaPasta(raiz, cwd) {
  const relativo = relative(raiz, cwd).replaceAll('\\', '/')

  return relativo.startsWith('..') ? cwd.replaceAll('\\', '/') : relativo || '.'
}

/** Junta os serviços da mesma família na mesma pasta e liga cada um ao seu grupo. */
export function agrupar(servicos) {
  const grupos = new Map()

  for (const servico of servicos) {
    const chave = `${servico.familia.nome}|${servico.cwd}`

    if (!grupos.has(chave)) {
      grupos.set(chave, { familia: servico.familia, cwd: servico.cwd, pasta: servico.pasta, servicos: [], info: null, falha: null })
    }
    grupos.get(chave).servicos.push(servico)
    servico.grupo = grupos.get(chave)
  }

  return [...grupos.values()]
}

/**
 * Aplica --only/--except desta execução e DEV_ONLY/DEV_EXCEPT da máquina.
 *
 * @param {import('../presets/tipos.mjs').Servico[]} servicos
 * @param {{ only?: string | true, except?: string | true }} opcoes
 * @param {Record<string, string>} preferencias
 */
export function filtrarServicos(servicos, opcoes, preferencias = {}) {
  const nomes = servicos.map(servico => servico.nome)

  if (!nomes.length) {
    throw new ErroDeUso('O orbita.config.mjs não declara nenhum serviço.', 'Rode `codify init` para gerar a lista, ou veja docs/configuracao.md.')
  }

  const only = listaDe(typeof opcoes.only === 'string' ? opcoes.only : '')
  const except = listaDe(typeof opcoes.except === 'string' ? opcoes.except : '')
  const desconhecidos = [...only, ...except].filter(nome => !nomes.includes(nome))

  if (desconhecidos.length) {
    throw new ErroDeUso(`Serviço(s) desconhecido(s): ${desconhecidos.join(', ')}.`, `Use: ${nomes.join(', ')}.`)
  }

  // O filtro da execução vence a preferência fixa da máquina.
  const so = only.length ? only : listaDe(preferencias.DEV_ONLY).filter(nome => nomes.includes(nome))
  const fora = [...except, ...listaDe(preferencias.DEV_EXCEPT)]
  const escolhidos = servicos.filter(servico => (!so.length || so.includes(servico.nome)) && !fora.includes(servico.nome))

  if (!escolhidos.length) {
    throw new ErroDeUso('Nenhum serviço para subir com esse filtro.', `Os serviços do projeto são: ${nomes.join(', ')}.`)
  }

  return escolhidos
}
