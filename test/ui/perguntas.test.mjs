import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { ErroCancelado } from '../../src/erros.mjs'
import { criarPerguntas } from '../../src/ui/perguntas.mjs'
import { criarEstilo } from '../../src/ui/estilo.mjs'
import { criarSaidaFalsa } from '../_ajudantes/saida-falsa.mjs'

const TECLAS = { enter: '\r', baixo: '\x1b[B', cima: '\x1b[A', apagar: '\x7f', ctrlC: '\x03' }

/** Cria as perguntas com um teclado falso e digita `teclas` logo depois que a pergunta abre. */
function comTeclado(...teclas) {
  const entrada = new PassThrough()
  const saida = criarSaidaFalsa()
  const perguntas = criarPerguntas({ entrada, saida, estilo: criarEstilo({ usaCor: false }) })
  const digitar = () => setImmediate(() => teclas.forEach(tecla => entrada.write(tecla)))

  return { perguntas, saida, digitar }
}

describe('criarPerguntas', () => {
  it('sem TTY não é interativo', () => {
    assert.equal(comTeclado().perguntas.interativo, false)
  })

  it('confirmar: Enter aceita o padrão; s/n respondem', async () => {
    for (const [teclas, padrao, esperado] of [
      [[TECLAS.enter], true, true],
      [[TECLAS.enter], false, false],
      [['s'], false, true],
      [['n'], true, false],
      [['x', 'y'], false, true],
    ]) {
      const { perguntas, digitar } = comTeclado(...teclas)
      digitar()
      assert.equal(await perguntas.confirmar('Continuar?', padrao), esperado)
    }
  })

  it('confirmar mostra a resposta no fim', async () => {
    const { perguntas, saida, digitar } = comTeclado('n')
    digitar()
    await perguntas.confirmar('Encerrar?')

    assert.match(saida.texto(), /✔ Encerrar\? Não/)
  })

  it('escolher: setas e Enter', async () => {
    const opcoes = [
      { valor: 'a', rotulo: 'Opção A' },
      { valor: 'b', rotulo: 'Opção B' },
      { valor: 'c', rotulo: 'Opção C' },
    ]
    const { perguntas, digitar } = comTeclado(TECLAS.baixo, TECLAS.baixo, TECLAS.cima, TECLAS.enter)
    digitar()

    assert.equal(await perguntas.escolher('Qual?', opcoes), 'b')
  })

  it('escolher: o número escolhe direto; o padrão é o selecionado de início', async () => {
    const opcoes = [
      { valor: 'a', rotulo: 'A' },
      { valor: 'b', rotulo: 'B' },
    ]
    const primeira = comTeclado('2')
    primeira.digitar()
    assert.equal(await primeira.perguntas.escolher('Qual?', opcoes), 'b')

    const segunda = comTeclado(TECLAS.enter)
    segunda.digitar()
    assert.equal(await segunda.perguntas.escolher('Qual?', opcoes, { padrao: 'b' }), 'b')
  })

  it('texto: digita, apaga e usa o padrão quando vazio', async () => {
    const digitado = comTeclado('l', 'o', 'j', 'x', TECLAS.apagar, 'a', TECLAS.enter)
    digitado.digitar()
    assert.equal(await digitado.perguntas.texto('Banco'), 'loja')

    const vazio = comTeclado(TECLAS.enter)
    vazio.digitar()
    assert.equal(await vazio.perguntas.texto('Host', { padrao: '127.0.0.1' }), '127.0.0.1')
  })

  it('texto: valida e só aceita depois de corrigir', async () => {
    const { perguntas, saida, digitar } = comTeclado('x', TECLAS.enter, TECLAS.apagar, '8', '0', TECLAS.enter)
    digitar()
    const porta = await perguntas.texto('Porta', { validar: valor => (/^\d+$/.test(valor) ? null : 'Só números.') })

    assert.equal(porta, '80')
    assert.match(saida.texto(), /Só números\./)
  })

  it('senha não mostra o que foi digitado', async () => {
    const { perguntas, saida, digitar } = comTeclado('s', 'e', 'g', 'r', 'e', 'd', 'o', TECLAS.enter)
    digitar()

    assert.equal(await perguntas.senha('Senha'), 'segredo')
    assert.ok(!saida.texto().includes('segredo'))
  })

  it('Ctrl+C cancela', async () => {
    const { perguntas, digitar } = comTeclado(TECLAS.ctrlC)
    digitar()

    await assert.rejects(perguntas.confirmar('Continuar?'), ErroCancelado)
  })
})
