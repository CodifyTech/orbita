import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { ErroDeUso } from '../../src/erros.mjs'
import { removerServicos } from '../../src/projeto/contexto.mjs'
import { chaveDaPorta, listaDe } from '../../src/projeto/preferencias.mjs'
import { gravarPortaPermanente, trocarPortaNaExecucao } from '../../src/projeto/troca-de-porta.mjs'
import { apontaParaEstaMaquina, hostParaAcesso } from '../../src/projeto/urls.mjs'
import { contextoFalso } from '../_ajudantes/projeto-falso.mjs'

const FOODOS = {
  gerenciador: 'bun',
  servicos: {
    server: { preset: 'laravel', cwd: 'backend' },
    queue: { preset: 'laravel:queue', cwd: 'backend' },
    reverb: { preset: 'laravel:reverb', cwd: 'backend' },
    web: { preset: 'vite', cwd: 'frontend' },
  },
}

describe('resolverServicos (via montarContexto)', () => {
  it('aplica o preset: porta padrão, família, pasta e saúde', () => {
    const { servicos } = contextoFalso(FOODOS)
    const [server, queue, reverb, web] = servicos

    assert.deepEqual([server.porta, queue.porta, reverb.porta, web.porta], [8000, null, 8080, 5173])
    assert.equal(server.familia.nome, 'laravel')
    assert.equal(web.familia.nome, 'node')
    assert.equal(server.pasta, 'backend')
    assert.equal(server.health, '/up')
    assert.equal(server.host, '127.0.0.1')
  })

  it('a preferência da máquina (.env do Laravel) vence a config', () => {
    const { servicos, preferencias } = contextoFalso(
      { servicos: { ...FOODOS.servicos, server: { preset: 'laravel', cwd: 'backend', porta: 9000 } } },
      { 'backend/.env': 'DEV_SERVER_PORT=8001\nDEV_SERVER_HOST=0.0.0.0\nREVERB_SERVER_PORT=8081\nDEV_WEB_PORT=5174\n' },
    )

    assert.match(preferencias.arquivo, /backend[\\/]\.env$/)
    assert.deepEqual(
      servicos.map(servico => [servico.nome, servico.porta]),
      [
        ['server', 8001],
        ['queue', null],
        ['reverb', 8081],
        ['web', 5174],
      ],
    )
    assert.equal(servicos[0].host, '0.0.0.0')
  })

  it('agrupa por família e pasta', () => {
    const { grupos } = contextoFalso(FOODOS)

    assert.deepEqual(
      grupos.map(grupo => [grupo.familia.nome, grupo.pasta, grupo.servicos.map(servico => servico.nome)]),
      [
        ['laravel', 'backend', ['server', 'queue', 'reverb']],
        ['node', 'frontend', ['web']],
      ],
    )
  })

  it('preset desconhecido lista os válidos', () => {
    assert.throws(() => contextoFalso({ servicos: { web: { preset: 'remix' } } }), erro => {
      assert.ok(erro instanceof ErroDeUso)
      assert.match(erro.message, /servicos\.web \("remix"\)/)
      assert.match(erro.dica, /vite/)

      return true
    })
  })

  it('serviço só com cmd é da família genérica', () => {
    const { servicos } = contextoFalso({ servicos: { worker: { cmd: 'node worker.js' } } })

    assert.equal(servicos[0].familia.nome, 'generico')
    assert.equal(servicos[0].porta, null)
  })
})

describe('filtrarServicos (via montarContexto)', () => {
  it('--only e --except', () => {
    assert.deepEqual(contextoFalso(FOODOS, {}, { opcoes: { only: 'server,web' } }).servicos.map(s => s.nome), ['server', 'web'])
    assert.deepEqual(contextoFalso(FOODOS, {}, { opcoes: { except: 'web' } }).servicos.map(s => s.nome), ['server', 'queue', 'reverb'])
  })

  it('DEV_EXCEPT da máquina vale sempre; DEV_ONLY só sem --only', () => {
    const arquivos = { 'backend/.env': 'DEV_EXCEPT=reverb\nDEV_ONLY=server,reverb,queue\n' }

    assert.deepEqual(contextoFalso(FOODOS, arquivos).servicos.map(s => s.nome), ['server', 'queue'])
    assert.deepEqual(contextoFalso(FOODOS, arquivos, { opcoes: { only: 'web' } }).servicos.map(s => s.nome), ['web'])
  })

  it('nome desconhecido e filtro vazio são erros claros', () => {
    assert.throws(() => contextoFalso(FOODOS, {}, { opcoes: { only: 'api' } }), /desconhecido\(s\): api/)
    assert.throws(() => contextoFalso(FOODOS, {}, { opcoes: { only: 'web', except: 'web' } }), /Nenhum serviço/)
  })

  it('filtrar: false traz todos', () => {
    assert.equal(contextoFalso(FOODOS, { 'backend/.env': 'DEV_EXCEPT=web' }, { filtrar: false }).servicos.length, 4)
  })

  it('removerServicos tira do contexto e dos grupos, e some com grupo vazio', () => {
    const contexto = contextoFalso(FOODOS)
    removerServicos(contexto, ['web'])

    assert.deepEqual(contexto.servicos.map(s => s.nome), ['server', 'queue', 'reverb'])
    assert.equal(contexto.grupos.length, 1)
  })
})

describe('troca de porta', () => {
  const comFrontend = { 'frontend/.env': 'VITE_API_URL=http://127.0.0.1:8000\n', 'backend/.env': 'APP_KEY=x\n' }

  it('na execução: a API muda e o frontend que aponta para ela acompanha (sem gravar nada)', () => {
    const contexto = contextoFalso(FOODOS, comFrontend)
    const detalhe = trocarPortaNaExecucao(contexto.servicos[0], 8002, contexto)

    assert.equal(contexto.servicos[0].porta, 8002)
    assert.deepEqual(contexto.envDaExecucao, { VITE_API_URL: 'http://127.0.0.1:8002' })
    assert.match(detalhe, /o frontend já aponta para ela/)
    assert.equal(readFileSync(join(contexto.projeto.raiz, 'backend', '.env'), 'utf8'), 'APP_KEY=x\n')
  })

  it('na execução: Reverb leva junto as variáveis que API, fila e frontend leem', () => {
    const contexto = contextoFalso(FOODOS)
    contexto.grupos[0].info = { reverb: { broadcastHost: 'localhost' } }
    trocarPortaNaExecucao(contexto.servicos[2], 8090, contexto)

    assert.deepEqual(contexto.envDaExecucao, { REVERB_SERVER_PORT: '8090', VITE_REVERB_PORT: '8090', REVERB_PORT: '8090' })
  })

  it('na execução: frontend avisa a URL nova', () => {
    const contexto = contextoFalso(FOODOS)

    assert.match(trocarPortaNaExecucao(contexto.servicos[3], 5180, contexto), /abra http:\/\/localhost:5180/)
  })

  it('permanente: grava a preferência e o .env.local do frontend', () => {
    const contexto = contextoFalso(FOODOS, comFrontend)
    const arquivo = gravarPortaPermanente(contexto.servicos[0], 8003, contexto)
    const raiz = contexto.projeto.raiz

    assert.equal(arquivo, 'backend/.env')
    assert.match(readFileSync(join(raiz, 'backend', '.env'), 'utf8'), /^DEV_SERVER_PORT=8003$/m)
    assert.equal(readFileSync(join(raiz, 'frontend', '.env.local'), 'utf8'), 'VITE_API_URL=http://127.0.0.1:8003\n')
  })

  it('permanente: serviço sem chave própria usa DEV_<NOME>_PORT', () => {
    const contexto = contextoFalso(FOODOS, comFrontend)
    gravarPortaPermanente(contexto.servicos[3], 5174, contexto)

    assert.match(readFileSync(join(contexto.projeto.raiz, 'backend', '.env'), 'utf8'), /^DEV_WEB_PORT=5174$/m)
  })
})

describe('preferencias e urls', () => {
  it('chaveDaPorta e listaDe', () => {
    assert.equal(chaveDaPorta('api-pix'), 'DEV_API_PIX_PORT')
    assert.deepEqual(listaDe(' a, b,,c '), ['a', 'b', 'c'])
    assert.deepEqual(listaDe(undefined), [])
  })

  it('apontaParaEstaMaquina e hostParaAcesso', () => {
    assert.ok(apontaParaEstaMaquina('http://localhost:8000'))
    assert.ok(apontaParaEstaMaquina('http://192.168.0.5:8000', ['192.168.0.5']))
    assert.ok(!apontaParaEstaMaquina('https://api.foodos.com.br'))
    assert.ok(!apontaParaEstaMaquina('não é url'))
    assert.equal(hostParaAcesso('0.0.0.0'), '127.0.0.1')
    assert.equal(hostParaAcesso('192.168.0.5'), '192.168.0.5')
  })
})
