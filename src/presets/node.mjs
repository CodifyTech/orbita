// Família "node": apps que sobem pelo script `dev` do próprio package.json (Vite, Nuxt, Astro, Next,
// Ionic). O preset só acrescenta a porta padrão, como passar a porta, a saúde, a cor e a variável
// de ambiente onde o app guarda o endereço da API.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gravarEnv, lerEnv } from '../ambiente/env.mjs'
import { versaoDe } from '../ambiente/ferramentas.mjs'
import { apiLocal, apontaParaEstaMaquina, envDoFrontend } from '../projeto/urls.mjs'
import { PADROES_NODE } from './padroes.mjs'

const DICAS_DE_INSTALACAO = {
  bun: 'Instale o Bun (https://bun.sh).',
  npm: 'Instale o Node.js LTS (https://nodejs.org), que já vem com o npm.',
  pnpm: 'Instale o pnpm (https://pnpm.io/installation).',
  yarn: 'Instale o Yarn (https://yarnpkg.com/getting-started/install).',
}

/**
 * @param {object} dados
 * @param {string} dados.nome
 * @param {string} dados.descricao
 * @param {[number, number, number]} dados.cor
 * @param {number} dados.porta
 * @param {(porta: number) => string[]} dados.argsDaPorta  como o script `dev` recebe a porta
 * @param {string} dados.variavelDaApi                      onde o app guarda a URL da API
 * @returns {import('./tipos.mjs').Preset & { variavelDaApi: string }}
 */
function presetNode({ nome, descricao, cor, porta, argsDaPorta, variavelDaApi }) {
  return {
    nome,
    familia: 'node',
    descricao,
    cor,
    porta,
    health: '/',
    protocolo: 'http',
    padroes: PADROES_NODE,
    // O painel conta as linhas "hmr update" do Vite; nos outros, a linha não aparece e fica zerada.
    metrica: 'hmr',
    variavelDaApi,
    comando: (servico, { projeto }) => comandoDoScript(projeto.config.gerenciador, 'dev', argsDaPorta(servico.porta)),
  }
}

/** `bun run dev --port 5173`; o npm precisa de `--` antes dos argumentos do script. */
export function comandoDoScript(gerenciador, script, args = []) {
  const separador = gerenciador === 'npm' && args.length ? ' --' : ''

  return `${gerenciador} run ${script}${separador}${args.length ? ` ${args.join(' ')}` : ''}`
}

export const PRESETS_NODE = [
  // --strictPort: sem ele, o Vite pula sozinho para a próxima porta e o painel vigia a errada.
  presetNode({ nome: 'vite', descricao: 'SPA · Vite', cor: [52, 211, 153], porta: 5173, argsDaPorta: p => ['--port', String(p), '--strictPort'], variavelDaApi: 'VITE_API_URL' }),
  presetNode({ nome: 'nuxt', descricao: 'App Nuxt', cor: [0, 220, 130], porta: 3000, argsDaPorta: p => ['--port', String(p)], variavelDaApi: 'NUXT_PUBLIC_API_BASE' }),
  presetNode({ nome: 'astro', descricao: 'Site Astro', cor: [255, 120, 60], porta: 4321, argsDaPorta: p => ['--port', String(p)], variavelDaApi: 'PUBLIC_API_URL' }),
  presetNode({ nome: 'next', descricao: 'App Next.js', cor: [220, 220, 230], porta: 3000, argsDaPorta: p => ['-p', String(p)], variavelDaApi: 'NEXT_PUBLIC_API_URL' }),
  presetNode({ nome: 'ionic', descricao: 'App Ionic', cor: [80, 140, 255], porta: 8100, argsDaPorta: p => ['--port', String(p)], variavelDaApi: 'VITE_API_URL' }),
]

/** Scripts do package.json da pasta (vazio se não houver). */
export function scriptsDaPasta(pasta) {
  try {
    return JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8')).scripts ?? {}
  } catch {
    return {}
  }
}

/** Frontends do projeto que leem as variáveis do Vite (onde o Laravel grava as do Reverb). */
export const ehFrontendVite = servico => ['vite', 'ionic'].includes(servico.preset?.nome)

/** @type {import('./tipos.mjs').Familia} */
export const familiaNode = {
  nome: 'node',

  ferramentas(grupo, { projeto }) {
    const { gerenciador } = projeto.config

    return [
      ...(gerenciador === 'bun' ? [] : [{ nome: 'Node.js', comando: 'node', dica: DICAS_DE_INSTALACAO.npm }]),
      { nome: rotuloDoGerenciador(gerenciador), comando: gerenciador, dica: DICAS_DE_INSTALACAO[gerenciador] },
    ]
  },

  async diagnosticar(grupo, contexto) {
    const { gerenciador } = contexto.projeto.config
    const itens = []

    if (!existsSync(grupo.cwd)) {
      return [{ estado: 'erro', item: rotulo(grupo), detalhe: `pasta não encontrada: ${grupo.pasta}`, reparo: null }]
    }

    contexto.cacheDeVersoes ??= {}
    contexto.cacheDeVersoes[gerenciador] ??= await versaoDe(gerenciador, ['--version'], contexto)
    if (!contexto.cacheDeVersoes[gerenciador]) {
      itens.push({ estado: 'erro', item: gerenciador, detalhe: `não está no PATH — ${DICAS_DE_INSTALACAO[gerenciador]}`, reparo: null })
    }

    if (!existsSync(join(grupo.cwd, 'node_modules'))) {
      itens.push({ estado: 'erro', item: rotulo(grupo), detalhe: 'sem node_modules — rode `codify setup`', reparo: null })

      return itens
    }

    return [...itens, ...diagnosticarApi(grupo, contexto)]
  },

  instalacao(grupo, contexto) {
    const { gerenciador } = contexto.projeto.config

    return {
      titulo: `Pacotes de ${grupo.pasta}`,
      porque: `O ${gerenciador} baixa as bibliotecas JavaScript que o app de ${grupo.pasta}/ usa.`,
      comando: gerenciador,
      args: ['install'],
      texto: `Instalando os pacotes do ${gerenciador} em ${grupo.pasta}/`,
      passosSeFalhar: [
        `Confira sua conexão com a internet e se o \`${gerenciador} --version\` funciona.`,
        `Rode \`${gerenciador} install\` dentro de ${grupo.pasta}/ para ver a saída completa.`,
      ],
    }
  },

  paraOPlano(grupo, { projeto }) {
    const { gerenciador } = projeto.config
    const scripts = scriptsDaPasta(grupo.cwd)
    const acoes = [
      { titulo: `Instalar pacotes (${grupo.pasta})`, detalhe: `${gerenciador} install`, comando: `${gerenciador} install`, cwd: grupo.cwd },
      ...['typecheck', 'lint', 'test']
        .filter(script => scripts[script])
        .map(script => ({ titulo: `${script} (${grupo.pasta})`, detalhe: comandoDoScript(gerenciador, script), comando: comandoDoScript(gerenciador, script), cwd: grupo.cwd })),
    ]

    return {
      acoes,
      alvos: [
        {
          nome: grupo.pasta,
          cwd: grupo.cwd,
          cor: grupo.servicos[0].preset?.cor ?? [52, 211, 153],
          exemplo: `ex.: ${comandoDoScript(gerenciador, scripts.typecheck ? 'typecheck' : 'build')}`,
          atalho: null,
          servicos: grupo.servicos.map(servico => servico.nome),
        },
      ],
    }
  },
}

/**
 * Valores que o app precisa para falar com a API local. Grava no .env novo todos; num .env que já
 * existe, só os vazios (não sobrescreve uma escolha do dev, ex.: apontar para a homologação).
 * Se o resultado ainda aponta para outro lugar, cria o .env.local (o app lê por cima e o git ignora).
 *
 * @returns {string[]} mensagens do que foi feito
 */
export function prepararEnvDoFrontend(grupo, contexto, extras = {}) {
  const feito = []
  const api = apiLocal(contexto.servicos)
  const arquivo = join(grupo.cwd, '.env')
  const novo = !existsSync(arquivo)
  const variavel = grupo.servicos[0].preset?.variavelDaApi

  if (novo) {
    const exemplo = join(grupo.cwd, '.env.example')
    writeFileSync(arquivo, existsSync(exemplo) ? readFileSync(exemplo, 'utf8') : '')
  }

  const atuais = lerEnv(arquivo)
  const locais = {
    ...(api && variavel ? { [variavel]: api.url } : {}),
    ...extras,
    // Só preenche o nome do app quando o projeto usa a variável (ela existe, vazia, no .env).
    ...(variavel?.startsWith('VITE_') && 'VITE_APP_NAME' in atuais ? { VITE_APP_NAME: contexto.projeto.config.nome } : {}),
  }
  const preencher = Object.entries(locais).filter(([chave]) => novo || !atuais[chave])

  for (const [chave, valor] of preencher) {
    gravarEnv(arquivo, chave, valor)
  }
  if (novo) {
    feito.push(`${grupo.pasta}/.env criado e configurado para o ambiente local.`)
  } else if (preencher.length) {
    feito.push(`${grupo.pasta}/.env: preenchi ${preencher.map(([chave]) => chave).join(', ')}.`)
  }

  const local = join(grupo.cwd, '.env.local')
  const env = envDoFrontend(grupo.cwd)
  const outraApi = api && variavel && !apontaParaEstaMaquina(env[variavel] ?? '')
  const outraChave = Object.entries(extras).some(([chave, valor]) => chave.endsWith('_KEY') && env[chave] !== valor)

  if (!existsSync(local) && (outraApi || outraChave)) {
    const valores = { ...(api && variavel ? { [variavel]: api.url } : {}), ...Object.fromEntries(Object.entries(extras).filter(([chave]) => chave.endsWith('_KEY'))) }
    writeFileSync(
      local,
      [
        '# Criado pelo `codify setup`: o .env aponta para outro ambiente; este arquivo aponta para o',
        '# local só nesta máquina (o git ignora). Apague-o para voltar aos valores do .env.',
        ...Object.entries(valores).map(([chave, valor]) => `${chave}=${valor}`),
        '',
      ].join('\n'),
    )
    feito.push(`${grupo.pasta}/.env.local criado: o app vai usar a API local (${api?.url ?? 'local'}).`)
  }

  return feito
}

function diagnosticarApi(grupo, contexto) {
  const api = apiLocal(contexto.servicos)
  const variavel = grupo.servicos[0].preset?.variavelDaApi

  if (!api || !variavel) {
    return []
  }

  const valor = envDoFrontend(grupo.cwd)[variavel] ?? ''
  const hostExtra = [api.servico.host]

  if (valor === '') {
    return [{ estado: 'aviso', item: variavel, detalhe: `vazia em ${grupo.pasta}/.env — use ${api.url}`, reparo: null }]
  }
  if (!apontaParaEstaMaquina(valor, hostExtra)) {
    return [
      {
        estado: 'aviso',
        item: variavel,
        detalhe: `o app vai falar com ${valor}, não com a API local (${api.url}). Para apontar só na sua máquina, crie ${grupo.pasta}/.env.local com ${variavel}=${api.url}`,
        reparo: null,
      },
    ]
  }

  return [{ estado: 'ok', item: variavel, detalhe: valor, reparo: null }]
}

const rotulo = grupo => `App ${grupo.pasta}`

const rotuloDoGerenciador = gerenciador => ({ bun: 'Bun', npm: 'npm', pnpm: 'pnpm', yarn: 'Yarn' })[gerenciador]
