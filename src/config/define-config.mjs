// `defineConfig`: valida o orbita.config.mjs e preenche os padrões.
//
// Regra da casa: o Órbita não adivinha nada em tempo de execução. Por isso uma chave desconhecida
// (um "servico" no lugar de "servicos", por exemplo) é erro, não é ignorada em silêncio.
import { ErroDeConfig } from '../erros.mjs'

export const GERENCIADORES = ['npm', 'bun', 'pnpm', 'yarn']

const CHAVES_DA_CONFIG = ['nome', 'slogan', 'logo', 'gerenciador', 'servicos', 'descricoes']
const CHAVES_DO_SERVICO = ['preset', 'cwd', 'porta', 'cmd', 'health']
const NOME_DE_SERVICO = /^[a-z][a-z0-9:_-]*$/i

/**
 * @typedef {object} Servico
 * @property {string | null} preset  "laravel", "vite", "nuxt"… (o que o Órbita já sabe daquela stack)
 * @property {string} cwd            pasta do serviço, relativa à raiz do projeto
 * @property {number | null} porta   porta padrão; o `dev` troca se estiver ocupada
 * @property {string | null} cmd     comando próprio; sem ele vale o do preset
 * @property {string | null} health  caminho (ex.: "/up") ou URL para checar se o serviço está de pé
 */

/**
 * @typedef {object} Config
 * @property {string} nome                       nome do projeto (aparece no banner e no painel)
 * @property {string} slogan                     frase curta do projeto ('' se não houver)
 * @property {string[] | null} logo              linhas do logo ASCII; null usa o do Órbita
 * @property {'npm' | 'bun' | 'pnpm' | 'yarn'} gerenciador  quem roda os scripts do projeto
 * @property {Record<string, Servico>} servicos  um por aba do painel, na ordem declarada
 * @property {Record<string, string>} descricoes descrição de cada script, usada no banner e no `help`
 */

/**
 * Valida e normaliza a configuração. Lança `ErroDeConfig` listando *todos* os problemas de uma vez.
 *
 * @param {object} entrada o objeto escrito pelo dev no orbita.config.mjs
 * @returns {Config}
 */
export function defineConfig(entrada) {
  if (!ehObjeto(entrada)) {
    throw new ErroDeConfig([`a configuração precisa ser um objeto, mas veio ${descreverTipo(entrada)}`])
  }

  const problemas = []

  chavesDesconhecidas(entrada, CHAVES_DA_CONFIG, 'configuração', problemas)

  const nome = campoTexto(entrada, 'nome', 'configuração', problemas)
  if (!nome) {
    problemas.push('"nome" é obrigatório (ex.: nome: "FoodOS")')
  }

  const config = {
    nome: nome ?? '',
    // '' é o valor normalizado de "sem slogan"; precisa passar quando a config é revalidada.
    slogan: entrada.slogan === '' ? '' : (campoTexto(entrada, 'slogan', 'configuração', problemas) ?? ''),
    logo: normalizarLogo(entrada.logo, problemas),
    gerenciador: normalizarGerenciador(entrada.gerenciador, problemas),
    servicos: normalizarServicos(entrada.servicos, problemas),
    descricoes: normalizarDescricoes(entrada.descricoes, problemas),
  }

  if (problemas.length) {
    throw new ErroDeConfig(problemas)
  }

  return config
}

function normalizarLogo(logo, problemas) {
  if (logo == null) {
    return null
  }
  if (!Array.isArray(logo) || logo.length === 0 || !logo.every(linha => typeof linha === 'string')) {
    problemas.push('"logo" precisa ser uma lista de linhas de texto (array de strings)')

    return null
  }

  return logo
}

function normalizarGerenciador(gerenciador, problemas) {
  if (gerenciador == null) {
    return 'npm'
  }
  if (!GERENCIADORES.includes(gerenciador)) {
    problemas.push(`"gerenciador" precisa ser um destes: ${GERENCIADORES.join(', ')} (veio ${JSON.stringify(gerenciador)})`)

    return 'npm'
  }

  return gerenciador
}

function normalizarDescricoes(descricoes, problemas) {
  if (descricoes == null) {
    return {}
  }
  if (!ehObjeto(descricoes) || !Object.values(descricoes).every(texto => typeof texto === 'string')) {
    problemas.push('"descricoes" precisa ser um objeto { script: "descrição" } só com textos')

    return {}
  }

  return { ...descricoes }
}

function normalizarServicos(servicos, problemas) {
  if (servicos == null) {
    return {}
  }
  if (!ehObjeto(servicos)) {
    problemas.push('"servicos" precisa ser um objeto { nome: { preset, cwd, porta… } }')

    return {}
  }

  const resultado = {}

  for (const [nome, entrada] of Object.entries(servicos)) {
    if (!NOME_DE_SERVICO.test(nome)) {
      problemas.push(`servicos.${nome}: nome inválido (comece com letra; use letras, números, "-", "_" ou ":")`)
      continue
    }
    resultado[nome] = normalizarServico(nome, entrada, problemas)
  }

  return resultado
}

function normalizarServico(nome, entrada, problemas) {
  const onde = `servicos.${nome}`

  if (!ehObjeto(entrada)) {
    problemas.push(`${onde}: precisa ser um objeto, mas veio ${descreverTipo(entrada)}`)

    return null
  }

  chavesDesconhecidas(entrada, CHAVES_DO_SERVICO, onde, problemas)

  const preset = campoTexto(entrada, 'preset', onde, problemas)
  const cmd = campoTexto(entrada, 'cmd', onde, problemas)

  if (!preset && !cmd) {
    problemas.push(`${onde}: informe "preset" (ex.: "vite") ou "cmd" (o comando que sobe o serviço)`)
  }

  return {
    preset: preset ?? null,
    cwd: campoTexto(entrada, 'cwd', onde, problemas) ?? '.',
    porta: campoPorta(entrada, onde, problemas),
    cmd: cmd ?? null,
    health: campoTexto(entrada, 'health', onde, problemas) ?? null,
  }
}

function campoPorta(entrada, onde, problemas) {
  const { porta } = entrada

  if (porta == null) {
    return null
  }
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    problemas.push(`${onde}: "porta" precisa ser um número inteiro de 1 a 65535 (veio ${JSON.stringify(porta)})`)

    return null
  }

  return porta
}

/** Lê um campo opcional de texto; ausente (ou null) devolve undefined. */
function campoTexto(objeto, chave, onde, problemas) {
  const valor = objeto[chave]

  if (valor == null) {
    return undefined
  }
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push(`${onde}: "${chave}" precisa ser um texto não vazio (veio ${JSON.stringify(valor)})`)

    return undefined
  }

  return valor
}

function chavesDesconhecidas(objeto, permitidas, onde, problemas) {
  for (const chave of Object.keys(objeto)) {
    if (!permitidas.includes(chave)) {
      problemas.push(`${onde}: chave desconhecida "${chave}" (as válidas são: ${permitidas.join(', ')})`)
    }
  }
}

const ehObjeto = valor => typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const descreverTipo = valor => (Array.isArray(valor) ? 'uma lista' : valor === null ? 'null' : `um(a) ${typeof valor}`)
