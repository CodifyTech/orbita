import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { carregarProjeto } from '../../src/config/carregar-config.mjs'
import { encontrarRaiz, subirAte } from '../../src/config/raiz-do-projeto.mjs'
import { ErroDeConfig, ErroDeUso } from '../../src/erros.mjs'
import { criarProjetoTemporario } from '../_ajudantes/saida-falsa.mjs'

const CONFIG_VALIDA = `export default { nome: 'Projeto', gerenciador: 'bun', descricoes: { dev: 'da config' } }`

describe('encontrarRaiz', () => {
  it('prefere a pasta do orbita.config.mjs, mesmo rodando de uma subpasta', () => {
    const raiz = criarProjetoTemporario({ 'orbita.config.mjs': CONFIG_VALIDA, 'backend/app/.gitkeep': '' })
    const resultado = encontrarRaiz(join(raiz, 'backend', 'app'))

    assert.equal(resultado.raiz, raiz)
    assert.equal(resultado.arquivoDeConfig, join(raiz, 'orbita.config.mjs'))
  })

  it('sem config, usa a pasta do package.json mais próximo', () => {
    const raiz = criarProjetoTemporario({ 'package.json': '{}', 'src/a.js': '' })
    const resultado = encontrarRaiz(join(raiz, 'src'), caminho => caminho === join(raiz, 'package.json'))

    assert.equal(resultado.raiz, raiz)
    assert.equal(resultado.arquivoDeConfig, null)
  })

  it('sem nada, usa a própria pasta', () => {
    const resultado = encontrarRaiz('/pasta/qualquer', () => false)

    assert.equal(resultado.arquivoDeConfig, null)
  })
})

describe('subirAte', () => {
  it('devolve null ao chegar na raiz do disco sem achar', () => {
    assert.equal(subirAte(process.cwd(), () => false), null)
  })
})

describe('carregarProjeto', () => {
  it('importa o orbita.config.mjs e junta as descrições (config vence o package.json)', async () => {
    const raiz = criarProjetoTemporario({
      'orbita.config.mjs': CONFIG_VALIDA,
      'package.json': JSON.stringify({
        scripts: { dev: 'codify dev', lint: 'eslint .' },
        descricoes: { dev: 'do package', lint: 'do package' },
      }),
    })

    const projeto = await carregarProjeto(raiz)

    assert.equal(projeto.raiz, raiz)
    assert.equal(projeto.config.nome, 'Projeto')
    assert.equal(projeto.config.gerenciador, 'bun')
    assert.deepEqual(projeto.scripts, { dev: 'codify dev', lint: 'eslint .' })
    assert.deepEqual(projeto.descricoes, { dev: 'da config', lint: 'do package' })
  })

  it('sem config, usa o nome do package.json', async () => {
    const raiz = criarProjetoTemporario({ 'package.json': JSON.stringify({ name: 'meu-app' }) })
    const projeto = await carregarProjeto(raiz)

    assert.equal(projeto.arquivoDeConfig, null)
    assert.equal(projeto.config.nome, 'meu-app')
  })

  it('aponta o arquivo quando a config é inválida', async () => {
    const raiz = criarProjetoTemporario({ 'orbita.config.mjs': `export default { gerenciador: 'deno' }` })

    await assert.rejects(carregarProjeto(raiz), erro => {
      assert.ok(erro instanceof ErroDeConfig)
      assert.match(erro.message, /orbita\.config\.mjs/)

      return true
    })
  })

  it('exige export default', async () => {
    const raiz = criarProjetoTemporario({ 'orbita.config.mjs': `export const nome = 'x'` })

    await assert.rejects(carregarProjeto(raiz), /export default/)
  })

  it('explica quando o pacote não está instalado no projeto', async () => {
    const raiz = criarProjetoTemporario({
      'orbita.config.mjs': `import { defineConfig } from '@codifytech/orbita'\nexport default defineConfig({ nome: 'x' })`,
    })

    await assert.rejects(carregarProjeto(raiz), erro => {
      assert.ok(erro instanceof ErroDeUso)
      assert.match(erro.dica, /npm install/)

      return true
    })
  })

  it('reclama de package.json quebrado', async () => {
    const raiz = criarProjetoTemporario({ 'package.json': '{ isto não é json' })

    await assert.rejects(carregarProjeto(raiz), /não é um JSON válido/)
  })
})
