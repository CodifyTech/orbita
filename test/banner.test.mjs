import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOGO_PADRAO, exibirBanner, montarLinhaCompacta, montarLinhaDoComando } from '../src/banner.mjs'
import { criarEstilo } from '../src/ui/estilo.mjs'
import { TERMINAL_SIMPLES, criarSaidaFalsa } from './_ajudantes/saida-falsa.mjs'

const config = { nome: 'FoodOS', slogan: 'Gestão e PDV', logo: null }
const estilo = criarEstilo({ usaCor: false })

const exibir = async opcoes => {
  const saida = criarSaidaFalsa()
  await exibirBanner({ config, terminal: TERMINAL_SIMPLES, saida, env: {}, ...opcoes })

  return saida.texto()
}

describe('exibirBanner', () => {
  it('mostra logo, assinatura, slogan, site e a linha do comando', async () => {
    const texto = await exibir({ comando: 'dev', descricao: 'Sobe tudo' })

    for (const esperado of [LOGO_PADRAO[0], 'desenvolvido e mantido por CodifyTech', 'Gestão e PDV', 'https://codifytech.com.br']) {
      assert.ok(texto.includes(esperado), `faltou: ${esperado}`)
    }
    assert.ok(texto.includes('▶ codify dev  —  Sobe tudo'))
  })

  it('usa o logo do projeto quando a config tem um', async () => {
    const texto = await exibir({ config: { ...config, logo: ['MEU LOGO'] } })

    assert.ok(texto.includes('MEU LOGO'))
    assert.ok(!texto.includes(LOGO_PADRAO[0]))
  })

  it('sem comando, não mostra a linha ▶', async () => {
    assert.ok(!(await exibir({ comando: '' })).includes('▶'))
  })

  it('sem slogan, mostra só o site', async () => {
    const texto = await exibir({ config: { ...config, slogan: '' } })

    assert.ok(texto.includes('  https://codifytech.com.br\n'))
    assert.ok(!texto.includes('·'))
  })

  it('mostra como o script foi chamado quando `execucao` é informada', async () => {
    assert.ok((await exibir({ comando: 'lint', execucao: 'bun run lint' })).includes('▶ bun run lint'))
  })

  it('ORBITA_BANNER=compacto escreve uma linha só', async () => {
    const texto = await exibir({ comando: 'dev', env: { ORBITA_BANNER: 'compacto' } })

    assert.equal(texto.trim().split('\n').length, 1)
    assert.ok(texto.includes('CodifyTech › dev'))
    assert.ok(texto.includes('FoodOS'))
  })

  it('só mexe no cursor quando anima', async () => {
    assert.ok(!(await exibir({ comando: 'dev' })).includes('\x1b[?25'))
  })
})

describe('montarLinhaDoComando / montarLinhaCompacta', () => {
  it('omite o travessão quando não há descrição', () => {
    const [linha] = montarLinhaDoComando(estilo, { execucao: 'codify dev' })

    assert.equal(linha, '  ▶ codify dev')
  })

  it('a compacta junta nome do projeto e site', () => {
    assert.equal(montarLinhaCompacta(estilo, { comando: 'dev', nome: 'X' }), '  ▶ CodifyTech › dev  X · https://codifytech.com.br')
  })
})
