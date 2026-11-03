import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { abrirNoPadrao, comandoDeAbrir, comandoDeCopiar, conteudoParaCopiar, copiarParaAreaDeTransferencia } from '../../src/ambiente/sistema.mjs'

/** criarProcesso falso: guarda a chamada e termina com o evento escolhido. */
function processoFalso(evento, valor) {
  const chamadas = []
  const criar = (comando, args, opcoes) => {
    const processo = Object.assign(new EventEmitter(), { stdin: new PassThrough(), unref() {} })
    let recebido = Buffer.alloc(0)
    processo.stdin.on('data', d => (recebido = Buffer.concat([recebido, Buffer.from(d)])))
    chamadas.push({ comando, args, opcoes, recebido: () => recebido })
    setImmediate(() => processo.emit(evento, valor))

    return processo
  }

  return { criar, chamadas }
}

describe('comandoDeCopiar', () => {
  it('clip, pbcopy, wl-copy ou xclip conforme o sistema', () => {
    assert.deepEqual(comandoDeCopiar({ plataforma: 'win32' }), ['clip', []])
    assert.deepEqual(comandoDeCopiar({ plataforma: 'darwin' }), ['pbcopy', []])
    assert.deepEqual(comandoDeCopiar({ plataforma: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } }), ['wl-copy', []])
    assert.deepEqual(comandoDeCopiar({ plataforma: 'linux', env: {} }), ['xclip', ['-selection', 'clipboard']])
  })

  it('no Windows o texto vai em UTF-16 com BOM (o clip entende os acentos)', () => {
    const conteudo = conteudoParaCopiar('ação', 'win32')
    assert.ok(Buffer.isBuffer(conteudo))
    assert.deepEqual([...conteudo.subarray(0, 2)], [0xff, 0xfe])
    assert.equal(conteudo.subarray(2).toString('utf16le'), 'ação')
    assert.equal(conteudoParaCopiar('ação', 'linux'), 'ação')
  })
})

describe('comandoDeAbrir', () => {
  it('start do cmd no Windows, open no macOS, xdg-open no Linux', () => {
    assert.deepEqual(comandoDeAbrir('http://x', 'win32'), ['cmd', ['/d', '/s', '/c', 'start "" "http://x"'], { windowsVerbatimArguments: true }])
    assert.deepEqual(comandoDeAbrir('http://x', 'darwin'), ['open', ['http://x'], {}])
    assert.deepEqual(comandoDeAbrir('/tmp/a.log', 'linux'), ['xdg-open', ['/tmp/a.log'], {}])
  })
})

describe('copiar e abrir (processo falso)', () => {
  it('copiar escreve no stdin do programa e diz se deu certo', async () => {
    const { criar, chamadas } = processoFalso('close', 0)
    assert.equal(await copiarParaAreaDeTransferencia('olá', { plataforma: 'darwin', criarProcesso: criar }), true)
    assert.equal(chamadas[0].comando, 'pbcopy')
    assert.equal(chamadas[0].recebido().toString(), 'olá')
  })

  it('programa ausente vira false, sem lançar', async () => {
    const { criar } = processoFalso('error', new Error('ENOENT'))
    assert.equal(await copiarParaAreaDeTransferencia('x', { plataforma: 'linux', env: {}, criarProcesso: criar }), false)
    assert.equal(await abrirNoPadrao('http://x', { plataforma: 'linux', criarProcesso: criar }), false)
  })

  it('abrir não espera o programa fechar e não prende o painel', async () => {
    const { criar, chamadas } = processoFalso('spawn')
    assert.equal(await abrirNoPadrao('http://x', { plataforma: 'linux', criarProcesso: criar }), true)
    assert.equal(chamadas[0].opcoes.detached, true)
    assert.equal(chamadas[0].opcoes.stdio, 'ignore')
  })
})
