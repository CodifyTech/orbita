// Sobe e vigia os processos do plano: reinício automático quando um cai (até 5 tentativas, com a
// espera dobrando), parar/subir/reiniciar a pedido, checagem de saúde e o encerramento no fim.
// Tudo que fala com o sistema chega por `deps`, então os testes trocam por processos falsos.
import {
  encerrarFilho as encerrarFilhoPadrao,
  encerrarFilhoJa as encerrarFilhoJaPadrao,
  iniciarFilho as iniciarFilhoPadrao,
} from '../ambiente/filhos.mjs'
import { aguardarLiberar } from '../ambiente/portas.mjs'
import { mostrarToast, processos } from './estado.mjs'
import { duracao } from './formato.mjs'
import { avancar, lerFluxo, linhaDoProcesso, registrar } from './logs.mjs'
import { aplicarSaude, consultar as consultarPadrao, INTERVALO_NO_AR, INTERVALO_SUBINDO } from './saude.mjs'

/** Reinícios automáticos seguidos antes de desistir de um processo que não para de cair. */
export const TENTATIVAS = 5
/** Um processo que ficou de pé mais que isso "deu certo": as tentativas voltam a zero. */
const VIVEU_O_BASTANTE = 30_000
/** Sem checagem de saúde (fila, agendador), o serviço está no ar se sobrevive a isto. */
const NO_AR_SEM_SAUDE = 2500
const PRIMEIRA_CHECAGEM = 1200

/**
 * @typedef {object} Dependencias
 * @property {() => number} [colunas]  largura do terminal (vai para o COLUMNS dos filhos)
 * @property {typeof iniciarFilhoPadrao} [iniciarFilho]
 * @property {typeof encerrarFilhoPadrao} [encerrarFilho]
 * @property {typeof encerrarFilhoJaPadrao} [encerrarFilhoJa]
 * @property {(porta: number) => Promise<unknown>} [aguardarPorta]  espera a porta liberar antes de subir de novo
 * @property {typeof consultarPadrao} [consultar]
 * @property {typeof setTimeout} [agendar]
 * @property {typeof clearTimeout} [cancelar]
 * @property {() => number} [relogio]
 */

/**
 * @param {import('./estado.mjs').Estado} estado
 * @param {Dependencias} [deps]
 */
export function criarSupervisor(estado, deps = {}) {
  const {
    colunas = () => 120,
    iniciarFilho = iniciarFilhoPadrao,
    encerrarFilho = encerrarFilhoPadrao,
    encerrarFilhoJa = encerrarFilhoJaPadrao,
    aguardarPorta = porta => aguardarLiberar(porta, 25, 200),
    consultar = consultarPadrao,
    agendar = setTimeout,
    cancelar = clearTimeout,
    relogio = Date.now,
  } = deps
  const toast = (texto, nivel, ms) => mostrarToast(estado, texto, nivel, ms, relogio())

  /**
   * Variáveis do plano (portas trocadas nesta execução) e sem cor: o painel colore do jeito dele.
   * COLUMNS menor que o terminal porque a margem do painel (hora, nome) come espaço.
   */
  const envFilhos = () => ({
    ...process.env,
    ...estado.plano.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    COLUMNS: String(Math.max(60, colunas() - 16)),
  })

  function iniciar(s) {
    if (s.filho || s.tipo !== 'processo' || estado.encerrando) {
      return
    }
    cancelar(s.timer)
    s.timer = null
    s.parando = false
    s.estado = 'subindo'
    s.detalhe = null
    s.inicio = relogio()
    s.falhasSaude = 0
    s.proximaChecagem = s.inicio + PRIMEIRA_CHECAGEM

    const filho = iniciarFilho(s.comando, { cwd: s.cwd, env: envFilhos() })
    s.filho = filho
    s.pid = filho.pid ?? null
    registrar(estado, s, `▶ ${s.comando}`, 'sistema', { agora: relogio() })
    lerFluxo(filho.stdout, linha => linhaDoProcesso(estado, s, linha, relogio()))
    lerFluxo(filho.stderr, linha => linhaDoProcesso(estado, s, linha, relogio()))
    filho.on('error', erro => {
      registrar(estado, s, `Não consegui iniciar: ${erro.message}`, 'erro', { agora: relogio() })
      // Falha ao criar o processo nem sempre emite `exit`: sem isto ele ficaria "subindo" para sempre.
      if (!filho.pid) {
        aoSair(s, filho, 1, null)
      }
    })
    filho.on('exit', (codigo, sinal) => aoSair(s, filho, codigo, sinal))
  }

  function aoSair(s, filho, codigo, sinal) {
    if (s.filho !== filho) {
      return
    }
    const agora = relogio()
    s.filho = null
    s.pid = null
    s.mem = null
    s.latencia = null

    // Saída pedida (parar, reiniciar, encerrar o painel).
    if (s.parando || estado.encerrando) {
      s.parando = false
      s.estado = 'parado'
      registrar(estado, s, '■ parado', 'sistema', { agora })
      if (s.reiniciarDepois && !estado.encerrando) {
        s.reiniciarDepois = false
        s.estado = 'reiniciando'
        // Sobe de novo só quando a porta liberar, senão o novo processo esbarra no antigo.
        Promise.resolve(s.porta ? aguardarPorta(s.porta) : null).then(() => iniciar(s))
      }

      return
    }

    // Caiu sozinho.
    const durou = agora - s.inicio
    if (durou > VIVEU_O_BASTANTE) {
      s.tentativas = 0
    }
    const motivo = `${s.nome} caiu (${sinal ?? `código ${codigo}`}) depois de ${duracao(durou)}`

    if (estado.plano.reiniciar && s.tentativas < TENTATIVAS) {
      s.tentativas++
      s.reinicios++
      const espera = 1000 * 2 ** (s.tentativas - 1)
      s.estado = 'reiniciando'
      s.retomarEm = agora + espera
      registrar(estado, s, `${motivo} — reiniciando em ${espera / 1000}s (tentativa ${s.tentativas}/${TENTATIVAS})`, 'erro', { agora })
      s.timer = agendar(() => iniciar(s), espera)
    } else {
      s.estado = 'caiu'
      const dica = estado.plano.reiniciar ? ` — desisti depois de ${TENTATIVAS} tentativas; r reinicia` : ' — r reinicia'
      registrar(estado, s, `${motivo}${dica}`, 'erro', { agora })
    }
  }

  function parar(s) {
    cancelar(s.timer)
    s.timer = null
    if (!s.filho) {
      s.estado = 'parado'

      return
    }
    s.parando = true
    s.estado = 'parando'
    encerrarFilho(s.filho)
  }

  function reiniciar(s) {
    if (s.tipo !== 'processo') {
      return toast(`${s.nome} não é um processo: não há o que reiniciar`, 'info')
    }
    s.reinicios++
    s.tentativas = 0
    registrar(estado, s, '↻ reiniciando a pedido', 'sistema', { agora: relogio() })
    if (s.filho) {
      s.reiniciarDepois = true
      parar(s)
      s.estado = 'reiniciando'
    } else {
      iniciar(s)
    }
  }

  /** `s`: para o que está de pé (ou esperando reiniciar) e sobe o que está parado. */
  function alternar(s) {
    if (s.tipo !== 'processo') {
      return toast(`${s.nome} não é um processo`, 'info')
    }
    if (s.filho || s.timer) {
      parar(s)
      toast(`■ ${s.nome} parado — s sobe de novo`, 'info')
    } else {
      s.tentativas = 0
      iniciar(s)
    }
  }

  function reiniciarTodos() {
    processos(estado).forEach(reiniciar)
    toast('↻ reiniciando todos os serviços', 'info')
  }

  async function checarSaude(s) {
    s.checando = true
    let resposta = null
    try {
      resposta = await consultar(s.saude)
    } finally {
      s.checando = false
    }
    s.proximaChecagem = relogio() + (s.estado === 'online' ? INTERVALO_NO_AR : INTERVALO_SUBINDO)
    if (!s.filho || s.parando) {
      return
    }
    const evento = aplicarSaude(s, resposta, relogio())
    if (evento) {
      registrar(estado, s, evento.texto, evento.nivel, { agora: relogio() })
    }
  }

  /** Um passo da supervisão (o painel chama a cada 100 ms, o inline a cada 500 ms). */
  function supervisionar() {
    const agora = relogio()
    for (const s of estado.servicos) {
      avancar(s, agora)
      if (s.tipo !== 'processo' || !s.filho) {
        continue
      }
      if (!s.saude && s.estado === 'subindo' && agora - s.inicio > NO_AR_SEM_SAUDE) {
        s.estado = 'online'
      }
      if (s.saude && !s.checando && agora >= s.proximaChecagem) {
        checarSaude(s)
      }
    }
  }

  /** Pede a todos (serviços e tarefas) para encerrar; `todosParados` diz quando terminaram. */
  function encerrarTodos() {
    for (const s of processos(estado)) {
      cancelar(s.timer)
      s.timer = null
      if (s.filho) {
        s.parando = true
        s.estado = 'parando'
        encerrarFilho(s.filho)
      } else {
        s.estado = 'parado'
      }
    }
    estado.tarefas.forEach(filho => encerrarFilho(filho))
  }

  const todosParados = () => processos(estado).every(s => !s.filho)

  /** Último recurso, síncrono: mata na hora tudo que ainda estiver vivo. */
  function matarTudoAgora() {
    for (const filho of [...processos(estado).map(s => s.filho), ...estado.tarefas]) {
      if (filho) {
        encerrarFilhoJa(filho)
      }
    }
  }

  return {
    envFilhos,
    iniciar,
    parar,
    reiniciar,
    alternar,
    reiniciarTodos,
    supervisionar,
    encerrarTodos,
    todosParados,
    matarTudoAgora,
    iniciarTodos: () => processos(estado).forEach(iniciar),
  }
}
