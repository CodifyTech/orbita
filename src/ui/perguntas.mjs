// Perguntas no terminal (confirmar, escolher, texto, senha), sem dependências: lê as teclas com
// `readline.emitKeypressEvents` e redesenha o bloco da pergunta a cada tecla.
//
// `criarPerguntas` recebe entrada e saída, então os testes conversam com ele por streams falsos.
// Quem chama decide se pergunta: sem terminal interativo (`perguntas.interativo === false`), o
// comando deve seguir o caminho sem perguntas (ex.: trocar a porta sozinho, ou pedir --force).
import { emitKeypressEvents } from 'node:readline'
import { ErroCancelado } from '../erros.mjs'
import { criarEstilo } from './estilo.mjs'

/**
 * @typedef {object} Opcao
 * @property {string} valor
 * @property {string} rotulo
 */

/**
 * @param {object} [fontes]
 * @param {NodeJS.ReadableStream & { isTTY?: boolean, setRawMode?: (ligar: boolean) => void }} [fontes.entrada]
 * @param {{ write(texto: string): unknown, isTTY?: boolean }} [fontes.saida]
 * @param {ReturnType<typeof criarEstilo>} [fontes.estilo]
 */
export function criarPerguntas({ entrada = process.stdin, saida = process.stdout, estilo } = {}) {
  const cores = estilo ?? criarEstilo({ usaCor: Boolean(saida.isTTY) && !process.env.NO_COLOR })
  const titulo = (pergunta, final) => `${final ? cores.verde('✔') : cores.ciano('?')} ${cores.negrito(pergunta)}`

  /**
   * Sessão de teclado: desenha, trata cada tecla e redesenha até alguém chamar `terminar`.
   *
   * @param {(final: boolean) => string} desenhar
   * @param {(tecla: { texto: string, nome: string, ctrl: boolean }, controle: { terminar(valor: unknown): void, redesenhar(): void }) => void} tratar
   */
  function sessao(desenhar, tratar) {
    return new Promise((resolve, reject) => {
      emitKeypressEvents(entrada)
      const crua = Boolean(entrada.isTTY && entrada.setRawMode)
      let linhasDesenhadas = 0

      const redesenhar = (final = false) => {
        if (linhasDesenhadas > 0) {
          // Sobe até o início do bloco anterior e apaga dali para baixo.
          saida.write(`\x1b[${linhasDesenhadas}F\x1b[J`)
        }
        const texto = desenhar(final)
        saida.write(`${texto}\n`)
        linhasDesenhadas = texto.split('\n').length
      }

      const encerrar = () => {
        entrada.removeListener('keypress', aoTeclar)
        if (crua) {
          entrada.setRawMode(false)
        }
        entrada.pause?.()
      }

      const terminar = valor => {
        encerrar()
        redesenhar(true)
        resolve(valor)
      }

      function aoTeclar(texto = '', tecla = {}) {
        if (tecla.ctrl && tecla.name === 'c') {
          encerrar()
          saida.write('\n')
          reject(new ErroCancelado())

          return
        }
        tratar({ texto, nome: tecla.name ?? '', ctrl: Boolean(tecla.ctrl) }, { terminar, redesenhar: () => redesenhar() })
      }

      if (crua) {
        entrada.setRawMode(true)
      }
      entrada.on('keypress', aoTeclar)
      entrada.resume?.()
      redesenhar()
    })
  }

  /**
   * Sim ou não. Enter aceita o padrão.
   *
   * @param {string} pergunta
   * @param {boolean} [padrao]
   * @returns {Promise<boolean>}
   */
  function confirmar(pergunta, padrao = true) {
    let resposta = null

    return sessao(
      final =>
        final
          ? `${titulo(pergunta, true)} ${cores.suave(resposta ? 'Sim' : 'Não')}`
          : `${titulo(pergunta, false)} ${cores.suave(padrao ? '(S/n)' : '(s/N)')}`,
      ({ texto, nome }, { terminar }) => {
        const letra = texto.toLowerCase()
        if (nome === 'return' || nome === 'enter') {
          resposta = padrao
        } else if (letra === 's' || letra === 'y') {
          resposta = true
        } else if (letra === 'n') {
          resposta = false
        } else {
          return
        }
        terminar(resposta)
      },
    )
  }

  /**
   * Uma opção da lista (↑↓ e Enter, ou o número da opção).
   *
   * @param {string} pergunta
   * @param {Opcao[]} opcoes
   * @param {{ padrao?: string, dica?: string }} [extras]
   * @returns {Promise<string>} o `valor` da opção escolhida
   */
  function escolher(pergunta, opcoes, { padrao, dica = '' } = {}) {
    let atual = Math.max(0, opcoes.findIndex(opcao => opcao.valor === padrao))

    return sessao(
      final => {
        if (final) {
          return `${titulo(pergunta, true)} ${cores.suave(opcoes[atual].rotulo)}`
        }

        return [
          titulo(pergunta, false),
          ...(dica ? [`  ${cores.suave(dica)}`] : []),
          ...opcoes.map((opcao, i) =>
            i === atual ? `  ${cores.ciano('›')} ${cores.ciano(opcao.rotulo)}` : `    ${opcao.rotulo}`,
          ),
          cores.suave('  ↑↓ escolhe · Enter confirma'),
        ].join('\n')
      },
      ({ texto, nome }, { terminar, redesenhar }) => {
        const numero = Number(texto)
        if (nome === 'up' || nome === 'k') {
          atual = (atual - 1 + opcoes.length) % opcoes.length
        } else if (nome === 'down' || nome === 'j' || nome === 'tab') {
          atual = (atual + 1) % opcoes.length
        } else if (Number.isInteger(numero) && numero >= 1 && numero <= opcoes.length) {
          atual = numero - 1
          terminar(opcoes[atual].valor)

          return
        } else if (nome === 'return' || nome === 'enter') {
          terminar(opcoes[atual].valor)

          return
        }
        redesenhar()
      },
    )
  }

  /**
   * Texto livre. `validar` devolve a mensagem de erro, ou null/'' se o valor serve.
   *
   * @param {string} pergunta
   * @param {{ padrao?: string, obrigatorio?: boolean, validar?: (valor: string) => string | null, oculto?: boolean }} [extras]
   * @returns {Promise<string>}
   */
  function texto(pergunta, { padrao = '', obrigatorio = false, validar = () => null, oculto = false } = {}) {
    let valor = ''
    let erro = ''
    const mostrar = conteudo => (oculto ? '•'.repeat(conteudo.length) : conteudo)

    return sessao(
      final => {
        if (final) {
          return `${titulo(pergunta, true)} ${cores.suave(oculto ? '•'.repeat(Math.min(valor.length, 8)) : valor)}`
        }
        const sugestao = padrao && !valor ? cores.suave(` (${padrao})`) : ''

        return `${titulo(pergunta, false)}${sugestao} ${mostrar(valor)}${erro ? `\n  ${cores.vermelho(erro)}` : ''}`
      },
      ({ texto: letra, nome, ctrl }, { terminar, redesenhar }) => {
        if (nome === 'return' || nome === 'enter') {
          const final = valor === '' ? padrao : valor
          erro = obrigatorio && final === '' ? 'Obrigatório.' : (validar(final) ?? '')
          if (!erro) {
            valor = final
            terminar(final)

            return
          }
        } else if (nome === 'backspace') {
          valor = valor.slice(0, -1)
        } else if (ctrl && nome === 'u') {
          valor = ''
        } else if (letra && !ctrl && letra >= ' ') {
          valor += letra
        }
        redesenhar()
      },
    )
  }

  /** Como `texto`, mas mostra bolinhas; aceita vazio (usuário sem senha). */
  const senha = pergunta => texto(pergunta, { oculto: true })

  return {
    interativo: Boolean(entrada.isTTY && saida.isTTY),
    confirmar,
    escolher,
    texto,
    senha,
  }
}
