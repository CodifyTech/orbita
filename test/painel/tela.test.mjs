import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { criarEstado, irPara, servicoDe, tarefasDe, vista } from '../../src/painel/estado.mjs'
import { linhaDoProcesso, registrar } from '../../src/painel/logs.mjs'
import { montarResumo } from '../../src/painel/resumo.mjs'
import { criarDesenhista } from '../../src/painel/tela/desenhista.mjs'
import { barrasDoGrafico, caixa, ponto, sobrepor, SPIN, textoEstado } from '../../src/painel/tela/pecas.mjs'
import { alturaDoLog, quadro } from '../../src/painel/tela/quadro.mjs'
import { realce, realceFiltro, tokens } from '../../src/painel/tela/realce.mjs'
import { semCores, vis } from '../../src/painel/texto.mjs'
import { criarPlanoFalso } from '../_ajudantes/plano-falso.mjs'

/** Estado com um pouco de tudo: linhas, erro, alerta, métrica, tarefa. */
function estadoCheio() {
  const estado = criarEstado(criarPlanoFalso(), { agora: 0 })
  estado.painel = true
  const server = servicoDe(estado, 'server')
  for (let i = 0; i < 40; i++) {
    linhaDoProcesso(estado, server, `  2025-01-01 10:00:00 /api/pedidos/${i} ........ ~ ${i}.5ms`, 1000)
  }
  linhaDoProcesso(estado, server, 'ERROR: listen EADDRINUSE 日本語 🚀', 1000)
  linhaDoProcesso(estado, servicoDe(estado, 'queue'), String.raw`App\Jobs\Enviar ...... RUNNING`, 1000)
  registrar(estado, servicoDe(estado, 'laravel'), '[2025-01-01 10:00:00] local.WARNING: cuidado', 'alerta', { agora: 1000 })
  registrar(estado, tarefasDe(estado), 'saída da tarefa', null, { agora: 1000 })

  return estado
}

describe('quadro', () => {
  it('toda vista, com e sem caixa, ocupa exatamente w×h em vários tamanhos', () => {
    const estado = estadoCheio()
    for (const [w, h] of [
      [120, 36],
      [80, 24],
      [200, 50],
      [60, 15],
      [45, 10],
    ]) {
      for (const aba of ['geral', 'todos', 'server', 'queue', 'laravel', 'tarefas', 'alertas']) {
        irPara(estado, aba)
        for (const overlay of [null, 'ajuda', 'acoes', 'comando', 'encerrando']) {
          estado.overlay = overlay
          const linhas = quadro(estado, w, h, 5000)
          assert.equal(linhas.length, h, `${w}x${h} ${aba} ${overlay}`)
          linhas.forEach((l, y) => assert.equal(vis(l), w, `${w}x${h} ${aba} ${overlay} linha ${y}: ${semCores(l)}`))
        }
      }
    }
  })

  it('splash com o logo do projeto e terminal pequeno demais', () => {
    const estado = estadoCheio()
    estado.plano.projeto.logo = ['LOGO-DO-PROJETO']
    // Perto do fim da animação o logo já está todo revelado.
    estado.splashAte = 5100
    assert.ok(quadro(estado, 100, 30, 5000).some(l => semCores(l).includes('LOGO-DO-PROJETO')))
    assert.match(quadro(estado, 50, 10, 5000).map(semCores).join('\n'), /mínimo 60×15 \(agora 50×10\)/)
  })

  it('cabeçalho com o nome do projeto, abas e ambiente na visão geral', () => {
    const estado = estadoCheio()
    const tela = quadro(estado, 120, 40, 5000).map(semCores)
    assert.match(tela[0], /◆ Teste dev {2}│ {2}● 0\/2 no ar {2}· {2}✖ 1 erro/)
    assert.match(tela[1], /1 ◈ Visão geral .* 2 ≡ Todos .* server .* queue .* laravel .* tarefas .* Alertas/)
    assert.ok(tela.some(l => /Banco +mysql/.test(l)))
    assert.ok(tela.some(l => l.includes('40 req/min')))
    assert.ok(tela.some(l => l.includes('Teste · desenvolvido e mantido pela CodifyTech')))
  })

  it('registra as regiões clicáveis das abas e dos cartões', () => {
    const estado = estadoCheio()
    quadro(estado, 120, 40, 5000)
    assert.deepEqual(estado.regioes.abas.map(a => a.id), ['geral', 'todos', 'server', 'queue', 'laravel', 'tarefas', 'alertas'])
    assert.equal(estado.regioes.cards.length, 4)
    assert.equal(estado.regioes.cards[0].y0, 6)
  })

  it('foco nos cartões: marca o escolhido, afina o traço da aba e troca as dicas do rodapé', () => {
    const estado = estadoCheio()
    const nasAbas = quadro(estado, 120, 40, 5000).map(semCores)
    assert.ok(!nasAbas.some(l => l.includes('▸')))
    assert.ok(nasAbas[2].includes('━'))
    assert.match(nasAbas.at(-1), /←→ abas {2}↓ ⏎ serviços/)

    estado.focoNosCartoes = true
    const linhas = quadro(estado, 120, 40, 5000)
    linhas.forEach(l => assert.equal(vis(l), 120))
    const nosCartoes = linhas.map(semCores)
    assert.equal(nosCartoes.filter(l => l.includes('▸')).length, 1)
    assert.ok(!nosCartoes[2].includes('━'))
    assert.match(nosCartoes.at(-1), /←→ serviço {2}↑ abas {2}⏎ logs/)
  })

  it('log rolado mostra o selo de linhas acima do fim', () => {
    const estado = estadoCheio()
    irPara(estado, 'server')
    vista(estado, 'server').rolagem = 5
    const tela = quadro(estado, 120, 30, 5000).map(semCores)
    assert.ok(tela.some(l => l.includes('5 linhas acima do fim · End segue o log')))
  })

  it('alturaDoLog desconta as linhas fixas e as duas do topo da aba', () => {
    assert.equal(alturaDoLog(36), 29)
  })
})

describe('peças', () => {
  it('barrasDoGrafico: proporcional ao maior, zero é ▁ e qualquer valor é no mínimo ▂', () => {
    assert.equal(barrasDoGrafico([0, 1, 7, 14]), '▁▂▅█')
    assert.equal(barrasDoGrafico([0, 0]), '▁▁')
  })

  it('ponto e textoEstado', () => {
    assert.ok(SPIN.includes(ponto({ estado: 'subindo' }, 0)[1]))
    assert.equal(ponto({ estado: 'caiu' })[1], '✖')
    assert.equal(ponto({ estado: 'inventado' })[1], '○')
    assert.equal(textoEstado({ estado: 'reiniciando', timer: 1, retomarEm: 4500 }, 1000), 'reiniciando em 4s')
    assert.equal(textoEstado({ estado: 'subindo', filho: {}, inicio: 0 }, 12_000), 'subindo 12s')
    assert.equal(textoEstado({ estado: 'instavel', detalhe: '/up → 500' }), '/up → 500')
    assert.equal(textoEstado({ estado: 'online', detalhe: null }), 'no ar')
  })

  it('caixa tem largura fixa e sobrepor a põe no meio sem mudar a largura da tela', () => {
    const linhasDaCaixa = caixa('Título', ['um', 'dois com 日本'], 20, [255, 0, 0])
    assert.ok(linhasDaCaixa.every(l => vis(l) === 20))
    const tela = Array.from({ length: 8 }, () => 'x'.repeat(40))
    const sobreposta = sobrepor(tela, 40, linhasDaCaixa)
    assert.ok(sobreposta.every(l => vis(l) === 40))
    assert.match(semCores(sobreposta[2]), /^x{10}╭─ Título/)
  })
})

describe('realce', () => {
  it('reconhece os tokens', () => {
    const achados = tokens(String.raw`GET /api/pedidos "texto" ~ 12ms https://x.dev DONE App\Models\User 2025-01-01 10:00:00`)
    assert.deepEqual(
      achados.map(t => t.tipo),
      ['metodo', 'rota', 'str', 'dur', 'url', 'ok', 'classe', 'data'],
    )
  })

  it('nível fixa a cor da linha inteira; o texto não muda', () => {
    assert.equal(semCores(realce('qualquer GET /x', { nivel: 'erro' })), 'qualquer GET /x')
    assert.match(realce('x', { nivel: 'erro' }), /^\x1b\[38;2;254;202;202m/)
    assert.equal(semCores(realce('GET /x ~ 3ms', { nivel: null })), 'GET /x ~ 3ms')
  })

  it('realceFiltro destaca cada ocorrência, sem diferenciar maiúsculas', () => {
    const marcado = realceFiltro('Erro e erro', 'erro')
    assert.equal(semCores(marcado), 'Erro e erro')
    assert.equal(marcado.match(/\x1b\[48;2;/g).length, 2)
  })
})

describe('desenhista', () => {
  it('reescreve só as linhas que mudaram, num lote sincronizado', () => {
    let saida = ''
    const desenhista = criarDesenhista(texto => (saida += texto))
    assert.equal(desenhista.desenhar(['a', 'b', 'c']), 3)
    assert.match(saida, /^\x1b\[\?2026h.*\x1b\[\?2026l$/s)
    saida = ''
    assert.equal(desenhista.desenhar(['a', 'B', 'c']), 1)
    assert.match(saida, /\x1b\[2;1H\x1b\[2KB/)
    saida = ''
    assert.equal(desenhista.desenhar(['a', 'B', 'c']), 0)
    assert.equal(saida, '')
    desenhista.invalidar()
    assert.equal(desenhista.desenhar(['a', 'B', 'c']), 3)
  })
})

describe('montarResumo', () => {
  it('sem cor: tempo, contagens e últimos erros em texto puro', () => {
    const estado = estadoCheio()
    const resumo = montarResumo(estado, { usaCor: false, agora: 125_000 })
    assert.ok(!resumo.includes('\x1b'))
    assert.match(resumo, /◆ Teste · dev encerrado depois de 2m05s/)
    assert.match(resumo, /2 serviço\(s\) · 0 reinício\(s\) · 1 erro\(s\) · 1 alerta\(s\)/)
    assert.match(resumo, /Últimos erros:\n.*server {3}ERROR: listen EADDRINUSE/)
    assert.match(resumo, /Até a próxima! — CodifyTech · https:\/\/codifytech\.com\.br/)
  })
})
