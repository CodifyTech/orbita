import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { montarPlano } from '../../src/plano/montar.mjs'
import { contextoFalso } from '../_ajudantes/projeto-falso.mjs'

const CONFIG = {
  gerenciador: 'bun',
  servicos: {
    server: { preset: 'laravel', cwd: 'backend' },
    queue: { preset: 'laravel:queue', cwd: 'backend' },
    reverb: { preset: 'laravel:reverb', cwd: 'backend' },
    web: { preset: 'vite', cwd: 'frontend' },
    worker: { cmd: 'node worker.js', cwd: 'tools', porta: 9100 },
  },
}

function plano(extras = {}, info = {}) {
  const contexto = contextoFalso(CONFIG, { 'frontend/package.json': JSON.stringify({ scripts: { dev: 'vite', typecheck: 'vue-tsc' } }) })
  contexto.grupos[0].info = {
    ...info,
    app: { nome: 'Loja', env: 'local' },
    versoes: { php: '8.5.0', laravel: '13.0.0' },
    banco: { conexao: 'mariadb', banco: 'loja' },
    fila: { conexao: 'database', filas: ['default', 'emails'] },
    cache: 'database',
    horizon: { chokidar: false },
    logs: '/app/backend/storage/logs',
  }
  Object.assign(contexto.envDaExecucao, extras)

  return montarPlano(contexto, { reiniciar: true })
}

describe('montarPlano', () => {
  it('um processo por serviço, na ordem da config, com comando, url e saúde', () => {
    const { processos } = plano()
    const resumo = processos.map(({ nome, comando, url, saude, porta }) => ({ nome, comando, url, saude, porta }))

    assert.deepEqual(resumo, [
      { nome: 'server', comando: processos[0].comando, url: 'http://127.0.0.1:8000', saude: { tipo: 'http', url: 'http://127.0.0.1:8000/up' }, porta: 8000 },
      { nome: 'queue', comando: 'php artisan queue:listen --tries=1 --timeout=0 --queue=default,emails', url: null, saude: null, porta: null },
      { nome: 'reverb', comando: 'php artisan reverb:start --port=8080', url: 'ws://127.0.0.1:8080', saude: { tipo: 'tcp', porta: 8080 }, porta: 8080 },
      { nome: 'web', comando: 'bun run dev --port 5173 --strictPort', url: 'http://localhost:5173', saude: { tipo: 'http', url: 'http://localhost:5173/' }, porta: 5173 },
      { nome: 'worker', comando: 'node worker.js', url: 'http://127.0.0.1:9100', saude: { tipo: 'tcp', porta: 9100 }, porta: 9100 },
    ])
  })

  it('descrição calculada (filas), cor e regex de cada preset', () => {
    const [server, queue] = plano().processos

    assert.equal(queue.descricao, 'Worker · 2 filas (default, emails)')
    assert.deepEqual(server.cor, [96, 165, 250])
    assert.match(server.padroes.erro, /SQLSTATE/)
    assert.equal(server.metrica, 'requisicoes')
    assert.equal(queue.metrica, 'jobs')
  })

  it('repassa os workers do .env, que o php -S só lê da variável de ambiente', () => {
    assert.equal(plano({}, { servidor: { workers: 4 } }).env.PHP_CLI_SERVER_WORKERS, '4')
    assert.equal(plano({}, { servidor: { workers: 1 } }).env.PHP_CLI_SERVER_WORKERS, undefined)
    assert.equal(plano().env.PHP_CLI_SERVER_WORKERS, undefined)
  })

  it('só o servidor Laravel sabe detalhar requests', () => {
    const [server, queue] = plano().processos

    assert.equal(server.detalhesDeRequest.args.at(-1), 'request')
    assert.match(server.detalhesDeRequest.args[0], /ambiente\.php$/)
    assert.equal(server.detalhesDeRequest.cwd, server.cwd)
    assert.equal(queue.detalhesDeRequest, null)
  })

  it('logs, cabeçalho, ações e alvos vêm das famílias', () => {
    const { logs, ambiente, acoes, alvos } = plano()

    assert.deepEqual(logs.map(log => [log.nome, log.formato, log.arquivos]), [['laravel', 'monolog', '^laravel.*\\.log$']])
    assert.deepEqual(ambiente.map(({ rotulo }) => rotulo), ['app', 'laravel', 'php', 'banco', 'fila', 'cache'])
    assert.ok(acoes.some(acao => acao.comando === 'php artisan optimize:clear'))
    assert.ok(acoes.some(acao => acao.comando === 'bun run typecheck'))
    assert.match(acoes.at(-1).comando, /codify\.mjs" doctor --sem-perguntas$|codify\.mjs doctor --sem-perguntas$/)
    assert.deepEqual(alvos.map(alvo => [alvo.nome, alvo.atalho]), [
      ['backend', { de: '^artisan\\b', para: 'php artisan' }],
      ['frontend', null],
      ['tools', null],
    ])
  })

  it('leva as variáveis trocadas nesta execução e o "reiniciar"', () => {
    const resultado = plano({ VITE_API_URL: 'http://127.0.0.1:8001' })

    assert.deepEqual(resultado.env, { VITE_API_URL: 'http://127.0.0.1:8001' })
    assert.equal(resultado.reiniciar, true)
    assert.equal(resultado.projeto.nome, 'Teste')
  })

  it('é JSON puro (dá para gravar e subir com ORBITA_PLANO)', () => {
    const original = plano()

    assert.deepEqual(JSON.parse(JSON.stringify(original)), original)
  })
})
