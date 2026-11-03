import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { consultarLaravel, explicarFalha, interpretarResposta } from '../../src/presets/laravel/consulta.mjs'
import { diagnosticarLaravel } from '../../src/presets/laravel/diagnostico.mjs'
import { familiaLaravel } from '../../src/presets/laravel/index.mjs'
import { executar } from '../../src/ambiente/executar.mjs'
import { removerServicos } from '../../src/projeto/contexto.mjs'
import { criarProjetoTemporario } from '../_ajudantes/saida-falsa.mjs'
import { contextoFalso } from '../_ajudantes/projeto-falso.mjs'

/** O que o ambiente.php devolve num app saudável; cada teste muda só o que importa. */
const infoSaudavel = (extra = {}) => ({
  ok: true,
  app: { nome: 'Loja', env: 'local', chave: true },
  jwt: { usa: false, segredo: false },
  versoes: { php: '8.5.0', laravel: '13.0.0' },
  pcntl: false,
  banco: { conexao: 'mariadb', driver: 'mariadb', host: '127.0.0.1', porta: '3306', banco: 'loja', usuario: 'root', estado: 'ok', pendentes: 0, rodadas: 10 },
  redis: { estado: 'nao-usado' },
  fila: { conexao: 'database', filas: ['default', 'emails'] },
  cache: 'database',
  horizon: { instalado: true, chokidar: false },
  pail: true,
  reverb: { host: '0.0.0.0', porta: 8080, chave: 'chave-local', broadcastHost: 'localhost', broadcastPorta: '8080' },
  logs: '/app/storage/logs',
  ...extra,
})

const SERVICOS = {
  server: { preset: 'laravel', cwd: 'backend' },
  queue: { preset: 'laravel:queue', cwd: 'backend' },
  horizon: { preset: 'laravel:horizon', cwd: 'backend' },
  reverb: { preset: 'laravel:reverb', cwd: 'backend' },
  logs: { preset: 'laravel:pail', cwd: 'backend' },
  web: { preset: 'vite', cwd: 'frontend' },
}

function comInfo(info, arquivos = {}) {
  const contexto = contextoFalso({ servicos: SERVICOS }, arquivos)
  contexto.grupos[0].info = info

  return contexto
}

const itens = async contexto => (await diagnosticarLaravel(contexto.grupos[0], contexto)).map(({ estado, item, detalhe, reparo }) => ({ estado, item, detalhe, reparo }))

describe('interpretarResposta', () => {
  it('lê o JSON, mesmo com lixo antes', () => {
    assert.deepEqual(interpretarResposta({ saida: 'aviso qualquer\n{"ok":true,"x":1}', erro: '' }), { ok: true, x: 1 })
  })

  it('PHP ausente vira php-ausente', () => {
    assert.equal(interpretarResposta({ saida: '', erro: "'php' não é reconhecido como um comando interno" }).etapa, 'php-ausente')
    assert.equal(interpretarResposta({ saida: '', erro: 'sh: php: command not found' }).etapa, 'php-ausente')
  })

  it('outra falha guarda a primeira linha', () => {
    assert.deepEqual(interpretarResposta({ saida: '', erro: 'Segmentation fault\nmais' }), { ok: false, etapa: 'php', erro: 'Segmentation fault' })
  })
})

describe('explicarFalha', () => {
  it('versão do PHP diferente da que o Composer pede', () => {
    const { detalhe, passos } = explicarFalha(
      { etapa: 'fatal', erro: 'Composer detected issues in your platform: Your Composer dependencies require a PHP version ">= 8.5.0". You are running 8.4.15.' },
      'backend',
    )

    assert.equal(detalhe, 'o projeto pede PHP 8.5.0 ou mais novo, mas o php usado é o 8.4.15')
    assert.match(passos[1], /ORBITA_PHP/)
  })

  it('sem vendor manda rodar o setup', () => {
    assert.match(explicarFalha({ etapa: 'vendor', erro: '' }, 'api').detalhe, /api\/vendor — rode `codify setup`/)
  })
})

describe('familiaLaravel.ajustar', () => {
  const removidos = info => familiaLaravel.ajustar(comInfo(info).grupos[0]).removidos.map(({ nome }) => nome)

  it('sem pcntl: fica o queue:listen, sai o Horizon e o Pail', () => {
    assert.deepEqual(removidos(infoSaudavel()), ['horizon', 'logs'])
  })

  it('com pcntl e fila redis: fica o Horizon, sai o queue:listen', () => {
    assert.deepEqual(removidos(infoSaudavel({ pcntl: true, fila: { conexao: 'redis', filas: ['default'] } })), ['queue'])
  })

  it('com pcntl e fila database: Horizon não serve', () => {
    assert.deepEqual(removidos(infoSaudavel({ pcntl: true })), ['horizon'])
  })

  it('sem info (consulta falhou) não mexe em nada', () => {
    assert.deepEqual(familiaLaravel.ajustar({ info: null, servicos: [] }).removidos, [])
  })
})

describe('comandos dos presets', () => {
  it('serve, queue:listen com as filas, reverb na porta e horizon conforme o chokidar', () => {
    const contexto = comInfo(infoSaudavel())
    const comando = nome => {
      const servico = contexto.servicos.find(s => s.nome === nome)

      return servico.preset.comando(servico, contexto)
    }

    assert.equal(comando('server'), 'php artisan serve --host=127.0.0.1 --port=8000')
    assert.equal(comando('queue'), 'php artisan queue:listen --tries=1 --timeout=0 --queue=default,emails')
    assert.equal(comando('reverb'), 'php artisan reverb:start --port=8080')
    assert.equal(comando('horizon'), 'php artisan horizon')
    assert.equal(comando('web'), 'npm run dev -- --port 5173 --strictPort')
  })

  it('usa o PHP de ORBITA_PHP, com aspas se tiver espaço', () => {
    const contexto = contextoFalso({ servicos: { server: { preset: 'laravel', cwd: 'b' } } }, {}, { env: { ORBITA_PHP: 'C:/Program Files/php/php.exe' } })

    assert.equal(contexto.servicos[0].preset.comando(contexto.servicos[0], contexto), '"C:/Program Files/php/php.exe" artisan serve --host=127.0.0.1 --port=8000')
  })
})

describe('diagnosticarLaravel', () => {
  it('app saudável: chaves, banco, fila e a chave do Reverb no frontend', async () => {
    const contexto = comInfo(infoSaudavel(), { 'frontend/.env': 'VITE_REVERB_APP_KEY=chave-local\n' })

    assert.deepEqual(
      (await itens(contexto)).map(({ estado, item }) => `${estado} ${item}`),
      ['ok APP_KEY', 'ok Banco (mariadb)', 'ok Fila', 'ok VITE_REVERB_APP_KEY (frontend)'],
    )
  })

  it('consulta que falhou vira um erro só, explicado', async () => {
    const contexto = comInfo(null)
    contexto.grupos[0].falha = { etapa: 'vendor', erro: '' }

    assert.deepEqual(await itens(contexto), [{ estado: 'erro', item: 'Laravel (backend)', detalhe: 'sem backend/vendor — rode `codify setup`', reparo: null }])
  })

  it('chaves vazias são erro; JWT só se o projeto usa', async () => {
    const lista = await itens(comInfo(infoSaudavel({ app: { nome: 'L', env: 'local', chave: false }, jwt: { usa: true, segredo: false } })))

    assert.equal(lista.find(i => i.item === 'APP_KEY').estado, 'erro')
    assert.equal(lista.find(i => i.item === 'JWT_SECRET').estado, 'erro')
  })

  it('banco: cada estado com o reparo certo', async () => {
    const banco = estado => ({ ...infoSaudavel().banco, ...estado })
    const doBanco = async estado => (await itens(comInfo(infoSaudavel({ banco: banco(estado) })))).find(i => i.item.startsWith('Banco'))

    assert.deepEqual((await doBanco({ estado: 'sem-conexao', erro: '[2002] recusou' })).reparo, { tipo: 'banco', mensagem: '[2002] recusou' })
    assert.deepEqual((await doBanco({ estado: 'nunca-migrado' })).reparo, { tipo: 'migrar', semente: true })
    assert.match((await doBanco({ estado: 'pendentes', pendentes: 4 })).detalhe, /4 migration\(s\) pendente\(s\)/)
    assert.equal((await doBanco({ estado: 'sqlite-inexistente', banco: 'x.sqlite' })).estado, 'erro')
  })

  it('Redis só importa se a fila, o cache ou o Horizon usam', async () => {
    // O Horizon foi declarado, mas saiu no ajuste (sem pcntl): o Redis não importa mais.
    const contexto = comInfo(infoSaudavel({ redis: { estado: 'erro', endereco: 'x', erro: 'Class "Redis" not found' } }))
    removerServicos(contexto, ['horizon'])
    const semUso = await itens(contexto)
    assert.ok(!semUso.some(i => i.item === 'Redis'))

    const comUso = await itens(comInfo(infoSaudavel({ cache: 'redis', redis: { estado: 'erro', endereco: '127.0.0.1:6379', erro: 'recusou' } })))
    assert.equal(comUso.find(i => i.item === 'Redis').estado, 'erro')
  })

  it('fila sync é aviso; chave do Reverb diferente também', async () => {
    const lista = await itens(comInfo(infoSaudavel({ fila: { conexao: 'sync', filas: ['default'] } }), { 'frontend/.env': 'VITE_REVERB_APP_KEY=outra\n' }))

    assert.equal(lista.find(i => i.item === 'Fila').estado, 'aviso')
    assert.match(lista.find(i => i.item.startsWith('VITE_REVERB')).detalhe, /websocket será recusado/)
  })
})

describe('ambiente.php (PHP real, se houver)', () => {
  const temPhp = spawnSync('php', ['-v'], { shell: process.platform === 'win32' }).status === 0

  it('pasta sem vendor responde JSON com a etapa', { skip: !temPhp && 'sem PHP no PATH' }, async () => {
    const resposta = await consultarLaravel(criarProjetoTemporario({ 'artisan': '' }), ['info'], { executar, php: 'php' })

    assert.equal(resposta.ok, false)
    assert.equal(resposta.etapa, 'vendor')
  })

  it('pasta que não existe responde JSON de argumentos', { skip: !temPhp && 'sem PHP no PATH' }, async () => {
    const resposta = await consultarLaravel('/pasta/que/nao/existe', ['info'], { executar, php: 'php' })

    assert.equal(resposta.etapa, 'argumentos')
  })
})
