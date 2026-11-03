import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { criarLeitorDeRespostas, criarMedidor, FIM_DA_AMOSTRA, lerAmostras, memoriaPorArvore } from '../../src/ambiente/memoria.mjs'

describe('lerAmostras', () => {
  it('PowerShell: "pid,ppid,bytes", ignorando o que não é número', () => {
    assert.deepEqual(lerAmostras('10,1,1000\r\n11,10,500\r\nPS> lixo\r\n\r\n'), [
      { pid: 10, ppid: 1, bytes: 1000 },
      { pid: 11, ppid: 10, bytes: 500 },
    ])
  })

  it('ps: colunas por espaço, rss em KB', () => {
    assert.deepEqual(lerAmostras('  123     1  2048\n  124   123   512\n', 1024), [
      { pid: 123, ppid: 1, bytes: 2048 * 1024 },
      { pid: 124, ppid: 123, bytes: 512 * 1024 },
    ])
  })
})

describe('memoriaPorArvore', () => {
  const amostras = [
    { pid: 0, ppid: 0, bytes: 0 },
    { pid: 1, ppid: 0, bytes: 10 },
    { pid: 10, ppid: 1, bytes: 100 },
    { pid: 11, ppid: 10, bytes: 50 },
    { pid: 12, ppid: 11, bytes: 25 },
    { pid: 20, ppid: 1, bytes: 7 },
  ]

  it('soma o processo e todos os descendentes', () => {
    const memoria = memoriaPorArvore(amostras, [10, 20])
    assert.equal(memoria.get(10), 175)
    assert.equal(memoria.get(20), 7)
  })

  it('PID ausente fica de fora; ciclo (PID 0 pai de si mesmo) não trava', () => {
    const memoria = memoriaPorArvore(amostras, [999, 0])
    assert.equal(memoria.has(999), false)
    assert.equal(memoria.get(0), 192)
  })
})

describe('criarLeitorDeRespostas', () => {
  it('entrega cada resposta completa, mesmo partida em pedaços ou duas juntas', () => {
    const respostas = []
    const ler = criarLeitorDeRespostas(texto => respostas.push(texto.trim()))
    ler('1,0,10\n2,1,')
    ler(`20\n${FIM_DA_AMOSTRA.slice(0, 3)}`)
    ler(`${FIM_DA_AMOSTRA.slice(3)}\n3,0,5\n${FIM_DA_AMOSTRA}\n4,0,1\n${FIM_DA_AMOSTRA}`)
    assert.deepEqual(respostas, ['1,0,10\n2,1,20', '3,0,5', '4,0,1'])
  })
})

describe('criarMedidor', () => {
  it('fora do Windows usa o ps (rss em KB)', async () => {
    const chamadas = []
    const amostras = await new Promise(resolve => {
      const medidor = criarMedidor(
        lista => {
          medidor.parar()
          resolve(lista)
        },
        {
          plataforma: 'linux',
          atraso: 0,
          executar: async (comando, args) => {
            chamadas.push([comando, ...args])

            return { ok: true, saida: '5 1 4\n', erro: '' }
          },
        },
      )
    })
    assert.deepEqual(chamadas[0], ['ps', '-axo', 'pid=,ppid=,rss='])
    assert.deepEqual(amostras, [{ pid: 5, ppid: 1, bytes: 4096 }])
  })

  it('no Windows conversa com um PowerShell vivo', async () => {
    const stdin = new PassThrough()
    const ps = Object.assign(new EventEmitter(), { stdin, stdout: new PassThrough(), kill() {} })
    let comando
    const amostras = await new Promise(resolve => {
      const medidor = criarMedidor(
        lista => {
          medidor.parar()
          resolve(lista)
        },
        {
          plataforma: 'win32',
          atraso: 0,
          criarProcesso: (programa, args) => {
            comando = [programa, ...args]

            return ps
          },
        },
      )
      // Responde quando chegar a consulta (depois do $ProgressPreference).
      let pedido = ''
      stdin.on('data', d => {
        pedido += d
        if (pedido.includes('Get-CimInstance')) {
          ps.stdout.write(`8,4,2048\r\n${FIM_DA_AMOSTRA}\r\n`)
        }
      })
    })
    assert.deepEqual(comando, ['powershell', '-NoProfile', '-NonInteractive', '-Command', '-'])
    assert.deepEqual(amostras, [{ pid: 8, ppid: 4, bytes: 2048 }])
  })
})
