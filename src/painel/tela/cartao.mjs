// Cartão de um serviço na visão geral: estado, descrição, endereço (com latência), tempo ligado,
// reinícios, memória, PID, gráfico de atividade, métrica e a última linha do log. Em tela baixa vira
// a versão compacta, de 4 linhas.
import {
  AMARELO,
  APAGADO,
  AZUL,
  CIANO,
  clarear,
  escurecer,
  forte,
  NEGRITO,
  pinta,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  VERDE,
  VERMELHO,
} from '../cores.mjs'
import { duracao, mb, plural } from '../formato.mjs'
import { resumoDeRequisicoes } from '../metricas.mjs'
import { ajustar, cortar, juntar, vis } from '../texto.mjs'
import { corLatencia, ESTADOS, ponto, sparkline, textoEstado } from './pecas.mjs'

export const ALTURA_DO_CARTAO = 7
export const ALTURA_DO_CARTAO_COMPACTO = 4

const ms = valor => (valor < 1000 ? `${Math.round(valor)} ms` : `${(valor / 1000).toFixed(1)} s`)

/**
 * O número que resume o serviço, conforme a `metrica` do plano (ou o tipo da aba).
 *
 * @param {import('../estado.mjs').Servico & Record<string, any>} s
 * @param {number} t agora
 */
export function metrica(s, t = Date.now()) {
  const m = s.metricas
  if (s.tipo === 'log') {
    return [
      pinta(TEXTO, `${m.entradas ?? 0} entradas`),
      pinta(s.erros ? VERMELHO : SUAVE, `✖ ${s.erros}`),
      pinta(s.avisos ? AMARELO : SUAVE, `▲ ${s.avisos}`),
    ].join('  ')
  }
  if (s.tipo === 'tarefas') {
    return pinta(TEXTO, `${m.total ?? 0} rodadas`)
  }
  switch (s.metrica) {
    case 'requisicoes': {
      const { porMinuto, media } = resumoDeRequisicoes(m, t)

      return `${pinta(TEXTO, `${porMinuto} req/min`)}${media === null ? '' : pinta(SUAVE, ` · média ${ms(media)}`)}`
    }
    case 'jobs':
      return [
        `${pinta(VERDE, `✔ ${m.feitos ?? 0}`)} ${pinta(SUAVE, 'jobs')}`,
        pinta(m.falhas ? VERMELHO : SUAVE, `✖ ${m.falhas ?? 0}`),
        m.rodando ? pinta(AZUL, `▶ ${m.rodando}`) : pinta(SUAVE, 'ocioso'),
      ].join('  ')
    case 'execucoes':
      return pinta(TEXTO, `${m.execucoes ?? 0} execuções`)
    case 'hmr':
      return `${pinta(TEXTO, `HMR ${m.hmr ?? 0}`)}${m.pronto ? pinta(SUAVE, ` · pronto em ${Math.round(m.pronto)} ms`) : ''}`
    default:
      return pinta(SUAVE, plural(s.linhas.length, 'linha'))
  }
}

/** A latência da última checagem, colorida, só com o serviço no ar. */
export const latencia = s =>
  s.latencia !== null && s.estado === 'online' ? pinta(corLatencia(s.latencia), `~${Math.round(s.latencia)} ms`) : ''

/**
 * @param {import('../estado.mjs').Servico & Record<string, any>} s
 * @param {number} w largura do cartão
 * @param {boolean} selecionado
 * @param {boolean} compacto
 * @param {number} t agora
 * @param {boolean} [foco] as setas estão nos cartões: o escolhido ganha a marca ▸ no título
 * @returns {string[]} as linhas do cartão, cada uma com largura `w`
 */
export function cartao(s, w, selecionado, compacto, t = Date.now(), foco = false) {
  const caiu = s.estado === 'caiu'
  const corBorda = selecionado ? (caiu ? VERMELHO : s.cor) : caiu ? escurecer(VERMELHO, 0.35) : [58, 65, 82]
  const b = texto => pinta(corBorda, texto, selecionado ? NEGRITO : '')
  const [corPonto, icone] = ponto(s, t)
  const corEstado = ESTADOS[s.estado]?.cor ?? SUAVE

  const rotulo = `${b('╭─ ')}${selecionado && foco ? b('▸ ') : ''}${pinta(corPonto, icone)}${forte(selecionado ? clarear(s.cor, 0.3) : s.cor, s.nome)} `
  const direita = ` ${pinta(corEstado, textoEstado(s, t))} ${b('─╮')}`
  const topo = cortar(rotulo + b('─'.repeat(Math.max(0, w - vis(rotulo) - vis(direita)))) + direita, w)
  const linha = conteudo => `${b('│')} ${ajustar(conteudo, w - 4)} ${b('│')}`

  const endereco = s.url
    ? juntar(pinta(CIANO, s.url, SUBLINHADO), latencia(s), w - 4)
    : s.tipo === 'log'
      ? pinta(SUAVE, s.metricas.arquivo ?? `nenhum arquivo em ${s.log?.pasta ?? '?'} ainda`)
      : pinta(SUAVE, `$ ${s.comando || s.descricao}`)

  const processo = s.tipo === 'processo'
  const dados = [
    processo && s.filho ? pinta(SUAVE, `⏱ ${duracao(t - s.inicio)}`) : null,
    processo ? pinta(s.reinicios ? AMARELO : SUAVE, `↻ ${s.reinicios}`) : null,
    s.mem ? pinta(SUAVE, `▣ ${mb(s.mem)}`) : null,
    s.pid ? pinta(APAGADO, `#${s.pid}`) : null,
    // No log os erros já aparecem na métrica.
    s.erros && s.tipo !== 'log' ? pinta(VERMELHO, `✖ ${s.erros}`) : null,
    !processo ? pinta(SUAVE, `${plural(s.linhas.length, 'linha')} no histórico`) : null,
  ]
    .filter(Boolean)
    .join('   ')

  const resumo = metrica(s, t)
  const larguraDoGrafico = Math.max(6, Math.min(s.atividade.length, w - 6 - vis(resumo)))
  const atividade = `${sparkline(s.atividade.slice(-larguraDoGrafico), s.cor)}  ${resumo}`

  const ultima = s.ultima
    ? `${pinta(APAGADO, '›')} ${pinta(s.ultima.nivel === 'erro' ? VERMELHO : SUAVE, s.ultima.texto)}`
    : pinta(APAGADO, '› aguardando saída…')

  const base = b(`╰${'─'.repeat(w - 2)}╯`)

  return compacto
    ? [topo, linha(endereco), linha(`${dados}   ${resumo}`), base]
    : [topo, linha(pinta(SUAVE, s.descricao)), linha(endereco), linha(dados), linha(atividade), linha(ultima), base]
}
