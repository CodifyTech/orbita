import assert from 'node:assert/strict'
import { appendFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { criarEstado, servicoDe } from '../../src/painel/estado.mjs'
import { arquivoMaisRecente, compilarArquivos, criarVigia, lerMonolog } from '../../src/painel/vigia-log.mjs'
import { criarPlanoFalso } from '../_ajudantes/plano-falso.mjs'
import { criarProjetoTemporario } from '../_ajudantes/saida-falsa.mjs'

describe('lerMonolog', () => {
  it('lê nível e mensagem, sem o contexto JSON', () => {
    assert.deepEqual(lerMonolog('[2025-01-31 10:00:00] local.ERROR: Falhou o pedido {"exception":"[object]"}'), {
      nivel: 'erro',
      nivelLog: 'ERROR',
      mensagem: 'Falhou o pedido',
    })
    assert.equal(lerMonolog('[2025-01-31T10:00:00.123456+00:00] production.WARNING: cuidado').nivel, 'alerta')
    assert.equal(lerMonolog('[2025-01-31 10:00:00] local.CRITICAL: x').nivel, 'erro')
    assert.equal(lerMonolog('[2025-01-31 10:00:00] local.INFO: x').nivel, null)
  })

  it('linha de stack trace não é cabeçalho', () => {
    assert.equal(lerMonolog('#0 /app/vendor/laravel/framework/src/Foo.php(12): bar()'), null)
  })
})

describe('arquivos', () => {
  it('compilarArquivos: regex inválida vira "qualquer .log"', () => {
    assert.equal(compilarArquivos('(').source, '\\.log$')
    assert.ok(compilarArquivos('^laravel.*\\.log$').test('laravel-2025-01-31.log'))
  })

  it('arquivoMaisRecente escolhe o modificado por último; pasta ausente dá null', () => {
    const pasta = criarProjetoTemporario({ 'laravel-1.log': 'a', 'laravel-2.log': 'bb', 'outro.txt': 'x' })
    try {
      utimesSync(join(pasta, 'laravel-1.log'), new Date(), new Date(Date.now() + 60_000))
      assert.equal(arquivoMaisRecente(pasta, /^laravel.*\.log$/).nome, 'laravel-1.log')
      assert.equal(arquivoMaisRecente(join(pasta, 'nao-existe'), /x/), null)
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })
})

describe('criarVigia (arquivo de verdade)', () => {
  const montar = (formato = 'monolog') => {
    const pasta = criarProjetoTemporario({})
    const plano = criarPlanoFalso()
    plano.logs[0] = { ...plano.logs[0], pasta, formato }
    const estado = criarEstado(plano)

    return { pasta, estado, s: servicoDe(estado, 'laravel') }
  }

  it('ao abrir, mostra só os cabeçalhos das últimas entradas, sem alertar', () => {
    const { pasta, estado, s } = montar()
    try {
      writeFileSync(
        join(pasta, 'laravel.log'),
        '[2025-01-31 10:00:00] local.ERROR: antigo {"x":1}\n#0 stack\n#1 stack\n[2025-01-31 10:00:01] local.INFO: info antiga\n',
      )
      const vigia = criarVigia(estado, s, { intervalo: 0 })
      assert.equal(s.estado, 'online')
      assert.equal(s.metricas.arquivo, 'laravel.log')
      const textos = s.linhas.map(l => l.texto)
      assert.match(textos[0], /acompanhando laravel\.log — as últimas 2 entradas/)
      assert.ok(textos.some(t => t.includes('local.ERROR: antigo')))
      assert.ok(!textos.some(t => t.startsWith('#0')))
      assert.equal(estado.alertas.length, 0)
      vigia.parar()
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })

  it('lê só o trecho novo, junta linha partida entre ciclos e alerta erros novos', () => {
    const { pasta, estado, s } = montar()
    try {
      const arquivo = join(pasta, 'laravel.log')
      writeFileSync(arquivo, '')
      const vigia = criarVigia(estado, s, { intervalo: 0 })
      const antes = s.linhas.length
      // O primeiro pedaço termina no meio da linha e no meio do "ç" (2 bytes em UTF-8).
      const fim = Buffer.from('ção ção\n')
      const inicio = '[2025-01-31 10:00:00] local.ERROR: Pedido 12 falhou {"e":1}\n#0 stack trace\n[2025-01-31 10:00:01] local.WARNING: a'
      appendFileSync(arquivo, Buffer.concat([Buffer.from(inicio), fim.subarray(0, 1)]))
      vigia.ciclo()
      appendFileSync(arquivo, fim.subarray(1))
      vigia.ciclo()
      const novas = s.linhas.slice(antes)
      assert.deepEqual(
        novas.map(l => l.nivel),
        ['erro', 'traco', 'alerta'],
      )
      assert.equal(novas[2].texto, '[2025-01-31 10:00:01] local.WARNING: ação ção')
      assert.deepEqual(estado.alertas.map(a => a.texto), ['ERROR: Pedido 12 falhou', 'WARNING: ação ção'])
      assert.equal(s.metricas.entradas, 2)
      vigia.parar()
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })

  it('arquivo truncado recomeça do início; arquivo novo (log diário) é anunciado', () => {
    const { pasta, estado, s } = montar('texto')
    try {
      const primeiro = join(pasta, 'laravel-1.log')
      writeFileSync(primeiro, 'linha velha que é bem comprida\n')
      const vigia = criarVigia(estado, s, { intervalo: 0 })
      writeFileSync(primeiro, 'Erro curto\n')
      vigia.ciclo()
      assert.equal(s.linhas.at(-1).texto, 'Erro curto')
      assert.equal(s.linhas.at(-1).nivel, 'erro')

      const segundo = join(pasta, 'laravel-2.log')
      writeFileSync(segundo, 'primeira do dia\n')
      utimesSync(segundo, new Date(), new Date(Date.now() + 60_000))
      vigia.ciclo()
      assert.deepEqual(
        s.linhas.slice(-2).map(l => l.texto),
        ['▶ novo arquivo: laravel-2.log', 'primeira do dia'],
      )
      assert.equal(vigia.caminho(), segundo)
      vigia.parar()
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })
})
