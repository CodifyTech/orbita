// Aba de log (de um serviço ou "Todos"): barra com o estado do serviço, linha do comando e contagem,
// as linhas com hora, nome (na "Todos") e barra colorida pelo nível, barra de rolagem e o selo
// "N linhas acima do fim" quando o dev não está seguindo o fim.
import {
  AMARELO,
  APAGADO,
  AZUL,
  BRANCO,
  CIANO,
  compor,
  escurecer,
  pinta,
  PRETO,
  SUAVE,
  SUBLINHADO,
  TEXTO,
  VERMELHO,
} from '../cores.mjs'
import { processos, servicoDe, vista } from '../estado.mjs'
import { duracao, horaDe, mb } from '../formato.mjs'
import { ajustar, centralizar, juntar, quebrar, vis } from '../texto.mjs'
import { latencia } from './cartao.mjs'
import { ESTADOS, pilula, ponto, spinner, textoEstado } from './pecas.mjs'
import { realce, realceFiltro } from './realce.mjs'

/** Margem esquerda: espaço + hora (8) + espaço + nome (9, só na "Todos") + barra e espaço. */
const larguraDaMargem = comNome => 1 + 8 + 1 + (comNome ? 9 : 0) + 2

/**
 * Primeira linha da aba: o resumo do serviço (ou de todos, na aba "Todos").
 *
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {(import('../estado.mjs').Servico & Record<string, any>) | null} s
 * @param {number} t agora
 */
export function barraInfo(estado, w, s, t) {
  if (!s) {
    const servicos = processos(estado).map(p => compor([ponto(p, t), [TEXTO, ` ${p.nome}`]]))
    const logs = estado.servicos
      .filter(l => l.tipo === 'log')
      .map(l => compor([ponto(l, t), [TEXTO, ` ${l.metricas.arquivo ?? l.nome}`]]))

    return ajustar(` ${pilula(AZUL, '≡ todos os serviços')}  ${[...servicos, ...logs].join('   ')}`, w)
  }
  const [corPonto, icone] = ponto(s, t)
  const partes = [
    ` ${compor([[BRANCO, ` ${s.nome} `, true]], escurecer(s.cor, 0.5))}`,
    compor([
      [corPonto, icone],
      [ESTADOS[s.estado]?.cor ?? SUAVE, ` ${textoEstado(s, t)}`],
    ]),
    s.filho ? pinta(SUAVE, `⏱ ${duracao(t - s.inicio)}`) : '',
    s.tipo === 'processo' ? pinta(s.reinicios ? AMARELO : SUAVE, `↻ ${s.reinicios}`) : '',
    s.mem ? pinta(SUAVE, `▣ ${mb(s.mem)}`) : '',
    s.pid ? pinta(APAGADO, `PID ${s.pid}`) : '',
    s.url ? pinta(CIANO, s.url, SUBLINHADO) : '',
    latencia(s),
  ].filter(Boolean)

  return ajustar(partes.join('   '), w)
}

/** Cor da barrinha à esquerda do texto: pelo nível da linha, ou a cor do serviço. */
function corDaBarra(l, destacada) {
  if (destacada) {
    return AMARELO
  }

  return { erro: VERMELHO, alerta: AMARELO, sistema: CIANO }[l.nivel] ?? escurecer(l.s.cor, 0.4)
}

/**
 * @param {import('../estado.mjs').Estado} estado
 * @param {number} w
 * @param {number} h altura do conteúdo
 * @param {string} id nome do serviço ou 'todos'
 * @param {number} t agora
 */
export function vistaLog(estado, w, h, id, t) {
  const s = id === 'todos' ? null : servicoDe(estado, id)
  const v = vista(estado, id)
  const filtro = v.filtro.toLowerCase()
  const fonte = s ? s.linhas : estado.todas
  const lista = filtro ? fonte.filter(l => l.texto.toLowerCase().includes(filtro)) : fonte
  const alturaLog = h - 2
  // Não rola além do topo: a primeira linha para no alto da tela, sem deixar a tela vazia.
  v.rolagem = Math.min(v.rolagem, Math.max(0, lista.length - alturaLog))
  if (v.rolagem === 0) {
    v.novos = 0
  }

  const comando = s ? (s.tipo === 'processo' ? `$ ${s.comando}` : s.descricao) : 'saída de todos os serviços, na ordem em que chegou'
  const contagem = filtro ? `${lista.length} de ${fonte.length} linhas com “${v.filtro}”` : `${fonte.length} linhas`
  const L = [barraInfo(estado, w, s, t), juntar(` ${pinta(APAGADO, comando)}`, `${pinta(filtro ? AMARELO : APAGADO, contagem)} `, w)]

  const comNome = !s
  const larguraTexto = Math.max(10, w - larguraDaMargem(comNome) - 2)
  const destaque = estado.destaque && t < estado.destaque.ate ? estado.destaque.seq : null
  const linhas = []

  // De baixo para cima, só até encher a tela: com milhares de linhas, quebrar todas seria caro.
  for (let i = lista.length - 1 - v.rolagem; i >= 0 && linhas.length < alturaLog; i--) {
    const l = lista[i]
    const destacada = l.seq === destaque
    const barra = pinta(corDaBarra(l, destacada), destacada ? '▶' : '▎')
    const bloco = quebrar(l.texto, larguraTexto).map((pedaco, k) => {
      const hora = k === 0 ? pinta(destacada ? AMARELO : APAGADO, horaDe(l.t)) : ' '.repeat(8)
      const nome = comNome ? `${k === 0 ? pinta(l.s.cor, l.s.nome.padEnd(8).slice(0, 8)) : ' '.repeat(8)} ` : ''
      const texto = filtro ? realceFiltro(pedaco, filtro) : realce(pedaco, l)

      return ` ${hora} ${nome}${barra} ${texto}`
    })
    linhas.unshift(...bloco)
  }
  while (linhas.length > alturaLog) {
    linhas.shift()
  }

  if (!lista.length) {
    const [cor, icone] = s ? ponto(s, t) : [AZUL, spinner(t)]
    const mensagem = filtro ? `nenhuma linha com “${v.filtro}” — Esc limpa o filtro` : `aguardando a saída${s ? ` do ${s.nome}` : ''}…`
    for (let i = 0; i < Math.floor(alturaLog / 2) - 1; i++) {
      linhas.push('')
    }
    linhas.push(centralizar(`${pinta(cor, icone)} ${pinta(SUAVE, mensagem)}`, w))
  }

  // Barra de rolagem na última coluna.
  const total = lista.length
  const polegar = total > alturaLog ? Math.max(1, Math.round((alturaLog * alturaLog) / total)) : 0
  const posicao =
    total > alturaLog
      ? Math.round(((total - alturaLog - Math.min(v.rolagem, total - alturaLog)) / Math.max(1, total - alturaLog)) * (alturaLog - polegar))
      : 0
  for (let y = 0; y < alturaLog; y++) {
    const trilho = polegar && y >= posicao && y < posicao + polegar ? pinta(s?.cor ?? AZUL, '┃') : pinta([40, 46, 60], '│')
    L.push(ajustar(linhas[y] ?? '', w - 1) + trilho)
  }

  if (v.rolagem > 0) {
    const novas = v.novos ? `↓ ${v.novos} nova${v.novos === 1 ? '' : 's'} · ` : ''
    const selo = compor([[PRETO, ` ${novas}${v.rolagem} linha${v.rolagem === 1 ? '' : 's'} acima do fim · End segue o log `, true]], AMARELO)
    L[L.length - 1] = juntar(ajustar(linhas[alturaLog - 1] ?? '', w - vis(selo) - 3), `${selo}  `, w)
  }

  return L
}
