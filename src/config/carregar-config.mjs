// Carrega o projeto: acha a raiz, importa o orbita.config.mjs (se houver) e lê o package.json.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ARQUIVO_DE_CONFIG, NOME_DO_PACOTE } from '../constantes.mjs'
import { ErroDeConfig, ErroDeUso } from '../erros.mjs'
import { defineConfig } from './define-config.mjs'
import { encontrarRaiz } from './raiz-do-projeto.mjs'

/**
 * @typedef {object} Projeto
 * @property {string} raiz                      pasta do projeto
 * @property {string | null} arquivoDeConfig    caminho do orbita.config.mjs (null se o projeto não tem)
 * @property {import('./define-config.mjs').Config} config  configuração já validada
 * @property {Record<string, string>} scripts   `scripts` do package.json do projeto
 * @property {Record<string, string>} descricoes descrição de cada script (config vence o package.json)
 */

/**
 * @param {string} cwd pasta onde o dev rodou o comando
 * @param {{ importar?: boolean }} [opcoes] importar: false = não carrega o orbita.config.mjs (o `init`
 *   só precisa da raiz, e a config que ele mesmo gerou pode nem carregar ainda)
 * @returns {Promise<Projeto>}
 */
export async function carregarProjeto(cwd, { importar = true } = {}) {
  const { raiz, arquivoDeConfig } = encontrarRaiz(cwd)
  const pacote = lerPacoteDoProjeto(raiz)
  const config = arquivoDeConfig && importar
    ? await importarConfig(arquivoDeConfig)
    : defineConfig({ nome: pacote.name ?? basename(raiz) })

  return {
    raiz,
    arquivoDeConfig,
    config,
    scripts: pacote.scripts ?? {},
    // O package.json é só o fallback: quem manda é o orbita.config.mjs.
    descricoes: { ...pacote.descricoes, ...config.descricoes },
  }
}

/** Lê o package.json da raiz; sem ele, devolve um objeto vazio. */
export function lerPacoteDoProjeto(raiz) {
  const arquivo = join(raiz, 'package.json')

  if (!existsSync(arquivo)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch (erro) {
    throw new ErroDeUso(`O package.json de ${raiz} não é um JSON válido: ${erro.message}`)
  }
}

async function importarConfig(arquivo) {
  let modulo

  try {
    modulo = await import(pathToFileURL(arquivo).href)
  } catch (erro) {
    throw traduzirErroDeImportacao(erro, arquivo)
  }

  if (modulo.default === undefined) {
    throw new ErroDeConfig(['o arquivo precisa exportar a configuração: export default defineConfig({ … })'], arquivo)
  }

  try {
    // Idempotente: se o dev já usou defineConfig, só revalida; se exportou um objeto cru, normaliza.
    return defineConfig(modulo.default)
  } catch (erro) {
    throw erro instanceof ErroDeConfig ? new ErroDeConfig(erro.problemas, arquivo) : erro
  }
}

function traduzirErroDeImportacao(erro, arquivo) {
  if (erro instanceof ErroDeConfig) {
    return new ErroDeConfig(erro.problemas, arquivo)
  }

  if (erro.code === 'ERR_MODULE_NOT_FOUND' && erro.message.includes(NOME_DO_PACOTE)) {
    return new ErroDeUso(
      `O ${ARQUIVO_DE_CONFIG} importa ${NOME_DO_PACOTE}, mas o pacote não está instalado neste projeto.`,
      `Rode: npm install --save-dev ${NOME_DO_PACOTE}  (veja docs/instalacao.md para configurar o token).`,
    )
  }

  return new ErroDeUso(`Não consegui carregar ${arquivo}: ${erro.message}`)
}
