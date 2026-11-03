// Trocar a porta de um serviço, de dois jeitos:
//   permanente (doctor)    → grava no .env de preferências; vale para as próximas execuções
//   só nesta execução (dev) → variáveis de ambiente herdadas pelos filhos, sem editar arquivo
// Nos dois, quem depende do serviço acompanha: se a API muda de porta, o frontend que aponta para a
// API local passa a apontar para a nova.
import { join, relative } from 'node:path'
import { gravarEnv } from '../ambiente/env.mjs'
import { chaveDaPorta } from './preferencias.mjs'
import { apiLocal, apontaParaEstaMaquina, envDoFrontend, hostParaAcesso } from './urls.mjs'

/** Onde fica a porta preferida deste serviço nesta máquina. */
export function ondeFicaAPorta(servico, contexto) {
  return servico.familia.preferenciaDePorta?.(servico, contexto) ?? { arquivo: contexto.preferencias.arquivo, chave: chaveDaPorta(servico.nome) }
}

/** Frontends (família node) cuja variável da API aponta para esta máquina. */
function frontendsQueApontamParaAApi(contexto, api) {
  const pastas = new Map()

  for (const servico of contexto.servicos) {
    const variavel = servico.preset?.variavelDaApi

    if (variavel && apontaParaEstaMaquina(envDoFrontend(servico.cwd)[variavel] ?? '', [api.servico.host])) {
      pastas.set(servico.cwd, variavel)
    }
  }

  return [...pastas.entries()].map(([cwd, variavel]) => ({ cwd, variavel }))
}

/**
 * Grava a porta nova (doctor). Devolve o arquivo onde gravou, para a mensagem.
 *
 * @param {import('../presets/tipos.mjs').Servico} servico
 * @param {number} nova
 * @param {import('../presets/tipos.mjs').Contexto} contexto
 */
export function gravarPortaPermanente(servico, nova, contexto) {
  const api = apiLocal(contexto.servicos)
  const ehApi = api?.servico === servico
  const frontends = ehApi ? frontendsQueApontamParaAApi(contexto, api) : []
  const { arquivo, chave } = ondeFicaAPorta(servico, contexto)

  gravarEnv(arquivo, chave, String(nova))
  servico.porta = nova
  servico.familia.gravarPorta?.(servico, nova, contexto)

  // O frontend sempre no .env.local: o app lê por cima do .env e o git ignora.
  for (const { cwd, variavel } of frontends) {
    gravarEnv(join(cwd, '.env.local'), variavel, `http://${hostParaAcesso(servico.host)}:${nova}`)
  }

  return relative(contexto.projeto.raiz, arquivo).replaceAll('\\', '/')
}

/**
 * Troca só nesta execução (dev): soma em `contexto.envDaExecucao` o que os filhos precisam herdar.
 *
 * @returns {string} complemento da mensagem (ex.: "; o frontend já aponta para ela")
 */
export function trocarPortaNaExecucao(servico, nova, contexto) {
  const api = apiLocal(contexto.servicos)
  const ehApi = api?.servico === servico
  const frontends = ehApi ? frontendsQueApontamParaAApi(contexto, api) : []
  const { env = {}, detalhe = '' } = servico.familia.envDaTroca?.(servico, nova, contexto) ?? {}

  servico.porta = nova
  Object.assign(contexto.envDaExecucao, env)

  for (const { variavel } of frontends) {
    contexto.envDaExecucao[variavel] = `http://${hostParaAcesso(servico.host)}:${nova}`
  }

  if (frontends.length) {
    return `${detalhe}; o frontend já aponta para ela`
  }
  if (servico.familia.nome === 'node') {
    return `${detalhe}; abra http://localhost:${nova}`
  }

  return detalhe
}
