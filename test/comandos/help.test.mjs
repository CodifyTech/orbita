import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agruparScripts, casaComFiltro, montarAjuda } from '../../src/comandos/help.mjs'
import { COMANDOS } from '../../src/comandos/index.mjs'
import { defineConfig } from '../../src/config/define-config.mjs'
import { criarEstilo } from '../../src/ui/estilo.mjs'

const estilo = criarEstilo({ usaCor: false })

const projeto = (extra = {}) => ({
  config: defineConfig({
    nome: 'FoodOS',
    gerenciador: 'bun',
    servicos: { server: { preset: 'laravel:server' }, web: { preset: 'vite' } },
  }),
  scripts: { dev: 'codify dev', 'dev:backend': 'codify dev --except=web', 'test:api': 'x', lint: 'y', deploy: 'z', help: 'codify help' },
  descricoes: { dev: 'Sobe tudo', 'test:api': 'Testes da API' },
  ...extra,
})

const ajuda = (filtro, p = projeto()) => montarAjuda({ projeto: p, comandos: COMANDOS, estilo, filtro }).join('\n')

describe('casaComFiltro', () => {
  it('"dev" casa com dev e dev:*, mas não com devops', () => {
    assert.ok(casaComFiltro('dev', 'dev'))
    assert.ok(casaComFiltro('dev:api', 'dev'))
    assert.ok(!casaComFiltro('devops', 'dev'))
  })

  it('sem filtro tudo casa', () => {
    assert.ok(casaComFiltro('qualquer', undefined))
  })
})

describe('agruparScripts', () => {
  const nomes = ['setup', 'dev', 'dev:api', 'test:web', 'lint', 'build:agente', 'verificar', 'deploy']

  it('separa em ambiente local, qualidade e outros', () => {
    assert.deepEqual(agruparScripts(nomes), {
      grupos: [
        { titulo: 'Ambiente local', nomes: ['setup', 'dev', 'dev:api'] },
        { titulo: 'Qualidade', nomes: ['test:web', 'lint', 'build:agente', 'verificar'] },
      ],
      outros: ['deploy'],
    })
  })

  it('com filtro, mostra só o que casa e esconde "outros"', () => {
    assert.deepEqual(agruparScripts(nomes, 'dev'), {
      grupos: [{ titulo: 'Ambiente local', nomes: ['dev', 'dev:api'] }],
      outros: [],
    })
  })
})

describe('montarAjuda', () => {
  it('lista os comandos do Órbita sem os ocultos', () => {
    const texto = ajuda()

    assert.match(texto, /codify dev\s+Sobe os serviços/)
    assert.match(texto, /codify help/)
    assert.ok(!texto.includes('codify banner'))
  })

  it('lista os scripts do projeto com o gerenciador configurado, sem o próprio help', () => {
    const texto = ajuda()

    assert.match(texto, /bun run dev\s+Sobe tudo/)
    assert.match(texto, /bun run test:api\s+Testes da API/)
    assert.ok(!texto.includes('bun run help'))
  })

  it('script sem descrição é apontado', () => {
    assert.match(ajuda(), /bun run lint\s+\(sem descrição/)
  })

  it('"help dev" mostra só dev e dev:*, com as dicas', () => {
    const texto = ajuda('dev')

    assert.ok(texto.includes('bun run dev:backend'))
    assert.ok(!texto.includes('bun run lint'))
    assert.ok(texto.includes('Dicas'))
    assert.ok(texto.includes('--only=server'))
  })

  it('filtro que não casa com nada avisa', () => {
    assert.match(ajuda('zzz'), /Nenhum comando ou script começa com "zzz"/)
  })

  it('dica do Laravel só aparece se algum serviço usa preset laravel', () => {
    assert.match(ajuda(), /DEV_EXCEPT/)

    const semLaravel = projeto({ config: defineConfig({ nome: 'X', servicos: { web: { preset: 'vite' } } }) })
    assert.ok(!ajuda(undefined, semLaravel).includes('DEV_EXCEPT'))
  })

  it('projeto sem package.json ainda mostra os comandos do Órbita', () => {
    const texto = ajuda(undefined, projeto({ scripts: {}, descricoes: {} }))

    assert.ok(texto.includes('Comandos do Órbita'))
    assert.ok(!texto.includes('Qualidade'))
  })
})
