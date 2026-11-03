import assert from 'node:assert/strict'
import { createServer as criarServidorHttp } from 'node:http'
import { createServer as criarServidorTcp } from 'node:net'
import { describe, it } from 'node:test'
import { criarServico } from '../../src/painel/estado.mjs'
import { aplicarSaude, consultar, consultarHttp, consultarTcp, rotuloDaSaude } from '../../src/painel/saude.mjs'

const ouvir = servidor =>
  new Promise(resolve => {
    servidor.listen(0, '127.0.0.1', () => resolve(servidor.address().port))
  })
const fechar = servidor => new Promise(resolve => servidor.close(resolve))

const servico = estado =>
  criarServico('server', { estado, inicio: 0, url: 'http://127.0.0.1:8000', saude: { tipo: 'http', url: 'http://127.0.0.1:8000/up' } })

describe('aplicarSaude', () => {
  it('subindo + resposta ok = no ar, com a latência e uma linha no log', () => {
    const s = servico('subindo')
    const evento = aplicarSaude(s, { status: 200, ms: 12 }, 3000)
    assert.equal(s.estado, 'online')
    assert.equal(s.latencia, 12)
    assert.deepEqual(evento, { texto: '✔ no ar em 3s · http://127.0.0.1:8000', nivel: 'sistema' })
  })

  it('4xx ainda conta como no ar (o servidor está de pé)', () => {
    const s = servico('subindo')
    aplicarSaude(s, { status: 404, ms: 1 })
    assert.equal(s.estado, 'online')
  })

  it('no ar: uma falha é tolerada, a segunda vira "sem resposta" com alerta', () => {
    const s = servico('online')
    assert.equal(aplicarSaude(s, null), null)
    assert.equal(s.estado, 'online')
    const evento = aplicarSaude(s, { status: 503, ms: 5 })
    assert.equal(s.estado, 'instavel')
    assert.equal(s.detalhe, '/up → 503')
    assert.equal(evento.nivel, 'alerta')
    assert.match(evento.texto, /respondeu 503 em \/up/)
  })

  it('volta a responder', () => {
    const s = servico('instavel')
    assert.equal(aplicarSaude(s, { status: 200, ms: 3 }).texto, '✔ voltou a responder')
    assert.equal(s.detalhe, null)
  })

  it('subindo sem resposta continua subindo, sem alerta', () => {
    const s = servico('subindo')
    assert.equal(aplicarSaude(s, null), null)
    assert.equal(aplicarSaude(s, null), null)
    assert.equal(s.estado, 'subindo')
  })

  it('rotuloDaSaude', () => {
    assert.equal(rotuloDaSaude({ tipo: 'http', url: 'http://localhost:8000/up' }), '/up')
    assert.equal(rotuloDaSaude({ tipo: 'tcp', porta: 8080 }), ':8080')
  })
})

describe('consultas (sistema real)', () => {
  it('HTTP: status e latência; porta fechada dá null', async () => {
    const servidor = criarServidorHttp((req, res) => {
      res.statusCode = req.url === '/up' ? 200 : 500
      res.end('ok')
    })
    const porta = await ouvir(servidor)
    const resposta = await consultarHttp(`http://127.0.0.1:${porta}/up`)
    assert.equal(resposta.status, 200)
    assert.ok(resposta.ms >= 0)
    assert.equal((await consultar({ tipo: 'http', url: `http://127.0.0.1:${porta}/x` })).status, 500)
    await fechar(servidor)
    assert.equal(await consultarHttp(`http://127.0.0.1:${porta}/up`, { timeout: 500 }), null)
  })

  it('TCP: conecta na porta aberta; fechada dá null', async () => {
    const servidor = criarServidorTcp(conexao => conexao.end())
    const porta = await ouvir(servidor)
    assert.equal((await consultarTcp(porta)).status, 0)
    await fechar(servidor)
    assert.equal(await consultar({ tipo: 'tcp', porta }), null)
  })

  it('URL inválida ou saúde incompleta dá null sem lançar', async () => {
    assert.equal(await consultarHttp('não é url'), null)
    assert.equal(await consultar({ tipo: 'http' }), null)
  })
})
