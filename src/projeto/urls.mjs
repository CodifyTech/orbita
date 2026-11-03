// URLs do ambiente local e as variáveis de ambiente que os frontends leem.
import { join } from 'node:path'
import { lerEnvs } from '../ambiente/env.mjs'

const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']

/** 0.0.0.0 e :: servem para escutar, não para acessar: o navegador usa 127.0.0.1. */
export const hostParaAcesso = host => (['0.0.0.0', '::', '[::]'].includes(host) ? '127.0.0.1' : host)

/**
 * A URL aponta para esta máquina? (localhost, 127.0.0.1, 0.0.0.0 ou o host extra, ex.: DEV_SERVER_HOST)
 *
 * @param {string} url
 * @param {string[]} [outrosHosts]
 */
export function apontaParaEstaMaquina(url, outrosHosts = []) {
  try {
    return [...HOSTS_LOCAIS, ...outrosHosts].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Arquivos que os frontends (Vite, Next, Nuxt…) leem em desenvolvimento, do menos para o mais forte. */
export const ARQUIVOS_ENV_DO_FRONTEND = ['.env', '.env.local', '.env.development', '.env.development.local']

/** Variáveis que o frontend enxerga em `dev`, na mesma precedência dele (a última vence). */
export const envDoFrontend = pasta => lerEnvs(ARQUIVOS_ENV_DO_FRONTEND.map(arquivo => join(pasta, arquivo)))

/**
 * A API local: o primeiro serviço que é um backend HTTP (preset laravel ou dotnet).
 *
 * @param {import('../presets/tipos.mjs').Servico[]} servicos
 * @returns {{ servico: import('../presets/tipos.mjs').Servico, url: string } | null}
 */
export function apiLocal(servicos) {
  const servico = servicos.find(s => ['laravel', 'dotnet'].includes(s.preset?.nome) && s.porta)

  return servico ? { servico, url: `http://${hostParaAcesso(servico.host)}:${servico.porta}` } : null
}
