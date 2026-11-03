import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { criarEstado, irPara, servicoDe, vista } from '../../src/painel/estado.mjs'
import {
  alertar,
  avancar,
  contarAlertas,
  lerFluxo,
  limparAlertas,
  limparLog,
  limparTodos,
  linhaDoProcesso,
  linhasVisiveis,
  MAX_ALERTAS,
  MAX_LINHAS,
  MAX_TODAS,
  registrar,
  textoDoAlerta,
} from '../../src/painel/logs.mjs'
import { criarPlanoFalso, proximoCiclo } from '../_ajudantes/plano-falso.mjs'

const novo = () => {
  const estado = criarEstado(criarPlanoFalso(), { agora: 0 })

  return { estado, server: servicoDe(estado, 'server'), queue: servicoDe(estado, 'queue') }
}

describe('registrar', () => {
  it('guarda no serviço e na aba Todos, com seq crescente', () => {
    const { estado, server, queue } = novo()
    const a = registrar(estado, server, 'um')
    const b = registrar(estado, queue, 'dois')
    assert.equal(b.seq, a.seq + 1)
    assert.deepEqual(server.linhas.map(l => l.texto), ['um'])
    assert.deepEqual(estado.todas.map(l => l.texto), ['um', 'dois'])
    assert.equal(server.ultima, a)
  })

  it('limita o buffer do serviço e o da aba Todos (corta em blocos de 500)', () => {
    const { estado, server } = novo()
    for (let i = 0; i < MAX_TODAS + 600; i++) {
      registrar(estado, server, `linha ${i}`)
    }
    assert.ok(server.linhas.length <= MAX_LINHAS + 500)
    assert.ok(estado.todas.length <= MAX_TODAS + 500)
    assert.equal(server.linhas.at(-1).texto, `linha ${MAX_TODAS + 599}`)
  })

  it('erro e aviso viram alerta; histórico antigo não', () => {
    const { estado, server } = novo()
    registrar(estado, server, 'falhou', 'erro')
    registrar(estado, server, 'cuidado', 'alerta')
    registrar(estado, server, 'velho', 'erro', { antigo: true })
    registrar(estado, server, 'texto da linha', 'erro', { alerta: 'resumo do alerta' })
    assert.deepEqual(estado.alertas.map(a => a.texto), ['falhou', 'cuidado', 'resumo do alerta'])
    assert.equal(server.erros, 2)
    assert.equal(server.avisos, 1)
  })

  it('quem está lendo lá em cima continua no mesmo ponto e vê o contador de novas', () => {
    const { estado, server } = novo()
    vista(estado, 'server').rolagem = 5
    vista(estado, 'todos').rolagem = 2
    vista(estado, 'todos').filtro = 'nada a ver'
    registrar(estado, server, 'nova')
    assert.deepEqual(vista(estado, 'server'), { rolagem: 6, novos: 1, filtro: '' })
    assert.equal(vista(estado, 'todos').rolagem, 2)
  })

  it('chama aoRegistrar (é assim que o modo inline imprime)', () => {
    const { estado, server } = novo()
    const vistas = []
    estado.aoRegistrar = (s, linha) => vistas.push(`${s.nome}:${linha.texto}`)
    registrar(estado, server, 'oi')
    assert.deepEqual(vistas, ['server:oi'])
  })
})

describe('alertar', () => {
  it('junta repetidos do último minuto (números não contam) e separa os de depois', () => {
    const { estado, server } = novo()
    alertar(estado, server, 'erro', 'pedido 12 falhou', 1, 1000)
    alertar(estado, server, 'erro', 'pedido 345 falhou', 2, 2000)
    assert.equal(estado.alertas.length, 1)
    assert.equal(estado.alertas[0].vezes, 2)
    assert.equal(estado.alertas[0].seq, 2)
    alertar(estado, server, 'erro', 'pedido 1 falhou', 3, 2000 + 61_000)
    assert.equal(estado.alertas.length, 2)
  })

  it('mantém no máximo MAX_ALERTAS', () => {
    const { estado, server } = novo()
    for (let i = 0; i < MAX_ALERTAS + 10; i++) {
      alertar(estado, server, 'erro', `erro ${'x'.repeat(i % 50)}${String.fromCharCode(65 + (i % 26))}${i}`, i, i * 70_000)
    }
    assert.equal(estado.alertas.length, MAX_ALERTAS)
  })

  it('com o painel na tela, conta não vistos e mostra toast de erro', () => {
    const { estado, server } = novo()
    estado.painel = true
    alertar(estado, server, 'erro', 'quebrou', 1, 1000)
    assert.equal(estado.alertasNaoVistos, 1)
    assert.equal(server.naoVistos, 1)
    assert.equal(estado.toast.nivel, 'erro')
    assert.match(estado.toast.texto, /server: quebrou/)

    irPara(estado, 'server')
    alertar(estado, server, 'alerta', 'cuidado', 2, 1000)
    assert.equal(server.naoVistos, 0)
    assert.equal(estado.alertasNaoVistos, 2)
  })

  it('contarAlertas soma as repetições', () => {
    assert.deepEqual(
      contarAlertas([
        { nivel: 'erro', vezes: 3 },
        { nivel: 'alerta', vezes: 1 },
        { nivel: 'erro', vezes: 1 },
      ]),
      { erros: 4, avisos: 1 },
    )
  })
})

describe('avancar (gráfico de atividade)', () => {
  it('anda um balde a cada 2 s, mesmo sem linhas', () => {
    const { server } = novo()
    avancar(server, 10_000)
    server.atividade[server.atividade.length - 1] = 7
    avancar(server, 14_000)
    assert.deepEqual(server.atividade.slice(-3), [7, 0, 0])
  })

  it('pausa longa zera o gráfico sem laço infinito', () => {
    const { server } = novo()
    avancar(server, 2000)
    server.atividade.fill(1)
    avancar(server, 2000 + 10 * 3600_000)
    assert.ok(server.atividade.every(v => v === 0))
  })
})

describe('linhaDoProcesso', () => {
  it('limpa, tira o carimbo de data e classifica pelas regex do serviço', () => {
    const { estado, server, queue } = novo()
    linhaDoProcesso(estado, server, '  2025-01-01 10:00:00 \x1b[31mERROR\x1b[0m deu ruim\r')
    assert.equal(server.linhas[0].texto, 'ERROR deu ruim')
    assert.equal(server.linhas[0].nivel, 'erro')
    // A fila só considera FAIL como erro (padrões do plano).
    linhaDoProcesso(estado, queue, 'ERROR que a fila não vê como erro')
    assert.equal(queue.linhas[0].nivel, null)
  })

  it('fica só com o último estado de uma barra de progresso (\\r)', () => {
    const { estado, server } = novo()
    linhaDoProcesso(estado, server, '10%\r50%\r100% pronto')
    assert.equal(server.linhas[0].texto, '100% pronto')
  })

  it('ignora linha vazia e as descartadas pela métrica', () => {
    const { estado, server } = novo()
    linhaDoProcesso(estado, server, '   ')
    linhaDoProcesso(estado, server, '/up ....... ~ 0.4ms')
    assert.equal(server.linhas.length, 0)
  })
})

describe('lerFluxo', () => {
  it('entrega linha a linha, juntando pedaços, e a última no fim', async () => {
    const stream = new PassThrough()
    const linhas = []
    lerFluxo(stream, l => linhas.push(l))
    stream.write('pri')
    stream.write('meira\nsegunda\nter')
    stream.end('ceira')
    await proximoCiclo()
    assert.deepEqual(linhas, ['primeira', 'segunda', 'terceira'])
  })
})

describe('limpar e copiar', () => {
  it('limparLog esvazia o serviço e as linhas dele na aba Todos', () => {
    const { estado, server, queue } = novo()
    registrar(estado, server, 'a')
    registrar(estado, queue, 'b')
    limparLog(estado, server)
    assert.equal(server.linhas.length, 0)
    assert.deepEqual(estado.todas.map(l => l.texto), ['b'])
    limparTodos(estado)
    assert.equal(estado.todas.length, 0)
    assert.equal(queue.linhas.length, 0)
  })

  it('limparAlertas zera a lista e os contadores', () => {
    const { estado, server } = novo()
    estado.painel = true
    registrar(estado, server, 'x', 'erro')
    limparAlertas(estado)
    assert.equal(estado.alertas.length, 0)
    assert.equal(server.naoVistos, 0)
    assert.equal(estado.alertasNaoVistos, 0)
  })

  it('textoDoAlerta leva o contexto do log', () => {
    const { estado, server } = novo()
    registrar(estado, server, 'antes', null, { agora: 0 })
    registrar(estado, server, 'quebrou', 'erro', { agora: 0 })
    registrar(estado, server, 'depois', null, { agora: 0 })
    const texto = textoDoAlerta(estado.alertas[0])
    assert.match(texto, /^\[server\] \d\d:\d\d:\d\d quebrou\n\n/)
    assert.match(texto, /antes\n.*quebrou\n.*depois$/)
  })

  it('linhasVisiveis respeita filtro e rolagem', () => {
    const { estado, server, queue } = novo()
    for (let i = 1; i <= 10; i++) {
      registrar(estado, i % 2 ? server : queue, `linha ${i}`, null, { agora: 0 })
    }
    vista(estado, 'todos').rolagem = 2
    const { texto, quantidade } = linhasVisiveis(estado, null, 3)
    assert.equal(quantidade, 3)
    assert.match(texto, /\[queue\] linha 6\n.*\[server\] linha 7\n.*\[queue\] linha 8$/)

    vista(estado, 'server').filtro = 'linha 1'
    assert.equal(linhasVisiveis(estado, server, 10).quantidade, 1)
  })
})
