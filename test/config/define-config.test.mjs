import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defineConfig } from '../../src/config/define-config.mjs'
import { ErroDeConfig } from '../../src/erros.mjs'

const problemasDe = entrada => {
  try {
    defineConfig(entrada)
  } catch (erro) {
    assert.ok(erro instanceof ErroDeConfig, 'deveria ser ErroDeConfig')

    return erro.problemas
  }
  assert.fail('deveria ter lançado ErroDeConfig')
}

describe('defineConfig', () => {
  it('aceita só o nome e preenche os padrões', () => {
    assert.deepEqual(defineConfig({ nome: 'FoodOS' }), {
      nome: 'FoodOS',
      slogan: '',
      logo: null,
      gerenciador: 'npm',
      servicos: {},
      descricoes: {},
    })
  })

  it('normaliza os serviços com cwd "." e o que faltar como null', () => {
    const { servicos } = defineConfig({
      nome: 'X',
      servicos: {
        server: { preset: 'laravel', cwd: 'backend', porta: 8000, health: '/up' },
        web: { cmd: 'bun run dev' },
      },
    })

    assert.deepEqual(servicos.server, { preset: 'laravel', cwd: 'backend', porta: 8000, cmd: null, health: '/up' })
    assert.deepEqual(servicos.web, { preset: null, cwd: '.', porta: null, cmd: 'bun run dev', health: null })
  })

  it('mantém a ordem dos serviços (é a ordem das abas)', () => {
    const { servicos } = defineConfig({
      nome: 'X',
      servicos: { web: { preset: 'vite' }, api: { preset: 'laravel' }, fila: { preset: 'laravel:queue' } },
    })

    assert.deepEqual(Object.keys(servicos), ['web', 'api', 'fila'])
  })

  it('é idempotente: revalidar uma config já normalizada não muda nada', () => {
    const uma = defineConfig({ nome: 'X', servicos: { web: { preset: 'vite', porta: 5173 } } })

    assert.deepEqual(defineConfig(uma), uma)
  })

  it('exige o nome', () => {
    assert.match(problemasDe({}).join('\n'), /"nome" é obrigatório/)
  })

  it('rejeita chave desconhecida (pega erro de digitação)', () => {
    const problemas = problemasDe({ nome: 'X', servico: {} })

    assert.match(problemas[0], /chave desconhecida "servico"/)
  })

  it('rejeita gerenciador fora da lista', () => {
    assert.match(problemasDe({ nome: 'X', gerenciador: 'deno' }).join('\n'), /"gerenciador" precisa ser um destes/)
  })

  it('exige preset ou cmd em cada serviço', () => {
    assert.match(problemasDe({ nome: 'X', servicos: { web: { cwd: 'frontend' } } }).join('\n'), /informe "preset".*"cmd"/)
  })

  it('valida a porta', () => {
    for (const porta of [0, 70000, 80.5, '8000']) {
      assert.match(problemasDe({ nome: 'X', servicos: { web: { preset: 'vite', porta } } }).join('\n'), /"porta"/)
    }
  })

  it('rejeita nome de serviço inválido', () => {
    assert.match(problemasDe({ nome: 'X', servicos: { '1web': { preset: 'vite' } } }).join('\n'), /nome inválido/)
  })

  it('rejeita logo que não é lista de textos', () => {
    assert.match(problemasDe({ nome: 'X', logo: 'FOODOS' }).join('\n'), /"logo"/)
  })

  it('rejeita descrições que não são texto', () => {
    assert.match(problemasDe({ nome: 'X', descricoes: { dev: 42 } }).join('\n'), /"descricoes"/)
  })

  it('rejeita o que não é objeto', () => {
    for (const entrada of [null, 'x', [], 5]) {
      assert.match(problemasDe(entrada)[0], /precisa ser um objeto/)
    }
  })

  it('lista todos os problemas de uma vez', () => {
    const problemas = problemasDe({ gerenciador: 'deno', servicos: { web: {} } })

    assert.equal(problemas.length, 3)
  })
})
