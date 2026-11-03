import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AZUL } from '../../src/painel/cores.mjs'
import {
  abaAtual,
  abas,
  alvosDo,
  criarEstado,
  irPara,
  normalizarPlano,
  processos,
  servicoDe,
  tarefasDe,
  trocarAba,
  verNoLog,
  visiveis,
  vista,
} from '../../src/painel/estado.mjs'
import { registrar } from '../../src/painel/logs.mjs'
import { criarPlanoFalso } from '../_ajudantes/plano-falso.mjs'

describe('criarEstado', () => {
  it('um serviço por processo, um por log e a aba tarefas', () => {
    const estado = criarEstado(criarPlanoFalso())
    assert.deepEqual(
      estado.servicos.map(s => [s.nome, s.tipo]),
      [
        ['server', 'processo'],
        ['queue', 'processo'],
        ['laravel', 'log'],
        ['tarefas', 'tarefas'],
      ],
    )
    assert.deepEqual(processos(estado).map(s => s.nome), ['server', 'queue'])
    const server = servicoDe(estado, 'server')
    assert.equal(server.cwd, '/projeto/backend')
    assert.deepEqual(server.saude, { tipo: 'http', url: 'http://127.0.0.1:8000/up' })
    assert.ok(server.padroes.erro instanceof RegExp)
  })

  it('aceita cor em hex e usa azul se a cor for inválida', () => {
    const plano = criarPlanoFalso()
    plano.processos[0].cor = '#ff0080'
    plano.processos[1].cor = 'roxo'
    const estado = criarEstado(plano)
    assert.deepEqual(servicoDe(estado, 'server').cor, [255, 0, 128])
    assert.deepEqual(servicoDe(estado, 'queue').cor, AZUL)
  })

  it('nome repetido ou reservado ganha sufixo (as abas não podem colidir)', () => {
    const plano = criarPlanoFalso()
    plano.processos[1].nome = 'server'
    plano.logs[0].nome = 'alertas'
    const estado = criarEstado(plano)
    assert.deepEqual(estado.servicos.map(s => s.nome), ['server', 'server-2', 'alertas-2', 'tarefas'])
  })

  it('plano mínimo: o resto ganha padrão', () => {
    const plano = normalizarPlano({ processos: [] })
    assert.deepEqual([plano.logs, plano.acoes, plano.alvos, plano.ambiente], [[], [], [], []])
    assert.equal(plano.reiniciar, true)
    assert.equal(plano.projeto.nome, 'projeto')
  })

  it('sem alvos, o comando livre roda na raiz do projeto', () => {
    const alvos = alvosDo(normalizarPlano({ projeto: { nome: 'x', raiz: '/raiz' } }))
    assert.equal(alvos.length, 1)
    assert.equal(alvos[0].cwd, '/raiz')
  })
})

describe('abas', () => {
  it('visão geral, todos, serviços e alertas; tarefas só com conteúdo', () => {
    const estado = criarEstado(criarPlanoFalso())
    assert.deepEqual(abas(estado).map(a => a.id), ['geral', 'todos', 'server', 'queue', 'laravel', 'alertas'])
    registrar(estado, tarefasDe(estado), 'rodou')
    assert.deepEqual(visiveis(estado).map(s => s.nome), ['server', 'queue', 'laravel', 'tarefas'])
  })

  it('trocarAba dá a volta nas pontas', () => {
    const estado = criarEstado(criarPlanoFalso())
    trocarAba(estado, -1)
    assert.equal(abaAtual(estado), 'alertas')
    trocarAba(estado, 1)
    assert.equal(abaAtual(estado), 'geral')
  })

  it('irPara zera os não vistos; aba que sumiu volta para a visão geral', () => {
    const estado = criarEstado(criarPlanoFalso())
    const server = servicoDe(estado, 'server')
    server.naoVistos = 3
    estado.alertasNaoVistos = 2
    irPara(estado, 'server')
    irPara(estado, 'alertas')
    assert.equal(server.naoVistos, 0)
    assert.equal(estado.alertasNaoVistos, 0)
    estado.abaId = 'tarefas'
    assert.equal(abaAtual(estado), 'geral')
  })
})

describe('verNoLog', () => {
  it('vai para a aba do serviço com a linha a um terço da tela e destacada', () => {
    const estado = criarEstado(criarPlanoFalso())
    const server = servicoDe(estado, 'server')
    for (let i = 0; i < 50; i++) {
      registrar(estado, server, `linha ${i}`, i === 10 ? 'erro' : null)
    }
    vista(estado, 'server').filtro = 'algo'
    verNoLog(estado, estado.alertas[0], 30, 1000)
    assert.equal(abaAtual(estado), 'server')
    assert.equal(vista(estado, 'server').filtro, '')
    assert.equal(vista(estado, 'server').rolagem, 50 - 1 - 10 - 10)
    assert.deepEqual(estado.destaque, { seq: estado.alertas[0].seq, ate: 5000 })
  })

  it('linha que já saiu do histórico vira toast', () => {
    const estado = criarEstado(criarPlanoFalso())
    verNoLog(estado, { s: servicoDe(estado, 'server'), seq: 999 }, 30)
    assert.match(estado.toast.texto, /saiu do histórico/)
    assert.equal(abaAtual(estado), 'geral')
  })
})
