import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classificar, compilarPadroes, PADROES_PADRAO } from '../../src/painel/classificacao.mjs'
import { analisar, resumoDeRequisicoes } from '../../src/painel/metricas.mjs'
import { criarServico } from '../../src/painel/estado.mjs'

describe('classificar (padrões genéricos)', () => {
  it('reconhece erros comuns', () => {
    for (const linha of [
      'PHP Fatal error: Uncaught Exception',
      'SQLSTATE[HY000] [2002] Connection refused',
      'Error: listen EADDRINUSE: address already in use :::5173',
      'FAILED tests/Feature/PedidoTest.php',
      'Erro ao gravar',
    ]) {
      assert.equal(classificar(linha), 'erro', linha)
    }
  })

  it('reconhece avisos', () => {
    assert.equal(classificar('PHP Deprecated: algo'), 'alerta')
    assert.equal(classificar('WARN  something'), 'alerta')
  })

  it('erro tem prioridade sobre aviso, e linha comum é null', () => {
    assert.equal(classificar('Warning: Exception thrown'), 'erro')
    assert.equal(classificar('GET /api/pedidos 200'), null)
    assert.equal(classificar('errors: 0 (sem ser palavra solta)'), null)
  })
})

describe('compilarPadroes', () => {
  it('compila o texto do plano com flag i', () => {
    const padroes = compilarPadroes({ erro: 'falhou', aviso: 'cuidado' })
    assert.equal(classificar('FALHOU o build', padroes), 'erro')
    assert.equal(classificar('Cuidado aqui', padroes), 'alerta')
    assert.equal(classificar('ERROR genérico', padroes), null)
  })

  it('regex inválida ou ausente cai nos padrões genéricos', () => {
    const padroes = compilarPadroes({ erro: '(', aviso: '' })
    assert.equal(padroes.erro, PADROES_PADRAO.erro)
    assert.equal(padroes.aviso, PADROES_PADRAO.aviso)
    assert.deepEqual(compilarPadroes(null), { erro: PADROES_PADRAO.erro, aviso: PADROES_PADRAO.aviso })
  })
})

describe('metricas', () => {
  const servidor = () =>
    criarServico('server', { metrica: 'requisicoes', saude: { tipo: 'http', url: 'http://127.0.0.1:8000/up' } })

  it('requisicoes: conta e mede as linhas do artisan serve', () => {
    const s = servidor()
    assert.equal(analisar(s, '/api/pedidos ........ ~ 12.5ms', 1000), true)
    assert.equal(analisar(s, '/api/lento ........ ~ 1.5s', 1000), true)
    assert.equal(s.metricas.total, 2)
    assert.deepEqual(resumoDeRequisicoes(s.metricas, 2000), { porMinuto: 2, media: 756.25 })
    assert.deepEqual(resumoDeRequisicoes(s.metricas, 70_000), { porMinuto: 0, media: null })
  })

  it('requisicoes: descarta as batidas do próprio painel na URL de saúde', () => {
    const s = servidor()
    assert.equal(analisar(s, '/up ........ ~ 0.5ms'), false)
    assert.equal(analisar(s, '/upload ........ ~ 3ms'), true)
    assert.equal(s.metricas.total, 1)
  })

  it('descarta o "Press Ctrl+C to stop" de qualquer serviço', () => {
    assert.equal(analisar(criarServico('x'), 'Press Ctrl+C to stop the server'), false)
  })

  it('jobs: rodando, feitos e falhas', () => {
    const s = criarServico('queue', { metrica: 'jobs' })
    analisar(s, String.raw`App\Jobs\EnviarEmail ........ RUNNING`)
    assert.equal(s.metricas.rodando, 'EnviarEmail')
    analisar(s, String.raw`App\Jobs\EnviarEmail ........ 12ms DONE`)
    analisar(s, String.raw`App\Jobs\Outro ........ FAIL`)
    assert.deepEqual(s.metricas, { rodando: null, feitos: 1, falhas: 1 })
  })

  it('hmr e execucoes', () => {
    const web = criarServico('web', { metrica: 'hmr' })
    analisar(web, 'VITE v5.0.0  ready in 312 ms')
    analisar(web, '[vite] hmr update /src/App.vue')
    assert.deepEqual(web.metricas, { pronto: 312, hmr: 1 })

    const agenda = criarServico('schedule', { metrica: 'execucoes' })
    analisar(agenda, 'Running [limpar] ........ DONE')
    assert.equal(agenda.metricas.execucoes, 1)
  })

  it('sem métrica, só deixa passar', () => {
    const s = criarServico('x')
    assert.equal(analisar(s, 'qualquer coisa'), true)
    assert.deepEqual(s.metricas, {})
  })
})
