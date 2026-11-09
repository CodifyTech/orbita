import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'
import { iniciarPainel } from '../../src/painel/index.mjs'
import { ENTRAR, LIGAR_MOUSE, SAIR } from '../../src/painel/terminal.mjs'
import { semCores } from '../../src/painel/texto.mjs'
import { pausa } from '../../src/pausa.mjs'

/** Terminal falso: um stdout com tamanho e um stdin em que dá para "digitar". */
function criarTerminalFalso() {
  let escrito = ''
  const stdout = Object.assign(new EventEmitter(), {
    isTTY: true,
    columns: 120,
    rows: 36,
    write: texto => (escrito += texto),
  })
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    raw: [],
    setRawMode(ligado) {
      this.raw.push(ligado)
    },
    setEncoding() {},
    resume() {},
    pause() {},
  })

  return { stdout, stdin, escrito: () => escrito }
}

describe('modo painel (terminal falso, processo de verdade)', () => {
  it('entra na tela alternativa, responde ao teclado e, com q, encerra e devolve o terminal', async () => {
    const { stdout, stdin, escrito } = criarTerminalFalso()
    const plano = {
      projeto: { nome: 'Painel', slogan: '', logo: null, raiz: process.cwd() },
      processos: [
        {
          nome: 'eco',
          comando: `node -e "setInterval(() => console.log('linha do eco'), 100)"`,
          cwd: process.cwd(),
          cor: [64, 196, 255],
          descricao: 'eco',
          porta: null,
          url: null,
          saude: null,
          padroes: null,
          metrica: null,
        },
      ],
    }

    const ouvintes = () => ['uncaughtException', 'exit', 'SIGINT', 'SIGTERM'].map(e => process.listenerCount(e))
    const antes = ouvintes()
    const fim = iniciarPainel(plano, { stdout, stdin })
    await pausa(200)
    stdin.emit('data', ' ') // pula o splash
    await pausa(600)
    stdin.emit('data', '3') // aba do serviço
    await pausa(250)
    const naAba = semCores(escrito())
    stdin.emit('data', 'q')
    const codigo = await fim

    assert.equal(codigo, 0)
    assert.deepEqual(stdin.raw, [true, false])
    assert.equal(stdin.listenerCount('data'), 0)
    const tudo = escrito()
    assert.ok(tudo.startsWith(ENTRAR + LIGAR_MOUSE), 'sem o mouse ligado, a roda chegaria como ↑↓ e moveria a seleção')
    assert.ok(tudo.includes(SAIR))
    assert.match(naAba, /\$ node -e/)
    assert.match(naAba, /linha do eco/)
    assert.match(semCores(tudo), /Encerrando o Painel/)
    assert.match(semCores(tudo.slice(tudo.indexOf(SAIR))), /◆ Painel · dev encerrado/)
    // Nada do painel fica pendurado no processo depois que ele fecha.
    assert.deepEqual(ouvintes(), antes)
  })
})
