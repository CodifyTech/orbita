// Entrada do painel do `codify dev`: recebe o plano pronto (o comando `dev` já checou o ambiente e
// resolveu as portas), sobe os processos e mostra o painel, ou as linhas prefixadas no modo inline,
// até o dev sair. Este arquivo só liga as peças; cada responsabilidade mora no seu arquivo:
//
//   estado.mjs      o estado do painel          supervisor.mjs  subir, vigiar e reiniciar processos
//   logs.mjs        linhas, alertas, buffers     saude.mjs       checagem HTTP/TCP
//   vigia-log.mjs   abas de arquivo de log       tarefas.mjs     ações e comandos livres
//   entrada.mjs     teclado e mouse              tela/           tudo que é desenhado
//   inline.mjs      modo sem painel              resumo.mjs      o que fica no terminal ao sair
import { join } from 'node:path'
import { criarMedidor, memoriaPorArvore } from '../ambiente/memoria.mjs'
import { abrirNoPadrao, copiarParaAreaDeTransferencia } from '../ambiente/sistema.mjs'
import { BINARIO } from '../constantes.mjs'
import { criarEstado, mostrarToast, processos } from './estado.mjs'
import { tratarEntrada } from './entrada.mjs'
import { ligarInline } from './inline.mjs'
import { criarConsultaDeRequest } from './requests.mjs'
import { montarResumo } from './resumo.mjs'
import { criarSupervisor } from './supervisor.mjs'
import { criarExecutorDeTarefas } from './tarefas.mjs'
import { criarDesenhista } from './tela/desenhista.mjs'
import { alturaDoLog, quadro } from './tela/quadro.mjs'
import { DURACAO_DO_SPLASH } from './tela/splash.mjs'
import { copiarPeloTerminal, DESLIGAR_MOUSE, ENTRAR, LIGAR_MOUSE, LIMPAR_TELA, SAIR, titulo } from './terminal.mjs'
import { criarVigia } from './vigia-log.mjs'

const SINAIS = ['SIGINT', 'SIGTERM', 'SIGHUP']
/** Se algum processo não morrer, o painel fecha assim mesmo (e mata o que sobrou na marra). */
const ESPERA_MAXIMA_AO_ENCERRAR = 6000
/** Tempo para o dev ver a caixa "Encerrando" com tudo marcado ✔ antes de fechar. */
const PAUSA_FINAL_DO_PAINEL = 450
const QUADROS_POR_SEGUNDO = 10

/**
 * Sobe os processos do plano e mostra o painel até o dev sair.
 *
 * @param {import('../plano/tipos.mjs').Plano} plano
 * @param {object} [opcoes]
 * @param {'painel' | 'inline'} [opcoes.modo]  inline: sem painel, linhas prefixadas por serviço
 * @param {NodeJS.WriteStream} [opcoes.stdout]
 * @param {NodeJS.ReadStream} [opcoes.stdin]   só o modo painel lê o teclado
 * @returns {Promise<number>} código de saída quando o usuário encerra (q / Ctrl+C)
 */
export async function iniciarPainel(plano, { modo = 'painel', stdout = process.stdout, stdin = process.stdin } = {}) {
  const estado = criarEstado(plano)
  const usaCor = Boolean(stdout.isTTY) && !process.env.NO_COLOR
  const escrever = texto => stdout.write(texto)
  const colunas = () => stdout.columns || 120
  const linhasDaTela = () => stdout.rows || 36
  const nome = estado.plano.projeto.nome

  const supervisor = criarSupervisor(estado, { colunas })
  const rodarTarefa = criarExecutorDeTarefas(estado, { envFilhos: supervisor.envFilhos })
  const desenhista = criarDesenhista(escrever)
  const toast = (texto, nivel, ms) => mostrarToast(estado, texto, nivel, ms)
  const desenhar = () => desenhista.desenhar(quadro(estado, colunas(), linhasDaTela()))

  async function abrir(alvo) {
    toast(`↗ abrindo ${alvo}`, 'info', 2500)
    if (!(await abrirNoPadrao(alvo))) {
      toast(`Não consegui abrir ${alvo}`, 'erro')
    }
  }

  /** `o`: a página do serviço no navegador, ou o arquivo de uma aba de log. */
  function abrirServico(s) {
    if (s.tipo === 'log' && s.metricas.arquivo) {
      return abrir(join(s.log.pasta, s.metricas.arquivo))
    }
    if (/^https?:\/\//.test(s.url ?? '')) {
      return abrir(s.url)
    }
    toast(s.url ? `${s.nome} não é uma página: ${s.url}` : `${s.nome} não tem endereço para abrir`, 'info')
  }

  /** Pelo terminal (OSC 52) e pela área de transferência do sistema: o que funcionar. */
  function copiar(texto, rotulo) {
    escrever(copiarPeloTerminal(texto))
    copiarParaAreaDeTransferencia(texto)
    toast(`⧉ ${rotulo} copiado para a área de transferência`, 'ok', 2500)
  }

  function alternarMouse(ligar = !estado.mouse) {
    estado.mouse = ligar
    escrever(ligar ? LIGAR_MOUSE : DESLIGAR_MOUSE)
    toast(ligar ? 'mouse ligado: clique nas abas e role com a roda · Shift+arrastar seleciona texto' : 'mouse desligado: seleção de texto normal', 'info', 3500)
  }

  function redesenharTudo() {
    desenhista.invalidar()
    escrever(LIMPAR_TELA)
  }

  function atualizarTitulo() {
    const lista = processos(estado)
    const noAr = lista.filter(s => s.estado === 'online').length
    const erros = estado.alertas.filter(a => a.nivel === 'erro').length
    escrever(titulo(`${nome} dev · ${noAr}/${lista.length} no ar${erros ? ` · ${erros} erro${erros > 1 ? 's' : ''}` : ''} — CodifyTech`))
  }

  /** Soma a memória da árvore de cada serviço na amostra que o medidor trouxe. */
  function aplicarMemoria(amostras) {
    const lista = processos(estado)
    const memoria = memoriaPorArvore(amostras, lista.filter(s => s.pid).map(s => s.pid))
    for (const s of lista) {
      s.mem = s.pid ? (memoria.get(s.pid) ?? null) : null
    }
  }

  return new Promise(resolve => {
    const relogios = []
    const adiados = []
    let vigias = []
    let medidor = null
    let terminou = false

    /** @type {import('./teclas.mjs').Contexto} */
    const ctx = {
      estado,
      alturaDoLog: () => alturaDoLog(linhasDaTela()),
      encerrar,
      reiniciar: supervisor.reiniciar,
      alternar: supervisor.alternar,
      reiniciarTodos: supervisor.reiniciarTodos,
      abrir,
      abrirServico,
      copiar,
      alternarMouse,
      redesenharTudo,
      rodarTarefa,
      consultarRequest: criarConsultaDeRequest(estado),
    }

    const aoDigitar = dados => {
      tratarEntrada(ctx, dados)
      desenhar()
    }
    const aoRedimensionar = () => {
      redesenharTudo()
      desenhar()
    }

    /** Devolve o terminal como estava: tela normal, cursor, mouse desligado, sem modo raw. */
    function restaurar() {
      if (!estado.painel) {
        return
      }
      estado.painel = false
      escrever(SAIR)
      try {
        stdin.setRawMode?.(false)
      } catch {}
    }

    // O processo vai morrer de qualquer jeito (process.exit de alguém): nada pode ficar órfão.
    const aoSairDoProcesso = () => {
      restaurar()
      supervisor.matarTudoAgora()
    }
    const aoErroInesperado = erro => finalizar(1, erro)

    /** Primeiro pedido (q, Ctrl+C, sinal): encerra com calma. O segundo fecha na hora. */
    function encerrar() {
      if (estado.encerrando) {
        return finalizar(0)
      }
      estado.encerrando = true
      estado.splashAte = 0
      estado.overlay = estado.painel ? 'encerrando' : null
      estado.digitando = false
      supervisor.encerrarTodos()
      adiados.push(setTimeout(() => finalizar(0), ESPERA_MAXIMA_AO_ENCERRAR))
      const esperar = setInterval(() => {
        if (supervisor.todosParados()) {
          clearInterval(esperar)
          adiados.push(setTimeout(() => finalizar(0), estado.painel ? PAUSA_FINAL_DO_PAINEL : 0))
        }
      }, 100)
      relogios.push(esperar)
    }

    function finalizar(codigo, erro = null) {
      if (terminou) {
        return
      }
      terminou = true
      relogios.forEach(clearInterval)
      adiados.forEach(clearTimeout)
      vigias.forEach(v => v.parar())
      medidor?.parar()
      supervisor.matarTudoAgora()
      restaurar()

      stdin.off?.('data', aoDigitar)
      if (modo !== 'inline') {
        stdin.pause?.()
      }
      stdout.off?.('resize', aoRedimensionar)
      SINAIS.forEach(sinal => process.off(sinal, encerrar))
      process.off('exit', aoSairDoProcesso)
      process.off('uncaughtException', aoErroInesperado)

      if (erro) {
        console.error(`\n  O painel do ${nome} encontrou um erro inesperado e encerrou os serviços:\n`)
        console.error(erro)
        if (modo !== 'inline') {
          console.error(`\n  Enquanto isso, \`${BINARIO} dev --inline\` sobe o ambiente sem o painel.\n`)
        }
      } else {
        escrever(montarResumo(estado, { usaCor }))
      }
      resolve(codigo)
    }

    process.on('exit', aoSairDoProcesso)
    process.on('uncaughtException', aoErroInesperado)
    SINAIS.forEach(sinal => process.on(sinal, encerrar))

    if (modo === 'inline') {
      ligarInline(estado, { escrever, usaCor })
      vigias = estado.servicos.filter(s => s.tipo === 'log').map(s => criarVigia(estado, s))
      supervisor.iniciarTodos()
      relogios.push(setInterval(supervisor.supervisionar, 500))

      return
    }

    estado.painel = true
    // Mouse ligado desde o início: sem o relato de cliques, a roda chega como ↑↓ (modo 1007) e seria
    // confundida com a navegação entre os requests. `m` desliga para selecionar texto arrastando.
    estado.mouse = true
    escrever(ENTRAR + LIGAR_MOUSE)
    stdin.setRawMode?.(true)
    stdin.setEncoding?.('utf8')
    stdin.resume?.()
    stdin.on('data', aoDigitar)
    stdout.on?.('resize', aoRedimensionar)

    estado.splashAte = Date.now() + DURACAO_DO_SPLASH
    vigias = estado.servicos.filter(s => s.tipo === 'log').map(s => criarVigia(estado, s))
    medidor = criarMedidor(aplicarMemoria)
    supervisor.iniciarTodos()
    atualizarTitulo()
    relogios.push(
      setInterval(() => {
        supervisor.supervisionar()
        desenhar()
      }, 1000 / QUADROS_POR_SEGUNDO),
    )
    relogios.push(setInterval(atualizarTitulo, 1000))
  })
}
