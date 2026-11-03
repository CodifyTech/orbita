import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { criarEstilo } from '../../src/ui/estilo.mjs'
import { formatarTempo } from '../../src/ui/spinner.mjs'
import { iconeDoEstado, linhaDeDetalhe, semAnsi } from '../../src/ui/tabela.mjs'

const estilo = criarEstilo({ usaCor: false })

describe('linhaDeDetalhe', () => {
  it('preenche com pontos até a largura', () => {
    const linha = linhaDeDetalhe('APP_KEY', 'definida', { largura: 30, estilo })

    assert.equal(linha, '  APP_KEY ........... definida')
    assert.equal(linha.length, 30)
  })

  it('mede sem contar as cores', () => {
    const colorido = criarEstilo({ usaCor: true })
    const linha = linhaDeDetalhe(colorido.verde('APP_KEY'), 'definida', { largura: 30, estilo: colorido })

    assert.equal(semAnsi(linha), '  APP_KEY ........... definida')
  })

  it('texto maior que a largura fica com um espaço só', () => {
    assert.equal(linhaDeDetalhe('a'.repeat(20), 'b'.repeat(20), { largura: 30, estilo }), `  ${'a'.repeat(20)} ${'b'.repeat(20)}`)
  })
})

describe('iconeDoEstado', () => {
  it('✓ ! ✗', () => {
    assert.equal(iconeDoEstado('ok', estilo), '✓')
    assert.equal(iconeDoEstado('aviso', estilo), '!')
    assert.equal(iconeDoEstado('erro', estilo), '✗')
  })
})

describe('formatarTempo', () => {
  it('nunca mostra 0s e passa para minutos', () => {
    assert.equal(formatarTempo(10), '1s')
    assert.equal(formatarTempo(4_400), '4s')
    assert.equal(formatarTempo(65_000), '1m05s')
  })
})
