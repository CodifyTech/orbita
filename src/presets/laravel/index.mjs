// Família "laravel": a API (php artisan serve) e os processos que moram na mesma pasta: fila,
// Horizon, scheduler, Reverb e Pail. O que só o Laravel sabe vem do ambiente.php (consulta.mjs).
// Porta do `DevServiceProvider.php` e do `config/dev.php` do FoodOS.
import { join } from 'node:path'
import { gravarEnv } from '../../ambiente/env.mjs'
import { linhaDeComando } from '../../ambiente/executar.mjs'
import { apontaParaEstaMaquina } from '../../projeto/urls.mjs'
import { ehFrontendVite } from '../node.mjs'
import { PADROES_PHP } from '../padroes.mjs'
import { consultarLaravel } from './consulta.mjs'
import { diagnosticarLaravel } from './diagnostico.mjs'
import { repararLaravel } from './reparo.mjs'
import { configuracaoLaravel } from './setup.mjs'

/** Base comum dos presets da família. */
const presetLaravel = dados => ({
  familia: 'laravel',
  porta: null,
  health: null,
  protocolo: 'http',
  padroes: PADROES_PHP,
  metrica: null,
  ...dados,
})

const artisan = (contexto, ...args) => linhaDeComando(contexto.php, ['artisan', ...args])

const filasDe = servico => servico.grupo?.info?.fila?.filas ?? ['default']

/** @type {import('../tipos.mjs').Preset[]} */
export const PRESETS_LARAVEL = [
  presetLaravel({
    nome: 'laravel',
    descricao: 'API Laravel · php artisan serve',
    cor: [96, 165, 250],
    porta: 8000,
    health: '/up',
    metrica: 'requisicoes',
    comando: (servico, contexto) => artisan(contexto, 'serve', `--host=${servico.host}`, `--port=${servico.porta}`),
  }),
  presetLaravel({
    nome: 'laravel:queue',
    descricao: 'Worker das filas · queue:listen',
    cor: [167, 139, 250],
    metrica: 'jobs',
    // queue:listen relê o código a cada job e consome as mesmas filas dos supervisores do Horizon.
    comando: (servico, contexto) => artisan(contexto, 'queue:listen', '--tries=1', '--timeout=0', `--queue=${filasDe(servico).join(',')}`),
    descrever: servico => `Worker · ${filasDe(servico).length} filas (${filasDe(servico).join(', ')})`,
  }),
  presetLaravel({
    nome: 'laravel:horizon',
    descricao: 'Horizon · filas no Redis',
    cor: [167, 139, 250],
    metrica: 'jobs',
    // horizon:listen reinicia quando o código muda, mas depende do chokidar no node_modules do app.
    comando: (servico, contexto) => artisan(contexto, servico.grupo?.info?.horizon?.chokidar ? 'horizon:listen' : 'horizon'),
  }),
  presetLaravel({
    nome: 'laravel:schedule',
    descricao: 'Agendador · schedule:work',
    cor: [251, 191, 36],
    metrica: 'execucoes',
    comando: (servico, contexto) => artisan(contexto, 'schedule:work'),
  }),
  presetLaravel({
    nome: 'laravel:reverb',
    descricao: 'WebSocket em tempo real · reverb:start',
    cor: [244, 114, 182],
    porta: 8080,
    protocolo: 'ws',
    comando: (servico, contexto) => artisan(contexto, 'reverb:start', `--port=${servico.porta}`),
  }),
  presetLaravel({
    nome: 'laravel:pail',
    descricao: 'Pail · logs da aplicação',
    cor: [251, 146, 60],
    comando: (servico, contexto) => artisan(contexto, 'pail'),
  }),
]

const presetDe = servico => servico.preset?.nome

/** O host do broadcasting é esta máquina? Só então API e fila acompanham a porta nova do Reverb. */
const broadcastLocal = grupo => apontaParaEstaMaquina(`http://${grupo.info?.reverb?.broadcastHost ?? ''}`)

/** @type {import('../tipos.mjs').Familia} */
export const familiaLaravel = {
  nome: 'laravel',

  ferramentas: (grupo, contexto) => [
    { nome: 'PHP', comando: contexto.php, dica: 'Instale o PHP (https://www.php.net/downloads ou Laravel Herd) e deixe no PATH, ou defina ORBITA_PHP.' },
    { nome: 'Composer', comando: 'composer', args: ['--version', '--no-ansi'], dica: 'Instale o Composer (https://getcomposer.org/download).' },
  ],

  async consultar(grupo, contexto) {
    const redis = grupo.servicos.some(servico => presetDe(servico) === 'laravel:horizon')
    const resposta = await consultarLaravel(grupo.cwd, ['info', ...(redis ? ['--redis'] : [])], contexto)

    grupo.info = resposta.ok ? resposta : null
    grupo.falha = resposta.ok ? null : resposta
  },

  /**
   * Horizon só com pcntl (não existe no PHP do Windows) e QUEUE_CONNECTION=redis; senão
   * queue:listen. Nunca os dois. O Pail também precisa de pcntl.
   */
  ajustar(grupo) {
    if (!grupo.info) {
      return { removidos: [] }
    }

    const { pcntl, fila } = grupo.info
    const usaHorizon = pcntl && fila.conexao === 'redis'
    const removidos = []
    const tem = preset => grupo.servicos.find(servico => presetDe(servico) === preset)

    if (tem('laravel:horizon') && !usaHorizon) {
      removidos.push({ nome: tem('laravel:horizon').nome, motivo: pcntl ? 'a fila não é redis' : 'sem pcntl (o PHP do Windows não tem)' })
    }
    if (tem('laravel:queue') && tem('laravel:horizon') && usaHorizon) {
      removidos.push({ nome: tem('laravel:queue').nome, motivo: 'o Horizon já consome as filas' })
    }
    if (tem('laravel:pail') && !pcntl) {
      removidos.push({ nome: tem('laravel:pail').nome, motivo: 'o Pail precisa de pcntl' })
    }

    return { removidos }
  },

  preferenciaDePorta(servico, contexto) {
    if (presetDe(servico) === 'laravel') {
      return { arquivo: contexto.preferencias.arquivo, chave: 'DEV_SERVER_PORT' }
    }
    if (presetDe(servico) === 'laravel:reverb') {
      return { arquivo: join(servico.cwd, '.env'), chave: 'REVERB_SERVER_PORT' }
    }

    return null
  },

  hostPreferido: (servico, contexto) =>
    presetDe(servico) === 'laravel' ? contexto.preferencias.valores.DEV_SERVER_HOST || '127.0.0.1' : null,

  diagnosticar: diagnosticarLaravel,

  reparar: repararLaravel,

  /** Troca permanente da porta do Reverb: quem publica nele (API, fila) e o frontend acompanham. */
  gravarPorta(servico, nova, contexto) {
    if (presetDe(servico) !== 'laravel:reverb') {
      return
    }
    if (broadcastLocal(servico.grupo)) {
      gravarEnv(join(servico.cwd, '.env'), 'REVERB_PORT', String(nova))
    }
    for (const cwd of new Set(contexto.servicos.filter(ehFrontendVite).map(frontend => frontend.cwd))) {
      gravarEnv(join(cwd, '.env.local'), 'VITE_REVERB_PORT', String(nova))
    }
  },

  /** Troca só nesta execução: os filhos herdam as variáveis, que vencem o .env (Laravel e Vite). */
  envDaTroca(servico, nova) {
    if (presetDe(servico) !== 'laravel:reverb') {
      return { env: {}, detalhe: '' }
    }

    return {
      env: {
        REVERB_SERVER_PORT: String(nova),
        VITE_REVERB_PORT: String(nova),
        ...(broadcastLocal(servico.grupo) ? { REVERB_PORT: String(nova) } : {}),
      },
      detalhe: '; API, fila e frontend já usam a nova',
    }
  },

  instalacao: grupo => ({
    titulo: `Pacotes do Composer (${grupo.pasta})`,
    porque: `A API de ${grupo.pasta}/ é um projeto Laravel; o Composer baixa as bibliotecas PHP que ela usa.`,
    comando: 'composer',
    args: ['install', '--no-interaction', '--no-progress'],
    texto: `Instalando os pacotes do Composer em ${grupo.pasta}/`,
    passosSeFalhar: [
      'Leia o erro acima: costuma ser extensão PHP faltando (ex.: zip, intl) ou falta de internet.',
      'Confira a versão do PHP com `php -v`.',
      `Rode \`composer install\` dentro de ${grupo.pasta}/ para ver a saída completa.`,
    ],
  }),

  configuracao: configuracaoLaravel,

  /** Variáveis do Reverb que um frontend Vite precisa para o tempo real. */
  extrasDoFrontend(frontend, grupo) {
    const reverb = grupo.servicos.find(servico => presetDe(servico) === 'laravel:reverb')

    if (!reverb || !ehFrontendVite(frontend) || !grupo.info?.reverb) {
      return {}
    }

    return {
      VITE_REVERB_APP_KEY: grupo.info.reverb.chave,
      VITE_REVERB_HOST: 'localhost',
      VITE_REVERB_PORT: String(reverb.porta),
      VITE_REVERB_SCHEME: 'http',
    }
  },

  paraOPlano(grupo, contexto) {
    const { info } = grupo
    const comando = (...args) => artisan(contexto, ...args)
    const acao = (titulo, ...args) => ({ titulo, detalhe: `php artisan ${args.join(' ')}`, comando: comando(...args), cwd: grupo.cwd })

    return {
      logs: [
        {
          nome: 'laravel',
          descricao: 'storage/logs/laravel*.log',
          cor: [253, 186, 116],
          pasta: info?.logs ?? join(grupo.cwd, 'storage', 'logs'),
          arquivos: '^laravel.*\\.log$',
          formato: 'monolog',
        },
      ],
      ambiente: info
        ? [
            { rotulo: 'app', valor: `${info.app.nome} · ${info.app.env}` },
            { rotulo: 'laravel', valor: info.versoes.laravel },
            { rotulo: 'php', valor: info.versoes.php },
            { rotulo: 'banco', valor: `${info.banco.conexao} · ${info.banco.banco}` },
            { rotulo: 'fila', valor: `${info.fila.conexao} · ${info.fila.filas.length} filas` },
            { rotulo: 'cache', valor: String(info.cache) },
          ]
        : [],
      acoes: [
        acao('Limpar caches', 'optimize:clear'),
        acao('Rodar migrations', 'migrate', '--no-interaction'),
        acao('Status das migrations', 'migrate:status'),
        acao('Jobs com falha', 'queue:failed'),
        acao('Reprocessar jobs com falha', 'queue:retry', 'all'),
      ],
      alvos: [
        {
          nome: grupo.pasta,
          cwd: grupo.cwd,
          cor: [96, 165, 250],
          exemplo: 'ex.: php artisan db:seed --class="DatabaseSeeder"',
          atalho: { de: '^artisan\\b', para: linhaDeComando(contexto.php, ['artisan']) },
          servicos: grupo.servicos.map(servico => servico.nome),
        },
      ],
    }
  },
}
