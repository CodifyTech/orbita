import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  lerLsof,
  lerNetstat,
  lerNetTcpConnection,
  lerNomeDoTasklist,
  lerProcessosDoPowerShell,
  lerPs,
  lerSs,
} from '../../src/ambiente/leitores-do-sistema.mjs'

describe('lerNetstat', () => {
  // Amostra com o estado em português: o critério é o endereço remoto zerado, não o texto.
  const amostra = `
Conexões ativas

  Proto  Endereço local         Endereço Remoto        Estado           PID
  TCP    0.0.0.0:80             0.0.0.0:0              ESCUTANDO       4
  TCP    127.0.0.1:8000         0.0.0.0:0              ESCUTANDO       1234
  TCP    127.0.0.1:8000         127.0.0.1:51000        ESTABELECIDA    1234
  TCP    192.168.0.5:51000      142.250.1.1:443        ESTABELECIDA    999
  TCP    [::]:5173              [::]:0                 ESCUTANDO       5678
  TCP    [::1]:5173             [::1]:51111            ESTABELECIDA    5678
`

  it('pega só as portas em escuta, com o PID', () => {
    assert.deepEqual([...lerNetstat(amostra)], [
      [80, 4],
      [8000, 1234],
      [5173, 5678],
    ])
  })

  it('texto vazio ou lixo dá mapa vazio', () => {
    assert.equal(lerNetstat('').size, 0)
    assert.equal(lerNetstat('nada a ver\n\n').size, 0)
  })
})

describe('lerNetTcpConnection', () => {
  const item = (LocalPort, OwningProcess, RemoteAddress = '0.0.0.0', RemotePort = 0) => ({
    LocalPort,
    OwningProcess,
    RemoteAddress,
    RemotePort,
  })

  it('pega as portas em escuta (remoto zerado), IPv4 e IPv6', () => {
    const json = JSON.stringify([item(8000, 10), item(5173, 20, '::'), item(51000, 30, '142.250.1.1', 443)])

    assert.deepEqual([...lerNetTcpConnection(json)], [
      [8000, 10],
      [5173, 20],
    ])
  })

  it('com um item só o PowerShell devolve objeto, não lista', () => {
    assert.deepEqual([...lerNetTcpConnection(JSON.stringify(item(8000, 10)))], [[8000, 10]])
  })

  it('ignora PID 0 e fica com a primeira ocorrência da porta', () => {
    assert.deepEqual([...lerNetTcpConnection(JSON.stringify([item(80, 0), item(8000, 10), item(8000, 11)]))], [[8000, 10]])
  })

  it('JSON inválido ou vazio dá mapa vazio', () => {
    assert.equal(lerNetTcpConnection('').size, 0)
    assert.equal(lerNetTcpConnection('erro').size, 0)
  })
})

describe('lerLsof', () => {
  it('associa cada porta ao PID da linha `p` anterior; a primeira vence', () => {
    const amostra = 'p100\nn*:8000\nn[::1]:8000\np200\nn127.0.0.1:5173\nn*:8000\n'

    assert.deepEqual([...lerLsof(amostra)], [
      [8000, 100],
      [5173, 200],
    ])
  })
})

describe('lerSs', () => {
  it('extrai porta e PID do campo users', () => {
    const amostra = [
      'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=4321,fd=19))',
      'LISTEN 0 4096 *:8080 *:* users:(("php",pid=777,fd=5))',
      'LISTEN 0 128 0.0.0.0:22 0.0.0.0:*',
    ].join('\n')

    assert.deepEqual([...lerSs(amostra)], [
      [5173, 4321],
      [8080, 777],
    ])
  })
})

describe('lerPs', () => {
  it('lê pid, ppid, comando e o nome do executável', () => {
    const processos = lerPs(' 1 0 /sbin/init splash\n 200 1 node /app/bin/codify.mjs dev --only=web\n\n')

    assert.deepEqual(processos.get(200), {
      pid: 200,
      ppid: 1,
      nome: 'node',
      comando: 'node /app/bin/codify.mjs dev --only=web',
    })
    assert.equal(processos.get(1).nome, 'init')
  })

  it('ignora linhas incompletas', () => {
    assert.equal(lerPs('123 45\n').size, 0)
  })
})

describe('lerProcessosDoPowerShell', () => {
  it('lê uma lista de processos', () => {
    const json = JSON.stringify([
      { ProcessId: 10, ParentProcessId: 1, Name: 'node.exe', CommandLine: 'node codify.mjs dev' },
      { ProcessId: 11, ParentProcessId: 10, Name: 'php.exe', CommandLine: null },
    ])
    const processos = lerProcessosDoPowerShell(json)

    assert.equal(processos.size, 2)
    assert.deepEqual(processos.get(11), { pid: 11, ppid: 10, nome: 'php.exe', comando: '' })
  })

  it('com um processo só o PowerShell devolve objeto, não lista', () => {
    const json = JSON.stringify({ ProcessId: 10, ParentProcessId: 1, Name: 'a.exe', CommandLine: 'a' })

    assert.equal(lerProcessosDoPowerShell(json).size, 1)
  })

  it('JSON inválido ou vazio dá mapa vazio', () => {
    assert.equal(lerProcessosDoPowerShell('').size, 0)
    assert.equal(lerProcessosDoPowerShell('erro').size, 0)
  })
})

describe('lerNomeDoTasklist', () => {
  it('pega a primeira coluna do CSV', () => {
    assert.equal(lerNomeDoTasklist('"node.exe","1234","Console","1","50.000 K"\r\n'), 'node.exe')
  })

  it('processo inexistente (frase no lugar do CSV) dá null', () => {
    assert.equal(lerNomeDoTasklist('INFORMAÇÕES: nenhuma tarefa em execução corresponde.'), null)
  })
})
