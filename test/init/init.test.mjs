import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { executarCli } from '../../src/cli.mjs'
import { detectarApps, detectarGerenciador, servicosDosApps, slug } from '../../src/init/detectar.mjs'
import { acrescentarScripts, scriptsSugeridos, textoDaConfig } from '../../src/init/gerar.mjs'
import { criarProjetoTemporario, criarSaidaFalsa } from '../_ajudantes/saida-falsa.mjs'

const LARAVEL = {
  'backend/artisan': '',
  'backend/composer.json': JSON.stringify({ require: { 'laravel/framework': '^13', 'laravel/horizon': '^5', 'laravel/reverb': '^1' } }),
  // O Laravel tem package.json com Vite (a welcome page): não pode virar um app Vite.
  'backend/package.json': JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^7' } }),
}
const VITE = { 'frontend/package.json': JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^7', vue: '^3' } }) }

describe('detectarApps', () => {
  it('acha Laravel e Vite pelo conteúdo, sem descer dentro de um app', () => {
    const raiz = criarProjetoTemporario({ ...LARAVEL, ...VITE, 'frontend/src/package.json': JSON.stringify({ scripts: { dev: 'x' }, dependencies: { vite: '1' } }) })

    assert.deepEqual(detectarApps(raiz), [
      { tipo: 'laravel', pacotes: ['laravel/framework', 'laravel/horizon', 'laravel/reverb'], pasta: 'backend' },
      { tipo: 'node', preset: 'vite', pasta: 'frontend' },
    ])
  })

  it('reconhece Nuxt, Next, Astro e Ionic antes do Vite, e .NET Web', () => {
    const raiz = criarProjetoTemporario({
      'apps/loja/package.json': JSON.stringify({ scripts: { dev: 'nuxt dev' }, dependencies: { nuxt: '3', vite: '5' } }),
      'apps/app/package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { '@ionic/vue': '8', vite: '5' } }),
      'api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>',
      'lib/Lib.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
    })
    const porPasta = Object.fromEntries(detectarApps(raiz).map(app => [app.pasta, app.preset ?? app.tipo]))

    assert.deepEqual(porPasta, { api: 'dotnet', 'apps/app': 'ionic', 'apps/loja': 'nuxt' })
  })

  it('para no segundo nível e ignora node_modules', () => {
    const raiz = criarProjetoTemporario({
      'a/b/c/package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vite: '1' } }),
      'node_modules/x/package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vite: '1' } }),
    })

    assert.deepEqual(detectarApps(raiz), [])
  })

  it('package.json sem script dev não é app', () => {
    assert.deepEqual(detectarApps(criarProjetoTemporario({ 'web/package.json': JSON.stringify({ dependencies: { vite: '1' } }) })), [])
  })
})

describe('servicosDosApps', () => {
  it('Laravel vira API, fila, Horizon/Reverb conforme o composer, e o Vite vira "web"', () => {
    const raiz = criarProjetoTemporario({ ...LARAVEL, ...VITE })

    assert.deepEqual(servicosDosApps(detectarApps(raiz)), {
      server: { preset: 'laravel', cwd: 'backend' },
      queue: { preset: 'laravel:queue', cwd: 'backend' },
      horizon: { preset: 'laravel:horizon', cwd: 'backend' },
      schedule: { preset: 'laravel:schedule', cwd: 'backend' },
      reverb: { preset: 'laravel:reverb', cwd: 'backend' },
      web: { preset: 'vite', cwd: 'frontend' },
    })
  })

  it('vários apps do mesmo tipo ganham o nome da pasta', () => {
    const servicos = servicosDosApps([
      { tipo: 'node', preset: 'vite', pasta: 'apps/painel' },
      { tipo: 'node', preset: 'nuxt', pasta: 'apps/site' },
    ])

    assert.deepEqual(Object.keys(servicos), ['painel', 'site'])
  })

  it('slug gera nome de serviço válido', () => {
    assert.equal(slug('Área do Cliente'), 'area-do-cliente')
    assert.equal(slug('2024'), 'app-2024')
  })
})

describe('detectarGerenciador', () => {
  it('pelo lockfile da raiz; senão, pelo dos apps; senão npm', () => {
    assert.equal(detectarGerenciador(criarProjetoTemporario({ 'bun.lock': '' })), 'bun')
    assert.equal(detectarGerenciador(criarProjetoTemporario({ 'web/pnpm-lock.yaml': '' }), [{ tipo: 'node', pasta: 'web' }]), 'pnpm')
    assert.equal(detectarGerenciador(criarProjetoTemporario()), 'npm')
  })
})

describe('gerar', () => {
  it('textoDaConfig é uma config válida que importa o defineConfig', async () => {
    const texto = textoDaConfig({ nome: "Loja d'Ana", gerenciador: 'bun', servicos: { web: { preset: 'vite', cwd: 'frontend' } }, descricoes: { 'dev:backend': 'x' } })

    assert.match(texto, /import \{ defineConfig \} from '@codifytech\/orbita'/)
    assert.match(texto, /nome: 'Loja d\\'Ana'/)
    assert.match(texto, /'dev:backend': 'x'/)
  })

  it('dev:backend só com backend e frontend', () => {
    assert.equal(scriptsSugeridos({ server: { preset: 'laravel' }, web: { preset: 'vite' } })['dev:backend'].comando, 'codify dev --except=web')
    assert.equal(scriptsSugeridos({ web: { preset: 'vite' } })['dev:backend'], undefined)
  })

  it('acrescentarScripts nunca troca script existente e mantém a indentação', () => {
    const { texto, adicionados } = acrescentarScripts('{\n    "name": "x",\n    "scripts": { "dev": "vite" }\n}\n', { dev: 'codify dev', setup: 'codify setup' }, 'x')

    assert.deepEqual(adicionados, ['setup'])
    assert.equal(JSON.parse(texto).scripts.dev, 'vite')
    assert.match(texto, /^ {4}"name"/m)
  })

  it('sem package.json, cria um', () => {
    assert.deepEqual(JSON.parse(acrescentarScripts(null, { dev: 'codify dev' }, 'loja').texto), { name: 'loja', private: true, scripts: { dev: 'codify dev' } })
  })
})

describe('codify init (de ponta a ponta)', () => {
  it('gera a config e os scripts; a segunda vez recusa sem --force', async () => {
    const raiz = criarProjetoTemporario({ ...LARAVEL, ...VITE, 'package.json': JSON.stringify({ name: 'loja', scripts: { lint: 'eslint .' } }), 'bun.lock': '' })
    const stderr = criarSaidaFalsa()
    const rodar = argv => executarCli(argv, { cwd: raiz, stdout: criarSaidaFalsa(), stderr, env: {} })

    assert.equal(await rodar(['init']), 0)

    const config = readFileSync(join(raiz, 'orbita.config.mjs'), 'utf8')
    const pacote = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))

    assert.match(config, /gerenciador: 'bun'/)
    assert.match(config, /server: \{ preset: 'laravel', cwd: 'backend' \}/)
    assert.equal(pacote.scripts.lint, 'eslint .')
    assert.equal(pacote.scripts.dev, 'codify dev')
    assert.equal(pacote.scripts['dev:backend'], 'codify dev --except=web')

    assert.equal(await rodar(['init']), 1)
    assert.match(stderr.texto(), /Já existe orbita\.config\.mjs/)
  })
})
