import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { diagnosticarPortas } from '../../src/doctor/diagnostico.mjs'
import { rodarDoctor } from '../../src/doctor/index.mjs'
import { reparar } from '../../src/doctor/reparo.mjs'
import { resolverPortas } from '../../src/plano/portas.mjs'
import { repararBanco } from '../../src/presets/laravel/reparo.mjs'
import { contextoFalso, perguntasProntas } from '../_ajudantes/projeto-falso.mjs'

/** Ocupa uma porta livre qualquer e devolve { porta, fechar }. */
const ocuparPorta = () =>
  new Promise(resolve => {
    const servidor = createServer().listen(0, '127.0.0.1', () =>
      resolve({ porta: servidor.address().port, fechar: () => new Promise(ok => servidor.close(ok)) }),
    )
  })

describe('portas no doctor', () => {
  it('porta ocupada vira aviso com reparo; livre é ok', async () => {
    const ocupada = await ocuparPorta()

    try {
      const contexto = contextoFalso({ servicos: { web: { cmd: 'x', porta: ocupada.porta }, api: { cmd: 'y', porta: ocupada.porta + 1 } } })
      const [web, api] = await diagnosticarPortas(contexto.servicos)

      assert.equal(web.estado, 'aviso')
      assert.match(web.detalhe, /em uso por .*node|em uso por/)
      assert.equal(web.reparo.tipo, 'porta')
      assert.equal(api.estado, 'ok')
    } finally {
      await ocupada.fechar()
    }
  })

  it('reparo da porta: confirma e grava DEV_<NOME>_PORT no .env de preferências', async () => {
    const ocupada = await ocuparPorta()

    try {
      const contexto = contextoFalso({ servicos: { web: { cmd: 'x', porta: ocupada.porta } } }, { '.env': '' }, { perguntas: perguntasProntas([true]) })
      const itens = await diagnosticarPortas(contexto.servicos)

      assert.equal(await reparar(itens, contexto), true)
      const gravada = Number(/DEV_WEB_PORT=(\d+)/.exec(readFileSync(join(contexto.projeto.raiz, '.env'), 'utf8'))[1])
      assert.ok(gravada > ocupada.porta)
      assert.equal(contexto.servicos[0].porta, gravada)
    } finally {
      await ocupada.fechar()
    }
  })

  it('reparo recusado não muda nada', async () => {
    const ocupada = await ocuparPorta()

    try {
      const contexto = contextoFalso({ servicos: { web: { cmd: 'x', porta: ocupada.porta } } }, {}, { perguntas: perguntasProntas([false]) })

      assert.equal(await reparar(await diagnosticarPortas(contexto.servicos), contexto), false)
      assert.equal(contexto.servicos[0].porta, ocupada.porta)
    } finally {
      await ocupada.fechar()
    }
  })
})

describe('rodarDoctor', () => {
  it('sem perguntas: só diagnostica, mostra a tabela e o resumo', async () => {
    const contexto = contextoFalso({ servicos: { worker: { cmd: 'x', cwd: 'nao-existe' } } })
    const { ok, alterou } = await rodarDoctor(contexto, { perguntar: false })

    assert.equal(ok, false)
    assert.equal(alterou, false)
    assert.match(contexto.saida.texto(), /Serviços \.+ worker/)
    assert.match(contexto.saida.texto(), /1 problema\(s\) impedem/)
  })

  it('para depois de 6 rodadas mesmo se o conserto "funcionar" sempre', async () => {
    const contexto = contextoFalso({ servicos: { worker: { cmd: 'x' } } })
    let rodadas = 0
    contexto.grupos[0].familia = {
      ...contexto.grupos[0].familia,
      diagnosticar: async grupo => (rodadas++, [{ estado: 'aviso', item: 'x', detalhe: 'y', reparo: { tipo: 'teimoso' }, grupo }]),
      reparar: async () => true,
    }

    await rodarDoctor(contexto, { perguntar: true })
    assert.equal(rodadas, 6)
  })
})

describe('resolverPortas (dev)', () => {
  it('sem terminal: troca sozinho só nesta execução', async () => {
    const ocupada = await ocuparPorta()

    try {
      const contexto = contextoFalso({ servicos: { web: { preset: 'vite', porta: ocupada.porta } } }, {}, { perguntas: { ...perguntasProntas(), interativo: false } })

      assert.equal(await resolverPortas(contexto), true)
      assert.ok(contexto.servicos[0].porta > ocupada.porta)
      assert.match(contexto.saida.texto(), /usando a \d+ nesta execução; abra http:\/\/localhost:\d+/)
    } finally {
      await ocupada.fechar()
    }
  })

  it('com terminal: "pular" deixa o serviço de fora; sem nenhum, cancela', async () => {
    const ocupada = await ocuparPorta()

    try {
      const contexto = contextoFalso({ servicos: { web: { cmd: 'x', porta: ocupada.porta } } }, {}, { perguntas: perguntasProntas(['pular']) })

      assert.equal(await resolverPortas(contexto), false)
      assert.equal(contexto.servicos.length, 0)
      assert.match(contexto.saida.texto(), /Nenhum serviço sobrou/)
    } finally {
      await ocupada.fechar()
    }
  })
})

describe('reparo do banco (Laravel)', () => {
  const comBanco = (perguntas, executar) => {
    const contexto = contextoFalso({ servicos: { server: { preset: 'laravel', cwd: 'backend' } } }, { 'backend/.env': 'DB_HOST=mariadb\nDB_PORT=3306\n' }, { perguntas: perguntasProntas(perguntas), executar })
    contexto.grupos[0].info = { banco: { driver: 'mariadb', host: 'mariadb', porta: '3306', banco: 'loja', usuario: 'root' } }

    return contexto
  }
  const envDo = contexto => readFileSync(join(contexto.projeto.raiz, 'backend', '.env'), 'utf8')

  it('conexão recusada: pergunta host e porta e grava no .env do app', async () => {
    const contexto = comBanco([true, '127.0.0.1', '3375'])

    assert.equal(await repararBanco(contexto.grupos[0], 'SQLSTATE[HY000] [2002] Connection refused', contexto), true)
    assert.equal(envDo(contexto), 'DB_HOST=127.0.0.1\nDB_PORT=3375\n')
  })

  it('acesso negado: usuário e senha (senha com caractere especial vai entre aspas)', async () => {
    const contexto = comBanco([true, 'app', 'p@ss $1'])

    assert.equal(await repararBanco(contexto.grupos[0], '[1045] Access denied', contexto), true)
    assert.match(envDo(contexto), /^DB_USERNAME=app$/m)
    assert.match(envDo(contexto), /^DB_PASSWORD="p@ss \\\$1"$/m)
  })

  it('banco inexistente: cria pelo ambiente.php', async () => {
    const chamadas = []
    const executar = async (comando, args) => (chamadas.push(args), { ok: true, saida: '{"ok":true,"banco":"loja"}', erro: '' })
    const contexto = comBanco(['criar'], executar)

    assert.equal(await repararBanco(contexto.grupos[0], "[1049] Unknown database 'loja'", contexto), true)
    assert.deepEqual(chamadas[0].slice(-2), ['criar-banco', 'loja'])
    assert.match(contexto.saida.texto(), /Banco 'loja' pronto/)
  })

  it('"Nada, eu resolvo" não mexe em nada; erro desconhecido não tem conserto', async () => {
    const contexto = comBanco(['nada'])

    assert.equal(await repararBanco(contexto.grupos[0], 'Unknown database', contexto), false)
    assert.equal(await repararBanco(contexto.grupos[0], 'syntax error', contexto), false)
    assert.equal(envDo(contexto), 'DB_HOST=mariadb\nDB_PORT=3306\n')
  })
})
