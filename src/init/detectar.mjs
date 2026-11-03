// Descobre a stack do projeto examinando as pastas (a raiz e até dois níveis abaixo) pelo CONTEÚDO,
// não pelo nome: `artisan` + laravel/framework é Laravel; package.json com script `dev` e a
// dependência certa é Vite/Nuxt/Astro/Next/Ionic; .csproj Web é .NET. É o único lugar em que o
// Órbita "adivinha" algo, e o resultado vira uma config que o dev revisa.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const IGNORADAS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'bin', 'obj', 'storage', 'public', 'coverage', 'tmp', '.nuxt', '.next', '.output', '.astro'])

/** Ordem importa: Ionic usa Vite por baixo, então é testado antes. */
const DEPENDENCIA_DO_PRESET = [
  ['nuxt', ['nuxt']],
  ['next', ['next']],
  ['astro', ['astro']],
  ['ionic', ['@ionic/vue', '@ionic/react', '@ionic/angular', '@ionic/core']],
  ['vite', ['vite']],
]

const lerJson = arquivo => {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @typedef {object} App uma aplicação encontrada
 * @property {'laravel' | 'node' | 'dotnet'} tipo
 * @property {string} pasta      relativa à raiz ("." para a própria raiz)
 * @property {string} [preset]   para node: vite, nuxt…
 * @property {string[]} [pacotes] para laravel: pacotes do composer (horizon, reverb, pail)
 */

/**
 * O que existe numa pasta (ou null).
 *
 * @param {string} pasta
 * @returns {Omit<App, 'pasta'> | null}
 */
export function detectarApp(pasta) {
  const composer = lerJson(join(pasta, 'composer.json'))
  const exige = { ...composer?.require, ...composer?.['require-dev'] }

  if (existsSync(join(pasta, 'artisan')) && exige['laravel/framework']) {
    return { tipo: 'laravel', pacotes: Object.keys(exige).filter(pacote => pacote.startsWith('laravel/')) }
  }

  const pacote = lerJson(join(pasta, 'package.json'))
  if (pacote?.scripts?.dev) {
    const dependencias = { ...pacote.dependencies, ...pacote.devDependencies }
    const encontrado = DEPENDENCIA_DO_PRESET.find(([, nomes]) => nomes.some(nome => dependencias[nome]))

    if (encontrado) {
      return { tipo: 'node', preset: encontrado[0] }
    }
  }

  const csproj = arquivosDe(pasta).find(arquivo => arquivo.endsWith('.csproj'))
  if (csproj && readFileSync(join(pasta, csproj), 'utf8').includes('Microsoft.NET.Sdk.Web')) {
    return { tipo: 'dotnet' }
  }

  return null
}

/**
 * Apps do projeto, da raiz até dois níveis. Não desce dentro de um app já encontrado (o
 * frontend/src de um app Vite não é outro app; o package.json do Laravel não vira um Vite).
 *
 * @param {string} raiz
 * @returns {App[]}
 */
export function detectarApps(raiz) {
  const apps = []
  const visitar = (pasta, nivel) => {
    const app = detectarApp(pasta)

    if (app) {
      apps.push({ ...app, pasta: relative(raiz, pasta).replaceAll('\\', '/') || '.' })

      return
    }
    if (nivel === 2) {
      return
    }
    for (const filha of subpastas(pasta)) {
      visitar(join(pasta, filha), nivel + 1)
    }
  }

  visitar(raiz, 0)

  return apps
}

/** bun.lock → bun, pnpm-lock.yaml → pnpm… procurando na raiz e depois nas pastas dos apps. */
export function detectarGerenciador(raiz, apps = []) {
  const travas = [
    ['bun', ['bun.lock', 'bun.lockb']],
    ['pnpm', ['pnpm-lock.yaml']],
    ['yarn', ['yarn.lock']],
    ['npm', ['package-lock.json']],
  ]

  for (const pasta of [raiz, ...apps.filter(app => app.tipo === 'node').map(app => join(raiz, app.pasta))]) {
    const achado = travas.find(([, arquivos]) => arquivos.some(arquivo => existsSync(join(pasta, arquivo))))
    if (achado) {
      return achado[0]
    }
  }

  return 'npm'
}

/**
 * Serviços da config a partir dos apps. Um app Laravel vira API + fila + scheduler (+ Horizon,
 * Reverb e Pail se o composer tiver); nomes curtos (server, web) quando há um app de cada tipo.
 *
 * @param {App[]} apps
 * @returns {Record<string, { preset: string, cwd: string }>}
 */
export function servicosDosApps(apps) {
  const servicos = {}
  const contar = tipo => apps.filter(app => app.tipo === tipo).length
  const nomeLivre = desejado => {
    let nome = desejado
    for (let i = 2; servicos[nome]; i++) {
      nome = `${desejado}-${i}`
    }

    return nome
  }
  const prefixo = app => (contar(app.tipo) > 1 ? `${slug(basename(app.pasta))}-` : '')

  for (const app of apps) {
    const cwd = app.pasta
    const adicionar = (nome, preset) => {
      servicos[nomeLivre(`${prefixo(app)}${nome}`)] = { preset, cwd }
    }

    if (app.tipo === 'laravel') {
      const tem = pacote => app.pacotes.includes(`laravel/${pacote}`)
      adicionar('server', 'laravel')
      adicionar('queue', 'laravel:queue')
      if (tem('horizon')) {
        adicionar('horizon', 'laravel:horizon')
      }
      adicionar('schedule', 'laravel:schedule')
      if (tem('reverb')) {
        adicionar('reverb', 'laravel:reverb')
      }
      if (tem('pail')) {
        adicionar('logs', 'laravel:pail')
      }
    } else if (app.tipo === 'node') {
      servicos[nomeLivre(contar('node') > 1 ? slug(basename(app.pasta === '.' ? 'web' : app.pasta)) : 'web')] = { preset: app.preset, cwd }
    } else {
      servicos[nomeLivre(contar('dotnet') > 1 ? slug(basename(app.pasta)) : contar('laravel') ? 'dotnet' : 'api')] = { preset: 'dotnet', cwd }
    }
  }

  return servicos
}

/** "Meu App" → "meu-app" (nome de serviço válido: começa com letra). */
export function slug(texto) {
  const limpo = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return /^[a-z]/.test(limpo) ? limpo : `app-${limpo || 'x'}`
}

function subpastas(pasta) {
  try {
    return readdirSync(pasta).filter(nome => !IGNORADAS.has(nome) && !nome.startsWith('.') && statSync(join(pasta, nome)).isDirectory())
  } catch {
    return []
  }
}

function arquivosDe(pasta) {
  try {
    return readdirSync(pasta)
  } catch {
    return []
  }
}
