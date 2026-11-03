import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listarAcoes } from '../../src/painel/acoes.mjs'
import { alvoDaAba, aplicarAtalho, descreverAtalho } from '../../src/painel/comando-livre.mjs'
import { tratarEntrada } from '../../src/painel/entrada.mjs'
import { abaAtual, criarEstado, irPara, servicoDe, vista } from '../../src/painel/estado.mjs'
import { registrar } from '../../src/painel/logs.mjs'
import { lerMouse } from '../../src/painel/mouse.mjs'
import { quadro } from '../../src/painel/tela/quadro.mjs'
import { nomeDaTecla, separarTeclas } from '../../src/painel/teclas.mjs'
import { criarPlanoFalso } from '../_ajudantes/plano-falso.mjs'

const ESC = '\x1b'
const CIMA = '\x1b[A'
const BAIXO = '\x1b[B'
const DIREITA = '\x1b[C'

/** Contexto falso: guarda cada ação chamada em `chamadas`. */
function criarCtx(plano = criarPlanoFalso()) {
  const estado = criarEstado(plano)
  const chamadas = []
  const anotar = nome => (...args) => chamadas.push([nome, ...args.map(a => a?.nome ?? a)])
  const ctx = {
    estado,
    alturaDoLog: () => 20,
    agora: () => 10_000,
    encerrar: anotar('encerrar'),
    reiniciar: anotar('reiniciar'),
    alternar: anotar('alternar'),
    reiniciarTodos: anotar('reiniciarTodos'),
    abrir: anotar('abrir'),
    abrirServico: anotar('abrirServico'),
    copiar: anotar('copiar'),
    alternarMouse: anotar('alternarMouse'),
    redesenharTudo: anotar('redesenharTudo'),
    rodarTarefa: anotar('rodarTarefa'),
  }
  const teclar = (...teclas) => teclas.forEach(t => tratarEntrada(ctx, t))

  return { ctx, estado, chamadas, teclar }
}

describe('separarTeclas', () => {
  it('separa setas, mouse, Esc, letras e emoji de um mesmo pacote', () => {
    assert.deepEqual(separarTeclas(`a${CIMA}\x1b[<64;10;5M${ESC}🚀\x1b[5~\x1bOA`), ['a', CIMA, '\x1b[<64;10;5M', ESC, '🚀', '\x1b[5~', '\x1bOA'])
  })

  it('nomeDaTecla', () => {
    assert.equal(nomeDaTecla(CIMA), 'cima')
    assert.equal(nomeDaTecla('\x1bOA'), 'cima')
    assert.equal(nomeDaTecla('\r'), 'enter')
    assert.equal(nomeDaTecla('\x03'), 'ctrlc')
    assert.equal(nomeDaTecla('x'), 'x')
  })
})

describe('tratarTecla: globais', () => {
  it('q e Ctrl+C encerram; Ctrl+C funciona até com caixa aberta', () => {
    const { estado, chamadas, teclar } = criarCtx()
    teclar('q')
    estado.overlay = 'comando'
    teclar('\x03')
    assert.deepEqual(chamadas, [['encerrar'], ['encerrar']])
  })

  it('durante o splash a tecla só pula a animação', () => {
    const { estado, chamadas, teclar } = criarCtx()
    estado.splashAte = 20_000
    teclar('q')
    assert.equal(estado.splashAte, 0)
    assert.deepEqual(chamadas, [])
  })

  it('encerrando, nada responde', () => {
    const { estado, chamadas, teclar } = criarCtx()
    estado.encerrando = true
    teclar('R', DIREITA)
    assert.deepEqual(chamadas, [])
    assert.equal(abaAtual(estado), 'geral')
  })

  it('setas, Tab e números trocam de aba; e vai para alertas', () => {
    const { estado, teclar } = criarCtx()
    teclar(DIREITA)
    assert.equal(abaAtual(estado), 'todos')
    teclar('\t')
    assert.equal(abaAtual(estado), 'server')
    teclar('\x1b[Z', '\x1b[D')
    assert.equal(abaAtual(estado), 'geral')
    teclar('4')
    assert.equal(abaAtual(estado), 'queue')
    teclar('e')
    assert.equal(abaAtual(estado), 'alertas')
  })

  it('?, a, m, R e Ctrl+L', () => {
    const { estado, chamadas, teclar } = criarCtx()
    teclar('?')
    assert.equal(estado.overlay, 'ajuda')
    teclar('z')
    assert.equal(estado.overlay, null)
    teclar('m', 'R', '\x0c')
    assert.deepEqual(chamadas, [['alternarMouse'], ['reiniciarTodos'], ['redesenharTudo']])
  })
})

describe('tratarTecla: visão geral', () => {
  it('↑↓ escolhem o cartão (dando a volta) e as letras agem nele', () => {
    const { estado, chamadas, teclar } = criarCtx()
    teclar(BAIXO)
    assert.equal(estado.selCard, 1)
    teclar('r', 's', 'o')
    assert.deepEqual(chamadas, [
      ['reiniciar', 'queue'],
      ['alternar', 'queue'],
      ['abrirServico', 'queue'],
    ])
    teclar(CIMA, CIMA)
    assert.equal(estado.selCard, 2)
    teclar('\r')
    assert.equal(abaAtual(estado), 'laravel')
  })
})

describe('tratarTecla: log', () => {
  const comLinhas = () => {
    const r = criarCtx()
    for (let i = 0; i < 100; i++) {
      registrar(r.estado, servicoDe(r.estado, 'server'), `linha ${i}`)
    }
    irPara(r.estado, 'server')

    return r
  }

  it('rola, pagina, vai ao topo e volta a seguir o fim', () => {
    const { estado, teclar } = comLinhas()
    teclar(CIMA, CIMA, 'k')
    assert.equal(vista(estado, 'server').rolagem, 3)
    teclar(BAIXO)
    assert.equal(vista(estado, 'server').rolagem, 2)
    teclar('\x1b[5~')
    assert.equal(vista(estado, 'server').rolagem, 20)
    teclar('\x1b[6~', '\x1b[6~')
    assert.equal(vista(estado, 'server').rolagem, 0)
    teclar('g')
    assert.equal(vista(estado, 'server').rolagem, Number.MAX_SAFE_INTEGER)
    teclar('\x1b[F')
    assert.equal(vista(estado, 'server').rolagem, 0)
  })

  it('/ digita o filtro; ⏎ aplica; Esc limpa', () => {
    const { estado, teclar } = comLinhas()
    teclar('/', 'l', 'i', 'x', '\x7f', 'n')
    assert.equal(estado.digitando, true)
    assert.equal(vista(estado, 'server').filtro, 'lin')
    teclar('\r')
    assert.equal(estado.digitando, false)
    teclar(ESC)
    assert.equal(vista(estado, 'server').filtro, '')
  })

  it('y copia o que está na tela; c limpa; r e s agem no serviço da aba', () => {
    const { estado, chamadas, teclar } = comLinhas()
    teclar('y', 'r', 's', 'o')
    assert.equal(chamadas[0][0], 'copiar')
    assert.equal(chamadas[0][2], '20 linha(s)')
    assert.deepEqual(chamadas.slice(1), [
      ['reiniciar', 'server'],
      ['alternar', 'server'],
      ['abrirServico', 'server'],
    ])
    teclar('c')
    assert.equal(servicoDe(estado, 'server').linhas.length, 0)
    assert.match(estado.toast.texto, /log do server limpo/)
  })

  it('na aba Todos, r e s pedem para escolher um serviço', () => {
    const { estado, chamadas, teclar } = criarCtx()
    irPara(estado, 'todos')
    teclar('r')
    assert.deepEqual(chamadas, [])
    assert.match(estado.toast.texto, /escolha um serviço/)
  })
})

describe('tratarTecla: alertas', () => {
  it('↑↓ escolhem, ⏎ leva ao log, y copia, c limpa', () => {
    const { estado, chamadas, teclar } = criarCtx()
    const server = servicoDe(estado, 'server')
    registrar(estado, server, 'primeiro erro', 'erro')
    registrar(estado, server, 'segundo erro', 'erro')
    irPara(estado, 'alertas')
    teclar(BAIXO)
    assert.equal(estado.selAlerta.texto, 'primeiro erro')
    teclar('y')
    assert.equal(chamadas[0][0], 'copiar')
    assert.match(chamadas[0][1], /primeiro erro/)
    teclar('\r')
    assert.equal(abaAtual(estado), 'server')
    irPara(estado, 'alertas')
    teclar('c')
    assert.equal(estado.alertas.length, 0)
  })
})

describe('ações rápidas', () => {
  it('lista as do plano, reiniciar todos, abrir serviços HTTP e conhecer a CodifyTech', () => {
    const { estado } = criarCtx()
    assert.deepEqual(
      listarAcoes(estado).map(a => a.titulo),
      ['Limpar caches', 'Reiniciar todos os serviços', 'Abrir o server no navegador', 'Conhecer a CodifyTech'],
    )
  })

  it('⏎ ou número executam; Esc fecha', () => {
    const { estado, chamadas, teclar } = criarCtx()
    teclar('a', BAIXO, '\r')
    assert.equal(estado.overlay, null)
    teclar('a', '1')
    teclar('a', '4')
    teclar('a', ESC)
    assert.deepEqual(chamadas, [
      ['reiniciarTodos'],
      ['rodarTarefa', { titulo: 'Limpar caches', comando: 'php artisan optimize:clear', cwd: '/projeto/backend' }],
      ['abrir', 'https://codifytech.com.br'],
    ])
    assert.equal(estado.overlay, null)
  })
})

describe('comando livre', () => {
  it('alvoDaAba pré-seleciona pelo serviço; sem par, o primeiro', () => {
    const alvos = criarPlanoFalso().alvos
    assert.equal(alvoDaAba(alvos, 'web'), 1)
    assert.equal(alvoDaAba(alvos, 'queue'), 0)
    assert.equal(alvoDaAba(alvos, 'geral'), 0)
  })

  it('atalho reescreve o começo do texto e é explicado na caixa', () => {
    const alvo = criarPlanoFalso().alvos[0]
    assert.equal(aplicarAtalho(alvo, 'artisan migrate'), 'php artisan migrate')
    assert.equal(aplicarAtalho(alvo, 'composer artisan'), 'composer artisan')
    assert.equal(aplicarAtalho({ atalho: { de: '(', para: 'x' } }, 'texto'), 'texto')
    assert.equal(descreverAtalho(alvo.atalho), '"artisan …" vira "php artisan …"')
    assert.equal(descreverAtalho(null), null)
    assert.equal(descreverAtalho({ de: '^(a|b)', para: 'c' }), '/^(a|b)/ vira "c"')
  })

  it('digita, Tab troca o alvo, ⏎ roda com o atalho e guarda no histórico', () => {
    const { estado, chamadas, teclar } = criarCtx()
    irPara(estado, 'queue')
    teclar(':')
    assert.equal(estado.overlay, 'comando')
    assert.equal(estado.cmd.alvo, 0)
    teclar(...'artisan migratex', '\x7f', '\r')
    assert.deepEqual(chamadas, [['rodarTarefa', { titulo: 'backend$ artisan migrate', comando: 'php artisan migrate', cwd: '/projeto/backend' }]])

    teclar('x', '\t', ...'npm test', '\x15', ...'ls', '\r')
    assert.deepEqual(chamadas[1], ['rodarTarefa', { titulo: 'frontend$ ls', comando: 'ls', cwd: '/projeto/frontend' }])
    assert.deepEqual(estado.cmd.hist, [
      { alvo: 1, texto: 'ls' },
      { alvo: 0, texto: 'artisan migrate' },
    ])
  })

  it('↑↓ navegam o histórico e voltam ao rascunho', () => {
    const { estado, teclar } = criarCtx()
    estado.cmd.hist = [
      { alvo: 1, texto: 'ls' },
      { alvo: 0, texto: 'artisan migrate' },
    ]
    teclar(':', ...'rasc', CIMA)
    assert.deepEqual([estado.cmd.texto, estado.cmd.alvo], ['ls', 1])
    teclar(CIMA, CIMA)
    assert.deepEqual([estado.cmd.texto, estado.cmd.alvo], ['artisan migrate', 0])
    teclar(BAIXO, BAIXO)
    assert.equal(estado.cmd.texto, 'rasc')
    teclar(ESC)
    assert.equal(estado.overlay, null)
  })
})

describe('mouse', () => {
  it('lerMouse lê a sequência SGR (coordenadas a partir de 0)', () => {
    assert.deepEqual(lerMouse('\x1b[<0;10;2M'), { botao: 0, x: 9, y: 1, soltou: false })
    assert.deepEqual(lerMouse('\x1b[<0;10;2m'), { botao: 0, x: 9, y: 1, soltou: true })
    assert.equal(lerMouse('lixo'), null)
  })

  it('clique na barra de abas troca de aba; roda rola o log', () => {
    const { estado, teclar } = criarCtx()
    quadro(estado, 120, 36, 0)
    const aba = estado.regioes.abas.find(a => a.id === 'queue')
    teclar(`\x1b[<0;${aba.x0 + 2};2M`)
    assert.equal(abaAtual(estado), 'queue')
    teclar('\x1b[<64;5;10M', '\x1b[<64;5;10M', '\x1b[<65;5;10M')
    assert.equal(vista(estado, 'queue').rolagem, 3)
  })

  it('clique num cartão escolhe; o segundo clique abre a aba', () => {
    const { estado, teclar } = criarCtx()
    quadro(estado, 120, 36, 0)
    const card = estado.regioes.cards[1]
    const clique = `\x1b[<0;${card.x0 + 3};${card.y0 + 2}M`
    teclar(clique)
    assert.equal(estado.selCard, 1)
    assert.equal(abaAtual(estado), 'geral')
    teclar(clique)
    assert.equal(abaAtual(estado), card.nome)
  })
})
