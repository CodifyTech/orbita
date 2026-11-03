import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CORES, criarEstilo, misturar } from '../../src/ui/estilo.mjs'
import { detectarTerminal } from '../../src/ui/terminal.mjs'

describe('criarEstilo', () => {
  it('sem cor, devolve o texto puro', () => {
    const estilo = criarEstilo({ usaCor: false })

    assert.equal(estilo.negrito('oi'), 'oi')
    assert.equal(estilo.rgb(CORES.AZUL, 'oi'), 'oi')
    assert.equal(estilo.degrade('degradê', CORES.AZUL, CORES.ROXO), 'degradê')
  })

  it('com cor, envolve em ANSI e fecha com reset', () => {
    const estilo = criarEstilo({ usaCor: true })

    assert.equal(estilo.verde('ok'), '\x1b[32mok\x1b[0m')
    assert.equal(estilo.rgb([1, 2, 3], 'x'), '\x1b[38;2;1;2;3mx\x1b[0m')
  })

  it('o degradê não pinta espaços', () => {
    const texto = criarEstilo({ usaCor: true }).degrade('a b', CORES.AZUL, CORES.ROXO)

    assert.ok(texto.includes('\x1b[0m \x1b['), 'o espaço fica entre as letras coloridas, sem cor própria')
  })
})

describe('misturar', () => {
  it('vai de uma cor à outra', () => {
    assert.deepEqual(misturar([0, 0, 0], [100, 200, 50], 0), [0, 0, 0])
    assert.deepEqual(misturar([0, 0, 0], [100, 200, 50], 1), [100, 200, 50])
    assert.deepEqual(misturar([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25])
  })
})

describe('detectarTerminal', () => {
  it('terminal de verdade usa cor e anima', () => {
    assert.deepEqual(detectarTerminal({ stdout: { isTTY: true }, env: {} }), { tty: true, usaCor: true, animar: true })
  })

  it('NO_COLOR tira a cor, CI tira a animação', () => {
    assert.equal(detectarTerminal({ stdout: { isTTY: true }, env: { NO_COLOR: '1' } }).usaCor, false)
    assert.equal(detectarTerminal({ stdout: { isTTY: true }, env: { CI: 'true' } }).animar, false)
  })

  it('sem TTY (pipe, arquivo) é texto puro', () => {
    assert.deepEqual(detectarTerminal({ stdout: {}, env: {} }), { tty: false, usaCor: false, animar: false })
  })
})
