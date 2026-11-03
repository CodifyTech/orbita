// Plano e processos falsos para os testes do painel (não é executado como teste).
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

/**
 * Plano com dois processos (um HTTP, um sem saúde), um log Monolog, uma ação e dois alvos.
 * `extra` sobrescreve chaves do plano.
 */
export function criarPlanoFalso(extra = {}) {
  return {
    projeto: { nome: 'Teste', slogan: 'projeto de teste', logo: null, raiz: '/projeto' },
    processos: [
      {
        nome: 'server',
        comando: 'php artisan serve',
        cwd: '/projeto/backend',
        cor: [96, 165, 250],
        descricao: 'API',
        porta: 8000,
        url: 'http://127.0.0.1:8000',
        saude: { tipo: 'http', url: 'http://127.0.0.1:8000/up' },
        padroes: { erro: 'ERROR|Exception', aviso: 'WARN' },
        metrica: 'requisicoes',
      },
      {
        nome: 'queue',
        comando: 'php artisan queue:listen',
        cwd: '/projeto/backend',
        cor: [167, 139, 250],
        descricao: 'Fila',
        porta: null,
        url: null,
        saude: null,
        padroes: { erro: 'FAIL', aviso: 'WARN' },
        metrica: 'jobs',
      },
    ],
    env: { APP_PORT: '8000' },
    reiniciar: true,
    logs: [
      {
        nome: 'laravel',
        descricao: 'storage/logs',
        cor: [253, 186, 116],
        pasta: '/projeto/backend/storage/logs',
        arquivos: '^laravel.*\\.log$',
        formato: 'monolog',
      },
    ],
    ambiente: [{ rotulo: 'Banco', valor: 'mysql' }],
    acoes: [{ titulo: 'Limpar caches', detalhe: 'optimize:clear', comando: 'php artisan optimize:clear', cwd: '/projeto/backend' }],
    alvos: [
      {
        nome: 'backend',
        cwd: '/projeto/backend',
        cor: [64, 196, 255],
        exemplo: 'ex.: php artisan db:seed',
        atalho: { de: '^artisan\\b', para: 'php artisan' },
        servicos: ['server', 'queue'],
      },
      { nome: 'frontend', cwd: '/projeto/frontend', cor: [74, 222, 128], exemplo: 'ex.: npm run typecheck', atalho: null, servicos: ['web'] },
    ],
    ...extra,
  }
}

/**
 * Um ChildProcess de mentira: stdout/stderr de verdade (PassThrough) e `sair()` para simular o fim.
 */
export function criarProcessoFalso(pid = 1000) {
  const filho = new EventEmitter()
  filho.pid = pid
  filho.exitCode = null
  filho.signalCode = null
  filho.stdout = new PassThrough()
  filho.stderr = new PassThrough()
  filho.sair = (codigo = 0, sinal = null) => {
    filho.exitCode = codigo
    filho.signalCode = sinal
    filho.emit('exit', codigo, sinal)
  }

  return filho
}

/** Espera os eventos pendentes (dados dos streams falsos) serem entregues. */
export const proximoCiclo = () => new Promise(resolve => setImmediate(resolve))
