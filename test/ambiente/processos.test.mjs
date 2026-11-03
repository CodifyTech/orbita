import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PADROES_DE_SESSAO,
  arvoreDe,
  encerrar,
  encerrarArvore,
  listarProcessos,
  nomeDoProcesso,
  raizDaSessao,
} from '../../src/ambiente/processos.mjs'

const proc = (pid, ppid, comando, nome = 'node') => [pid, { pid, ppid, nome, comando }]

// codify dev (100) → concurrently (101) → vite (102) e queue (103); 200 é um node qualquer.
const processos = new Map([
  proc(1, 0, 'init'),
  proc(100, 1, 'node /app/bin/codify.mjs dev --only=web'),
  proc(101, 100, 'node concurrently'),
  proc(102, 101, 'node vite --port 5173'),
  proc(103, 101, 'php artisan queue:listen', 'php'),
  proc(200, 1, 'node outro-servidor.js'),
])

/** Executor falso: guarda as chamadas e responde `ok`. */
const executorFalso = (resposta = { ok: true, saida: '', erro: '' }) => {
  const chamadas = []
  const executar = async (comando, args) => {
    chamadas.push([comando, ...args])

    return resposta
  }

  return { executar, chamadas }
}

describe('raizDaSessao', () => {
  it('sobe até o ancestral mais alto que é sessão do dev', () => {
    assert.equal(raizDaSessao(102, processos), 100)
    assert.equal(raizDaSessao(103, processos), 100)
  })

  it('a própria raiz é a raiz', () => {
    assert.equal(raizDaSessao(100, processos), 100)
  })

  it('processo que não pertence a nenhuma sessão devolve null', () => {
    assert.equal(raizDaSessao(200, processos), null)
  })

  it('PID desconhecido devolve null', () => {
    assert.equal(raizDaSessao(9999, processos), null)
  })

  it('não entra em loop se a árvore tiver ciclo', () => {
    const ciclo = new Map([proc(1, 2, 'node a'), proc(2, 1, 'node b')])

    assert.equal(raizDaSessao(1, ciclo), null)
  })

  it('reconhece as formas de iniciar o dev (codify, monitor do FoodOS, artisan)', () => {
    const casa = comando => PADROES_DE_SESSAO.some(padrao => padrao.test(comando))

    assert.ok(casa('node C:\\app\\node_modules\\@codifytech\\orbita\\bin\\codify.mjs dev'))
    assert.ok(casa('cmd /c codify dev --only=x'))
    assert.ok(casa('node monitor.mjs --except=web'))
    assert.ok(casa('php artisan foodos:dev'))
    assert.ok(casa('php artisan dev'))
    assert.ok(!casa('node codify.mjs parar'))
    assert.ok(!casa('php artisan device:list'))
  })
})

describe('arvoreDe', () => {
  it('lista o processo e todos os descendentes, pai primeiro', () => {
    assert.deepEqual(arvoreDe(100, processos), [100, 101, 102, 103])
  })

  it('processo sem filhos é só ele', () => {
    assert.deepEqual(arvoreDe(200, processos), [200])
  })
})

describe('encerrar / encerrarArvore', () => {
  it('no Windows usa taskkill com /T /F', async () => {
    const { executar, chamadas } = executorFalso()

    assert.equal(await encerrar(100, { executar, plataforma: 'win32' }), true)
    assert.deepEqual(chamadas, [['taskkill', '/PID', '100', '/T', '/F']])
  })

  it('no Linux usa kill', async () => {
    const { executar, chamadas } = executorFalso()

    await encerrar(100, { executar, plataforma: 'linux' })
    assert.deepEqual(chamadas, [['kill', '100']])
  })

  it('no Linux a árvore vai num kill só, pai antes dos filhos', async () => {
    const { executar, chamadas } = executorFalso()

    await encerrarArvore(100, processos, { executar, plataforma: 'linux' })
    assert.deepEqual(chamadas, [['kill', '100', '101', '102', '103']])
  })

  it('no Windows a árvore é o taskkill /T', async () => {
    const { executar, chamadas } = executorFalso()

    await encerrarArvore(100, processos, { executar, plataforma: 'win32' })
    assert.deepEqual(chamadas, [['taskkill', '/PID', '100', '/T', '/F']])
  })

  it('devolve false se o comando falhou', async () => {
    const { executar } = executorFalso({ ok: false, saida: '', erro: 'negado' })

    assert.equal(await encerrar(1, { executar, plataforma: 'linux' }), false)
  })
})

describe('nomeDoProcesso', () => {
  it('Windows: lê o CSV do tasklist', async () => {
    const { executar, chamadas } = executorFalso({ ok: true, saida: '"node.exe","1","Console","1","1 K"', erro: '' })

    assert.equal(await nomeDoProcesso(1, { executar, plataforma: 'win32' }), 'node.exe')
    assert.deepEqual(chamadas[0].slice(0, 3), ['tasklist', '/FI', 'PID eq 1'])
  })

  it('Linux: lê o comm do ps; vazio vira null', async () => {
    assert.equal(await nomeDoProcesso(1, { executar: executorFalso({ ok: true, saida: 'node\n', erro: '' }).executar, plataforma: 'linux' }), 'node')
    assert.equal(await nomeDoProcesso(1, { executar: executorFalso({ ok: false, saida: '', erro: '' }).executar, plataforma: 'linux' }), null)
  })
})

describe('listarProcessos (sistema real)', () => {
  it('enxerga o processo atual e o pai dele', async () => {
    const todos = await listarProcessos()
    const eu = todos.get(process.pid)

    assert.ok(eu, 'o próprio processo deveria estar na lista')
    assert.equal(eu.ppid, process.ppid)
    assert.match(eu.comando, /node|bun/i, 'a linha de comando é a do runtime que roda os testes')
  })
})
