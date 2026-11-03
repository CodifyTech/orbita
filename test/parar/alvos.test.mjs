import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { encontrarAlvos, portasCandidatas } from '../../src/parar/alvos.mjs'

const proc = (pid, ppid, nome, comando) => [pid, { pid, ppid, nome, comando }]

const SERVICOS = [
  { nome: 'server', porta: 8000 },
  { nome: 'queue', porta: null },
  { nome: 'web', porta: 5173 },
]

// Uma sessão do dev (100) com a API na 8001 (porta trocada) e o Vite na 5173; um Node qualquer na
// 5175; o wslrelay na 8000.
const PROCESSOS = new Map([
  proc(1, 0, 'init', 'init'),
  proc(100, 1, 'node.exe', 'node C:\\app\\node_modules\\@codifytech\\orbita\\bin\\codify.mjs dev'),
  proc(101, 100, 'php.exe', 'php artisan serve --port=8001'),
  proc(102, 100, 'bun.exe', 'bun run dev --port 5173'),
  proc(200, 1, 'node.exe', 'node outro.js'),
  proc(300, 1, 'wslrelay.exe', 'wslrelay'),
  proc(400, 1, 'php.exe', 'php -S localhost:5173'),
])

describe('portasCandidatas', () => {
  it('base e as 10 seguintes de cada serviço com porta', () => {
    const portas = portasCandidatas(SERVICOS)

    assert.equal(portas.length, 22)
    assert.deepEqual(portas[0], { porta: 8000, servico: 'server', base: true })
    assert.deepEqual(portas[10], { porta: 8010, servico: 'server', base: false })
  })
})

describe('encontrarAlvos', () => {
  it('encerra a sessão do dev inteira, juntando as portas dela', () => {
    const escutando = new Map([
      [8001, 101],
      [5173, 102],
    ])
    const { alvos, ignorados } = encontrarAlvos(SERVICOS, escutando, PROCESSOS)

    assert.deepEqual(alvos, [
      {
        pid: 100,
        descricao: 'sessão do `dev` (PID 100): todos os serviços dela',
        portas: [
          { porta: 8001, servico: 'server' },
          { porta: 5173, servico: 'web' },
        ],
      },
    ])
    assert.deepEqual(ignorados, [])
  })

  it('fora da porta base, sem sessão do dev, não é nosso', () => {
    assert.deepEqual(encontrarAlvos(SERVICOS, new Map([[5175, 200]]), PROCESSOS), { alvos: [], ignorados: [] })
  })

  it('na porta base, encerra php/node/bun soltos', () => {
    const { alvos } = encontrarAlvos(SERVICOS, new Map([[5173, 400]]), PROCESSOS)

    assert.deepEqual(alvos, [{ pid: 400, descricao: 'php.exe (PID 400)', portas: [{ porta: 5173, servico: 'web' }] }])
  })

  it('na porta base, o que não é encerrável vai para "não vou encerrar" com a dica', () => {
    const { alvos, ignorados } = encontrarAlvos(SERVICOS, new Map([[8000, 300]]), PROCESSOS)

    assert.deepEqual(alvos, [])
    assert.match(ignorados[0], /^Porta 8000 \(server\): wslrelay\.exe \(PID 300\) — porta encaminhada do WSL/)
  })

  it('portas candidatas que se repetem (serviços próximos) não duplicam', () => {
    const servicos = [
      { nome: 'a', porta: 3000 },
      { nome: 'b', porta: 3001 },
    ]
    const { alvos } = encontrarAlvos(servicos, new Map([[3001, 102]]), PROCESSOS)

    assert.equal(alvos[0].portas.length, 1)
  })
})
