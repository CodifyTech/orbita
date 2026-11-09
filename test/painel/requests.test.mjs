import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tratarEntrada } from '../../src/painel/entrada.mjs'
import { abaAtual, criarEstado, irPara, servicoDe, vista } from '../../src/painel/estado.mjs'
import { limparLog, linhaDoProcesso, registrar } from '../../src/painel/logs.mjs'
import { lerRequisicao } from '../../src/painel/metricas.mjs'
import { criarConsultaDeRequest, lerResposta, paraVariavel, textoDaSecao } from '../../src/painel/requests.mjs'
import { rolagemParaVer } from '../../src/painel/tela/log.mjs'
import { quadro } from '../../src/painel/tela/quadro.mjs'
import { linhasDaSecao } from '../../src/painel/tela/request.mjs'
import { semCores, vis } from '../../src/painel/texto.mjs'
import { criarPlanoFalso } from '../_ajudantes/plano-falso.mjs'

const CIMA = '\x1b[A'
const BAIXO = '\x1b[B'
const ENTER = '\r'
const ESC = '\x1b'
const RODA_CIMA = '\x1b[<64;5;10M'
const RODA_BAIXO = '\x1b[<65;5;10M'
const LARGURA = 120
const ALTURA = 36
const DETALHES = { programa: 'php', args: ['ambiente.php', '/projeto/backend', 'request'], cwd: '/projeto/backend' }

function criarCtx({ linhas = 3 } = {}) {
  const plano = criarPlanoFalso()
  plano.processos[0].detalhesDeRequest = DETALHES
  const estado = criarEstado(plano)
  const consultas = []
  const copias = []
  const ctx = {
    estado,
    alturaDoLog: () => 20,
    agora: () => 10_000,
    encerrar: () => consultas.push('encerrar'),
    consultarRequest: detalhe => consultas.push(detalhe),
    copiar: (texto, rotulo) => copias.push([texto, rotulo]),
  }
  const s = servicoDe(estado, 'server')
  irPara(estado, 'server')
  const desenhar = () => quadro(estado, LARGURA, ALTURA, 0)
  const teclar = (...teclas) =>
    teclas.forEach(tecla => {
      tratarEntrada(ctx, tecla)
      desenhar()
    })
  const request = (caminho, ms = 12) => linhaDoProcesso(estado, s, `${caminho} ........ ~ ${ms}ms`, 1000)
  for (let i = 1; i <= linhas; i++) {
    request(`/api/r${i}`)
  }
  desenhar()

  return { ctx, estado, s, consultas, copias, teclar, request, desenhar, v: vista(estado, 'server') }
}

const selecionada = ({ s, v }) => s.linhas.find(l => l.seq === v.sel)?.req.caminho ?? null

describe('lerRequisicao', () => {
  it('lê caminho e duração da linha do artisan serve', () => {
    assert.deepEqual(lerRequisicao('/api/pedidos ......... ~ 12.5ms'), { caminho: '/api/pedidos', ms: 12.5 })
    assert.deepEqual(lerRequisicao('/ .... ~ 2s'), { caminho: '/', ms: 2000 })
    assert.equal(lerRequisicao('Server running on [http://127.0.0.1:8000]'), null)
  })

  it('só marca o request em serviço que sabe detalhar', () => {
    const { s, estado } = criarCtx({ linhas: 1 })
    assert.deepEqual(s.linhas[0].req, { caminho: '/api/r1', ms: 12 })
    const fila = servicoDe(estado, 'queue')
    linhaDoProcesso(estado, fila, '/api/x .... ~ 3ms', 1000)
    assert.equal(fila.linhas[0].req, undefined)
  })
})

describe('escolher o request', () => {
  it('↑ começa no mais novo visível e anda para os mais antigos; ↓ volta', () => {
    const c = criarCtx()
    c.teclar(CIMA)
    assert.equal(selecionada(c), '/api/r3')
    c.teclar(CIMA)
    assert.equal(selecionada(c), '/api/r2')
    c.teclar(BAIXO)
    assert.equal(selecionada(c), '/api/r3')
  })

  it('pula as linhas que não são request', () => {
    const c = criarCtx({ linhas: 1 })
    registrar(c.estado, c.s, 'Server running', null)
    c.request('/api/r2')
    c.desenhar()
    c.teclar(CIMA, CIMA)
    assert.equal(selecionada(c), '/api/r1')
  })

  it('↓ depois do mais novo larga a escolha e volta a seguir o log', () => {
    const c = criarCtx()
    c.teclar(CIMA, BAIXO)
    assert.equal(c.v.sel, null)
    assert.equal(c.v.rolagem, 0)
  })

  it('sem request nenhum, ↑↓ continuam rolando o log', () => {
    const c = criarCtx({ linhas: 0 })
    for (let i = 0; i < 80; i++) {
      registrar(c.estado, c.s, `linha ${i}`, null)
    }
    c.desenhar()
    c.teclar(CIMA, CIMA)
    assert.equal(c.v.rolagem, 2)
    assert.equal(c.v.sel, null)
  })

  it('num pacote com várias setas (tecla repetindo) anda uma por uma', () => {
    const c = criarCtx({ linhas: 60 })
    tratarEntrada(c.ctx, CIMA.repeat(5))
    c.desenhar()
    assert.equal(selecionada(c), '/api/r56')
  })

  it('a seleção aparece destacada e a tela continua com o tamanho certo', () => {
    const c = criarCtx()
    c.teclar(CIMA)
    const tela = quadro(c.estado, LARGURA, ALTURA, 0)
    assert.ok(tela.some(l => semCores(l).includes('› /api/r3')))
    tela.forEach(l => assert.equal(vis(l), LARGURA))
  })

  it('rola o log para manter visível o request escolhido', () => {
    const c = criarCtx({ linhas: 60 })
    c.teclar(...Array(40).fill(CIMA))
    assert.equal(selecionada(c), '/api/r21')
    assert.ok(quadro(c.estado, LARGURA, ALTURA, 0).some(l => semCores(l).includes('› /api/r21')))
  })

  it('com request escolhido, as linhas novas não empurram a vista', () => {
    const c = criarCtx()
    c.teclar(CIMA)
    c.request('/api/novo')
    assert.equal(c.v.rolagem, 1)
    assert.equal(c.v.novos, 1)
    assert.ok(quadro(c.estado, LARGURA, ALTURA, 0).some(l => semCores(l).includes('› /api/r3')))
  })

  it('o filtro limita os requests escolhíveis e descarta a escolha', () => {
    const c = criarCtx()
    c.teclar(CIMA, '/', 'r', '1', ENTER)
    assert.equal(c.v.sel, null)
    c.teclar(CIMA)
    assert.equal(selecionada(c), '/api/r1')
  })

  it('End e limpar o log largam a escolha', () => {
    const c = criarCtx()
    c.teclar(CIMA, '\x1b[F')
    assert.equal(c.v.sel, null)
    c.teclar(CIMA)
    limparLog(c.estado, c.s)
    assert.equal(c.v.sel, null)
  })

  it('Esc primeiro larga a escolha e só depois limpa o filtro', () => {
    const c = criarCtx()
    c.v.filtro = 'r'
    c.teclar(CIMA, ESC)
    assert.equal(c.v.sel, null)
    assert.equal(c.v.filtro, 'r')
    c.teclar(ESC)
    assert.equal(c.v.filtro, '')
  })
})

describe('rolar com o mouse junto da seleção', () => {
  it('a roda rola o log sem mexer no request escolhido', () => {
    const c = criarCtx({ linhas: 60 })
    c.teclar(CIMA)
    c.teclar(RODA_CIMA, RODA_CIMA)
    assert.equal(c.v.rolagem, 6)
    assert.equal(selecionada(c), '/api/r60')
  })

  it('a roda funciona em aba de servidor sem request escolhido', () => {
    const c = criarCtx({ linhas: 60 })
    c.teclar(RODA_CIMA, RODA_BAIXO, RODA_CIMA)
    assert.equal(c.v.rolagem, 3)
    assert.equal(c.v.sel, null)
  })

  it('a seta depois da roda continua pelo que está na tela, sem pular de volta', () => {
    const c = criarCtx({ linhas: 60 })
    c.teclar(CIMA, ...Array(10).fill(RODA_CIMA), CIMA)
    assert.equal(selecionada(c), '/api/r30')
  })

  it('rolar de volta até o fim retoma o seguimento', () => {
    const c = criarCtx({ linhas: 60 })
    c.teclar(CIMA, RODA_CIMA, RODA_BAIXO)
    assert.equal(c.v.rolagem, 0)
    assert.equal(c.v.sel, null)
  })

  it('o clique escolhe; o segundo clique abre os detalhes', () => {
    const c = criarCtx()
    const { y } = c.estado.regioes.log.find(r => r.linha.req.caminho === '/api/r2')
    const clique = `\x1b[<0;20;${y + 1}M`
    c.teclar(clique)
    assert.equal(selecionada(c), '/api/r2')
    assert.equal(c.consultas.length, 0)
    c.teclar(clique)
    assert.equal(c.consultas.length, 1)
    assert.equal(c.estado.detalheRequest.linha.req.caminho, '/api/r2')
  })
})

const PRONTO = {
  situacao: 'pronto',
  resumo: { metodo: 'POST', caminho: '/api/r3?x=1', status: 201, duracaoMs: 12, memoriaMb: 8.5, ip: '127.0.0.1', controller: 'App\\C@store', middleware: ['api', 'auth'] },
  secoes: [
    { titulo: 'Payload', tipo: 'json', valor: { nome: 'x', itens: Array.from({ length: 200 }, (_, i) => i) } },
    { titulo: 'Headers', tipo: 'json', valor: {} },
    { titulo: 'Queries', tipo: 'lista', itens: [{ texto: 'select 1', detalhe: '1 ms · mysql', nivel: null }] },
  ],
}

describe('tela de detalhes', () => {
  const abrir = () => {
    const c = criarCtx()
    c.teclar(CIMA, ENTER)
    Object.assign(c.estado.detalheRequest, PRONTO)
    c.desenhar()

    return { ...c, d: c.estado.detalheRequest }
  }

  it('⏎ sem request escolhido não abre nada', () => {
    const c = criarCtx()
    c.teclar(ENTER)
    assert.equal(c.estado.detalheRequest, null)
    assert.equal(c.consultas.length, 0)
  })

  it('⏎ pede os detalhes e mostra "buscando" enquanto isso', () => {
    const c = criarCtx()
    c.teclar(CIMA, ENTER)
    assert.equal(c.consultas[0], c.estado.detalheRequest)
    assert.ok(quadro(c.estado, LARGURA, ALTURA, 0).some(l => semCores(l).includes('buscando os detalhes')))
  })

  it('mostra resumo e seções, com a tela no tamanho certo em qualquer terminal', () => {
    const { estado } = abrir()
    const tela = quadro(estado, LARGURA, ALTURA, 0).map(semCores).join('\n')
    for (const trecho of ['POST', '/api/r3?x=1', '201', 'App\\C@store', 'auth', 'Payload', 'Queries 1', '"nome"']) {
      assert.ok(tela.includes(trecho), trecho)
    }
    for (const [w, h] of [[60, 15], [80, 24], [200, 50]]) {
      const linhas = quadro(estado, w, h, 0)
      assert.equal(linhas.length, h)
      linhas.forEach(l => assert.equal(vis(l), w))
    }
  })

  it('←→ trocam de seção, ↑↓ rolam e End não passa do fim', () => {
    const { teclar, d } = abrir()
    teclar(BAIXO, BAIXO)
    assert.equal(d.rolagem, 2)
    teclar('\x1b[C')
    assert.equal(d.secao, 1)
    assert.equal(d.rolagem, 0)
    teclar('\x1b[D', '\x1b[F')
    assert.ok(d.rolagem > 0 && d.rolagem < 300)
  })

  it('a roda rola o detalhe e o clique troca a seção', () => {
    const { teclar, d, estado } = abrir()
    teclar(RODA_BAIXO)
    assert.equal(d.rolagem, 3)
    const secao = estado.regioes.secoes[2]
    teclar(`\x1b[<0;${secao.x0 + 2};${secao.y + 1}M`)
    assert.equal(d.secao, 2)
  })

  it('Esc e q voltam à lista, com o request ainda escolhido, sem encerrar o painel', () => {
    for (const tecla of [ESC, 'q']) {
      const c = abrir()
      c.teclar(tecla)
      assert.equal(c.estado.detalheRequest, null)
      assert.equal(selecionada(c), '/api/r3')
      assert.ok(!c.consultas.includes('encerrar'))
    }
  })

  it('Ctrl+C encerra mesmo com o detalhe aberto', () => {
    const c = abrir()
    c.teclar('\x03')
    assert.ok(c.consultas.includes('encerrar'))
  })

  it('y copia a seção aberta', () => {
    const { teclar, copias } = abrir()
    teclar('y')
    assert.equal(copias[0][1], 'Payload')
    assert.match(copias[0][0], /"nome": "x"/)
  })

  it('clicar em outra aba fecha o detalhe', () => {
    const c = abrir()
    const aba = c.estado.regioes.abas.find(a => a.id === 'queue')
    c.teclar(`\x1b[<0;${aba.x0 + 2};2M`)
    assert.equal(c.estado.detalheRequest, null)
    assert.equal(abaAtual(c.estado), 'queue')
  })

  it('mostra a falha com a dica de como resolver', () => {
    const c = criarCtx()
    c.teclar(CIMA, ENTER)
    Object.assign(c.estado.detalheRequest, { situacao: 'falha', falha: { erro: 'O Telescope está desligado', dica: 'TELESCOPE_ENABLED=true' } })
    const tela = quadro(c.estado, LARGURA, ALTURA, 0).map(semCores).join('\n')
    assert.ok(tela.includes('O Telescope está desligado'))
    assert.ok(tela.includes('TELESCOPE_ENABLED=true'))
  })
})

describe('consulta dos detalhes', () => {
  const preparar = saida => {
    const estado = criarEstado(criarPlanoFalso())
    const s = { ...servicoDe(estado, 'server'), detalhesDeRequest: DETALHES }
    const chamadas = []
    const executar = async (programa, args, opcoes) => {
      chamadas.push({ programa, args, opcoes })

      return { ok: true, saida, erro: '' }
    }
    const detalhe = { s, linha: { t: 5000, req: { caminho: '/x&calc', ms: 7 } }, situacao: 'carregando', secoes: [] }
    estado.detalheRequest = detalhe

    return { estado, detalhe, chamadas, consultar: criarConsultaDeRequest(estado, { executar, shell: true }) }
  }

  it('o caminho vai pela variável de ambiente, nunca pela linha de comando', async () => {
    const { consultar, detalhe, chamadas } = preparar('{"ok":true,"resumo":{},"secoes":[]}')
    await consultar(detalhe)
    assert.deepEqual(chamadas[0].args, DETALHES.args)
    assert.ok(!chamadas[0].args.join(' ').includes('calc'))
    assert.deepEqual(JSON.parse(chamadas[0].opcoes.env.ORBITA_REQUEST), { caminho: '/x&calc', t: 5000, ms: 7 })
    assert.equal(detalhe.situacao, 'pronto')
  })

  it('resposta de falha vira a mensagem da tela', async () => {
    const { consultar, detalhe } = preparar('{"ok":false,"etapa":"telescope","erro":"desligado","dica":"ligue"}')
    await consultar(detalhe)
    assert.deepEqual(detalhe.falha, { erro: 'desligado', dica: 'ligue' })
  })

  it('resposta que chega depois de fechar é descartada', async () => {
    const { consultar, detalhe, estado } = preparar('{"ok":true,"resumo":{},"secoes":[]}')
    const pendente = consultar(detalhe)
    estado.detalheRequest = null
    await pendente
    assert.equal(detalhe.situacao, 'carregando')
  })

  it('lerResposta ignora avisos do interpretador antes do JSON', () => {
    assert.equal(lerResposta({ saida: 'Failed loading xdebug.dll {nada}\n{"ok":true}', erro: '' }).ok, true)
    assert.deepEqual(lerResposta({ saida: 'nada aqui', erro: 'quebrou\nfeio' }), { ok: false, etapa: 'resposta', erro: 'quebrou' })
  })

  it('paraVariavel mantém só ASCII e continua sendo o mesmo JSON', () => {
    const texto = paraVariavel({ caminho: '/ação' })
    assert.match(texto, /^[\x00-\x7f]*$/)
    assert.deepEqual(JSON.parse(texto), { caminho: '/ação' })
  })
})

describe('conteúdo das seções', () => {
  it('quebra o JSON na largura e tira sequências de controle das listas', () => {
    const secao = { titulo: 'L', tipo: 'lista', itens: [{ texto: '\x1b[31mvermelho', detalhe: 'd' }] }
    assert.deepEqual(linhasDaSecao(secao, 40).map(semCores), ['• vermelho', '  d'])
    const json = linhasDaSecao({ titulo: 'J', tipo: 'json', valor: { a: 'x'.repeat(50) } }, 20)
    json.forEach(l => assert.ok(vis(l) <= 20))
  })

  it('seção vazia não tem linhas; texto puro aparece como está', () => {
    assert.deepEqual(linhasDaSecao({ titulo: 'J', tipo: 'json', valor: {} }, 40), [])
    assert.deepEqual(linhasDaSecao({ titulo: 'R', tipo: 'json', valor: 'HTML Response\nsegunda' }, 40).map(semCores), ['HTML Response', 'segunda'])
  })

  it('textoDaSecao', () => {
    assert.equal(textoDaSecao({ tipo: 'lista', itens: [{ texto: 'a', detalhe: 'b' }, { texto: 'c' }] }), 'a\n  b\nc')
    assert.equal(textoDaSecao({ tipo: 'json', valor: 'puro' }), 'puro')
  })
})

describe('rolagemParaVer', () => {
  const lista = Array.from({ length: 100 }, (_, i) => i)
  const um = () => 1

  it('não mexe em quem já está visível', () => {
    assert.equal(rolagemParaVer(lista, 95, 0, 10, um), 0)
  })

  it('leva a linha abaixo da tela para a última posição', () => {
    assert.equal(rolagemParaVer(lista, 95, 20, 10, um), 4)
  })

  it('leva a linha acima da tela para a primeira posição', () => {
    assert.equal(rolagemParaVer(lista, 50, 0, 10, um), 40)
  })

  it('considera as linhas que ocupam mais de uma linha de tela', () => {
    assert.equal(rolagemParaVer(lista, 50, 0, 10, () => 2), 45)
  })
})
