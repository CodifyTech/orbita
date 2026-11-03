import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'
import { encerrarFilho, encerrarFilhoJa, estaVivo, iniciarFilho } from '../../src/ambiente/filhos.mjs'

const vivo = (pid = 42) => ({ pid, exitCode: null, signalCode: null })

describe('iniciarFilho', () => {
  it('roda com shell e pipe; fora do Windows vira líder de grupo', () => {
    const chamadas = []
    const criarProcesso = (comando, opcoes) => chamadas.push({ comando, opcoes })
    iniciarFilho('npm run dev', { cwd: '/app', env: { A: '1' }, plataforma: 'linux', criarProcesso })
    iniciarFilho('npm run dev', { plataforma: 'win32', criarProcesso })
    assert.equal(chamadas[0].comando, 'npm run dev')
    assert.deepEqual(chamadas[0].opcoes, {
      cwd: '/app',
      env: { A: '1' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: true,
    })
    assert.equal(chamadas[1].opcoes.detached, false)
  })
})

describe('estaVivo', () => {
  it('vivo só com PID e sem código de saída nem sinal', () => {
    assert.equal(estaVivo(vivo()), true)
    assert.equal(estaVivo({ ...vivo(), exitCode: 0 }), false)
    assert.equal(estaVivo({ ...vivo(), signalCode: 'SIGTERM' }), false)
    assert.equal(estaVivo({ pid: undefined, exitCode: null, signalCode: null }), false)
    assert.equal(estaVivo(null), false)
  })
})

describe('encerrarFilho', () => {
  it('Windows: taskkill /T /F na árvore', () => {
    const chamadas = []
    const criarProcesso = (comando, args) => {
      chamadas.push([comando, ...args])

      return new EventEmitter()
    }
    encerrarFilho(vivo(42), { plataforma: 'win32', criarProcesso })
    assert.deepEqual(chamadas, [['taskkill', '/PID', '42', '/T', '/F']])
  })

  it('Linux/macOS: SIGTERM no grupo e, se ainda vivo depois da espera, SIGKILL', () => {
    const sinais = []
    const agendados = []
    const filho = vivo(42)
    const opcoes = {
      plataforma: 'linux',
      sinalizar: (pid, sinal) => sinais.push([pid, sinal]),
      agendar: (fn, ms) => agendados.push({ fn, ms }) && {},
    }
    encerrarFilho(filho, opcoes)
    assert.deepEqual(sinais, [[-42, 'SIGTERM']])
    assert.equal(agendados[0].ms, 4000)
    agendados[0].fn()
    assert.deepEqual(sinais, [
      [-42, 'SIGTERM'],
      [-42, 'SIGKILL'],
    ])
  })

  it('não insiste se o processo saiu a tempo; sem PID não faz nada', () => {
    const sinais = []
    const agendados = []
    const filho = vivo(7)
    encerrarFilho(filho, { plataforma: 'linux', sinalizar: (...a) => sinais.push(a), agendar: fn => agendados.push(fn) && {} })
    filho.exitCode = 0
    agendados[0]()
    assert.equal(sinais.length, 1)
    encerrarFilho({ pid: undefined }, { plataforma: 'linux', sinalizar: (...a) => sinais.push(a) })
    assert.equal(sinais.length, 1)
  })

  it('erro ao sinalizar (processo já morreu) não lança', () => {
    const sinalizar = () => {
      throw new Error('ESRCH')
    }
    assert.doesNotThrow(() => encerrarFilho(vivo(), { plataforma: 'linux', sinalizar, agendar: () => ({}) }))
  })
})

describe('encerrarFilhoJa', () => {
  it('síncrono: taskkill no Windows, SIGKILL no grupo fora dele; morto é ignorado', () => {
    const chamadas = []
    encerrarFilhoJa(vivo(9), { plataforma: 'win32', rodarSincrono: (c, a) => chamadas.push([c, ...a]) })
    encerrarFilhoJa(vivo(9), { plataforma: 'darwin', sinalizar: (pid, sinal) => chamadas.push([pid, sinal]) })
    encerrarFilhoJa({ ...vivo(9), exitCode: 1 }, { plataforma: 'darwin', sinalizar: (pid, sinal) => chamadas.push([pid, sinal]) })
    assert.deepEqual(chamadas, [
      ['taskkill', '/PID', '9', '/T', '/F'],
      [-9, 'SIGKILL'],
    ])
  })
})
