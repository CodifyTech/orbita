import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lerArgumentos } from '../src/argumentos.mjs'

describe('lerArgumentos', () => {
  it('separa posicionais de opções', () => {
    assert.deepEqual(lerArgumentos(['dev', '--only=server,web', '--no-restart', '-v']), {
      posicionais: ['dev'],
      opcoes: { only: 'server,web', 'no-restart': true, v: true },
    })
  })

  it('mantém o "=" dentro do valor', () => {
    assert.deepEqual(lerArgumentos(['--cmd=a=b']).opcoes, { cmd: 'a=b' })
  })

  it('trata tudo depois de "--" como posicional', () => {
    assert.deepEqual(lerArgumentos(['dev', '--', '--only=x', '-f']).posicionais, ['dev', '--only=x', '-f'])
  })

  it('não confunde "-" sozinho com opção', () => {
    assert.deepEqual(lerArgumentos(['-']).posicionais, ['-'])
  })

  it('aceita lista vazia', () => {
    assert.deepEqual(lerArgumentos([]), { posicionais: [], opcoes: {} })
  })
})
